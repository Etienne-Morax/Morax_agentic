import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url))
}

/**
 * GET requis en plus du POST : redirect() (Server Component) emet une
 * navigation GET, et seul un route handler peut ecrire les cookies de
 * deconnexion (un RSC ne peut pas). Sert a nettoyer une session orpheline
 * (utilisateur authentifie sans ligne public.users / tenant_id), cf.
 * getCurrentTenantId.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const redirectUrl = new URL('/login', request.url)
  const reason = request.nextUrl.searchParams.get('reason')
  if (reason) {
    redirectUrl.searchParams.set('e', reason)
  }
  return NextResponse.redirect(redirectUrl)
}
