/**
 * Morax worker - "Relancer les impayes" (bouton Launchpad chase-unpaid).
 * Lit les factures document_drafts (kind='invoice', status='sent', due_date
 * depassee), redige une relance (LLM, categorie relance_client) puis propose
 * l'envoi via le gate HIGH (pending_actions action_type='chase_reminder' +
 * job action_propose auto-enfile). AUCUN envoi direct ici.
 */

import { creditCost, resolveModel } from '@morax/model-core'
import type { ChaseReminderActionPayload } from '@morax/model-core'
import type { OverdueInvoiceRow } from '../ports.js'
import type { TaskContext } from './types.js'

/**
 * Le corps de l'email est redige par le LLM (voix, phrasing) : non finance-critique,
 * car montant/echeance/numero sont deja des faits connus de la base (OverdueInvoiceRow).
 * On impose un texte brut (ce texte DEVIENT le corps litteral de l'email de relance),
 * ton chaleureux-mais-ferme, en francais.
 */
const CHASE_SYSTEM = `Tu rediges le corps d'un email de relance pour une facture impayee,
au nom d'un artisan/independant britannique qui relance SON client. Contraintes strictes :
- Ton chaleureux mais ferme, professionnel, en francais.
- Rappelle le numero de la facture, le montant avec sa devise, et la date d'echeance depassee.
- Demande un reglement rapide et propose de revenir vers toi en cas de question.
- Termine par une formule de politesse professionnelle.
- TEXTE BRUT UNIQUEMENT : aucun markdown, aucun HTML, aucun objet d'email, aucune signature
  factice de type [Nom]. Ce texte est envoye tel quel comme corps de l'email.`

/** Borne le corps a un email court : la relance tient en quelques phrases. */
const CHASE_MAX_OUTPUT_TOKENS = 400

/** Brief compact passe au LLM : les faits viennent de la base, pas d'invention cote modele. */
function chaseUserBrief(invoice: OverdueInvoiceRow): string {
  return [
    `Facture : ${invoice.docNumber}`,
    `Montant du : ${invoice.total} ${invoice.currency}`,
    `Date d'echeance depassee : ${invoice.dueDate}`,
    'Redige le corps de la relance.',
  ].join('\n')
}

export async function chaseUnpaid(ctx: TaskContext): Promise<void> {
  const tenantId = ctx.tenant.tenant_id
  const overdue = await ctx.ports.drafts.listOverdueInvoices(tenantId)

  // Rien a relancer : on notifie poliment et on s'arrete. Pas d'appel LLM ni de
  // credit comptabilise quand il n'y a aucune facture en retard.
  if (overdue.length === 0) {
    await ctx.ports.notifier.notifyActionResult(tenantId, 'Aucune facture en retard a relancer.')
    return
  }

  // Sequentiel volontairement : le client LLM retente en interne et le quota
  // tenant doit voir les appels un a un (pas de rafale parallele).
  for (const invoice of overdue) {
    const modelConfig = resolveModel({ tenantConfig: ctx.tenant, role: 'cerveau' })
    const llmResult = await ctx.llm.complete({
      modelConfig,
      messages: [
        { role: 'system', content: CHASE_SYSTEM },
        { role: 'user', content: chaseUserBrief(invoice) },
      ],
      hasPersonalData: true,
      maxOutputTokens: CHASE_MAX_OUTPUT_TOKENS,
    })

    const payload: ChaseReminderActionPayload = {
      draft_id: invoice.draftId,
      doc_number: invoice.docNumber,
      client_email: invoice.clientEmail,
      ...(invoice.cc ? { cc: invoice.cc } : {}),
      total: invoice.total,
      currency: invoice.currency,
      message_text: llmResult.text.trim(),
    }

    // Gate HIGH : on ne fait que PROPOSER. L'email n'est jamais envoye ici ;
    // il ne partira qu'apres approbation humaine (Telegram), via run.ts
    // (processChaseReminderExecute). On ne touche jamais ctx.ports.mailer.
    // Le spread adapte le payload type (interface figee) a la colonne jsonb
    // (Record<string, unknown>) sans perdre la verification de champs ci-dessus.
    const { pendingActionId } = await ctx.ports.pendingActions.enqueue({
      tenantId,
      actionType: 'chase_reminder',
      payload: { ...payload },
    })

    // Auto-enfilage du job action_propose qui declenche le prompt d'approbation
    // Telegram (meme pattern que finalizeDraftAction cote app).
    await ctx.ports.queue.send({
      schema_version: 1,
      type: 'action_propose',
      tenant_id: tenantId,
      source: 'app',
      action: { pending_action_id: pendingActionId },
      idempotency_key: `act-prop:${pendingActionId}`,
      enqueued_at: new Date().toISOString(),
    })

    // Comptabilisation ferme de la redaction (credits + COGS) pour CETTE facture.
    await ctx.ports.credits.record({
      tenantId,
      jobRunId: ctx.jobRunId,
      actionCategory: 'relance_client',
      weight: creditCost('relance_client'),
      ...(ctx.traceId ? { langfuseTraceId: ctx.traceId } : {}),
    })
    await ctx.ports.credits.recordCost({
      tenantId,
      jobRunId: ctx.jobRunId,
      role: modelConfig.financePinned ? 'cerveau:finance' : 'pipeline',
      model: modelConfig.model,
      provider: modelConfig.provider,
      tokensIn: llmResult.tokensIn,
      tokensOut: llmResult.tokensOut,
      usdCost: llmResult.usdCost,
      ...(ctx.traceId ? { langfuseTraceId: ctx.traceId } : {}),
    })
  }
}
