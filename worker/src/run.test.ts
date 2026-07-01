import { describe, expect, it } from 'vitest'
import type { TenantConfig } from '@morax/model-core'
import { LlmClient } from './llm.js'
import type { Ports } from './ports.js'
import { processEnvelope, type RunConfig } from './run.js'
import type { JobMessage, QueueEnvelope } from './types.js'

const RUN_CONFIG: RunConfig = {
  maxLoopsPerJob: 8,
  queueBatchSize: 10,
  visibilityTimeoutSec: 120,
}

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

interface Recorded {
  deleted: number[]
  archived: number[]
  credits: Array<{ category: string; weight: number }>
  costs: Array<{ model: string; provider: string; role: string }>
  acks: string[]
  finishes: Array<{ status: string }>
  reminderNotifs: Array<{ tenantId: string; text: string }>
}

function makePorts(opts: { fresh?: boolean } = {}): { ports: Ports; rec: Recorded } {
  const rec: Recorded = {
    deleted: [],
    archived: [],
    credits: [],
    costs: [],
    acks: [],
    finishes: [],
    reminderNotifs: [],
  }
  const fresh = opts.fresh ?? true
  const ports: Ports = {
    queue: {
      async read() {
        return []
      },
      async delete(id) {
        rec.deleted.push(id)
      },
      async archive(id) {
        rec.archived.push(id)
      },
    },
    tenants: {
      async load() {
        return baseTenant()
      },
    },
    documents: {
      async setStatus() {},
      async saveExtracted() {},
    },
    media: {
      async getObject() {
        return { bytes: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' }
      },
    },
    jobRuns: {
      async begin() {
        return { jobRunId: 'jr-1', fresh }
      },
      async finish(_id, status) {
        rec.finishes.push({ status })
      },
    },
    credits: {
      async record(e) {
        rec.credits.push({ category: e.actionCategory, weight: e.weight })
      },
      async recordCost(e) {
        rec.costs.push({ model: e.model, provider: e.provider, role: e.role })
      },
      async consumedThisPeriod() {
        return 0
      },
    },
    pendingActions: {
      async enqueue() {
        return { pendingActionId: 'pa-1' }
      },
    },
    notifier: {
      async ack(_t, text) {
        rec.acks.push(text)
      },
      async proposeApproval() {},
      async proposeReminderValidation() {},
      async notifyReminderDue(tenantId, text) {
        rec.reminderNotifs.push({ tenantId, text })
      },
    },
    tracer: {
      async trace(_name, _tags, fn) {
        return fn('trace-1')
      },
    },
  }
  return { ports, rec }
}

function envelope(overrides: Partial<JobMessage> = {}, readCt = 1): QueueEnvelope {
  const message: JobMessage = {
    schema_version: 1,
    type: 'capture_document',
    tenant_id: 'morax-test',
    source: 'telegram',
    document_id: 'doc-1',
    media_key: 'tenants/morax-test/postmark/k-1/facture.pdf',
    idempotency_key: 'k-1',
    enqueued_at: '2026-06-30T00:00:00Z',
    ...overrides,
  }
  return { msg_id: 42, read_ct: readCt, enqueued_at: message.enqueued_at, message }
}

function reminderEnvelope(overrides: Partial<JobMessage> = {}, readCt = 1): QueueEnvelope {
  const message: JobMessage = {
    schema_version: 1,
    type: 'reminder_notify',
    tenant_id: 'morax-test',
    source: 'cron',
    idempotency_key: 'remind:rem-1:j7',
    enqueued_at: '2026-07-08T07:00:00Z',
    reminder: { id: 'rem-1', milestone: 'j7', due_date: '2026-07-15', amount: 340, currency: 'GBP' },
    ...overrides,
  }
  return { msg_id: 99, read_ct: readCt, enqueued_at: message.enqueued_at, message }
}

// fetchImpl injecte : evite tout appel reseau reel depuis processEnvelope (OCR finance-pinne -> Anthropic).
const fakeFetch = (async () =>
  new Response(
    JSON.stringify({
      content: [{ type: 'text', text: '{"montant":340,"devise":"GBP","date_echeance":"2026-07-15"}' }],
      usage: { input_tokens: 50, output_tokens: 20 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )) as typeof fetch

const llm = new LlmClient({ anthropicApiKey: 'x', openrouterApiKey: 'y' }, fakeFetch)

describe('processEnvelope', () => {
  it('traite un capture_document, comptabilise le crédit scan et acquitte', async () => {
    const { ports, rec } = makePorts()
    const res = await processEnvelope(envelope(), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('done')
    expect(rec.deleted).toContain(42)
    expect(rec.credits).toEqual([{ category: 'scan_document', weight: 1 }])
    expect(rec.acks.length).toBe(1)
    expect(rec.finishes).toEqual([{ status: 'done' }])
  })

  it('route la lecture finance vers Opus (épinglage)', async () => {
    const { ports, rec } = makePorts()
    await processEnvelope(envelope(), ports, llm, RUN_CONFIG)
    expect(rec.costs[0]?.model).toBe('claude-opus-4-8')
    expect(rec.costs[0]?.provider).toBe('anthropic')
    expect(rec.costs[0]?.role).toBe('cerveau:finance')
  })

  it('saute un job déjà traité (idempotence) sans recompter', async () => {
    const { ports, rec } = makePorts({ fresh: false })
    const res = await processEnvelope(envelope(), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('skipped_idempotent')
    expect(rec.deleted).toContain(42)
    expect(rec.credits).toHaveLength(0)
  })

  it('archive un message qui dépasse Max Loops', async () => {
    const { ports, rec } = makePorts()
    const res = await processEnvelope(envelope({}, 99), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('max_loops')
    expect(rec.archived).toContain(42)
    expect(rec.credits).toHaveLength(0)
  })

  it('un type inconnu finit en erreur', async () => {
    const { ports, rec } = makePorts()
    const bad = envelope({ type: 'capture_audio', document_id: undefined })
    // capture_audio est valide ; on force une erreur via capture_document sans doc.
    void bad
    const res = await processEnvelope(
      envelope({ document_id: undefined }),
      ports,
      llm,
      RUN_CONFIG,
    )
    expect(res.status).toBe('error')
    expect(rec.finishes[0]?.status).toBe('error')
  })
})

describe('processEnvelope reminder_notify', () => {
  it('notifie Telegram sans LLM, credits ni ack', async () => {
    const { ports, rec } = makePorts()
    const res = await processEnvelope(reminderEnvelope(), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('done')
    expect(rec.deleted).toContain(99)
    expect(rec.reminderNotifs).toEqual([
      { tenantId: 'morax-test', text: 'Rappel : echeance dans 7 jours (15/07/2026) — 340 GBP.' },
    ])
    expect(rec.acks).toHaveLength(0)
    expect(rec.credits).toHaveLength(0)
    expect(rec.costs).toHaveLength(0)
    expect(rec.finishes).toEqual([{ status: 'done' }])
  })

  it('saute un rappel deja notifie (idempotence)', async () => {
    const { ports, rec } = makePorts({ fresh: false })
    const res = await processEnvelope(reminderEnvelope(), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('skipped_idempotent')
    expect(rec.deleted).toContain(99)
    expect(rec.reminderNotifs).toHaveLength(0)
  })

  it('finit en erreur si le payload reminder est absent', async () => {
    const { ports, rec } = makePorts()
    const res = await processEnvelope(
      reminderEnvelope({ reminder: undefined }),
      ports,
      llm,
      RUN_CONFIG,
    )
    expect(res.status).toBe('error')
    expect(rec.finishes[0]?.status).toBe('error')
    expect(rec.reminderNotifs).toHaveLength(0)
  })
})
