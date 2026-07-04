import { describe, expect, it, vi } from 'vitest'
import type { TenantConfig } from '@morax/model-core'
import { LlmClient } from '../llm.js'
import type { DaySummaryRow, Ports } from '../ports.js'
import { dailySummary } from './daily-summary.js'
import type { TaskContext } from './types.js'

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

function quietSummary(): DaySummaryRow {
  return {
    documentsReceived: 0,
    documentsNeedingValidation: 0,
    remindersDueNext7Days: 0,
    overdueReminders: 0,
    draftsPendingSend: 0,
    jobsRunToday: 0,
    jobsErroredToday: 0,
  }
}

function busySummary(): DaySummaryRow {
  return {
    documentsReceived: 3,
    documentsNeedingValidation: 1,
    remindersDueNext7Days: 2,
    overdueReminders: 1,
    draftsPendingSend: 2,
    jobsRunToday: 5,
    jobsErroredToday: 1,
  }
}

function openRouterResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 40, completion_tokens: 25 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

interface Recorded {
  notifications: Array<{ tenantId: string; text: string }>
  credits: Array<{ tenantId: string; jobRunId: string; actionCategory: string; weight: number; langfuseTraceId?: string }>
  costs: Array<{
    tenantId: string
    jobRunId: string
    role: string
    model: string
    provider: string
    tokensIn: number
    tokensOut: number
    usdCost: number
    langfuseTraceId?: string
  }>
}

function makeContext(opts: {
  summary: DaySummaryRow
  fetchImpl?: typeof fetch
}): { ctx: TaskContext; rec: Recorded } {
  const rec: Recorded = { notifications: [], credits: [], costs: [] }
  const fetchImpl = opts.fetchImpl ?? (async () => {
    throw new Error('fetchImpl ne devrait pas etre appele pour une journee calme')
  })
  const llm = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'k' }, fetchImpl)

  const ports: Ports = {
    queue: { async read() { return [] }, async send() {}, async delete() {}, async archive() {} },
    tenants: { async load() { return baseTenant() } },
    documents: {
      async setStatus() {},
      async saveExtracted() {},
      async listUnclassified() { return [] },
      async setCategory() {},
    },
    drafts: {
      async markSent() {},
      async listOverdueInvoices() { return [] },
    },
    reminders: {
      async listOverdue() { return [] },
      async listUpcoming() { return [] },
    },
    dashboard: {
      async summarizeDay() { return opts.summary },
    },
    media: {
      async getObject() {
        return { bytes: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' }
      },
    },
    mailer: {
      async sendDocumentEmail() { return { messageId: 'msg-1' } },
    },
    jobRuns: {
      async begin() { return { jobRunId: 'jr-1', fresh: true } },
      async finish() {},
    },
    credits: {
      async record(e) {
        rec.credits.push(e)
      },
      async recordCost(e) {
        rec.costs.push(e)
      },
      async consumedThisPeriod() { return 0 },
    },
    pendingActions: {
      async enqueue() { return { pendingActionId: 'pa-1' } },
      async load() { return null },
      async markExecuted() {},
      async markBounced() { return true },
    },
    pushSubscriptions: {
      async listForTenant() { return [] },
      async removeByEndpoint() {},
    },
    webPush: {
      async send() { return { delivered: false, expired: false } },
    },
    notifier: {
      async ack() {},
      async proposeApproval() {},
      async proposeReminderValidation() {},
      async notifyReminderDue() {},
      async notifyActionResult(tenantId, text) {
        rec.notifications.push({ tenantId, text })
      },
    },
    commandChat: {
      async listRecent() { return [] },
      async reply() {},
    },
    tracer: { async trace(_n, _t, fn) { return fn('trace-1') } },
  }

  const ctx: TaskContext = {
    tenant: baseTenant(),
    ports,
    llm,
    jobRunId: 'jr-1',
    traceId: 'trace-1',
  }

  return { ctx, rec }
}

describe('dailySummary', () => {
  it('journee calme : envoie le message deterministe sans appel LLM ni credits', async () => {
    const fetchImpl = vi.fn()
    const { ctx, rec } = makeContext({ summary: quietSummary(), fetchImpl })

    await dailySummary(ctx)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(rec.notifications).toEqual([
      { tenantId: 'morax-test', text: 'Journee calme, rien a signaler.' },
    ])
    expect(rec.credits).toHaveLength(0)
    expect(rec.costs).toHaveLength(0)
  })

  it('journee chargee : appelle le LLM, notifie le texte redige, comptabilise credits + cout', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      openRouterResponse('Trois documents recus aujourd\'hui, une echeance en retard a traiter.'),
    )
    const { ctx, rec } = makeContext({ summary: busySummary(), fetchImpl })

    await dailySummary(ctx)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [, requestInit] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(requestInit.body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const systemMessage = body.messages.find((m) => m.role === 'system')
    const userMessage = body.messages.find((m) => m.role === 'user')
    expect(systemMessage?.content).toContain('TDAH')
    expect(userMessage?.content).toContain('documents recus aujourd\'hui : 3')
    expect(userMessage?.content).toContain('echeances en retard : 1')
    expect(userMessage?.content).toContain('jobs en erreur aujourd\'hui : 1')

    expect(rec.notifications).toEqual([
      {
        tenantId: 'morax-test',
        text: 'Trois documents recus aujourd\'hui, une echeance en retard a traiter.',
      },
    ])

    expect(rec.credits).toHaveLength(1)
    expect(rec.credits[0]).toMatchObject({
      tenantId: 'morax-test',
      jobRunId: 'jr-1',
      actionCategory: 'resume_financier',
      weight: 1.5,
      langfuseTraceId: 'trace-1',
    })

    expect(rec.costs).toHaveLength(1)
    expect(rec.costs[0]).toMatchObject({
      tenantId: 'morax-test',
      jobRunId: 'jr-1',
      tokensIn: 40,
      tokensOut: 25,
      langfuseTraceId: 'trace-1',
    })
    expect(rec.costs[0]?.usdCost).toBeGreaterThan(0)
  })
})
