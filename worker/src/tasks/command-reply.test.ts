import { describe, expect, it, vi } from 'vitest'
import type { TenantConfig } from '@morax/model-core'
import { LlmClient } from '../llm.js'
import type { CommandMessageRow, Ports } from '../ports.js'
import { commandReply } from './command-reply.js'
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

/** Reponse LLM factice portant les deux formes (Anthropic + OpenRouter), meme motif que chase-unpaid.test.ts. */
function llmResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text }],
      choices: [{ message: { content: text } }],
      usage: { input_tokens: 30, output_tokens: 12, prompt_tokens: 30, completion_tokens: 12 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

interface Recorded {
  replies: string[]
  credits: Array<{ actionCategory: string; weight: number }>
  costs: Array<{ tokensIn: number; tokensOut: number }>
}

function makeContext(opts: {
  history: CommandMessageRow[]
  fetchImpl?: ReturnType<typeof vi.fn>
}): { ctx: TaskContext; rec: Recorded } {
  const rec: Recorded = { replies: [], credits: [], costs: [] }
  const fetchImpl = opts.fetchImpl ?? vi.fn(async () => {
    throw new Error('fetchImpl ne devrait pas etre appele (garde-fou attendu)')
  })
  const llm = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'k' }, fetchImpl as unknown as typeof fetch)

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
      async summarizeDay() {
        return {
          documentsReceived: 0,
          documentsNeedingValidation: 0,
          remindersDueNext7Days: 0,
          overdueReminders: 0,
          draftsPendingSend: 0,
          jobsRunToday: 0,
          jobsErroredToday: 0,
        }
      },
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
        rec.credits.push({ actionCategory: e.actionCategory, weight: e.weight })
      },
      async recordCost(e) {
        rec.costs.push({ tokensIn: e.tokensIn, tokensOut: e.tokensOut })
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
      async notifyActionResult() {},
    },
    commandChat: {
      async listRecent() { return opts.history },
      async reply(_tenantId, text) {
        rec.replies.push(text)
      },
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

describe('commandReply', () => {
  it('repond au dernier message utilisateur, insere la reponse agent, comptabilise credits + cout', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(llmResponse('Voici ta reponse.'))
    const { ctx, rec } = makeContext({
      history: [
        { role: 'user', body: 'Combien de factures en retard ?', createdAt: '2026-07-04T09:00:00Z' },
      ],
      fetchImpl,
    })

    await commandReply(ctx)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(rec.replies).toEqual(['Voici ta reponse.'])
    expect(rec.credits).toEqual([{ actionCategory: 'chat_reply', weight: 1.5 }])
    expect(rec.costs).toHaveLength(1)
    expect(rec.costs[0]).toMatchObject({ tokensIn: 30, tokensOut: 12 })
  })

  it('transmet l\'historique dans l\'ordre chronologique avec les roles mappes (agent -> assistant)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(llmResponse('Ok.'))
    const { ctx } = makeContext({
      history: [
        { role: 'user', body: 'Premier message', createdAt: '2026-07-04T09:00:00Z' },
        { role: 'agent', body: 'Premiere reponse', createdAt: '2026-07-04T09:00:05Z' },
        { role: 'user', body: 'Deuxieme message', createdAt: '2026-07-04T09:01:00Z' },
      ],
      fetchImpl,
    })

    await commandReply(ctx)

    const [, requestInit] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(requestInit.body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    const nonSystem = body.messages.filter((m) => m.role !== 'system')
    expect(nonSystem).toEqual([
      { role: 'user', content: 'Premier message' },
      { role: 'assistant', content: 'Premiere reponse' },
      { role: 'user', content: 'Deuxieme message' },
    ])
  })

  it('garde-fou : si le dernier tour n\'est pas un message utilisateur, ne fait rien', async () => {
    const fetchImpl = vi.fn()
    const { ctx, rec } = makeContext({
      history: [
        { role: 'user', body: 'Question', createdAt: '2026-07-04T09:00:00Z' },
        { role: 'agent', body: 'Deja repondu par un autre job', createdAt: '2026-07-04T09:00:05Z' },
      ],
      fetchImpl,
    })

    await commandReply(ctx)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(rec.replies).toHaveLength(0)
    expect(rec.credits).toHaveLength(0)
  })

  it('garde-fou : historique vide -> ne fait rien', async () => {
    const fetchImpl = vi.fn()
    const { ctx, rec } = makeContext({ history: [], fetchImpl })

    await commandReply(ctx)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(rec.replies).toHaveLength(0)
  })
})
