import { describe, expect, it, vi } from 'vitest'
import type { TenantConfig } from '@morax/model-core'
import { LlmClient } from '../llm.js'
import type { DocumentRepository, Notifier, UnclassifiedDocumentRow } from '../ports.js'
import { DOCUMENT_CATEGORIES, resolveCategory, sortInbox } from './sort-inbox.js'
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
  setCategoryCalls: Array<{ tenantId: string; documentId: string; category: string }>
  creditRecords: Array<{ actionCategory: string; weight: number }>
  costRecords: number
  notifications: string[]
}

function makeContext(opts: {
  fetchImpl: typeof fetch
  docs: UnclassifiedDocumentRow[]
}): { ctx: TaskContext; rec: Recorded } {
  const rec: Recorded = {
    setCategoryCalls: [],
    creditRecords: [],
    costRecords: 0,
    notifications: [],
  }

  const documents: DocumentRepository = {
    async setStatus() {},
    async saveExtracted() {},
    async listUnclassified() {
      return opts.docs
    },
    async setCategory(tenantId, documentId, category) {
      rec.setCategoryCalls.push({ tenantId, documentId, category })
    },
  }

  const notifier: Notifier = {
    async ack() {},
    async proposeApproval() {},
    async proposeReminderValidation() {},
    async notifyReminderDue() {},
    async notifyActionResult(_tenantId, text) {
      rec.notifications.push(text)
    },
  }

  const llm = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'k' }, opts.fetchImpl)

  const ctx: TaskContext = {
    tenant: baseTenant(),
    jobRunId: 'jr-1',
    llm,
    ports: {
      queue: { async read() { return [] }, async send() {}, async delete() {}, async archive() {} },
      tenants: { async load() { return baseTenant() } },
      documents,
      drafts: { async markSent() {}, async listOverdueInvoices() { return [] } },
      reminders: { async listOverdue() { return [] }, async listUpcoming() { return [] } },
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
          return { bytes: new Uint8Array(), contentType: 'application/pdf' }
        },
      },
      mailer: {
        async sendDocumentEmail() {
          return { messageId: 'm-1' }
        },
      },
      jobRuns: {
        async begin() { return { jobRunId: 'jr-1', fresh: true } },
        async finish() {},
      },
      credits: {
        async record(entry) {
          rec.creditRecords.push({ actionCategory: entry.actionCategory, weight: entry.weight })
        },
        async recordCost() {
          rec.costRecords += 1
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
        async send() {
          return { delivered: true, expired: false }
        },
      },
      notifier,
      commandChat: { async listRecent() { return [] }, async reply() {} },
      tracer: { async trace(_n, _t, fn) { return fn('trace-1') } },
    },
  }

  return { ctx, rec }
}

describe('resolveCategory', () => {
  it('accepte un slug valide tel quel', () => {
    expect(resolveCategory('facture_fournisseur')).toBe('facture_fournisseur')
  })

  it('accepte un slug valide avec espaces et casse variable', () => {
    expect(resolveCategory('  Recu_Depense  \n')).toBe('recu_depense')
  })

  it('retombe sur autre pour un texte non reconnu', () => {
    expect(resolveCategory('je ne sais pas trop')).toBe('autre')
  })

  it('expose une taxonomie stable contenant autre', () => {
    expect(DOCUMENT_CATEGORIES).toContain('autre')
  })
})

describe('sortInbox', () => {
  it('liste vide : aucun appel LLM, aucun credit, aucune notification', async () => {
    const fetchImpl = vi.fn()
    const { ctx, rec } = makeContext({ fetchImpl, docs: [] })

    await sortInbox(ctx)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(rec.setCategoryCalls).toHaveLength(0)
    expect(rec.creditRecords).toHaveLength(0)
    expect(rec.notifications).toHaveLength(0)
  })

  it('un document : LLM appele, categorie assignee, credit enregistre, notification envoyee', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(openRouterResponse('facture_fournisseur'))
    const docs: UnclassifiedDocumentRow[] = [
      {
        id: 'doc-1',
        mime: 'application/pdf',
        extracted: { emetteur: 'British Gas', montant: 120, devise: 'GBP' },
      },
    ]
    const { ctx, rec } = makeContext({ fetchImpl, docs })

    await sortInbox(ctx)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(rec.setCategoryCalls).toHaveLength(1)
    expect(rec.setCategoryCalls[0]?.documentId).toBe('doc-1')
    expect(DOCUMENT_CATEGORIES).toContain(rec.setCategoryCalls[0]?.category)
    expect(rec.creditRecords).toHaveLength(1)
    expect(rec.creditRecords[0]?.actionCategory).toBe('classification')
    expect(rec.costRecords).toBe(1)
    expect(rec.notifications).toHaveLength(1)
    expect(rec.notifications[0]).toContain('1 document(s) classe(s)')
  })

  it('plusieurs documents : setCategory + credit par document, une seule notification finale', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => openRouterResponse('autre'))
    const docs: UnclassifiedDocumentRow[] = [
      { id: 'doc-1', mime: 'image/jpeg', extracted: null },
      { id: 'doc-2', mime: 'application/pdf', extracted: { montant: 50 } },
      { id: 'doc-3', mime: null, extracted: null },
    ]
    const { ctx, rec } = makeContext({ fetchImpl, docs })

    await sortInbox(ctx)

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(rec.setCategoryCalls).toHaveLength(3)
    expect(rec.creditRecords).toHaveLength(3)
    expect(rec.costRecords).toBe(3)
    expect(rec.notifications).toHaveLength(1)
    expect(rec.notifications[0]).toContain('3 document(s) classe(s)')
  })

  it('categorie non reconnue renvoyee par le LLM : retombe sur autre', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(openRouterResponse('n\'importe quoi'))
    const docs: UnclassifiedDocumentRow[] = [{ id: 'doc-1', mime: null, extracted: null }]
    const { ctx, rec } = makeContext({ fetchImpl, docs })

    await sortInbox(ctx)

    expect(rec.setCategoryCalls[0]?.category).toBe('autre')
  })
})
