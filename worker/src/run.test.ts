import { describe, expect, it } from 'vitest'
import type { TenantConfig } from '@morax/model-core'
import { LlmClient } from './llm.js'
import type { PendingActionRow, PendingActionStatus, Ports } from './ports.js'
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
  approvals: Array<{ tenantId: string; pendingActionId: string; summary: string }>
  actionResults: Array<{ tenantId: string; text: string }>
  emails: Array<{ to: string; cc?: string; subject: string; filename: string; htmlBody?: string }>
  markedExecuted: string[]
  markedSent: string[]
}

function actionRow(
  status: PendingActionStatus,
  payloadOverrides: Record<string, unknown> = {},
): PendingActionRow {
  return {
    id: 'pa-1',
    status,
    payload: {
      draft_id: 'draft-1',
      kind: 'invoice',
      doc_number: 'INV-001',
      client_email: 'client@x.com',
      pdf_key: 'tenants/morax-test/drafts/draft-1/INV-001.pdf',
      total: 340,
      currency: 'GBP',
      ...payloadOverrides,
    },
  }
}

function makePorts(
  opts: { fresh?: boolean; action?: PendingActionRow | null } = {},
): { ports: Ports; rec: Recorded } {
  const rec: Recorded = {
    deleted: [],
    archived: [],
    credits: [],
    costs: [],
    acks: [],
    finishes: [],
    reminderNotifs: [],
    approvals: [],
    actionResults: [],
    emails: [],
    markedExecuted: [],
    markedSent: [],
  }
  const fresh = opts.fresh ?? true
  const action = opts.action === undefined ? actionRow('pending') : opts.action
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
    drafts: {
      async markSent(_tenantId, draftId) {
        rec.markedSent.push(draftId)
      },
    },
    media: {
      async getObject() {
        return { bytes: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' }
      },
    },
    mailer: {
      async sendDocumentEmail(input) {
        rec.emails.push({
          to: input.to,
          cc: input.cc,
          subject: input.subject,
          filename: input.attachment.filename,
          htmlBody: input.htmlBody,
        })
        return { messageId: 'msg-1' }
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
      async load() {
        return action
      },
      async markExecuted(_tenantId, pendingActionId) {
        rec.markedExecuted.push(pendingActionId)
      },
    },
    notifier: {
      async ack(_t, text) {
        rec.acks.push(text)
      },
      async proposeApproval(tenantId, pendingActionId, summary) {
        rec.approvals.push({ tenantId, pendingActionId, summary })
      },
      async proposeReminderValidation() {},
      async notifyReminderDue(tenantId, text) {
        rec.reminderNotifs.push({ tenantId, text })
      },
      async notifyActionResult(tenantId, text) {
        rec.actionResults.push({ tenantId, text })
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

function actionEnvelope(
  type: 'action_propose' | 'action_execute',
  overrides: Partial<JobMessage> = {},
  readCt = 1,
): QueueEnvelope {
  const message: JobMessage = {
    schema_version: 1,
    type,
    tenant_id: 'morax-test',
    source: 'app',
    idempotency_key: type === 'action_propose' ? 'act-prop:pa-1' : 'act-exec:pa-1',
    enqueued_at: '2026-07-08T09:00:00Z',
    action: { pending_action_id: 'pa-1' },
    ...overrides,
  }
  return { msg_id: 7, read_ct: readCt, enqueued_at: message.enqueued_at, message }
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

describe('processEnvelope action_propose/action_execute', () => {
  it('propose : envoie proposeApproval avec le resume, sans credit/LLM/ack', async () => {
    const { ports, rec } = makePorts({ action: actionRow('pending') })
    const res = await processEnvelope(actionEnvelope('action_propose'), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('done')
    expect(rec.deleted).toContain(7)
    expect(rec.approvals).toEqual([
      {
        tenantId: 'morax-test',
        pendingActionId: 'pa-1',
        summary: 'Envoyer la facture INV-001 (340 GBP TTC) a client@x.com ?',
      },
    ])
    expect(rec.acks).toHaveLength(0)
    expect(rec.credits).toHaveLength(0)
    expect(rec.finishes).toEqual([{ status: 'done' }])
  })

  it('propose sur une action deja decidee : done sans notification', async () => {
    const { ports, rec } = makePorts({ action: actionRow('approved') })
    const res = await processEnvelope(actionEnvelope('action_propose'), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('done')
    expect(rec.approvals).toHaveLength(0)
  })

  it('execute approuvee : envoie l\'email avec la piece jointe R2, marque executed + sent', async () => {
    const { ports, rec } = makePorts({ action: actionRow('approved') })
    const res = await processEnvelope(actionEnvelope('action_execute'), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('done')
    expect(rec.emails).toHaveLength(1)
    expect(rec.emails[0]?.to).toBe('client@x.com')
    expect(rec.emails[0]?.subject).toBe('Facture INV-001')
    expect(rec.emails[0]?.filename).toBe('INV-001.pdf')
    expect(rec.emails[0]?.cc).toBeUndefined()
    expect(rec.emails[0]?.htmlBody).toContain('INV-001')
    expect(rec.markedExecuted).toEqual(['pa-1'])
    expect(rec.markedSent).toEqual(['draft-1'])
    expect(rec.actionResults).toEqual([
      { tenantId: 'morax-test', text: 'Email envoye : facture INV-001 a client@x.com.' },
    ])
    expect(rec.credits).toEqual([{ category: 'envoi_document', weight: 0.5 }])
  })

  it('execute rejetee : notifie seulement, pas d\'email', async () => {
    const { ports, rec } = makePorts({ action: actionRow('rejected') })
    const res = await processEnvelope(actionEnvelope('action_execute'), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('done')
    expect(rec.emails).toHaveLength(0)
    expect(rec.actionResults).toEqual([
      { tenantId: 'morax-test', text: 'Envoi annule : facture INV-001.' },
    ])
    expect(rec.credits).toHaveLength(0)
  })

  it('execute approuvee avec cc : transmet le cc au mailer', async () => {
    const { ports, rec } = makePorts({
      action: actionRow('approved', { cc: 'copy@x.com' }),
    })
    const res = await processEnvelope(actionEnvelope('action_execute'), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('done')
    expect(rec.emails[0]?.cc).toBe('copy@x.com')
  })

  it('execute expiree (72h) : notifie seulement, pas d\'email', async () => {
    const { ports, rec } = makePorts({ action: actionRow('expired') })
    const res = await processEnvelope(actionEnvelope('action_execute'), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('done')
    expect(rec.emails).toHaveLength(0)
    expect(rec.actionResults).toEqual([
      {
        tenantId: 'morax-test',
        text: 'Proposition expiree (72h) : facture INV-001. Relancer un nouvel envoi si besoin.',
      },
    ])
    expect(rec.credits).toHaveLength(0)
  })

  it('execute deja executee : idempotent, pas de double email', async () => {
    const { ports, rec } = makePorts({ action: actionRow('executed') })
    const res = await processEnvelope(actionEnvelope('action_execute'), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('done')
    expect(rec.emails).toHaveLength(0)
    expect(rec.actionResults).toHaveLength(0)
    expect(rec.credits).toHaveLength(0)
  })

  it('idempotence : job deja vu -> skip', async () => {
    const { ports, rec } = makePorts({ fresh: false })
    const res = await processEnvelope(actionEnvelope('action_propose'), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('skipped_idempotent')
    expect(rec.deleted).toContain(7)
    expect(rec.approvals).toHaveLength(0)
  })

  it('finit en erreur si pending_action_id absent', async () => {
    const { ports, rec } = makePorts()
    const res = await processEnvelope(
      actionEnvelope('action_propose', { action: undefined }),
      ports,
      llm,
      RUN_CONFIG,
    )
    expect(res.status).toBe('error')
    expect(rec.finishes[0]?.status).toBe('error')
  })

  it('finit en erreur si le pending_action est introuvable', async () => {
    const { ports, rec } = makePorts({ action: null })
    const res = await processEnvelope(actionEnvelope('action_execute'), ports, llm, RUN_CONFIG)
    expect(res.status).toBe('error')
    expect(rec.finishes[0]?.status).toBe('error')
  })
})
