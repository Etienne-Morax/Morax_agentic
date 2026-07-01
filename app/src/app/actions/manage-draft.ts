'use server'

/**
 * Morax - E2 : Server Actions pour les brouillons devis/facture (outbound).
 * RLS scope l'insert/update au tenant courant (tenant_id defaut current_tenant_id()
 * a l'insert, policy drft_tenant au check). Action LOW : creation/edition d'un
 * brouillon local, aucun envoi externe -> pas de gate HIGH ici.
 */

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateDraft, type DraftFormInput } from '@/lib/document-draft-core'

export interface UpdateDraftState {
  success: boolean
  errors?: Record<string, string>
  message?: string
}

export async function createDraftAction(formData: FormData): Promise<void> {
  const kind = String(formData.get('kind') ?? '')
  if (kind !== 'quote' && kind !== 'invoice') {
    throw new Error('[document-drafts] kind invalide')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_drafts')
    .insert({ kind })
    .select('id')
    .single()

  if (error) throw new Error(`[document-drafts] creation impossible : ${error.message}`)

  revalidatePath('/documents')
  redirect(`/documents/${(data as { id: string }).id}`)
}

function readLineItems(formData: FormData): unknown {
  const raw = String(formData.get('lineItems') ?? '[]')
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function updateDraftAction(
  _prevState: UpdateDraftState,
  formData: FormData,
): Promise<UpdateDraftState> {
  const draftId = String(formData.get('draftId') ?? '')
  if (!draftId) {
    return { success: false, message: 'Brouillon introuvable.' }
  }

  const lineItems = readLineItems(formData)
  if (lineItems === null) {
    return { success: false, errors: { lineItems: 'Lignes invalides.' } }
  }

  const input: DraftFormInput = {
    kind: String(formData.get('kind') ?? ''),
    docNumber: String(formData.get('docNumber') ?? ''),
    clientName: String(formData.get('clientName') ?? ''),
    clientAddress: String(formData.get('clientAddress') ?? ''),
    currency: String(formData.get('currency') ?? ''),
    vatRate: String(formData.get('vatRate') ?? ''),
    issueDate: String(formData.get('issueDate') ?? ''),
    dueDate: String(formData.get('dueDate') ?? ''),
    notes: String(formData.get('notes') ?? ''),
    lineItems,
  }

  const validation = validateDraft(input)
  if (!validation.success) {
    return { success: false, errors: validation.errors }
  }

  const { data } = validation
  const supabase = await createClient()

  const { error } = await supabase
    .from('document_drafts')
    .update({
      kind: data.kind,
      doc_number: data.docNumber ?? null,
      client_name: data.clientName ?? null,
      client_address: data.clientAddress ?? null,
      currency: data.currency ?? 'GBP',
      vat_rate: data.vatRate,
      line_items: data.lineItems,
      notes: data.notes ?? null,
      issue_date: data.issueDate ?? null,
      due_date: data.dueDate ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', draftId)

  if (error) {
    return { success: false, message: `Enregistrement impossible : ${error.message}` }
  }

  revalidatePath(`/documents/${draftId}`)
  revalidatePath('/documents')

  return { success: true, message: 'Brouillon enregistre.' }
}
