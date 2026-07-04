import { describe, expect, it, vi } from 'vitest'
import type { WorkerConfig } from '../config.js'
import { makeMailer } from './postmark.js'

function fakeConfig(): WorkerConfig {
  return {
    env: 'test',
    supabaseUrl: 'https://x.supabase.co',
    supabaseServiceRoleKey: 'svc',
    anthropicApiKey: 'k',
    openrouterApiKey: 'k',
    langfuse: { publicKey: 'pk', secretKey: 'sk', host: 'https://cloud.langfuse.com' },
    r2: {
      accountId: 'acc1',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret',
      bucket: 'morax-media',
      endpoint: 'https://acc1.r2.cloudflarestorage.com',
    },
    telegramBotToken: 'tg',
    postmarkServerToken: 'pm-token',
    mailFrom: 'factures@morax.app',
    maxLoopsPerJob: 8,
    queueBatchSize: 10,
    vapid: null,
  }
}

describe('makeMailer (adapter Postmark)', () => {
  it('poste vers api.postmarkapp.com avec le bon header et body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ MessageID: 'msg-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const mailer = makeMailer(fakeConfig(), fetchImpl)

    const result = await mailer.sendDocumentEmail({
      to: 'client@x.com',
      subject: 'Facture INV-001',
      textBody: 'Bonjour...',
      attachment: { filename: 'INV-001.pdf', contentBase64: 'YWJj', contentType: 'application/pdf' },
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.postmarkapp.com/email')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['X-Postmark-Server-Token']).toBe('pm-token')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      From: 'factures@morax.app',
      To: 'client@x.com',
      Subject: 'Facture INV-001',
      TextBody: 'Bonjour...',
      Attachments: [
        { Name: 'INV-001.pdf', Content: 'YWJj', ContentType: 'application/pdf' },
      ],
      MessageStream: 'outbound',
    })
    expect(result.messageId).toBe('msg-1')
  })

  it('ajoute HtmlBody et Cc au payload quand fournis', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ MessageID: 'msg-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const mailer = makeMailer(fakeConfig(), fetchImpl)

    await mailer.sendDocumentEmail({
      to: 'client@x.com',
      cc: 'copy@x.com',
      subject: 'Facture INV-001',
      textBody: 'Bonjour...',
      htmlBody: '<p>Bonjour...</p>',
      attachment: { filename: 'INV-001.pdf', contentBase64: 'YWJj', contentType: 'application/pdf' },
    })

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.Cc).toBe('copy@x.com')
    expect(body.HtmlBody).toBe('<p>Bonjour...</p>')
  })

  it('omet HtmlBody et Cc quand absents', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ MessageID: 'msg-3' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const mailer = makeMailer(fakeConfig(), fetchImpl)

    await mailer.sendDocumentEmail({
      to: 'client@x.com',
      subject: 'Facture INV-001',
      textBody: 'Bonjour...',
      attachment: { filename: 'INV-001.pdf', contentBase64: 'YWJj', contentType: 'application/pdf' },
    })

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.Cc).toBeUndefined()
    expect(body.HtmlBody).toBeUndefined()
  })

  it('jette une erreur explicite sur un statut non-2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('bad request', { status: 422 }))
    const mailer = makeMailer(fakeConfig(), fetchImpl)

    await expect(
      mailer.sendDocumentEmail({
        to: 'client@x.com',
        subject: 'x',
        textBody: 'x',
        attachment: { filename: 'x.pdf', contentBase64: 'YQ==', contentType: 'application/pdf' },
      }),
    ).rejects.toThrow(/422/)
  })
})
