'use server'

/**
 * Centre de Commandement - envoi d'un message de chat. Touche le client Supabase
 * serveur (insert command_messages) : doit etre une Server Action, jamais un
 * insert direct depuis un composant client. tenant_id n'est jamais fourni par
 * l'appelant -- la colonne a pour default current_tenant_id() et la policy RLS
 * 'with check' rejette toute valeur differente (voir migration
 * 0010_command_messages.sql). Un message utilisateur n'est pas une action
 * HIGH-risk (donnee applicative normale du tenant, comme un document ou un
 * reminder) : pas de gate d'approbation ici, contrairement a triggerShortcut.
 *
 * Apres l'insert, on enfile un job command_reply (worker/src/tasks/command-reply.ts)
 * qui redige et insere la reponse de l'agent (role='agent'). Sans ca, le
 * message utilisateur restait stocke sans jamais declencher de reponse -- le
 * chat n'affichait donc jamais rien.
 */

import { createClient } from '@/lib/supabase/server'
import { enqueueJob, serviceClient } from '@/lib/supabase-server'
import { mapCommandMessageRow, type CommandMessageRow } from '@/lib/command-center/chat-message-core'
import type { ChatMessage } from '@/lib/command-center/types'
import { putObject } from '@/lib/r2'
import { buildVoiceUploadKey, validateVoiceUpload } from '@/lib/voice-upload-core'

export interface SendCommandMessageResult {
  ok: boolean
  message?: ChatMessage
  error?: string
}

/** Insere un tour role='user', tenant derive de la session (jamais fourni par l'appelant). */
async function insertUserMessage(body: string): Promise<{ tenantId: string; row: CommandMessageRow } | { error: string }> {
  const supabase = await createClient()
  const { data: tenantId, error: tenantError } = await supabase.rpc('current_tenant_id')
  if (tenantError || !tenantId) {
    return { error: 'Session tenant introuvable.' }
  }

  const { data, error } = await supabase
    .from('command_messages')
    .insert({ role: 'user', body })
    .select('id, role, body, created_at')
    .single()

  if (error) {
    return { error: error.message }
  }

  return { tenantId: tenantId as string, row: data as CommandMessageRow }
}

export async function sendCommandMessage(content: string): Promise<SendCommandMessageResult> {
  const trimmed = content.trim()
  if (!trimmed) {
    return { ok: false, error: 'Message vide.' }
  }

  const inserted = await insertUserMessage(trimmed)
  if ('error' in inserted) {
    return { ok: false, error: `[sendCommandMessage] ${inserted.error}` }
  }

  await enqueueJob(serviceClient(), {
    schema_version: 1,
    type: 'command_reply',
    tenant_id: inserted.tenantId,
    source: 'app',
    idempotency_key: `command-reply:${inserted.row.id}`,
    enqueued_at: new Date().toISOString(),
  })

  return {
    ok: true,
    message: mapCommandMessageRow(inserted.row),
  }
}

/**
 * Trace dans le chat qu'une piece jointe a ete envoyee (le pipeline OCR
 * capture_document notifie deja le resultat via Telegram -- pas de reponse
 * LLM ici, juste un repere visuel dans l'historique web).
 */
export async function logAttachmentMessage(filename: string): Promise<SendCommandMessageResult> {
  const inserted = await insertUserMessage(`📎 Piece jointe envoyee : ${filename}`)
  if ('error' in inserted) {
    return { ok: false, error: `[logAttachmentMessage] ${inserted.error}` }
  }

  return {
    ok: true,
    message: mapCommandMessageRow(inserted.row),
  }
}

export interface UploadVoiceResult {
  ok: boolean
  message: string
}

const VOICE_GENERIC_ERROR = 'Envoi impossible. Reessaie dans un instant.'

/**
 * Message vocal (deja reencode en WAV cote client, cf. encode-wav.ts) : upload
 * R2 puis enfile capture_audio. Le worker transcrit (Gemini Flash-Lite) et
 * poste le texte comme tour utilisateur normal, avant d'enfiler command_reply
 * -- la voix rejoint la meme conversation que le chat texte (WS3).
 */
export async function uploadVoiceMessage(formData: FormData): Promise<UploadVoiceResult> {
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { ok: false, message: 'Aucun message vocal enregistre.' }
  }

  const validation = validateVoiceUpload({ size: file.size, type: file.type })
  if (!validation.success) {
    return { ok: false, message: validation.message }
  }

  try {
    const supabase = await createClient()
    const { data: tenantId, error: tenantError } = await supabase.rpc('current_tenant_id')
    if (tenantError || !tenantId) {
      return { ok: false, message: 'Session tenant introuvable.' }
    }

    const voiceId = crypto.randomUUID()
    const mediaKey = buildVoiceUploadKey(tenantId as string, voiceId, 'message.wav')
    const bytes = new Uint8Array(await file.arrayBuffer())
    await putObject(mediaKey, bytes, 'audio/wav')

    await enqueueJob(serviceClient(), {
      schema_version: 1,
      type: 'capture_audio',
      tenant_id: tenantId as string,
      source: 'app',
      media_key: mediaKey,
      idempotency_key: `voice:${mediaKey}`,
      enqueued_at: new Date().toISOString(),
    })

    return { ok: true, message: 'Message vocal envoye.' }
  } catch (error) {
    console.error('[command/voice] echec inattendu', error)
    return { ok: false, message: VOICE_GENERIC_ERROR }
  }
}
