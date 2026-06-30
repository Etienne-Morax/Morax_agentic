/**
 * Detail document + editeur inline (seule ecriture de Milestone E1).
 * Lecture scope tenant via RLS. L'ecriture passe par la Server Action
 * updateDocumentAction (app/actions/update-document.ts), elle aussi RLS-scopee.
 */

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { statusTone } from '@/lib/status-tone'
import { StatusPill } from '@/components/status-pill'
import type { ExtractedFields } from '@/lib/document-edit-core'
import { DocumentEditForm } from './document-edit-form'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

interface DocumentDetailRow {
  id: string
  source: 'telegram' | 'email' | 'upload'
  status: 'received' | 'processing' | 'extracted' | 'incomplete' | 'validated' | 'archived'
  extracted: ExtractedFields | null
  created_at: string
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('documents')
    .select('id, source, status, extracted, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`[document-detail] ${error.message}`)
  if (!data) notFound()

  const document = data as DocumentDetailRow

  return (
    <section>
      <div className={styles.header}>
        <h1 className={styles.title}>Document ({document.source})</h1>
        <StatusPill label={document.status} tone={statusTone('document', document.status)} />
      </div>
      <p className={styles.meta}>
        Recu le {new Date(document.created_at).toLocaleString('en-GB')}
      </p>

      <DocumentEditForm documentId={document.id} extracted={document.extracted ?? {}} />
    </section>
  )
}
