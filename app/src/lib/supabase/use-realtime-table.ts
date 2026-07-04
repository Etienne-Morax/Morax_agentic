'use client'

/**
 * Morax - abonnement Realtime generique a une table tenant-scoped (postgres_changes).
 * RLS (tenant_id = current_tenant_id()) restreint deja les lignes visibles ; le
 * filtre tenant_id=eq.<id> ici est une defense en profondeur + limite le trafic
 * evalue cote serveur, pas la seule barriere de securite.
 */

import { useEffect, useRef } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createClient } from './client'

/** Meme borne generique que RealtimePostgresChangesPayload (supabase-js) : `unknown` rejetterait les interfaces concretes sans index signature (ex. CommandMessageRow). */
export function useRealtimeTable<T extends Record<string, any>>(
  table: string,
  tenantId: string | undefined,
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void,
): void {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!tenantId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`${table}:${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `tenant_id=eq.${tenantId}` },
        (payload: RealtimePostgresChangesPayload<T>) => onChangeRef.current(payload),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, tenantId])
}
