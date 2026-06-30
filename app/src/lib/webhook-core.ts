/**
 * Morax - logique de webhook, framework-agnostique et testable.
 * Contrainte dure : valide, authentifie, accuse reception < 1s, empile.
 * JAMAIS d'appel IA ici. Le telechargement du media est delegue au worker.
 */

import type { JobMessage, JobType } from '@morax/model-core'

export interface TelegramChat {
  id: number
}

export interface TelegramMessage {
  chat: TelegramChat
  text?: string
  voice?: { file_id: string }
  photo?: Array<{ file_id: string }>
  document?: { file_id: string; mime_type?: string }
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

export interface WebhookDeps {
  /** Authentifie le chat Telegram -> tenant_id, ou null si inconnu. */
  findTenantByTelegram(chatId: string): Promise<string | null>
  /** Cree un document en statut `received`, renvoie son id. */
  createDocument(input: {
    tenantId: string
    source: 'telegram' | 'email'
    mediaKey: string
    mime?: string
  }): Promise<{ documentId: string }>
  /** Empile le job (pgmq via RPC service_role). */
  enqueue(message: JobMessage): Promise<void>
}

export interface WebhookResult {
  /** Statut HTTP a renvoyer (toujours 200 pour acquitter vite). */
  status: number
  enqueued: boolean
  reason?: string
}

const ACK_OK: WebhookResult = { status: 200, enqueued: true }

function classify(message: TelegramMessage): {
  type: JobType
  fileId?: string
  mime?: string
} {
  if (message.photo && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1]
    return { type: 'capture_document', fileId: largest?.file_id }
  }
  if (message.document) {
    return {
      type: 'capture_document',
      fileId: message.document.file_id,
      mime: message.document.mime_type,
    }
  }
  if (message.voice) {
    return { type: 'capture_audio', fileId: message.voice.file_id }
  }
  // Texte seul : brain dump -> decomposition en micro-actions.
  return { type: 'capture_audio' }
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: WebhookDeps,
  now: string,
): Promise<WebhookResult> {
  const message = update.message
  if (!message) {
    return { status: 200, enqueued: false, reason: 'no_message' }
  }

  const chatId = String(message.chat.id)
  const tenantId = await deps.findTenantByTelegram(chatId)
  if (!tenantId) {
    // Chat inconnu : on acquitte mais on n'empile rien (jamais de tenant implicite).
    return { status: 200, enqueued: false, reason: 'unknown_chat' }
  }

  const classified = classify(message)
  const idempotencyKey = `tg:${update.update_id}`

  let documentId: string | undefined
  let mediaKey: string | undefined
  if (classified.fileId) {
    mediaKey = `telegram:${classified.fileId}`
    const created = await deps.createDocument({
      tenantId,
      source: 'telegram',
      mediaKey,
      mime: classified.mime,
    })
    documentId = created.documentId
  }

  const jobMessage: JobMessage = {
    schema_version: 1,
    type: classified.type,
    tenant_id: tenantId,
    source: 'telegram',
    media_key: mediaKey,
    document_id: documentId,
    text: message.text,
    idempotency_key: idempotencyKey,
    enqueued_at: now,
  }

  await deps.enqueue(jobMessage)
  return ACK_OK
}

export interface PostmarkAttachment {
  Name: string
  /** Contenu base64 fourni par Postmark. */
  Content: string
  ContentType: string
}

export interface PostmarkInbound {
  MessageID: string
  OriginalRecipient?: string
  ToFull?: Array<{ Email: string }>
  Subject?: string
  Attachments?: PostmarkAttachment[]
}

export interface PostmarkDeps {
  /** Authentifie l'alias email -> tenant_id, ou null si inconnu. */
  findTenantByEmailAlias(alias: string): Promise<string | null>
  /** Cree un document en statut `received`, renvoie son id. */
  createDocument(input: {
    tenantId: string
    source: 'telegram' | 'email'
    mediaKey: string
    mime?: string
  }): Promise<{ documentId: string }>
  /** Empile le job (pgmq via RPC service_role). */
  enqueue(message: JobMessage): Promise<void>
  /** Depose la piece jointe en R2 sous la cle fournie. */
  uploadAttachment(key: string, bytes: Uint8Array, contentType: string): Promise<void>
}

export async function handlePostmarkInbound(
  payload: PostmarkInbound,
  deps: PostmarkDeps,
  now: string,
): Promise<WebhookResult> {
  const alias = payload.OriginalRecipient ?? payload.ToFull?.[0]?.Email ?? ''
  const tenantId = alias ? await deps.findTenantByEmailAlias(alias) : null
  if (!tenantId) {
    // Alias inconnu : on acquitte mais on n'empile rien (jamais de tenant implicite).
    return { status: 200, enqueued: false, reason: 'unknown_alias' }
  }

  const attachment = payload.Attachments?.[0]
  let mediaKey = `postmark:${payload.MessageID}`
  let mime: string | undefined
  if (attachment) {
    mediaKey = `tenants/${tenantId}/postmark/${payload.MessageID}/${attachment.Name}`
    const bytes = new Uint8Array(Buffer.from(attachment.Content, 'base64'))
    await deps.uploadAttachment(mediaKey, bytes, attachment.ContentType)
    mime = attachment.ContentType
  }

  const { documentId } = await deps.createDocument({
    tenantId,
    source: 'email',
    mediaKey,
    mime,
  })

  const jobMessage: JobMessage = {
    schema_version: 1,
    type: 'capture_document',
    tenant_id: tenantId,
    source: 'email',
    media_key: mediaKey,
    document_id: documentId,
    idempotency_key: `pm:${payload.MessageID}`,
    enqueued_at: now,
  }

  await deps.enqueue(jobMessage)
  return ACK_OK
}
