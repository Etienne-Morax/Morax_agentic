/**
 * Morax - client Supabase navigateur. Aucune cle service-role ni LLM ici.
 */

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createClient(): SupabaseClient {
  // Next.js n'inline les variables NEXT_PUBLIC_* cote navigateur que pour un
  // acces statique litteral (process.env.X) — un acces dynamique process.env[name]
  // n'est jamais remplace au build et reste undefined dans le bundle client.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url) throw new Error('[supabase] env manquante : NEXT_PUBLIC_SUPABASE_URL')
  if (!anonKey) throw new Error('[supabase] env manquante : NEXT_PUBLIC_SUPABASE_ANON_KEY')

  return createBrowserClient(url, anonKey)
}
