/**
 * Morax app - upload media vers Cloudflare R2.
 * Cote serveur uniquement : les cles R2 ne quittent jamais le client/edge.
 */

import { AwsClient } from 'aws4fetch'

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`[r2] env manquante : ${name}`)
  return v
}

export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const client = new AwsClient({
    accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    service: 's3',
    region: 'auto',
  })
  const bucket = requiredEnv('R2_BUCKET')
  const endpoint = requiredEnv('R2_ENDPOINT')
  const url = `${endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`

  const res = await client.fetch(url, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    // Cast : décalage de version entre lib.dom.Uint8Array et @types/node.Uint8Array<ArrayBufferLike>.
    body: bytes as BodyInit,
  })
  if (!res.ok) {
    throw new Error(`[r2] PUT ${key} -> ${res.status}`)
  }
}
