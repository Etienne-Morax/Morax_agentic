/**
 * Morax - client Supabase navigateur. Aucune cle service-role ni LLM ici.
 */

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`[supabase] env manquante : ${name}`)
  return v
}

export function createClient(): SupabaseClient {
  return createBrowserClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  )
}
