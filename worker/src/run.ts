/**
 * Morax worker - orchestration pure (testable avec des fakes).
 * Garde-fous : idempotence, Max Loops par job, ack non bloquant,
 * comptabilisation des crédits et du coût réel.
 */

import { creditCost } from '@morax/model-core'
import type { BounceKind } from '@morax/model-core'
import type { LlmClient } from './llm.js'
import type { PendingActionRow, Ports } from './ports.js'
import {
  draftDocument,
  ocrDocument,
  outcomeCredits,
  planTasks,
  type PipelineContext,
  type StageOutcome,
} from './pipeline.js'
import { formatReminderMessage } from './reminder-notify-core.js'
import {
  formatActionResult,
  formatApprovalSummary,
  formatBounceResult,
  formatChaseActionResult,
  formatChaseApprovalSummary,
  formatChaseBounceResult,
  formatChaseReminderEmail,
  formatDocumentEmail,
  parseChaseReminderPayload,
  parseSendEmailPayload,
} from './action-gate-core.js'
import { TASK_HANDLERS } from './tasks/registry.js'
import type { JobMessage, QueueEnvelope } from './types.js'

const TASK_JOB_TYPES = new Set<JobMessage['type']>([
  'chase_unpaid',
  'check_deadlines',
  'daily_summary',
  'sort_inbox',
])

export interface RunConfig {
  maxLoopsPerJob: number
  queueBatchSize: number
  visibilityTimeoutSec: number
}

export interface ProcessResult {
  status: 'done' | 'skipped_idempotent' | 'max_loops' | 'error'
  msgId: number
}

export async function processEnvelope(
  envelope: QueueEnvelope,
  ports: Ports,
  llm: LlmClient,
  config: RunConfig,
): Promise<ProcessResult> {
  const msg = envelope.message

  // Garde-fou Max Loops : un message relu trop de fois part en DLQ (archive).
  if (envelope.read_ct > config.maxLoopsPerJob) {
    await ports.queue.archive(envelope.msg_id)
    return { status: 'max_loops', msgId: envelope.msg_id }
  }

  // reminder_notify : voie dediee, ce n'est pas un job IA (ni LLM, ni credits/COGS, ni ack).
  if (msg.type === 'reminder_notify') {
    return processReminderNotify(envelope, msg, ports, config)
  }

  // action_propose/action_execute/action_bounce : gate HIGH, ce n'est pas un job IA non plus.
  if (msg.type === 'action_propose' || msg.type === 'action_execute' || msg.type === 'action_bounce') {
    return processActionGate(envelope, msg, ports, config)
  }

  // Taches Launchpad (chase_unpaid/check_deadlines/daily_summary/sort_inbox) :
  // dispatch par registre (voir tasks/registry.ts), credits/cost geres par le
  // handler lui-meme (0..N items par job, pas un seul outcome comme ci-dessous).
  if (TASK_JOB_TYPES.has(msg.type)) {
    return processTask(envelope, msg, ports, llm, config)
  }

  // Idempotence : un même évènement source ne produit qu'un job.
  const begin = await ports.jobRuns.begin(msg.tenant_id, msg)
  if (!begin.fresh) {
    await ports.queue.delete(envelope.msg_id)
    return { status: 'skipped_idempotent', msgId: envelope.msg_id }
  }

  try {
    const result = await ports.tracer.trace(
      `job:${msg.type}`,
      { tenant: msg.tenant_id, type: msg.type, source: msg.source },
      async (traceId) => {
        const tenant = await ports.tenants.load(msg.tenant_id)
        // Ack non bloquant immédiat (UX TDAH : "je m'en occupe").
        await ports.notifier.ack(msg.tenant_id, 'Je m’en occupe.')

        const ctx: PipelineContext = {
          tenant,
          ports,
          llm,
          jobRunId: begin.jobRunId,
          traceId,
        }

        let outcome: StageOutcome
        switch (msg.type) {
          case 'capture_document':
            outcome = await ocrDocument(ctx, msg, requireDocId(msg.document_id))
            break
          case 'capture_audio':
            outcome = await planTasks(ctx, msg)
            break
          case 'draft_quote':
            outcome = await draftDocument(ctx, msg, 'brouillon_devis')
            break
          case 'draft_invoice':
            outcome = await draftDocument(ctx, msg, 'brouillon_facture')
            break
          default:
            throw new Error(`[run] Type de job inconnu : ${String(msg.type)}`)
        }

        // Comptabilisation ferme : crédits + coût réel (COGS).
        await ports.credits.record({
          tenantId: msg.tenant_id,
          jobRunId: begin.jobRunId,
          actionCategory: outcome.category,
          weight: outcomeCredits(outcome),
          langfuseTraceId: traceId,
        })
        await ports.credits.recordCost({
          tenantId: msg.tenant_id,
          jobRunId: begin.jobRunId,
          role: outcome.modelConfig.financePinned ? 'cerveau:finance' : 'pipeline',
          model: outcome.modelConfig.model,
          provider: outcome.modelConfig.provider,
          tokensIn: outcome.tokensIn,
          tokensOut: outcome.tokensOut,
          usdCost: outcome.usdCost,
          langfuseTraceId: traceId,
        })
        return outcome
      },
    )

    void result
    await ports.jobRuns.finish(begin.jobRunId, 'done')
    await ports.queue.delete(envelope.msg_id)
    return { status: 'done', msgId: envelope.msg_id }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    await ports.jobRuns.finish(begin.jobRunId, 'error', message)
    // Si on a épuisé les tentatives, archive (DLQ) ; sinon laisse le message
    // redevenir visible pour un retry borné.
    if (envelope.read_ct + 1 > config.maxLoopsPerJob) {
      await ports.queue.archive(envelope.msg_id)
    }
    return { status: 'error', msgId: envelope.msg_id }
  }
}

/**
 * reminder_notify : relai texte vers Telegram, sans pipeline IA. Idempotence propre
 * (job_runs) car la voie precoce court-circuite le begin() partage plus bas.
 */
async function processReminderNotify(
  envelope: QueueEnvelope,
  msg: JobMessage,
  ports: Ports,
  config: RunConfig,
): Promise<ProcessResult> {
  const begin = await ports.jobRuns.begin(msg.tenant_id, msg)
  if (!begin.fresh) {
    await ports.queue.delete(envelope.msg_id)
    return { status: 'skipped_idempotent', msgId: envelope.msg_id }
  }

  try {
    await ports.notifier.notifyReminderDue(msg.tenant_id, formatReminderMessage(msg.reminder))
    await ports.jobRuns.finish(begin.jobRunId, 'done')
    await ports.queue.delete(envelope.msg_id)
    return { status: 'done', msgId: envelope.msg_id }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    await ports.jobRuns.finish(begin.jobRunId, 'error', message)
    if (envelope.read_ct + 1 > config.maxLoopsPerJob) {
      await ports.queue.archive(envelope.msg_id)
    }
    return { status: 'error', msgId: envelope.msg_id }
  }
}

/**
 * Taches Launchpad : idempotence propre (job_runs), ack immediat (UX TDAH),
 * puis dispatch au handler enregistre (tasks/registry.ts). Le handler gere
 * lui-meme ses credits/COGS (0..N items traites par job).
 */
async function processTask(
  envelope: QueueEnvelope,
  msg: JobMessage,
  ports: Ports,
  llm: LlmClient,
  config: RunConfig,
): Promise<ProcessResult> {
  const begin = await ports.jobRuns.begin(msg.tenant_id, msg)
  if (!begin.fresh) {
    await ports.queue.delete(envelope.msg_id)
    return { status: 'skipped_idempotent', msgId: envelope.msg_id }
  }

  try {
    const handler = TASK_HANDLERS[msg.type]
    if (!handler) {
      throw new Error(`[run] Aucun handler enregistre pour la tache : ${msg.type}`)
    }
    const tenant = await ports.tenants.load(msg.tenant_id)
    await ports.notifier.ack(msg.tenant_id, 'Je m’en occupe.')

    await ports.tracer.trace(
      `job:${msg.type}`,
      { tenant: msg.tenant_id, type: msg.type, source: msg.source },
      (traceId) => handler({ tenant, ports, llm, jobRunId: begin.jobRunId, traceId }),
    )

    await ports.jobRuns.finish(begin.jobRunId, 'done')
    await ports.queue.delete(envelope.msg_id)
    return { status: 'done', msgId: envelope.msg_id }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    await ports.jobRuns.finish(begin.jobRunId, 'error', message)
    if (envelope.read_ct + 1 > config.maxLoopsPerJob) {
      await ports.queue.archive(envelope.msg_id)
    }
    return { status: 'error', msgId: envelope.msg_id }
  }
}

/**
 * action_propose/action_execute : relai du gate HIGH (envoi devis/facture), sans
 * pipeline IA. Idempotence propre (job_runs), meme voie precoce que reminder_notify.
 */
async function processActionGate(
  envelope: QueueEnvelope,
  msg: JobMessage,
  ports: Ports,
  config: RunConfig,
): Promise<ProcessResult> {
  const begin = await ports.jobRuns.begin(msg.tenant_id, msg)
  if (!begin.fresh) {
    await ports.queue.delete(envelope.msg_id)
    return { status: 'skipped_idempotent', msgId: envelope.msg_id }
  }

  try {
    const pendingActionId = requirePendingActionId(msg.action?.pending_action_id)
    const action = await ports.pendingActions.load(msg.tenant_id, pendingActionId)
    if (!action) {
      throw new Error(`[run] pending_action introuvable : ${pendingActionId}`)
    }

    if (msg.type === 'action_propose') {
      await processActionPropose(msg.tenant_id, action, ports)
    } else if (msg.type === 'action_execute') {
      await processActionExecute(msg.tenant_id, action, ports, begin.jobRunId)
    } else {
      await processActionBounce(msg.tenant_id, action, ports, begin.jobRunId, requireBounceKind(msg.action?.bounce_kind))
    }

    await ports.jobRuns.finish(begin.jobRunId, 'done')
    await ports.queue.delete(envelope.msg_id)
    return { status: 'done', msgId: envelope.msg_id }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    await ports.jobRuns.finish(begin.jobRunId, 'error', message)
    if (envelope.read_ct + 1 > config.maxLoopsPerJob) {
      await ports.queue.archive(envelope.msg_id)
    }
    return { status: 'error', msgId: envelope.msg_id }
  }
}

async function processActionPropose(
  tenantId: string,
  action: PendingActionRow,
  ports: Ports,
): Promise<void> {
  // Deja decidee (approuvee/rejetee/executee) entre l'enqueue et le traitement : rien a proposer.
  if (action.status !== 'pending') return
  if (action.actionType === 'chase_reminder') {
    const payload = parseChaseReminderPayload(action.payload)
    await ports.notifier.proposeApproval(tenantId, action.id, formatChaseApprovalSummary(payload))
    return
  }
  const payload = parseSendEmailPayload(action.payload)
  await ports.notifier.proposeApproval(tenantId, action.id, formatApprovalSummary(payload))
}

async function processActionExecute(
  tenantId: string,
  action: PendingActionRow,
  ports: Ports,
  jobRunId: string,
): Promise<void> {
  // Deja envoyee : idempotence, pas de double email.
  if (action.status === 'executed') return

  if (action.actionType === 'chase_reminder') {
    return processChaseReminderExecute(tenantId, action, ports)
  }

  const payload = parseSendEmailPayload(action.payload)

  if (action.status === 'rejected') {
    await ports.notifier.notifyActionResult(tenantId, formatActionResult('rejected', payload))
    return
  }

  if (action.status === 'expired') {
    await ports.notifier.notifyActionResult(tenantId, formatActionResult('expired', payload))
    return
  }

  if (action.status !== 'approved') {
    throw new Error(`[run] action_execute sur pending_action au statut inattendu : ${action.status}`)
  }

  const { bytes } = await ports.media.getObject(payload.pdf_key)
  const email = formatDocumentEmail(payload)
  const sent = await ports.mailer.sendDocumentEmail({
    to: payload.client_email,
    ...(payload.cc ? { cc: payload.cc } : {}),
    subject: email.subject,
    textBody: email.textBody,
    htmlBody: email.htmlBody,
    attachment: {
      filename: email.filename,
      contentBase64: Buffer.from(bytes).toString('base64'),
      contentType: 'application/pdf',
    },
  })
  // Le MessageID est persiste pour correler un eventuel bounce/spam-complaint
  // Postmark a cette pending_action (le webhook de bounce ne recoit que le
  // MessageID, jamais notre tenant_id/pending_action_id).
  await ports.pendingActions.markExecuted(tenantId, action.id, sent.messageId)
  await ports.drafts.markSent(tenantId, payload.draft_id)
  // Poids symbolique de suivi d'usage (pas de LLM ici) : jamais bloquant, le
  // gate Telegram est le seul controle sur l'envoi.
  await ports.credits.record({
    tenantId,
    jobRunId,
    actionCategory: 'envoi_document',
    weight: creditCost('envoi_document'),
  })
  await ports.notifier.notifyActionResult(tenantId, formatActionResult('executed', payload))
}

/**
 * Execution d'une relance impaye approuvee : email TEXTE seul (pas de PDF/R2).
 * Le poids relance_client a deja ete comptabilise a la proposition (chase_unpaid) ;
 * aucun credit supplementaire ici (symetrique a envoi_document mais pas double-compte).
 */
async function processChaseReminderExecute(
  tenantId: string,
  action: PendingActionRow,
  ports: Ports,
): Promise<void> {
  const payload = parseChaseReminderPayload(action.payload)

  if (action.status === 'rejected') {
    await ports.notifier.notifyActionResult(tenantId, formatChaseActionResult('rejected', payload))
    return
  }
  if (action.status === 'expired') {
    await ports.notifier.notifyActionResult(tenantId, formatChaseActionResult('expired', payload))
    return
  }
  if (action.status !== 'approved') {
    throw new Error(`[run] action_execute sur pending_action au statut inattendu : ${action.status}`)
  }

  const email = formatChaseReminderEmail(payload)
  const sent = await ports.mailer.sendDocumentEmail({
    to: payload.client_email,
    ...(payload.cc ? { cc: payload.cc } : {}),
    subject: email.subject,
    textBody: email.textBody,
  })
  await ports.pendingActions.markExecuted(tenantId, action.id, sent.messageId)
  await ports.notifier.notifyActionResult(tenantId, formatChaseActionResult('executed', payload))
}

/**
 * action_bounce : hard bounce ou spam-complaint Postmark sur un envoi HIGH
 * deja execute. Hard bounce -> remboursement du credit envoi_document (le
 * document n'est jamais arrive) + notification. Spam complaint -> notification
 * seule (le document est bien arrive, pas de remboursement). Soft bounce
 * n'atteint jamais ce point (filtre au niveau du webhook, cf. webhook-core.ts).
 */
async function processActionBounce(
  tenantId: string,
  action: PendingActionRow,
  ports: Ports,
  jobRunId: string,
  bounceKind: Exclude<BounceKind, 'soft'>,
): Promise<void> {
  // Rien a rembourser/notifier si l'envoi n'a en fait jamais ete execute
  // (bounce arrive avant l'execution, ou pending_action dans un autre etat).
  if (action.status !== 'executed') return

  // Garde d'idempotence : un deuxieme webhook Postmark pour le meme MessageID
  // (retry) ne doit ni rembourser ni notifier une deuxieme fois.
  const isFirstBounce = await ports.pendingActions.markBounced(tenantId, action.id, bounceKind)
  if (!isFirstBounce) return

  if (action.actionType === 'chase_reminder') {
    const chasePayload = parseChaseReminderPayload(action.payload)
    // Pas de remboursement : relance_client est comptabilise a la redaction
    // (chase_unpaid), pas a l'envoi -- rien a rembourser ici, juste notifier.
    await ports.notifier.notifyActionResult(tenantId, formatChaseBounceResult(bounceKind, chasePayload))
    return
  }

  const payload = parseSendEmailPayload(action.payload)

  if (bounceKind === 'hard') {
    // Remboursement : ligne compensatoire de poids negatif, jamais de mutation
    // retroactive du ledger existant (append-only, meme pattern que le reste
    // de credits_ledger).
    await ports.credits.record({
      tenantId,
      jobRunId,
      actionCategory: 'envoi_document',
      weight: -creditCost('envoi_document'),
    })
  }

  await ports.notifier.notifyActionResult(tenantId, formatBounceResult(bounceKind, payload))
}

/** Un passage : lit un lot et traite chaque message. Retourne le nombre traité. */
export async function runOnce(
  ports: Ports,
  llm: LlmClient,
  config: RunConfig,
): Promise<ProcessResult[]> {
  const batch = await ports.queue.read(config.queueBatchSize, config.visibilityTimeoutSec)
  const results: ProcessResult[] = []
  for (const envelope of batch) {
    results.push(await processEnvelope(envelope, ports, llm, config))
  }
  return results
}

function requireDocId(documentId: string | undefined): string {
  if (!documentId) {
    throw new Error('[run] capture_document sans document_id')
  }
  return documentId
}

function requirePendingActionId(pendingActionId: string | undefined): string {
  if (!pendingActionId) {
    throw new Error('[run] job action_propose/action_execute sans pending_action_id')
  }
  return pendingActionId
}

function requireBounceKind(bounceKind: BounceKind | undefined): Exclude<BounceKind, 'soft'> {
  if (bounceKind !== 'hard' && bounceKind !== 'spam_complaint') {
    throw new Error(`[run] job action_bounce avec bounce_kind invalide : ${String(bounceKind)}`)
  }
  return bounceKind
}
