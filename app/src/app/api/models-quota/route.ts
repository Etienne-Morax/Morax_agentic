/**
 * Morax - route API interne "Modèles actifs + Quota de crédits" (lecture seule, ZERO appel IA).
 * Contrat JSON pour rafraîchissement léger côté serveur. Mêmes garanties que les pages :
 *  - scope=client : client RLS (session), cloisonné par `current_tenant_id()`.
 *  - scope=admin  : gate explicite `users.role='admin'` PUIS service_role (bypass RLS).
 * Aucune clé LLM ni secret dans la réponse (le registre n'expose ni endpoint ni clé ici).
 *
 * Importe @morax/model-core (via le loader) -> runtime nodejs obligatoire.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serviceClient } from '@/lib/supabase-server'
import {
  assertAdminRole,
  ForbiddenAdminAccessError,
  loadAdminModelsQuota,
  loadClientModelsQuota,
} from '@/lib/models-quota-loader'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Envelope<T> {
  success: boolean
  data: T | null
  error: string | null
}

function envelope<T>(data: T): Envelope<T> {
  return { success: true, data, error: null }
}

function failure(error: string): Envelope<never> {
  return { success: false, data: null, error }
}

export async function GET(request: Request): Promise<NextResponse> {
  const scope = new URL(request.url).searchParams.get('scope') ?? 'client'
  if (scope !== 'client' && scope !== 'admin') {
    return NextResponse.json(failure('scope invalide (client|admin)'), { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(failure('non authentifie'), { status: 401 })
  }

  try {
    if (scope === 'client') {
      const view = await loadClientModelsQuota(supabase)
      return NextResponse.json(envelope(view))
    }

    // scope === 'admin' : gate d'abord, puis service_role (jamais l'inverse).
    await assertAdminRole(supabase, user.id)
    const view = await loadAdminModelsQuota(serviceClient())
    return NextResponse.json(envelope(view))
  } catch (error) {
    if (error instanceof ForbiddenAdminAccessError) {
      return NextResponse.json(failure('acces admin refuse'), { status: 403 })
    }
    // Ne pas divulguer le détail interne au client.
    console.error('[api/models-quota]', error)
    return NextResponse.json(failure('erreur interne'), { status: 500 })
  }
}
