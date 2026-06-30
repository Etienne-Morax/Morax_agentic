import { describe, expect, it, vi } from 'vitest'
import type { TenantConfig } from '@morax/model-core'
import { LlmClient } from './llm.js'
import type { MediaRepository, Notifier } from './ports.js'
import { draftDocument, ocrDocument, planTasks, type PipelineContext } from './pipeline.js'
import type { ExtractedFields, JobMessage } from './types.js'

function baseTenant(): TenantConfig {
  return {
    tenant_id: 'morax-test',
    offre: 'base',
    fallback_quota: true,
    action_quota_monthly: 60,
    alert_threshold_pct: 80,
    quota_exceeded_behavior: 'queue',
    packs_actifs: ['base'],
  }
}

function anthropicResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text }],
      usage: { input_tokens: 42, output_tokens: 17 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function openRouterResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 30, completion_tokens: 12 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

interface Recorded {
  statuses: string[]
  saved: ExtractedFields[]
  reminders: string[]
}

function makeContext(opts: { fetchImpl: typeof fetch }): { ctx: PipelineContext; rec: Recorded } {
  const rec: Recorded = { statuses: [], saved: [], reminders: [] }
  const media: MediaRepository = {
    async getObject() {
      return { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' }
    },
  }
  const notifier: Notifier = {
    async ack() {},
    async proposeApproval() {},
    async proposeReminderValidation(_tenantId, _documentId, summary) {
      rec.reminders.push(summary)
    },
  }
  const llm = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'k' }, opts.fetchImpl)
  const ctx: PipelineContext = {
    tenant: baseTenant(),
    jobRunId: 'jr-1',
    llm,
    ports: {
      queue: { async read() { return [] }, async delete() {}, async archive() {} },
      tenants: { async load() { return baseTenant() } },
      documents: {
        async setStatus(_t, _d, status) {
          rec.statuses.push(status)
        },
        async saveExtracted(_t, _d, fields) {
          rec.saved.push(fields)
        },
      },
      media,
      jobRuns: {
        async begin() { return { jobRunId: 'jr-1', fresh: true } },
        async finish() {},
      },
      credits: {
        async record() {},
        async recordCost() {},
        async consumedThisPeriod() { return 0 },
      },
      pendingActions: { async enqueue() { return { pendingActionId: 'pa-1' } } },
      notifier,
      tracer: { async trace(_n, _t, fn) { return fn('trace-1') } },
    },
  }
  return { ctx, rec }
}

function baseJob(overrides: Partial<JobMessage> = {}): JobMessage {
  return {
    schema_version: 1,
    type: 'capture_document',
    tenant_id: 'morax-test',
    source: 'telegram',
    idempotency_key: 'k-1',
    enqueued_at: '2026-06-30T00:00:00Z',
    ...overrides,
  }
}

describe('ocrDocument', () => {
  it('extrait les champs JSON, propage tokens/cout et propose un rappel si echeance', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      anthropicResponse(
        JSON.stringify({ montant: 340, devise: 'GBP', date_echeance: '2026-07-15', emetteur: 'Adobe UK' }),
      ),
    )
    const { ctx, rec } = makeContext({ fetchImpl })
    const job = baseJob({ media_key: 'tenants/morax-test/postmark/m1/facture.pdf' })

    const outcome = await ocrDocument(ctx, job, 'doc-1')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(rec.statuses).toContain('extracted')
    expect(rec.saved[0]?.montant).toBe(340)
    expect(rec.reminders).toHaveLength(1)
    expect(rec.reminders[0]).toContain('340')
    expect(outcome.tokensIn).toBe(42)
    expect(outcome.tokensOut).toBe(17)
    expect(outcome.usdCost).toBeGreaterThan(0)
    expect(outcome.category).toBe('scan_document')
  })

  it('sans echeance detectee : statut incomplete, pas de rappel', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(anthropicResponse(JSON.stringify({ montant: 10 })))
    const { ctx, rec } = makeContext({ fetchImpl })
    const job = baseJob({ media_key: 'tenants/morax-test/postmark/m2/recu.pdf' })

    await ocrDocument(ctx, job, 'doc-2')

    expect(rec.statuses).toContain('incomplete')
    expect(rec.reminders).toHaveLength(0)
  })

  it('sans media_key : aucun appel LLM, champs vides', async () => {
    const fetchImpl = vi.fn()
    const { ctx, rec } = makeContext({ fetchImpl })
    const job = baseJob()

    const outcome = await ocrDocument(ctx, job, 'doc-3')

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(rec.saved[0]).toEqual({})
    expect(outcome.tokensIn).toBe(0)
    expect(outcome.usdCost).toBe(0)
  })
})

describe('planTasks', () => {
  it('decompose job.text via le LLM et propage le cout', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(openRouterResponse('1. Ouvrir la facture\n2. Payer'))
    const { ctx } = makeContext({ fetchImpl })
    const job = baseJob({ type: 'capture_audio', text: 'paye la facture EDF et appelle le plombier' })

    const outcome = await planTasks(ctx, job)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(outcome.category).toBe('classification')
    expect(outcome.tokensIn).toBe(30)
    expect(outcome.tokensOut).toBe(12)
  })

  it('sans texte : aucun appel LLM', async () => {
    const fetchImpl = vi.fn()
    const { ctx } = makeContext({ fetchImpl })
    const job = baseJob({ type: 'capture_audio' })

    const outcome = await planTasks(ctx, job)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(outcome.tokensIn).toBe(0)
  })
})

describe('draftDocument', () => {
  it('genere un brouillon via le LLM avec le brief du job', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(openRouterResponse('Devis : ...'))
    const { ctx } = makeContext({ fetchImpl })
    const job = baseJob({ type: 'draft_quote', text: 'devis pour refonte du site, 3 pages' })

    const outcome = await draftDocument(ctx, job, 'brouillon_devis')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(outcome.category).toBe('brouillon_devis')
    expect(outcome.tokensIn).toBe(30)
  })

  it('sans brief : aucun appel LLM', async () => {
    const fetchImpl = vi.fn()
    const { ctx } = makeContext({ fetchImpl })
    const job = baseJob({ type: 'draft_invoice' })

    const outcome = await draftDocument(ctx, job, 'brouillon_facture')

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(outcome.category).toBe('brouillon_facture')
  })
})
