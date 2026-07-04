/**
 * Morax worker - pipeline déterministe.
 * Étages : Réceptionniste -> Planificateur TDAH -> Exécuteur -> OCR.
 * Contraintes dures appliquées ici :
 *  - lecture finance (date/montant/pénalité) -> Opus, via actionRole finance-critique.
 *  - OCR financier -> jamais d'écriture agenda sans validation humaine.
 *  - action HIGH -> jamais directe, passe par le gate pending_actions.
 */

import { resolveModel, resolveTranscriptionModel } from '@morax/model-core'
import type { ModelConfig, TenantConfig } from '@morax/model-core'
import type { ActionCategory } from '@morax/model-core'
import { creditCost } from '@morax/model-core'
import type { LlmClient, LlmResult } from './llm.js'
import type { Ports } from './ports.js'
import {
  DRAFT_SYSTEM,
  OCR_INSTRUCTION,
  OCR_SYSTEM,
  TRANSCRIBE_INSTRUCTION,
  TRANSCRIBE_SYSTEM,
  parseExtractedFields,
} from './prompts.js'
import type { ExtractedFields, JobMessage } from './types.js'

export interface StageOutcome {
  category: ActionCategory
  modelConfig: ModelConfig
  usdCost: number
  tokensIn: number
  tokensOut: number
}

export interface PipelineContext {
  tenant: TenantConfig
  ports: Ports
  llm: LlmClient
  jobRunId: string
  traceId?: string
}

/**
 * OCR d'une facture/reçu. La LECTURE de la date d'échéance et du montant
 * est finance-critique -> Opus (actionRole). Aucune écriture agenda ici :
 * on émet une proposition à valider par l'humain.
 */
export async function ocrDocument(
  ctx: PipelineContext,
  job: JobMessage,
  documentId: string,
): Promise<StageOutcome> {
  await ctx.ports.documents.setStatus(ctx.tenant.tenant_id, documentId, 'processing')

  // Extraction des champs : finance-critique (montant, date d'échéance) -> Opus.
  const modelConfig = resolveModel({
    tenantConfig: ctx.tenant,
    role: 'workhorse',
    actionRole: 'amount_verification',
  })

  let extracted: ExtractedFields = {}
  let llmResult: LlmResult | undefined
  if (job.media_key) {
    const media = await ctx.ports.media.getObject(job.media_key)
    llmResult = await ctx.llm.complete({
      modelConfig,
      messages: [
        { role: 'system', content: OCR_SYSTEM },
        { role: 'user', content: OCR_INSTRUCTION },
      ],
      attachments: [{ bytes: media.bytes, mediaType: media.contentType }],
      hasPersonalData: true,
    })
    extracted = parseExtractedFields(llmResult.text)
  }

  const hasDeadline = Boolean(extracted.date_echeance)
  const status = hasDeadline ? 'extracted' : 'incomplete'

  await ctx.ports.documents.saveExtracted(
    ctx.tenant.tenant_id,
    documentId,
    extracted,
    /* needsHumanValidation */ true,
  )
  await ctx.ports.documents.setStatus(ctx.tenant.tenant_id, documentId, status)

  // Proposition d'échéance soumise à validation humaine (jamais d'écriture directe).
  if (hasDeadline) {
    await ctx.ports.notifier.proposeReminderValidation(
      ctx.tenant.tenant_id,
      documentId,
      `Échéance détectée : ${extracted.montant ?? '?'} ${extracted.devise ?? ''} le ${extracted.date_echeance}. Valider ?`,
    )
  }

  return toOutcome('scan_document', modelConfig, llmResult)
}

/**
 * Transcrit un message vocal (Gemini Flash-Lite epingle, audio natif via
 * OpenRouter) puis poste le texte comme tour utilisateur normal dans le chat,
 * en enfilant un command_reply -- meme chemin que le chat texte (WS3), la
 * voix n'est qu'une autre porte d'entree vers la meme conversation.
 */
export async function transcribeAudio(
  ctx: PipelineContext,
  job: JobMessage,
  mediaKey: string,
): Promise<StageOutcome> {
  const modelConfig = resolveTranscriptionModel()
  const media = await ctx.ports.media.getObject(mediaKey)
  const llmResult = await ctx.llm.complete({
    modelConfig,
    messages: [
      { role: 'system', content: TRANSCRIBE_SYSTEM },
      { role: 'user', content: TRANSCRIBE_INSTRUCTION },
    ],
    attachments: [{ bytes: media.bytes, mediaType: media.contentType }],
    hasPersonalData: true,
  })

  const transcript = llmResult.text.trim()
  if (!transcript) {
    await ctx.ports.notifier.notifyActionResult(
      ctx.tenant.tenant_id,
      'Message vocal non compris. Réessaie ou écris ta demande.',
    )
    return toOutcome('transcription_vocale', modelConfig, llmResult)
  }

  const posted = await ctx.ports.commandChat.postUser(ctx.tenant.tenant_id, transcript)
  await ctx.ports.queue.send({
    schema_version: 1,
    type: 'command_reply',
    tenant_id: ctx.tenant.tenant_id,
    source: job.source,
    idempotency_key: `command-reply:${posted.id}`,
    enqueued_at: new Date().toISOString(),
  })

  return toOutcome('transcription_vocale', modelConfig, llmResult)
}

/** Brouillon de devis/facture dans la voix client (cerveau non-finance). */
export async function draftDocument(
  ctx: PipelineContext,
  job: JobMessage,
  category: Extract<
    ActionCategory,
    'brouillon_devis' | 'brouillon_facture' | 'devis_complexe'
  >,
): Promise<StageOutcome> {
  const modelConfig = resolveModel({ tenantConfig: ctx.tenant, role: 'cerveau' })
  if (!job.text) {
    return toOutcome(category, modelConfig)
  }
  const llmResult = await ctx.llm.complete({
    modelConfig,
    messages: [
      { role: 'system', content: DRAFT_SYSTEM },
      { role: 'user', content: job.text },
    ],
    hasPersonalData: true,
  })
  return toOutcome(category, modelConfig, llmResult)
}

function toOutcome(
  category: ActionCategory,
  modelConfig: ModelConfig,
  llmResult?: LlmResult,
): StageOutcome {
  return {
    category,
    modelConfig,
    usdCost: llmResult?.usdCost ?? 0,
    tokensIn: llmResult?.tokensIn ?? 0,
    tokensOut: llmResult?.tokensOut ?? 0,
  }
}

/** Crédits à comptabiliser pour une issue d'étage. */
export function outcomeCredits(outcome: StageOutcome): number {
  return creditCost(outcome.category)
}
