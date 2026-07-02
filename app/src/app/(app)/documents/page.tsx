/**
 * Morax - E2 : liste des brouillons devis/facture (outbound). ZERO appel IA.
 * Lecture seule scope tenant via RLS. Creation via createDraftAction
 * (app/actions/manage-draft.ts), qui redirige vers l'editeur du brouillon cree.
 */

import Link from 'next/link'
import { ChevronRight, FileSignature, Plus, Receipt, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createDraftAction } from '@/app/actions/manage-draft'
import { entityKindSpec } from '@/lib/entity-kind'
import type { StatusTone } from '@/lib/status-tone'
import { StatusPill } from '@/components/status-pill'
import { SectionCard } from '@/components/section-card'
import { EmptyState } from '@/components/empty-state'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

interface DraftListRow {
  id: string
  kind: 'quote' | 'invoice'
  status: 'draft' | 'finalized' | 'sent'
  doc_number: string | null
  client_name: string | null
  created_at: string
}

const KIND_LABEL: Record<DraftListRow['kind'], string> = {
  quote: 'Devis',
  invoice: 'Facture',
}

const KIND_ICON: Record<DraftListRow['kind'], LucideIcon> = {
  quote: FileSignature,
  invoice: Receipt,
}

const STATUS_LABEL: Record<DraftListRow['status'], string> = {
  draft: 'Brouillon',
  finalized: 'Finalise',
  sent: 'Envoye',
}

const STATUS_TONE: Record<DraftListRow['status'], StatusTone> = {
  draft: 'neutral',
  finalized: 'info',
  sent: 'success',
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
  const draftSpec = entityKindSpec('draft')

  const statusCounts = drafts.reduce<Record<DraftListRow['status'], number>>(
    (acc, draft) => {
      acc[draft.status] += 1
      return acc
    },
    { draft: 0, finalized: 0, sent: 0 },
  )

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Devis &amp; factures</h1>
        <div className={styles.newButtons}>
          <form action={createDraftAction}>
            <input type="hidden" name="kind" value="quote" />
            <button className={`${styles.newButton} pressable`} type="submit">
              <Plus className={styles.newButtonIcon} strokeWidth={2} aria-hidden="true" />
              Devis
            </button>
          </form>
          <form action={createDraftAction}>
            <input type="hidden" name="kind" value="invoice" />
            <button className={`${styles.newButton} pressable`} type="submit">
              <Plus className={styles.newButtonIcon} strokeWidth={2} aria-hidden="true" />
              Facture
            </button>
          </form>
        </div>
      </div>

      {drafts.length > 0 && (
        <div className={styles.statusRow}>
          {(['draft', 'finalized', 'sent'] as const).map((status) => (
            <StatusPill
              key={status}
              label={`${STATUS_LABEL[status]} : ${statusCounts[status]}`}
              tone={STATUS_TONE[status]}
            />
          ))}
        </div>
      )}

      <SectionCard title="Brouillons" icon={<FileSignature strokeWidth={2} />} count={drafts.length}>
        {drafts.length === 0 ? (
          <EmptyState icon={<FileSignature strokeWidth={2} />} title="Aucun brouillon pour l'instant." />
        ) : (
          <ul className={styles.list}>
            {drafts.map((draft) => {
              const Icon = KIND_ICON[draft.kind]
              return (
                <li key={draft.id} className={styles.item}>
                  <Link className={`${styles.itemLink} pressable`} href={`/documents/${draft.id}`}>
                    <span
                      className={styles.iconBadge}
                      style={{ background: draftSpec.soft, color: draftSpec.ink }}
                      aria-hidden="true"
                    >
                      <Icon className={styles.icon} strokeWidth={2} />
                    </span>
                    <span className={styles.itemBody}>
                      <span className={styles.kindLabel}>
                        {KIND_LABEL[draft.kind]}
                        {draft.doc_number && <span className={styles.docNumber}>{draft.doc_number}</span>}
                      </span>
                      {draft.client_name && <span className={styles.client}>{draft.client_name}</span>}
                    </span>
                    <StatusPill label={STATUS_LABEL[draft.status]} tone={STATUS_TONE[draft.status]} />
                    <ChevronRight className={styles.chevron} strokeWidth={2} aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>
    </section>
  )
}
