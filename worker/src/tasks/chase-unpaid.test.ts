import { describe, expect, it, vi } from 'vitest'
import type { ChaseReminderActionPayload, TenantConfig } from '@morax/model-core'
import { LlmClient } from '../llm.js'
import type { OverdueInvoiceRow, Ports } from '../ports.js'
import type { JobMessage } from '../types.js'
import type { TaskContext } from './types.js'
import { chaseUnpaid } from './chase-unpaid.js'

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

/**
 * Reponse LLM factice portant les deux formes (Anthropic + OpenRouter) : le
 * routage du role 'cerveau' peut tomber sur l'un ou l'autre selon le registre,
 * donc on rend le meme corps parsable par les deux branches de LlmClient.
 */
function llmResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text }],
      choices: [{ message: { content: text } }],
      usage: {
        input_tokens: 42,
        output_tokens: 17,
        prompt_tokens: 42,
        completion_tokens: 17,
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

interface Enqueued {
  actionType: string
  payload: ChaseReminderActionPayload
}

interface Recorded {
  enqueued: Enqueued[]
  jobs: JobMessage[]
  credits: Array<{ category: string; weight: number }>
  costs: Array<{ model: string; provider: string; role: string }>
  actionResults: string[]
  /** Sentinelle : mis a true si le mailer est appele (interdit ici). */
  mailerCalled: boolean
}

interface Fixture {
  ctx: TaskContext
  rec: Recorded
  fetchImpl: ReturnType<typeof vi.fn>
}

function makeFixture(opts: { overdue: OverdueInvoiceRow[]; text?: string }): Fixture {
  const rec: Recorded = {
    enqueued: [],
    jobs: [],
    credits: [],
    costs: [],
    actionResults: [],
    mailerCalled: false,
  }

  // Fabrique une reponse FRAICHE par appel : un corps Response ne se lit qu'une
  // fois, donc reutiliser le meme objet casserait le cas multi-factures.
  const text = opts.text ?? 'Bonjour, votre facture reste impayee.'
  const fetchImpl = vi.fn().mockImplementation(async () => llmResponse(text))
  const llm = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'k' }, fetchImpl as unknown as typeof fetch)

  let seq = 0
  const ports = {
    queue: {
      async send(message: JobMessage) {
        rec.jobs.push(message)
      },
    },
    drafts: {
      async listOverdueInvoices() {
        return opts.overdue
      },
    },
    pendingActions: {
      async enqueue(action: { actionType: string; payload: ChaseReminderActionPayload }) {
        seq += 1
        rec.enqueued.push({ actionType: action.actionType, payload: action.payload })
        return { pendingActionId: `pa-${seq}` }
      },
    },
    credits: {
      async record(e: { actionCategory: string; weight: number }) {
        rec.credits.push({ category: e.actionCategory, weight: e.weight })
      },
      async recordCost(e: { model: string; provider: string; role: string }) {
        rec.costs.push({ model: e.model, provider: e.provider, role: e.role })
      },
    },
    notifier: {
      async notifyActionResult(_tenantId: string, text: string) {
        rec.actionResults.push(text)
      },
    },
    // Sentinelle du garde-fou : la presence d'un mailer piege prouve que le
    // handler ne l'invoque jamais (l'envoi ne se fait qu'apres approbation).
    mailer: {
      async sendDocumentEmail() {
        rec.mailerCalled = true
        return { messageId: 'should-never-happen' }
      },
    },
  } as unknown as Ports

  const ctx: TaskContext = {
    tenant: baseTenant(),
    ports,
    llm,
    jobRunId: 'jr-1',
    traceId: 'trace-1',
  }
  return { ctx, rec, fetchImpl }
}

function overdueInvoice(overrides: Partial<OverdueInvoiceRow> = {}): OverdueInvoiceRow {
  return {
    draftId: 'draft-1',
    docNumber: 'INV-001',
    clientEmail: 'client@example.com',
    total: 340,
    currency: 'GBP',
    dueDate: '2026-06-01',
    ...overrides,
  }
}

describe('chaseUnpaid', () => {
  it('sans facture en retard : aucun appel LLM, aucun credit, notifie "aucune facture"', async () => {
    const { ctx, rec, fetchImpl } = makeFixture({ overdue: [] })

    await chaseUnpaid(ctx)

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(rec.enqueued).toHaveLength(0)
    expect(rec.jobs).toHaveLength(0)
    expect(rec.credits).toHaveLength(0)
    expect(rec.costs).toHaveLength(0)
    expect(rec.actionResults).toEqual(['Aucune facture en retard a relancer.'])
    expect(rec.mailerCalled).toBe(false)
  })

  it('une facture : propose via le gate chase_reminder avec le texte LLM et enfile action_propose', async () => {
    const { ctx, rec, fetchImpl } = makeFixture({
      overdue: [overdueInvoice({ cc: 'compta@example.com' })],
      text: '  Bonjour, merci de regler la facture INV-001.  ',
    })

    await chaseUnpaid(ctx)

    // Appel LLM unique pour rediger la relance.
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    // Proposition gate HIGH : bon action_type + payload complet, message_text = texte LLM trimme.
    expect(rec.enqueued).toHaveLength(1)
    const proposal = rec.enqueued[0]!
    expect(proposal.actionType).toBe('chase_reminder')
    expect(proposal.payload).toEqual({
      draft_id: 'draft-1',
      doc_number: 'INV-001',
      client_email: 'client@example.com',
      cc: 'compta@example.com',
      total: 340,
      currency: 'GBP',
      message_text: 'Bonjour, merci de regler la facture INV-001.',
    })

    // Job action_propose auto-enfile, referencant le bon pending_action_id.
    expect(rec.jobs).toHaveLength(1)
    const job = rec.jobs[0]!
    expect(job.type).toBe('action_propose')
    expect(job.action?.pending_action_id).toBe('pa-1')
    expect(job.idempotency_key).toBe('act-prop:pa-1')
    expect(job.tenant_id).toBe('morax-test')

    // Credit comptabilise une fois, categorie relance_client (poids 2).
    expect(rec.credits).toEqual([{ category: 'relance_client', weight: 2 }])
    expect(rec.costs).toHaveLength(1)

    // Garde-fou : jamais d'envoi direct.
    expect(rec.mailerCalled).toBe(false)
  })

  it('sans cc : le champ cc est omis du payload (pas de cc vide)', async () => {
    const { ctx, rec } = makeFixture({ overdue: [overdueInvoice()] })

    await chaseUnpaid(ctx)

    expect(rec.enqueued).toHaveLength(1)
    expect(rec.enqueued[0]!.payload).not.toHaveProperty('cc')
  })

  it('plusieurs factures : une proposition + un credit PAR facture, jamais de mailer', async () => {
    const overdue = [
      overdueInvoice({ draftId: 'd-1', docNumber: 'INV-1', clientEmail: 'a@x.com' }),
      overdueInvoice({ draftId: 'd-2', docNumber: 'INV-2', clientEmail: 'b@x.com', total: 90 }),
      overdueInvoice({ draftId: 'd-3', docNumber: 'INV-3', clientEmail: 'c@x.com', total: 1200 }),
    ]
    const { ctx, rec, fetchImpl } = makeFixture({ overdue })

    await chaseUnpaid(ctx)

    // Un appel LLM, une proposition, un job, un credit et un cout PAR facture.
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(rec.enqueued).toHaveLength(3)
    expect(rec.jobs).toHaveLength(3)
    expect(rec.credits).toHaveLength(3)
    expect(rec.costs).toHaveLength(3)

    // Chaque job pointe vers un pending_action distinct (pa-1..pa-3).
    expect(rec.jobs.map((j) => j.action?.pending_action_id)).toEqual(['pa-1', 'pa-2', 'pa-3'])
    // Chaque proposition porte la bonne facture.
    expect(rec.enqueued.map((e) => e.payload.doc_number)).toEqual(['INV-1', 'INV-2', 'INV-3'])
    // Tous les credits sont des relance_client.
    expect(rec.credits.every((c) => c.category === 'relance_client')).toBe(true)

    expect(rec.mailerCalled).toBe(false)
  })
})
