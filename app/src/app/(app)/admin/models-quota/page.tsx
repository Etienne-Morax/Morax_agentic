/**
 * Dashboard admin "Modeles actifs + Quota de credits" (Etienne uniquement).
 * Detail complet : modeles tous paliers + credits global/par-tenant + tendance COGS.
 * ZERO appel IA. La vue admin bypasse la RLS (service_role) UNIQUEMENT apres avoir
 * verifie explicitement `users.role = 'admin'` via un client RLS classique (voir
 * app/src/lib/models-quota-loader.ts pour le detail de la garantie).
 *
 * Importe @morax/model-core (via models-quota-loader) -> runtime nodejs requis,
 * meme contrainte que app/src/app/(app)/credits/page.tsx et .../documents/[id]/pdf/route.tsx.
 */

import { notFound } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase-server'
import { assertAdminRole, ForbiddenAdminAccessError, loadAdminModelsQuota } from '@/lib/models-quota-loader'
import { ModelsQuotaPanel } from '@/components/models-quota-panel'
import styles from '../../credits/page.module.css'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function AdminModelsQuotaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  try {
    await assertAdminRole(supabase, user.id)
  } catch (error) {
    if (error instanceof ForbiddenAdminAccessError) notFound()
    throw error
  }

  // Verification admin passee : bypass RLS via service_role pour agreger TOUS les
  // tenants. Jamais accessible sans le garde ci-dessus (voir models-quota-loader.ts).
  const view = await loadAdminModelsQuota(serviceClient())

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>
        <ShieldAlert aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} />
        Modeles &amp; quota — vue admin
      </h1>
      <ModelsQuotaPanel detail="admin" view={view} />
    </section>
  )
}
