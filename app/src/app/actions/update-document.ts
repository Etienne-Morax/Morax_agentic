'use server'

/**
 * Morax - Server Action : edition inline d'un document.
 * RLS scope l'UPDATE au tenant courant via la session (current_tenant_id()).
 * Ne JAMAIS filtrer le tenant a la main ici : la policy `doc_tenant` le fait.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  buildExtractedPatch,
  validateExtracted,
  type ExtractedFields,
  type ExtractedFieldsFormInput,
} from '@/lib/document-edit-core'

const EDITABLE_FIELDS = [
  'montant',
  'devise',
  'date_emission',
  'date_echeance',
  'emetteur',
  'destinataire',
  'numero_document',
] as const

export interface UpdateDocumentState {
  success: boolean
  errors?: Record<string, string>
  message?: string
}

function readFormInput(formData: FormData): ExtractedFieldsFormInput {
  const input: ExtractedFieldsFormInput = {}
  for (const field of EDITABLE_FIELDS) {
    input[field] = String(formData.get(field) ?? '')
  }
  return input
}

export async function updateDocumentAction(
  _prevState: UpdateDocumentState,
  formData: FormData,
): Promise<UpdateDocumentState> {
  const documentId = String(formData.get('documentId') ?? '')
  if (!documentId) {
    return { success: false, message: 'Document introuvable.' }
  }

  const validation = validateExtracted(readFormInput(formData))
  if (!validation.success) {
    return { success: false, errors: validation.errors }
  }

  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('documents')
    .select('extracted')
    .eq('id', documentId)
    .maybeSingle()

  if (readError) {
    return { success: false, message: `Lecture impossible : ${readError.message}` }
  }
  if (!existing) {
    return { success: false, message: 'Document introuvable.' }
  }

  const current = (existing.extracted ?? {}) as ExtractedFields
  const patch = buildExtractedPatch(current, validation.data)

  const { error: updateError } = await supabase
    .from('documents')
    .update({ extracted: patch })
    .eq('id', documentId)

  if (updateError) {
    return { success: false, message: `Enregistrement impossible : ${updateError.message}` }
  }

  revalidatePath(`/inbox/${documentId}`)
  revalidatePath('/inbox')

  return { success: true, message: 'Document mis a jour.' }
}
