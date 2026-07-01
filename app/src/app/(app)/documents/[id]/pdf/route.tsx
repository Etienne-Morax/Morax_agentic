/**
 * Morax - E2 : export PDF d'un brouillon devis/facture (outbound). Action LOW
 * (telechargement local, aucun envoi externe). Lecture RLS-scopee au tenant.
 * @react-pdf/renderer importe uniquement ici (runtime Node requis pour le
 * rendu server-side, jamais dans le bundle client).
 */

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { DraftFields } from '@/lib/document-draft-core'
import { renderDraftPdf } from '@/lib/pdf/render-draft-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DraftRow {
  kind: 'quote' | 'invoice'
  doc_number: string | null
  client_name: string | null
  client_address: string | null
  currency: string
  vat_rate: number
  line_items: DraftFields['lineItems']
  notes: string | null
  issue_date: string | null
  due_date: string | null
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('document_drafts')
    .select(
      'kind, doc_number, client_name, client_address, currency, vat_rate, line_items, notes, issue_date, due_date',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`[document-draft-pdf] ${error.message}`)
  if (!data) notFound()

  const row = data as DraftRow
  const draft: DraftFields = {
    kind: row.kind,
    docNumber: row.doc_number ?? undefined,
    clientName: row.client_name ?? undefined,
    clientAddress: row.client_address ?? undefined,
    currency: row.currency,
    vatRate: row.vat_rate,
    issueDate: row.issue_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    notes: row.notes ?? undefined,
    lineItems: row.line_items ?? [],
  }

  const buffer = await renderDraftPdf(draft)
  const filename = `${draft.kind}-${row.doc_number ?? id}.pdf`

  return new Response(
    // Cast : decalage de version entre lib.dom.BodyInit et Buffer<ArrayBufferLike> de Node.
    buffer as BodyInit,
    {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    },
  )
}
