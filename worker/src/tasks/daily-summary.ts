/**
 * Morax worker - "Resume du jour" (bouton Launchpad daily-summary).
 * Agrege ports.dashboard.summarizeDay() puis redige un resume (LLM, cerveau
 * non-finance, categorie resume_financier) envoye en self-notify.
 */

import { creditCost, resolveModel } from '@morax/model-core'
import type { DaySummaryRow } from '../ports.js'
import type { TaskContext } from './types.js'

const DAILY_SUMMARY_SYSTEM = `Tu es l'assistant personnel d'un independant britannique avec un TDAH.
Tu lui envoies son resume du jour par message texte, comme le ferait un(e) assistant(e)
de confiance -- chaleureux(se) et direct(e), jamais un rapport corporate.
Regles :
- 2 a 4 phrases courtes maximum.
- Integre les chiffres fournis dans des phrases naturelles, jamais de liste a puces.
- Si des rappels sont en retard (overdueReminders) ou des jobs ont echoue
  (jobsErroredToday), signale-le clairement comme un point d'attention.
- N'invente aucun chiffre : utilise uniquement les donnees fournies.
- Texte brut uniquement, aucun markdown (pas de *, #, -, etc.).`

const QUIET_DAY_MESSAGE = 'Journee calme, rien a signaler.'

function isQuietDay(summary: DaySummaryRow): boolean {
  return (
    summary.documentsReceived === 0 &&
    summary.remindersDueNext7Days === 0 &&
    summary.overdueReminders === 0 &&
    summary.draftsPendingSend === 0 &&
    summary.jobsRunToday === 0
  )
}

function describeSummary(summary: DaySummaryRow): string {
  return [
    `documents recus aujourd'hui : ${summary.documentsReceived}`,
    `documents en attente de validation : ${summary.documentsNeedingValidation}`,
    `echeances dans les 7 prochains jours : ${summary.remindersDueNext7Days}`,
    `echeances en retard : ${summary.overdueReminders}`,
    `brouillons en attente d'envoi : ${summary.draftsPendingSend}`,
    `jobs executes aujourd'hui : ${summary.jobsRunToday}`,
    `jobs en erreur aujourd'hui : ${summary.jobsErroredToday}`,
  ].join('\n')
}

export async function dailySummary(ctx: TaskContext): Promise<void> {
  const summary = await ctx.ports.dashboard.summarizeDay(ctx.tenant.tenant_id)

  if (isQuietDay(summary)) {
    await ctx.ports.notifier.notifyActionResult(ctx.tenant.tenant_id, QUIET_DAY_MESSAGE)
    return
  }

  const modelConfig = resolveModel({ tenantConfig: ctx.tenant, role: 'cerveau' })
  const llmResult = await ctx.llm.complete({
    modelConfig,
    messages: [
      { role: 'system', content: DAILY_SUMMARY_SYSTEM },
      { role: 'user', content: describeSummary(summary) },
    ],
    hasPersonalData: true,
  })

  await ctx.ports.notifier.notifyActionResult(ctx.tenant.tenant_id, llmResult.text.trim())

  await ctx.ports.credits.record({
    tenantId: ctx.tenant.tenant_id,
    jobRunId: ctx.jobRunId,
    actionCategory: 'resume_financier',
    weight: creditCost('resume_financier'),
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
