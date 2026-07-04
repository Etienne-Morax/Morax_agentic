/**
 * Morax worker - adapter push web VAPID (PWA). sendNotification injectable
 * pour les tests, meme idiome que adapters/postmark.ts (fetch injectable).
 * No-op silencieux si VAPID non provisionne (config.vapid === null) : le push
 * est une amelioration additive, jamais un chemin bloquant (Telegram reste
 * le canal de notification garanti).
 */

import webpush, { WebPushError, type PushSubscription, type RequestOptions, type SendResult } from 'web-push'
import type { WorkerConfig } from '../config.js'
import type { PushSender } from '../ports.js'

export type SendNotificationImpl = (
  subscription: PushSubscription,
  payload: string,
  options: RequestOptions,
) => Promise<SendResult>

export function makeWebPush(
  config: WorkerConfig,
  sendNotificationImpl: SendNotificationImpl = webpush.sendNotification,
): PushSender {
  return {
    async send(subscription, payload) {
      if (!config.vapid) return { delivered: false, expired: false }

      try {
        await sendNotificationImpl(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { vapidDetails: config.vapid },
        )
        return { delivered: true, expired: false }
      } catch (err) {
        const expired = err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)
        if (!expired) throw err
        return { delivered: false, expired: true }
      }
    },
  }
}
