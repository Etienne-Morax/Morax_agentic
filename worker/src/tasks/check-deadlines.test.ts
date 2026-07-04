import { describe, expect, it } from 'vitest'
import type { TenantConfig } from '@morax/model-core'
import { LlmClient } from '../llm.js'
import type { Ports, ReminderSummaryRow } from '../ports.js'
import { checkDeadlines } from './check-deadlines.js'
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

function neverCalled(name: string): () => never {
  return () => {
    throw new Error(`[test] ${name} ne doit jamais etre appele par checkDeadlines`)
  }
}

/** LLM qui leve si `complete()` est appele : prouve que checkDeadlines ne fait aucun appel LLM. */
function neverCalledLlm(): LlmClient {
  return new LlmClient({ anthropicApiKey: 'x', openrouterApiKey: 'y' }, (() => {
    throw new Error('[test] ctx.llm ne doit jamais etre appele par checkDeadlines')
  }) as unknown as typeof fetch)
}

interface Recorded {
  reminderNotifs: Array<{ tenantId: string; text: string }>
  listOverdueCalls: string[]
  listUpcomingCalls: Array<{ tenantId: string; withinDays: number }>
}

function makeContext(overdue: ReminderSummaryRow[], upcoming: ReminderSummaryRow[]): {
  ctx: TaskContext
  rec: Recorded
} {
  const rec: Recorded = { reminderNotifs: [], listOverdueCalls: [], listUpcomingCalls: [] }

  // Ports minimal : seuls reminders.listOverdue/listUpcoming et
  // notifier.notifyReminderDue sont exercises. Tout le reste leve si appele,
  // ce qui prouve que checkDeadlines ne touche ni credits ni llm.
  const ports: Ports = {
    queue: {
      read: neverCalled('queue.read'),
      send: neverCalled('queue.send'),
      delete: neverCalled('queue.delete'),
      archive: neverCalled('queue.archive'),
    },
    tenants: { load: neverCalled('tenants.load') },
    documents: {
      setStatus: neverCalled('documents.setStatus'),
      saveExtracted: neverCalled('documents.saveExtracted'),
      listUnclassified: neverCalled('documents.listUnclassified'),
      setCategory: neverCalled('documents.setCategory'),
    },
    drafts: {
      markSent: neverCalled('drafts.markSent'),
      listOverdueInvoices: neverCalled('drafts.listOverdueInvoices'),
    },
    reminders: {
      async listOverdue(tenantId: string) {
        rec.listOverdueCalls.push(tenantId)
        return overdue
      },
      async listUpcoming(tenantId: string, withinDays: number) {
        rec.listUpcomingCalls.push({ tenantId, withinDays })
        return upcoming
      },
    },
    dashboard: { summarizeDay: neverCalled('dashboard.summarizeDay') },
    media: { getObject: neverCalled('media.getObject') },
    mailer: { sendDocumentEmail: neverCalled('mailer.sendDocumentEmail') },
    jobRuns: {
      begin: neverCalled('jobRuns.begin'),
      finish: neverCalled('jobRuns.finish'),
    },
    credits: {
      record: neverCalled('credits.record'),
      recordCost: neverCalled('credits.recordCost'),
      consumedThisPeriod: neverCalled('credits.consumedThisPeriod'),
    },
    pendingActions: {
      enqueue: neverCalled('pendingActions.enqueue'),
      load: neverCalled('pendingActions.load'),
      markExecuted: neverCalled('pendingActions.markExecuted'),
      markBounced: neverCalled('pendingActions.markBounced'),
    },
    pushSubscriptions: {
      listForTenant: neverCalled('pushSubscriptions.listForTenant'),
      removeByEndpoint: neverCalled('pushSubscriptions.removeByEndpoint'),
    },
    webPush: { send: neverCalled('webPush.send') },
    notifier: {
      ack: neverCalled('notifier.ack'),
      proposeApproval: neverCalled('notifier.proposeApproval'),
      proposeReminderValidation: neverCalled('notifier.proposeReminderValidation'),
      async notifyReminderDue(tenantId: string, text: string) {
        rec.reminderNotifs.push({ tenantId, text })
      },
      notifyActionResult: neverCalled('notifier.notifyActionResult'),
    },
    tracer: { trace: neverCalled('tracer.trace') },
  }

  const ctx: TaskContext = {
    tenant: baseTenant(),
    ports,
    llm: neverCalledLlm(),
    jobRunId: 'job-1',
  }

  return { ctx, rec }
}

describe('checkDeadlines', () => {
  it('lit overdue/upcoming et notifie le digest forme', async () => {
    const overdue: ReminderSummaryRow[] = [
      { id: 'rem-late', dueDate: '2026-07-01', amount: 100, currency: 'EUR' },
    ]
    const upcoming: ReminderSummaryRow[] = [
      { id: 'rem-soon', dueDate: '2026-07-10', amount: null, currency: 'EUR' },
    ]
    const { ctx, rec } = makeContext(overdue, upcoming)

    await checkDeadlines(ctx)

    expect(rec.listOverdueCalls).toEqual(['morax-test'])
    expect(rec.listUpcomingCalls).toEqual([{ tenantId: 'morax-test', withinDays: 7 }])
    expect(rec.reminderNotifs).toHaveLength(1)
    expect(rec.reminderNotifs[0]?.tenantId).toBe('morax-test')
    expect(rec.reminderNotifs[0]?.text).toBe(
      'EN RETARD :\n- 01/07/2026 — 100 EUR\n\nA VENIR (7 jours) :\n- 10/07/2026',
    )
  })

  it('notifie le message rassurant quand aucune echeance', async () => {
    const { ctx, rec } = makeContext([], [])

    await checkDeadlines(ctx)

    expect(rec.reminderNotifs[0]?.text).toBe('Aucune echeance en retard ni a venir sous 7 jours.')
  })

  it('ne touche jamais ctx.ports.credits ni ctx.llm', async () => {
    const { ctx } = makeContext([], [])

    await expect(checkDeadlines(ctx)).resolves.toBeUndefined()
    // Si checkDeadlines appelait credits.record/recordCost ou ctx.llm.complete,
    // les fakes neverCalled/neverCalledLlm auraient leve et fait echouer ce test.
  })
})
