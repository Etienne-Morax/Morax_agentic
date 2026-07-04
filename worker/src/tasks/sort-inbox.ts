/**
 * Morax worker - tache Launchpad "Classer l'inbox".
 * Parcourt les documents entrants non classes (documents.category IS NULL) et
 * assigne une categorie via LLM (classification legere, pas finance-critique).
 */

import { resolveModel } from '@morax/model-core'
import { creditCost } from '@morax/model-core'
import type { ExtractedFields } from '../types.js'
import type { TaskContext } from './types.js'

/**
 * Taxonomie fixe et stable des categories de documents entrants (factures,
 * recus, courriers photographies/emailes par un artisan/TPE UK). Toute
 * evolution de cette liste doit rester retro-compatible avec les valeurs deja
 * ecrites en base (documents.category est un texte libre, sans CHECK).
 */
export const DOCUMENT_CATEGORIES = [
  'facture_fournisseur',
  'recu_depense',
  'courrier_officiel',
  'relance_impayee',
  'contrat',
  'autre',
] as const

export type Category = (typeof DOCUMENT_CATEGORIES)[number]

const DEFAULT_CATEGORY: Category = 'autre'

const CATEGORY_SET: ReadonlySet<string> = new Set(DOCUMENT_CATEGORIES)

const SORT_INBOX_SYSTEM = `Tu classes un document professionnel entrant (facture, recu, courrier, contrat) recu par un artisan/TPE au Royaume-Uni.
Categories possibles (choisis-en EXACTEMENT une) :
- facture_fournisseur : facture emise par un fournisseur/prestataire, a payer
- recu_depense : recu/ticket de depense deja payee
- courrier_officiel : courrier administratif ou officiel (HMRC, banque, assurance...)
- relance_impayee : rappel/relance pour un paiement en retard
- contrat : contrat, devis signe, bail, accord
- autre : ne correspond a aucune categorie ci-dessus

Reponds UNIQUEMENT avec le slug exact de la categorie choisie, en minuscules, sans ponctuation ni explication.`

/**
 * Parse defensif de la reponse LLM : ne fait confiance a rien, retombe sur la
 * categorie par defaut si le texte ne correspond a aucun slug connu.
 */
export function resolveCategory(rawLlmText: string): Category {
  const normalized = rawLlmText.trim().toLowerCase()
  if (CATEGORY_SET.has(normalized)) {
    return normalized as Category
  }
  return DEFAULT_CATEGORY
}

function buildDocumentPrompt(mime: string | null, extracted: ExtractedFields | null): string {
  const lines: string[] = [`Type de fichier : ${mime ?? 'inconnu'}`]
  if (extracted?.emetteur) lines.push(`Emetteur : ${extracted.emetteur}`)
  if (extracted?.destinataire) lines.push(`Destinataire : ${extracted.destinataire}`)
  if (extracted?.montant !== undefined) {
    lines.push(`Montant : ${extracted.montant} ${extracted.devise ?? ''}`.trim())
  }
  if (extracted?.date_emission) lines.push(`Date d'emission : ${extracted.date_emission}`)
  if (extracted?.date_echeance) lines.push(`Date d'echeance : ${extracted.date_echeance}`)
  if (extracted?.numero_document) lines.push(`Numero de document : ${extracted.numero_document}`)
  return lines.join('\n')
}

/** Classe tous les documents entrants non classes du tenant, un par un. */
export async function sortInbox(ctx: TaskContext): Promise<void> {
  const docs = await ctx.ports.documents.listUnclassified(ctx.tenant.tenant_id)
  if (docs.length === 0) return

  const modelConfig = resolveModel({ tenantConfig: ctx.tenant, role: 'workhorse' })

  for (const doc of docs) {
    const llmResult = await ctx.llm.complete({
      modelConfig,
      messages: [
        { role: 'system', content: SORT_INBOX_SYSTEM },
        { role: 'user', content: buildDocumentPrompt(doc.mime, doc.extracted) },
      ],
      hasPersonalData: true,
    })

    const category = resolveCategory(llmResult.text)
    await ctx.ports.documents.setCategory(ctx.tenant.tenant_id, doc.id, category)

    await ctx.ports.credits.record({
      tenantId: ctx.tenant.tenant_id,
      jobRunId: ctx.jobRunId,
      actionCategory: 'classification',
      weight: creditCost('classification'),
      langfuseTraceId: ctx.traceId,
    })
    await ctx.ports.credits.recordCost({
      tenantId: ctx.tenant.tenant_id,
      jobRunId: ctx.jobRunId,
      role: modelConfig.financePinned ? 'cerveau:finance' : 'pipeline',
      model: modelConfig.model,
      provider: modelConfig.provider,
      tokensIn: llmResult.tokensIn,
      tokensOut: llmResult.tokensOut,
      usdCost: llmResult.usdCost,
      langfuseTraceId: ctx.traceId,
    })
  }

  await ctx.ports.notifier.notifyActionResult(
    ctx.tenant.tenant_id,
    `${docs.length} document(s) classe(s).`,
  )
}
