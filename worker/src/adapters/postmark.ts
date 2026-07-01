/**
 * Morax worker - adapter email sortant (Postmark).
 * fetch injectable pour les tests, meme idiome que adapters/r2.ts.
 */

import type { WorkerConfig } from '../config.js'
import type { Mailer } from '../ports.js'

export function makeMailer(
  config: WorkerConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): Mailer {
  return {
    async sendDocumentEmail(input) {
      const res = await fetchImpl('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'X-Postmark-Server-Token': config.postmarkServerToken,
        },
        body: JSON.stringify({
          From: config.mailFrom,
          To: input.to,
          Subject: input.subject,
          TextBody: input.textBody,
          Attachments: [
            {
              Name: input.attachment.filename,
              Content: input.attachment.contentBase64,
              ContentType: input.attachment.contentType,
            },
          ],
          MessageStream: 'outbound',
        }),
      })
      if (!res.ok) {
        throw new Error(`[postmark] POST /email -> ${res.status}`)
      }
      const data = (await res.json()) as { MessageID: string }
      return { messageId: data.MessageID }
    },
  }
}
