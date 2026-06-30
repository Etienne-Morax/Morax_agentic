import { describe, expect, it } from 'vitest'
import type { JobMessage } from '@morax/model-core'
import {
  handleTelegramUpdate,
  type TelegramUpdate,
  type WebhookDeps,
} from './webhook-core.js'

const NOW = '2026-06-30T12:00:00Z'

function makeDeps(opts: { tenantId?: string | null } = {}): {
  deps: WebhookDeps
  enqueued: JobMessage[]
  createdDocs: number
} {
  const enqueued: JobMessage[] = []
  let createdDocs = 0
  const deps: WebhookDeps = {
    async findTenantByTelegram() {
      return opts.tenantId === undefined ? 'morax-test' : opts.tenantId
    },
    async createDocument() {
      createdDocs += 1
      return { documentId: `doc-${createdDocs}` }
    },
    async enqueue(message) {
      enqueued.push(message)
    },
  }
  return {
    deps,
    enqueued,
    get createdDocs() {
      return createdDocs
    },
  } as { deps: WebhookDeps; enqueued: JobMessage[]; createdDocs: number }
}

function photoUpdate(): TelegramUpdate {
  return {
    update_id: 555,
    message: { chat: { id: 111111111 }, photo: [{ file_id: 'AAA' }, { file_id: 'BBB' }] },
  }
}

describe('handleTelegramUpdate', () => {
  it('empile un capture_document pour une photo de chat connu', async () => {
    const h = makeDeps()
    const res = await handleTelegramUpdate(photoUpdate(), h.deps, NOW)
    expect(res.status).toBe(200)
    expect(res.enqueued).toBe(true)
    expect(h.enqueued).toHaveLength(1)
    const job = h.enqueued[0]!
    expect(job.type).toBe('capture_document')
    expect(job.media_key).toBe('telegram:BBB') // plus grande resolution
    expect(job.document_id).toBe('doc-1')
    expect(job.idempotency_key).toBe('tg:555')
  })

  it('acquitte sans empiler un chat inconnu (pas de tenant implicite)', async () => {
    const h = makeDeps({ tenantId: null })
    const res = await handleTelegramUpdate(photoUpdate(), h.deps, NOW)
    expect(res.status).toBe(200)
    expect(res.enqueued).toBe(false)
    expect(res.reason).toBe('unknown_chat')
    expect(h.enqueued).toHaveLength(0)
  })

  it('classe une note vocale en capture_audio sans creer de document', async () => {
    const h = makeDeps()
    const update: TelegramUpdate = {
      update_id: 7,
      message: { chat: { id: 111111111 }, voice: { file_id: 'VOICE1' } },
    }
    const res = await handleTelegramUpdate(update, h.deps, NOW)
    expect(res.enqueued).toBe(true)
    expect(h.enqueued[0]!.type).toBe('capture_audio')
    expect(h.enqueued[0]!.media_key).toBe('telegram:VOICE1')
  })

  it('classe un texte seul en capture_audio (brain dump)', async () => {
    const h = makeDeps()
    const update: TelegramUpdate = {
      update_id: 8,
      message: { chat: { id: 111111111 }, text: 'rappelle-moi la facture EDF' },
    }
    const res = await handleTelegramUpdate(update, h.deps, NOW)
    expect(res.enqueued).toBe(true)
    expect(h.enqueued[0]!.type).toBe('capture_audio')
    expect(h.enqueued[0]!.document_id).toBeUndefined()
    expect(h.enqueued[0]!.text).toContain('EDF')
  })

  it('acquitte une update sans message', async () => {
    const h = makeDeps()
    const res = await handleTelegramUpdate({ update_id: 9 }, h.deps, NOW)
    expect(res.status).toBe(200)
    expect(res.enqueued).toBe(false)
    expect(res.reason).toBe('no_message')
  })
})
