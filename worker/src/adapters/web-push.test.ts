import { describe, expect, it, vi } from 'vitest'
import { WebPushError } from 'web-push'
import type { WorkerConfig } from '../config.js'
import { makeWebPush } from './web-push.js'

function fakeConfig(vapid: WorkerConfig['vapid']): WorkerConfig {
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
    vapid,
  }
}

const SUBSCRIPTION = { endpoint: 'https://push.example/abc', p256dh: 'p256dh-key', auth: 'auth-secret' }
const PAYLOAD = { title: 'Morax', body: 'Echeance J-7', url: '/launchpad' }

describe('makeWebPush (adapter push VAPID)', () => {
  it('no-op si VAPID non configure (config.vapid === null)', async () => {
    const sendNotificationImpl = vi.fn()
    const sender = makeWebPush(fakeConfig(null), sendNotificationImpl)

    const result = await sender.send(SUBSCRIPTION, PAYLOAD)

    expect(result).toEqual({ delivered: false, expired: false })
    expect(sendNotificationImpl).not.toHaveBeenCalled()
  })

  it('envoie via web-push avec le bon abonnement/payload/vapidDetails', async () => {
    const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:etienne@morax.app' }
    const sendNotificationImpl = vi.fn().mockResolvedValue({ statusCode: 201, body: '', headers: {} })
    const sender = makeWebPush(fakeConfig(vapid), sendNotificationImpl)

    const result = await sender.send(SUBSCRIPTION, PAYLOAD)

    expect(result).toEqual({ delivered: true, expired: false })
    expect(sendNotificationImpl).toHaveBeenCalledTimes(1)
    const [subscriptionArg, payloadArg, optionsArg] = sendNotificationImpl.mock.calls[0]
    expect(subscriptionArg).toEqual({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
    })
    expect(JSON.parse(payloadArg)).toEqual(PAYLOAD)
    expect(optionsArg.vapidDetails).toEqual(vapid)
  })

  it('marque expired sur 404/410 sans jeter', async () => {
    const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:etienne@morax.app' }
    const sendNotificationImpl = vi
      .fn()
      .mockRejectedValue(new WebPushError('gone', 410, {}, 'gone', SUBSCRIPTION.endpoint))
    const sender = makeWebPush(fakeConfig(vapid), sendNotificationImpl)

    const result = await sender.send(SUBSCRIPTION, PAYLOAD)

    expect(result).toEqual({ delivered: false, expired: true })
  })

  it('propage les autres erreurs (ex. 500 amont)', async () => {
    const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:etienne@morax.app' }
    const sendNotificationImpl = vi
      .fn()
      .mockRejectedValue(new WebPushError('upstream error', 500, {}, 'err', SUBSCRIPTION.endpoint))
    const sender = makeWebPush(fakeConfig(vapid), sendNotificationImpl)

    await expect(sender.send(SUBSCRIPTION, PAYLOAD)).rejects.toThrow(/upstream error/)
  })
})
