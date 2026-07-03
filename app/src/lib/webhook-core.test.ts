import { describe, expect, it } from 'vitest'
import type { JobMessage } from '@morax/model-core'
import {
  handlePostmarkInbound,
  handleTelegramUpdate,
  parseActionCallback,
  verifyPostmarkBasicAuth,
  type PostmarkDeps,
  type PostmarkInbound,
  type TelegramUpdate,
  type WebhookDeps,
} from './webhook-core.js'

const NOW = '2026-06-30T12:00:00Z'

function makeDeps(
  opts: { tenantId?: string | null; decide?: boolean } = {},
): {
  deps: WebhookDeps
  enqueued: JobMessage[]
  createdDocs: number
  decisions: Array<{ tenantId: string; pendingActionId: string; decision: string; decidedBy: string }>
} {
  const enqueued: JobMessage[] = []
  const decisions: Array<{
    tenantId: string
    pendingActionId: string
    decision: string
    decidedBy: string
  }> = []
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
    async decidePendingAction(tenantId, pendingActionId, decision, decidedBy) {
      decisions.push({ tenantId, pendingActionId, decision, decidedBy })
      return opts.decide ?? true
    },
  }
  return {
    deps,
    enqueued,
    decisions,
    get createdDocs() {
      return createdDocs
    },
  } as {
    deps: WebhookDeps
    enqueued: JobMessage[]
    createdDocs: number
    decisions: Array<{ tenantId: string; pendingActionId: string; decision: string; decidedBy: string }>
  }
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

describe('parseActionCallback', () => {
  it('parse un callback_data approve valide', () => {
    expect(parseActionCallback('act:abc-123:approve')).toEqual({
      pendingActionId: 'abc-123',
      decision: 'approve',
    })
  })

  it('parse un callback_data reject valide', () => {
    expect(parseActionCallback('act:abc-123:reject')).toEqual({
      pendingActionId: 'abc-123',
      decision: 'reject',
    })
  })

  it('rejette un callback_data absent', () => {
    expect(parseActionCallback(undefined)).toBeNull()
  })

  it('rejette un callback_data malforme', () => {
    expect(parseActionCallback('nope')).toBeNull()
    expect(parseActionCallback('act:abc-123:maybe')).toBeNull()
  })
})

describe('handleTelegramUpdate callback_query', () => {
  function callbackUpdate(overrides: Partial<TelegramUpdate['callback_query']> = {}): TelegramUpdate {
    return {
      update_id: 10,
      callback_query: {
        id: 'cbq-1',
        from: { id: 42 },
        data: 'act:pa-1:approve',
        message: { chat: { id: 111111111 } },
        ...overrides,
      },
    }
  }

  it('approve : decide puis empile action_execute', async () => {
    const h = makeDeps()
    const res = await handleTelegramUpdate(callbackUpdate(), h.deps, NOW)
    expect(res.status).toBe(200)
    expect(res.enqueued).toBe(true)
    expect(h.decisions).toEqual([
      { tenantId: 'morax-test', pendingActionId: 'pa-1', decision: 'approve', decidedBy: '42' },
    ])
    expect(h.enqueued).toHaveLength(1)
    const job = h.enqueued[0]!
    expect(job.type).toBe('action_execute')
    expect(job.source).toBe('telegram')
    expect(job.action).toEqual({ pending_action_id: 'pa-1' })
    expect(job.idempotency_key).toBe('act-exec:pa-1')
  })

  it('reject : decide puis empile action_execute', async () => {
    const h = makeDeps()
    const res = await handleTelegramUpdate(
      callbackUpdate({ data: 'act:pa-1:reject' }),
      h.deps,
      NOW,
    )
    expect(res.enqueued).toBe(true)
    expect(h.decisions[0]?.decision).toBe('reject')
  })

  it('chat inconnu : acquitte sans decider ni empiler', async () => {
    const h = makeDeps({ tenantId: null })
    const res = await handleTelegramUpdate(callbackUpdate(), h.deps, NOW)
    expect(res.status).toBe(200)
    expect(res.enqueued).toBe(false)
    expect(res.reason).toBe('unknown_chat')
    expect(h.decisions).toHaveLength(0)
    expect(h.enqueued).toHaveLength(0)
  })

  it('callback_data malforme : acquitte sans decider ni empiler', async () => {
    const h = makeDeps()
    const res = await handleTelegramUpdate(callbackUpdate({ data: 'nope' }), h.deps, NOW)
    expect(res.status).toBe(200)
    expect(res.enqueued).toBe(false)
    expect(res.reason).toBe('bad_callback')
    expect(h.decisions).toHaveLength(0)
    expect(h.enqueued).toHaveLength(0)
  })

  it('action deja decidee : pas d empilage', async () => {
    const h = makeDeps({ decide: false })
    const res = await handleTelegramUpdate(callbackUpdate(), h.deps, NOW)
    expect(res.status).toBe(200)
    expect(res.enqueued).toBe(false)
    expect(res.reason).toBe('already_decided')
    expect(h.enqueued).toHaveLength(0)
  })

  it('non-regression : un message texte normal reste route comme avant', async () => {
    const h = makeDeps()
    const update: TelegramUpdate = {
      update_id: 11,
      message: { chat: { id: 111111111 }, text: 'brain dump' },
    }
    const res = await handleTelegramUpdate(update, h.deps, NOW)
    expect(res.enqueued).toBe(true)
    expect(h.enqueued[0]!.type).toBe('capture_audio')
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

function basicHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
}

describe('verifyPostmarkBasicAuth', () => {
  it('accepte un Basic Auth avec le bon utilisateur et secret', () => {
    expect(verifyPostmarkBasicAuth(basicHeader('morax', 's3cret'), 's3cret')).toBe(true)
  })

  it('refuse un header absent', () => {
    expect(verifyPostmarkBasicAuth(null, 's3cret')).toBe(false)
  })

  it('refuse un schema non-Basic', () => {
    expect(verifyPostmarkBasicAuth('Bearer abc123', 's3cret')).toBe(false)
  })

  it('refuse un mauvais utilisateur', () => {
    expect(verifyPostmarkBasicAuth(basicHeader('autre', 's3cret'), 's3cret')).toBe(false)
  })

  it('refuse un mauvais secret', () => {
    expect(verifyPostmarkBasicAuth(basicHeader('morax', 'faux'), 's3cret')).toBe(false)
  })

  it('refuse quand POSTMARK_INBOUND_SECRET est absent (env mal configuree)', () => {
    expect(verifyPostmarkBasicAuth(basicHeader('morax', 's3cret'), undefined)).toBe(false)
  })
})
