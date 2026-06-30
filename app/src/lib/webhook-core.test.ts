import { describe, expect, it } from 'vitest'
import type { JobMessage } from '@morax/model-core'
import {
  handlePostmarkInbound,
  handleTelegramUpdate,
  type PostmarkDeps,
  type PostmarkInbound,
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

function makePostmarkDeps(opts: { tenantId?: string | null } = {}): {
  deps: PostmarkDeps
  enqueued: JobMessage[]
  uploads: Array<{ key: string; contentType: string }>
  createdMime: string | undefined
} {
  const enqueued: JobMessage[] = []
  const uploads: Array<{ key: string; contentType: string }> = []
  let createdMime: string | undefined
  const deps: PostmarkDeps = {
    async findTenantByEmailAlias() {
      return opts.tenantId === undefined ? 'morax-test' : opts.tenantId
    },
    async createDocument(input) {
      createdMime = input.mime
      return { documentId: 'doc-1' }
    },
    async enqueue(message) {
      enqueued.push(message)
    },
    async uploadAttachment(key, _bytes, contentType) {
      uploads.push({ key, contentType })
    },
  }
  return {
    deps,
    enqueued,
    uploads,
    get createdMime() {
      return createdMime
    },
  } as { deps: PostmarkDeps; enqueued: JobMessage[]; uploads: Array<{ key: string; contentType: string }>; createdMime: string | undefined }
}

describe('handlePostmarkInbound', () => {
  it('depose la piece jointe en R2 et empile capture_document avec mime', async () => {
    const h = makePostmarkDeps()
    const payload: PostmarkInbound = {
      MessageID: 'msg-1',
      OriginalRecipient: 'tenant@morax.app',
      Attachments: [{ Name: 'facture.pdf', Content: Buffer.from('pdf-bytes').toString('base64'), ContentType: 'application/pdf' }],
    }

    const res = await handlePostmarkInbound(payload, h.deps, NOW)

    expect(res.status).toBe(200)
    expect(res.enqueued).toBe(true)
    expect(h.uploads).toHaveLength(1)
    expect(h.uploads[0]?.key).toBe('tenants/morax-test/postmark/msg-1/facture.pdf')
    expect(h.uploads[0]?.contentType).toBe('application/pdf')
    expect(h.createdMime).toBe('application/pdf')
    expect(h.enqueued[0]?.media_key).toBe('tenants/morax-test/postmark/msg-1/facture.pdf')
    expect(h.enqueued[0]?.idempotency_key).toBe('pm:msg-1')
  })

  it('sans piece jointe : reference postmark, pas d upload', async () => {
    const h = makePostmarkDeps()
    const payload: PostmarkInbound = { MessageID: 'msg-2', OriginalRecipient: 'tenant@morax.app' }

    const res = await handlePostmarkInbound(payload, h.deps, NOW)

    expect(res.enqueued).toBe(true)
    expect(h.uploads).toHaveLength(0)
    expect(h.enqueued[0]?.media_key).toBe('postmark:msg-2')
    expect(h.createdMime).toBeUndefined()
  })

  it('resout le destinataire via ToFull si OriginalRecipient absent', async () => {
    const h = makePostmarkDeps()
    const payload: PostmarkInbound = {
      MessageID: 'msg-3',
      ToFull: [{ Email: 'tenant@morax.app' }],
    }

    const res = await handlePostmarkInbound(payload, h.deps, NOW)

    expect(res.enqueued).toBe(true)
  })

  it('acquitte sans empiler un alias inconnu (pas de tenant implicite)', async () => {
    const h = makePostmarkDeps({ tenantId: null })
    const payload: PostmarkInbound = { MessageID: 'msg-4', OriginalRecipient: 'inconnu@morax.app' }

    const res = await handlePostmarkInbound(payload, h.deps, NOW)

    expect(res.status).toBe(200)
    expect(res.enqueued).toBe(false)
    expect(res.reason).toBe('unknown_alias')
    expect(h.uploads).toHaveLength(0)
    expect(h.enqueued).toHaveLength(0)
  })
})
