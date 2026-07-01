/**
 * Morax - E2 : liste des brouillons devis/facture (outbound). ZERO appel IA.
 * Lecture seule scope tenant via RLS. Creation via createDraftAction
 * (app/actions/manage-draft.ts), qui redirige vers l'editeur du brouillon cree.
 */

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createDraftAction } from '@/app/actions/manage-draft'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

interface DraftListRow {
  id: string
  kind: 'quote' | 'invoice'
  status: 'draft' | 'finalized'
  doc_number: string | null
  client_name: string | null
  created_at: string
}

const KIND_LABEL: Record<DraftListRow['kind'], string> = {
  quote: 'Devis',
  invoice: 'Facture',
}

export default async function DocumentsPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('document_drafts')
    .select('id, kind, status, doc_number, client_name, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`[documents] ${error.message}`)

  const drafts = (data ?? []) as DraftListRow[]

  return (
    <section>
      <div className={styles.header}>
        <h1 className={styles.title}>Devis &amp; factures</h1>
        <div className={styles.newButtons}>
          <form action={createDraftAction}>
            <input type="hidden" name="kind" value="quote" />
            <button className={styles.newButton} type="submit">
              Nouveau devis
            </button>
          </form>
          <form action={createDraftAction}>
            <input type="hidden" name="kind" value="invoice" />
            <button className={styles.newButton} type="submit">
              Nouvelle facture
            </button>
          </form>
        </div>
      </div>

      {drafts.length === 0 ? (
        <p className={styles.empty}>Aucun brouillon pour l&apos;instant.</p>
      ) : (
        <ul className={styles.list}>
          {drafts.map((draft) => (
            <li key={draft.id} className={styles.item}>
              <Link className={styles.itemLink} href={`/documents/${draft.id}`}>
                <span className={styles.itemTitle}>
                  {KIND_LABEL[draft.kind]}
                  {draft.doc_number ? ` — ${draft.doc_number}` : ''}
                  {draft.client_name ? ` (${draft.client_name})` : ''}
                </span>
                <span className={styles.itemStatus}>{draft.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
