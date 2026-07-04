import { type NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // sw.js exclu comme manifest.webmanifest : le navigateur le re-fetch en tache
    // de fond (hors contexte de page) pour detecter les mises a jour - un redirect
    // /login casserait l'enregistrement du service worker si la session a expire.
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
