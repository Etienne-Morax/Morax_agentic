'use server'

/**
 * Launchpad - declenchement d'un raccourci. Trois comportements possibles
 * (voir ShortcutBehavior) : navigation pure, creation d'un brouillon vide, ou
 * enfilage d'un job reel dans pgmq (jamais plus d'agent_task HIGH mort-ne,
 * cf. migration 0013). Le tenant est TOUJOURS derive de la session
 * authentifiee (RPC current_tenant_id(), jamais fourni par le client).
 */

import type { JobType } from '@morax/model-core'
import { createClient } from '@/lib/supabase/server'
import { enqueueJob, serviceClient } from '@/lib/supabase-server'
import { findShortcut } from '@/lib/command-center/shortcuts'
import type { TriggerResult } from '@/lib/command-center/types'

export async function triggerShortcut(id: string): Promise<TriggerResult> {
  const shortcut = findShortcut(id)
  if (!shortcut || !shortcut.enabled) {
    return { ok: false, message: 'Raccourci indisponible.' }
  }

  try {
    switch (shortcut.behavior.type) {
      case 'navigate':
        return { ok: true, redirectTo: shortcut.behavior.href, message: 'Ouverture.' }
      case 'create-quote-draft':
        return await createQuoteDraft()
      case 'job':
        return await enqueueShortcutJob(shortcut.behavior.jobType)
      default:
        return { ok: false, message: 'Raccourci indisponible.' }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue.'
    return { ok: false, message: `Declenchement impossible : ${message}` }
  }
}

async function createQuoteDraft(): Promise<TriggerResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_drafts')
    .insert({ kind: 'quote' })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, message: `Creation du brouillon impossible : ${error?.message ?? 'erreur inconnue'}` }
  }

  return { ok: true, redirectTo: `/documents/${(data as { id: string }).id}`, message: 'Brouillon cree.' }
}

async function enqueueShortcutJob(jobType: JobType): Promise<TriggerResult> {
  const supabase = await createClient()
  const { data: tenantId, error } = await supabase.rpc('current_tenant_id')
  if (error || !tenantId) {
    return { ok: false, message: 'Session tenant introuvable.' }
  }

  const now = new Date().toISOString()
  await enqueueJob(serviceClient(), {
    schema_version: 1,
    type: jobType,
    tenant_id: tenantId as string,
    source: 'app',
    idempotency_key: buildIdempotencyKey(now, jobType),
    enqueued_at: now,
  })

  return { ok: true, message: 'Lance.' }
}

/** Cle d'idempotence a la minute : un double-tap rapide ne cree pas deux jobs identiques. */
function buildIdempotencyKey(nowIso: string, jobType: string): string {
  return `shortcut:${jobType}:${nowIso.slice(0, 16)}`
}
