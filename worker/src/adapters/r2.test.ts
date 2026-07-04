import { describe, expect, it, vi } from 'vitest'
import type { WorkerConfig } from '../config.js'
import { makeMedia } from './r2.js'

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

describe('makeMedia (adapter R2)', () => {
  it('signe et envoie un GET vers la bonne URL, renvoie bytes + contentType', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    )
    const media = makeMedia(fakeConfig(), fetchImpl)

    const result = await media.getObject('tenants/morax-test/postmark/m1/facture.pdf')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [signedRequest] = fetchImpl.mock.calls[0] as [Request]
    expect(signedRequest.method).toBe('GET')
    expect(signedRequest.url).toBe(
      'https://acc1.r2.cloudflarestorage.com/morax-media/tenants/morax-test/postmark/m1/facture.pdf',
    )
    expect(signedRequest.headers.get('authorization')).toBeTruthy()
    expect(result.contentType).toBe('application/pdf')
    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4])
  })

  it('jette une erreur explicite sur un statut non-2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }))
    const media = makeMedia(fakeConfig(), fetchImpl)

    await expect(media.getObject('missing.pdf')).rejects.toThrow(/404/)
  })
})
