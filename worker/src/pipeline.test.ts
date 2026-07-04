import { describe, expect, it, vi } from 'vitest'
import type { TenantConfig } from '@morax/model-core'
import { LlmClient } from './llm.js'
import type { MediaRepository, Notifier } from './ports.js'
import { draftDocument, ocrDocument, transcribeAudio, type PipelineContext } from './pipeline.js'
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
  actionResults: string[]
  postedUser: string[]
  sentJobs: JobMessage[]
}

function makeContext(
  opts: { fetchImpl: typeof fetch; mediaContentType?: string },
): { ctx: PipelineContext; rec: Recorded } {
  const rec: Recorded = {
    statuses: [],
    saved: [],
    reminders: [],
    actionResults: [],
    postedUser: [],
    sentJobs: [],
  }
  const media: MediaRepository = {
    async getObject() {
      return { bytes: new Uint8Array([1, 2, 3]), contentType: opts.mediaContentType ?? 'image/png' }
    },
  }
  const notifier: Notifier = {
    async ack() {},
    async proposeApproval() {},
    async proposeReminderValidation(_tenantId, _documentId, summary) {
      rec.reminders.push(summary)
    },
    async notifyReminderDue() {},
    async notifyActionResult(_tenantId, text) {
      rec.actionResults.push(text)
    },
  }
  const llm = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'k' }, opts.fetchImpl)
  const ctx: PipelineContext = {
    tenant: baseTenant(),
    jobRunId: 'jr-1',
    llm,
    ports: {
      queue: {
        async read() { return [] },
        async send(message) { rec.sentJobs.push(message) },
        async delete() {},
        async archive() {},
      },
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
      commandChat: {
        async listRecent() { return [] },
        async reply() {},
        async postUser(_tenantId, text) {
          rec.postedUser.push(text)
          return { id: 'cm-1' }
        },
      },
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

describe('transcribeAudio', () => {
  it('transcrit l\'audio, poste un tour utilisateur et enfile command_reply', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(openRouterResponse('Paye la facture EDF stp'))
    const { ctx, rec } = makeContext({ fetchImpl, mediaContentType: 'audio/wav' })
    const job = baseJob({ type: 'capture_audio', source: 'app', media_key: 'tenants/morax-test/voice/v1.wav' })

    const outcome = await transcribeAudio(ctx, job, 'tenants/morax-test/voice/v1.wav')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(outcome.category).toBe('transcription_vocale')
    expect(outcome.tokensIn).toBe(30)
    expect(outcome.tokensOut).toBe(12)
    expect(rec.postedUser).toEqual(['Paye la facture EDF stp'])
    expect(rec.sentJobs).toHaveLength(1)
    expect(rec.sentJobs[0]).toMatchObject({
      type: 'command_reply',
      tenant_id: 'morax-test',
      idempotency_key: 'command-reply:cm-1',
    })
    expect(rec.actionResults).toHaveLength(0)
  })

  it('transcription vide (audio inintelligible) : notifie, ne poste rien, n\'enfile rien', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(openRouterResponse('   '))
    const { ctx, rec } = makeContext({ fetchImpl, mediaContentType: 'audio/wav' })
    const job = baseJob({ type: 'capture_audio', media_key: 'tenants/morax-test/voice/v2.wav' })

    await transcribeAudio(ctx, job, 'tenants/morax-test/voice/v2.wav')

    expect(rec.postedUser).toHaveLength(0)
    expect(rec.sentJobs).toHaveLength(0)
    expect(rec.actionResults).toEqual(['Message vocal non compris. Réessaie ou écris ta demande.'])
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
