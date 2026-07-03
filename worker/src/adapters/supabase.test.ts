import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeJobRuns } from './supabase.js'
import type { JobMessage } from '../types.js'

/**
 * Fake minimal du query-builder Supabase : chaque terminal (`.single()` ou
 * `await`-sur-`.eq()`) consomme le prochain résultat scripté dans l'ordre.
 * `ops` enregistre les insert/update pour vérifier ce que l'adaptateur écrit.
 */
function fakeDb(results: Array<{ data?: unknown; error?: unknown }>): {
  db: SupabaseClient
  ops: Array<{ op: string; arg?: unknown }>
} {
  let i = 0
  const next = () => results[i++] ?? { data: null, error: null }
  const ops: Array<{ op: string; arg?: unknown }> = []
  const builder = {
    insert(arg: unknown) {
      ops.push({ op: 'insert', arg })
      return builder
    },
    update(arg: unknown) {
      ops.push({ op: 'update', arg })
      return builder
    },
    select() {
      return builder
    },
    eq() {
      return builder
    },
    single() {
      return Promise.resolve(next())
    },
    then(resolve: (value: unknown) => unknown) {
      return resolve(next())
    },
  }
  return {
    db: { from: () => builder } as unknown as SupabaseClient,
    ops,
  }
}

function jobMessage(): JobMessage {
  return {
    schema_version: 1,
    type: 'capture_document',
    tenant_id: 'morax-test',
    source: 'telegram',
    document_id: 'doc-1',
    media_key: 'tenants/morax-test/postmark/k-1/facture.pdf',
    idempotency_key: 'k-1',
    enqueued_at: '2026-07-03T00:00:00Z',
  }
}

describe('makeJobRuns.begin (idempotence + retry)', () => {
  it('première exécution : insère une ligne running et renvoie fresh:true', async () => {
    const { db, ops } = fakeDb([{ data: { id: 'jr-new' }, error: null }])
    const res = await makeJobRuns(db).begin('morax-test', jobMessage())
    expect(res).toEqual({ jobRunId: 'jr-new', fresh: true })
    expect(ops[0]).toEqual({
      op: 'insert',
      arg: expect.objectContaining({ status: 'running', idempotency_key: 'k-1' }),
    })
    // Pas de réouverture : aucun update émis sur le chemin nominal.
    expect(ops.some((o) => o.op === 'update')).toBe(false)
  })

  it('conflit sur une exécution déjà done : saute sans rouvrir (fresh:false)', async () => {
    const { db, ops } = fakeDb([
      { data: null, error: { code: '23505' } }, // insert -> unique_violation
      { data: { id: 'jr-done', status: 'done', attempts: 1 }, error: null }, // relecture
    ])
    const res = await makeJobRuns(db).begin('morax-test', jobMessage())
    expect(res).toEqual({ jobRunId: 'jr-done', fresh: false })
    expect(ops.some((o) => o.op === 'update')).toBe(false) // jamais réouvert
  })

  it('conflit sur une exécution en erreur : rouvre la même ligne pour retry (fresh:true, attempts+1)', async () => {
    const { db, ops } = fakeDb([
      { data: null, error: { code: '23505' } }, // insert -> unique_violation
      { data: { id: 'jr-err', status: 'error', attempts: 2 }, error: null }, // relecture
      { data: [{ id: 'jr-err' }], error: null }, // update de réouverture : 1 ligne gagnée
    ])
    const res = await makeJobRuns(db).begin('morax-test', jobMessage())
    expect(res).toEqual({ jobRunId: 'jr-err', fresh: true })
    const update = ops.find((o) => o.op === 'update')
    expect(update?.arg).toEqual(
      expect.objectContaining({ status: 'running', attempts: 3, error: null, finished_at: null }),
    )
  })

  it('conflit sur une exécution running (crash précédent) : rouvre aussi pour retry', async () => {
    const { db } = fakeDb([
      { data: null, error: { code: '23505' } },
      { data: { id: 'jr-run', status: 'running', attempts: 1 }, error: null },
      { data: [{ id: 'jr-run' }], error: null },
    ])
    const res = await makeJobRuns(db).begin('morax-test', jobMessage())
    expect(res).toEqual({ jobRunId: 'jr-run', fresh: true })
  })

  it('conflit rouvert par un appelant concurrent entre lecture et écriture (TOCTOU) : cède, fresh:false', async () => {
    const { db } = fakeDb([
      { data: null, error: { code: '23505' } },
      { data: { id: 'jr-race', status: 'error', attempts: 1 }, error: null },
      { data: [], error: null }, // update conditionnel : 0 ligne, un autre a gagné la course
    ])
    const res = await makeJobRuns(db).begin('morax-test', jobMessage())
    expect(res).toEqual({ jobRunId: 'jr-race', fresh: false })
  })

  it('erreur DB non-conflit : jette (ne saute pas silencieusement)', async () => {
    const { db } = fakeDb([{ data: null, error: { code: '42P01', message: 'relation absente' } }])
    await expect(makeJobRuns(db).begin('morax-test', jobMessage())).rejects.toThrow(/relation absente/)
  })
})

describe('makeJobRuns.finish', () => {
  it('écrit le statut et finished_at', async () => {
    const { db, ops } = fakeDb([{ data: null, error: null }])
    await makeJobRuns(db).finish('jr-1', 'done')
    const update = ops.find((o) => o.op === 'update')
    expect(update?.arg).toEqual(
      expect.objectContaining({ status: 'done', finished_at: expect.any(String) }),
    )
  })
})
