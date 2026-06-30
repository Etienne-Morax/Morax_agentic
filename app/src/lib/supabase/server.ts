/**
 * Morax - client Supabase cote serveur, scope au tenant via la session Auth.
 * Role `authenticated`, RLS active (current_tenant_id() lit le claim JWT).
 * A NE PAS confondre avec supabase-server.ts (service-role, webhooks uniquement).
 */

import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`[supabase] env manquante : ${name}`)
  return v
}

export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()

  return createServerClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // setAll appele depuis un Server Component (pas une Server Action / route
            // handler) : la session sera quand meme rafraichie par le middleware.
          }
        },
      },
    },
  )
}
