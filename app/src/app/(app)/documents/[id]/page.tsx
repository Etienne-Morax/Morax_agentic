/**
 * Morax - E2 : editeur inline d'un brouillon devis/facture (outbound).
 * Lecture scope tenant via RLS. L'ecriture passe par updateDraftAction
 * (app/actions/manage-draft.ts), elle aussi RLS-scopee. Action LOW : aucun
 * envoi externe ici, seulement lecture/edition du brouillon local.
 */

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { DraftFields } from '@/lib/document-draft-core'
import { DocumentDraftForm } from './document-draft-form'
import { FinalizeDraftForm } from './finalize-draft-form'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  finalized: 'Finalise',
  sent: 'Envoye',
}

interface DraftDetailRow {
  id: string
  kind: 'quote' | 'invoice'
  status: 'draft' | 'finalized' | 'sent'
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
  created_at: string
}

export default async function DocumentDraftPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('document_drafts')
    .select(
      'id, kind, status, doc_number, client_name, client_address, client_email, currency, vat_rate, line_items, notes, issue_date, due_date, created_at',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`[document-draft] ${error.message}`)
  if (!data) notFound()

  const draft = data as DraftDetailRow

  return (
    <section>
      <div className={styles.header}>
        <h1 className={styles.title}>
          {draft.kind === 'quote' ? 'Devis' : 'Facture'}
          {draft.doc_number ? ` — ${draft.doc_number}` : ''}
        </h1>
        <div className={styles.fieldRow}>
          <span className={styles.badge}>{STATUS_LABEL[draft.status] ?? draft.status}</span>
          <a className={styles.pdfLink} href={`/documents/${draft.id}/pdf`}>
            Telecharger le PDF
          </a>
        </div>
      </div>
      <p className={styles.meta}>
        Cree le {new Date(draft.created_at).toLocaleString('en-GB')}
      </p>

      <DocumentDraftForm
        draftId={draft.id}
        readOnly={draft.status !== 'draft'}
        initial={{
          kind: draft.kind,
          docNumber: draft.doc_number ?? undefined,
          clientName: draft.client_name ?? undefined,
          clientAddress: draft.client_address ?? undefined,
          clientEmail: draft.client_email ?? undefined,
          currency: draft.currency,
          vatRate: draft.vat_rate,
          issueDate: draft.issue_date ?? undefined,
          dueDate: draft.due_date ?? undefined,
          notes: draft.notes ?? undefined,
          lineItems: draft.line_items ?? [],
        }}
      />

      {draft.status === 'draft' && <FinalizeDraftForm draftId={draft.id} />}
    </section>
  )
}
