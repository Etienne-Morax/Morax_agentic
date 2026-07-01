'use server'

/**
 * Morax - E2 : Server Actions pour les brouillons devis/facture (outbound).
 * RLS scope l'insert/update au tenant courant (tenant_id defaut current_tenant_id()
 * a l'insert, policy drft_tenant au check). Action LOW : creation/edition d'un
 * brouillon local, aucun envoi externe -> pas de gate HIGH ici.
 */

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { JobMessage } from '@morax/model-core'
import { createClient } from '@/lib/supabase/server'
import { serviceClient, enqueueJob } from '@/lib/supabase-server'
import { validateDraft, type DraftFields, type DraftFormInput } from '@/lib/document-draft-core'
import {
  buildPdfKey,
  buildSendEmailPayload,
  validateFinalizeDraft,
} from '@/lib/finalize-draft-core'
import { renderDraftPdf } from '@/lib/pdf/render-draft-pdf'
import { putObject } from '@/lib/r2'

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

  const { data: updated, error } = await supabase
    .from('document_drafts')
    .update({
      kind: data.kind,
      doc_number: data.docNumber ?? null,
      client_name: data.clientName ?? null,
      client_address: data.clientAddress ?? null,
      client_email: data.clientEmail ?? null,
      currency: data.currency ?? 'GBP',
      vat_rate: data.vatRate,
      line_items: data.lineItems,
      notes: data.notes ?? null,
      issue_date: data.issueDate ?? null,
      due_date: data.dueDate ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', draftId)
    .eq('status', 'draft')
    .select('id')

  if (error) {
    return { success: false, message: `Enregistrement impossible : ${error.message}` }
  }
  if (!updated || updated.length === 0) {
    return { success: false, message: 'Brouillon deja finalise, non modifiable.' }
  }

  revalidatePath(`/documents/${draftId}`)
  revalidatePath('/documents')

  return { success: true, message: 'Brouillon enregistre.' }
}

interface FinalizeDraftRow {
  tenant_id: string
  status: string
  kind: 'quote' | 'invoice'
  doc_number: string | null
  client_name: string | null
  client_address: string | null
  client_email: string | null
  currency: string
  vat_rate: number
  line_items: DraftFields['lineItems']
  notes: string | null
  issue_date: string | null
  due_date: string | null
}

export async function finalizeDraftAction(
  _prevState: UpdateDraftState,
  formData: FormData,
): Promise<UpdateDraftState> {
  const draftId = String(formData.get('draftId') ?? '')
  if (!draftId) {
    return { success: false, message: 'Brouillon introuvable.' }
  }

  const supabase = await createClient()
  const { data, error: loadError } = await supabase
    .from('document_drafts')
    .select(
      'tenant_id, status, kind, doc_number, client_name, client_address, client_email, currency, vat_rate, line_items, notes, issue_date, due_date',
    )
    .eq('id', draftId)
    .maybeSingle()

  if (loadError || !data) {
    return { success: false, message: 'Brouillon introuvable.' }
  }
  const row = data as FinalizeDraftRow

  const validation = validateFinalizeDraft({
    status: row.status,
    kind: row.kind,
    docNumber: row.doc_number ?? undefined,
    clientEmail: row.client_email ?? undefined,
    lineItems: row.line_items ?? [],
  })
  if (!validation.success) {
    return { success: false, errors: validation.errors, message: validation.errors.form }
  }

  const draft: DraftFields = {
    kind: row.kind,
    docNumber: row.doc_number ?? undefined,
    clientName: row.client_name ?? undefined,
    clientAddress: row.client_address ?? undefined,
    clientEmail: row.client_email ?? undefined,
    currency: row.currency,
    vatRate: row.vat_rate,
    issueDate: row.issue_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    notes: row.notes ?? undefined,
    lineItems: row.line_items ?? [],
  }

  const pdfBuffer = await renderDraftPdf(draft)
  const pdfKey = buildPdfKey(row.tenant_id, draftId, row.doc_number as string)
  await putObject(pdfKey, new Uint8Array(pdfBuffer), 'application/pdf')

  const { data: finalized, error: finalizeError } = await supabase
    .from('document_drafts')
    .update({ status: 'finalized', pdf_key: pdfKey, finalized_at: new Date().toISOString() })
    .eq('id', draftId)
    .eq('status', 'draft')
    .select('id')

  if (finalizeError) {
    return { success: false, message: `Finalisation impossible : ${finalizeError.message}` }
  }
  if (!finalized || finalized.length === 0) {
    return { success: false, message: 'Deja finalise.' }
  }

  const payload = buildSendEmailPayload({
    draftId,
    kind: row.kind,
    docNumber: row.doc_number as string,
    clientEmail: row.client_email as string,
    pdfKey,
    currency: row.currency,
    lineItems: row.line_items ?? [],
    vatRate: row.vat_rate,
  })

  const { data: pendingAction, error: pendingError } = await supabase
    .from('pending_actions')
    .insert({
      tenant_id: row.tenant_id,
      action_type: 'send_email',
      risk: 'HIGH',
      payload,
      status: 'pending',
    })
    .select('id')
    .single()

  if (pendingError || !pendingAction) {
    return {
      success: false,
      message: `Proposition d'envoi impossible : ${pendingError?.message ?? 'erreur inconnue'}`,
    }
  }
  const pendingActionId = (pendingAction as { id: string }).id

  const jobMessage: JobMessage = {
    schema_version: 1,
    type: 'action_propose',
    tenant_id: row.tenant_id,
    source: 'app',
    action: { pending_action_id: pendingActionId },
    idempotency_key: `act-prop:${pendingActionId}`,
    enqueued_at: new Date().toISOString(),
  }
  await enqueueJob(serviceClient(), jobMessage)

  revalidatePath(`/documents/${draftId}`)
  revalidatePath('/documents')

  return { success: true, message: 'Brouillon finalise. Envoi propose sur Telegram.' }
}
