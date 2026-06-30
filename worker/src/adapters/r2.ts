/**
 * Morax worker - adapter media (Cloudflare R2, compatible S3).
 * Signature SigV4 via aws4fetch ; fetch injectable pour les tests.
 */

import { AwsClient } from 'aws4fetch'
import type { WorkerConfig } from '../config.js'
import type { MediaRepository } from '../ports.js'

export function makeMedia(
  config: WorkerConfig,
  fetchImpl: typeof fetch = globalThis.fetch,
): MediaRepository {
  const client = new AwsClient({
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
    service: 's3',
    region: 'auto',
  })

  return {
    async getObject(key: string) {
      const url = `${config.r2.endpoint}/${config.r2.bucket}/${key
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`
      const signedRequest = await client.sign(url, { method: 'GET' })
      const res = await fetchImpl(signedRequest)
      if (!res.ok) {
        throw new Error(`[r2] GET ${key} -> ${res.status}`)
      }
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
      const bytes = new Uint8Array(await res.arrayBuffer())
      return { bytes, contentType }
    },
  }
}
