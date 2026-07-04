'use server'

/**
 * Morax - Scanner un document (upload photo/PDF depuis le telephone).
 * Cree un document en statut `received` puis empile le job capture_document
 * (pipeline OCR existant). Action LOW : aucun envoi externe, pas de gate HIGH.
 * Le tenant est TOUJOURS derive de la session authentifiee (RPC
 * current_tenant_id(), jamais fourni par le client).
 */

import { revalidatePath } from 'next/cache'
import type { JobMessage } from '@morax/model-core'
import { createClient } from '@/lib/supabase/server'
import { enqueueJob, serviceClient } from '@/lib/supabase-server'
import { buildScanUploadKey, validateScanUpload } from '@/lib/scan-upload-core'
import { putObject } from '@/lib/r2'

export interface UploadScanResult {
  ok: boolean
  message: string
}

const GENERIC_ERROR_MESSAGE = 'Envoi impossible. Reessaie dans un instant.'

export async function uploadScannedDocument(formData: FormData): Promise<UploadScanResult> {
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { ok: false, message: 'Aucun fichier selectionne.' }
  }

  const validation = validateScanUpload({ size: file.size, type: file.type })
  if (!validation.success) {
    return { ok: false, message: validation.message }
  }

  try {
    const supabase = await createClient()
    const { data: tenantId, error: tenantError } = await supabase.rpc('current_tenant_id')
    if (tenantError || !tenantId) {
      return { ok: false, message: 'Session tenant introuvable.' }
    }

    const { data: created, error: insertError } = await supabase
      .from('documents')
      .insert({
        tenant_id: tenantId as string,
        source: 'upload',
        mime: file.type,
        status: 'received',
      })
      .select('id')
      .single()

    if (insertError || !created) {
      console.error('[scan/upload] insertion documents impossible', insertError)
      return { ok: false, message: GENERIC_ERROR_MESSAGE }
    }
    const documentId = (created as { id: string }).id

    const mediaKey = buildScanUploadKey(tenantId as string, documentId, file.name || 'scan')
    const bytes = new Uint8Array(await file.arrayBuffer())
    await putObject(mediaKey, bytes, file.type)

    const { error: updateError } = await supabase
      .from('documents')
      .update({ media_key: mediaKey })
      .eq('id', documentId)

    if (updateError) {
      console.error('[scan/upload] mise a jour media_key impossible', updateError)
      return { ok: false, message: GENERIC_ERROR_MESSAGE }
    }

    const jobMessage: JobMessage = {
      schema_version: 1,
      type: 'capture_document',
      tenant_id: tenantId as string,
      source: 'upload',
      document_id: documentId,
      media_key: mediaKey,
      idempotency_key: `upload:${documentId}`,
      enqueued_at: new Date().toISOString(),
    }
    await enqueueJob(serviceClient(), jobMessage)

    revalidatePath('/inbox')
    revalidatePath('/')

    return { ok: true, message: 'Document envoye pour analyse.' }
  } catch (error) {
    console.error('[scan/upload] echec inattendu', error)
    return { ok: false, message: GENERIC_ERROR_MESSAGE }
  }
}
