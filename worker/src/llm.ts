/**
 * Morax worker - client LLM.
 * Dispatch par fournisseur : Anthropic en direct, tout le reste via OpenRouter.
 * Applique assertRgpdCompliance AVANT tout appel sortant.
 */

import { assertRgpdCompliance } from '@morax/model-core'
import type { ModelConfig } from '@morax/model-core'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmAttachment {
  bytes: Uint8Array
  mediaType: string
}

export interface LlmRequest {
  modelConfig: ModelConfig
  messages: LlmMessage[]
  hasPersonalData: boolean
  maxOutputTokens?: number
  /** Pièces jointes multimodales (OCR). Attachées au premier message user. */
  attachments?: LlmAttachment[]
}

export interface LlmResult {
  text: string
  tokensIn: number
  tokensOut: number
  usdCost: number
}

export interface LlmCredentials {
  anthropicApiKey: string
  openrouterApiKey: string
}

const REQUEST_TIMEOUT_MS = 60_000
const MAX_RETRIES = 1
const RETRY_BACKOFF_MS = 500
// Domaine non acheté (voir docs/PROVISIONING-RUNBOOK.md étape 8bis) : referer sur l'URL Vercel
// active tant que morax.app n'est pas délégué. Override via MORAX_APP_URL si besoin.
const OPENROUTER_REFERER = process.env.MORAX_APP_URL ?? 'https://morax-app.vercel.app'

function estimateCostUsd(
  modelConfig: ModelConfig,
  tokensIn: number,
  tokensOut: number,
): number {
  return (
    (tokensIn / 1_000_000) * modelConfig.priceInUsdPerM +
    (tokensOut / 1_000_000) * modelConfig.priceOutUsdPerM
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

interface AnthropicContentBlock {
  type: string
  text?: string
}

interface AnthropicMessage {
  content: AnthropicContentBlock[]
  usage: { input_tokens: number; output_tokens: number }
}

interface OpenRouterMessage {
  choices: Array<{ message: { content: string } }>
  usage: { prompt_tokens: number; completion_tokens: number }
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function attachmentToAnthropicBlock(attachment: LlmAttachment): Record<string, unknown> {
  const data = bytesToBase64(attachment.bytes)
  const blockType = attachment.mediaType.startsWith('image/') ? 'image' : 'document'
  return {
    type: blockType,
    source: { type: 'base64', media_type: attachment.mediaType, data },
  }
}

function buildAnthropicBody(
  req: LlmRequest,
  modelName: string,
): Record<string, unknown> {
  const systemText = req.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')

  let attached = false
  const messages = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (!attached && m.role === 'user' && req.attachments && req.attachments.length > 0) {
        attached = true
        const blocks: unknown[] = req.attachments.map(attachmentToAnthropicBlock)
        blocks.push({ type: 'text', text: m.content })
        return { role: m.role, content: blocks }
      }
      return { role: m.role, content: m.content }
    })

  return {
    model: modelName,
    max_tokens: req.maxOutputTokens ?? 1024,
    ...(systemText ? { system: systemText } : {}),
    messages,
  }
}

function buildOpenRouterBody(req: LlmRequest, modelName: string): Record<string, unknown> {
  return {
    model: modelName,
    max_tokens: req.maxOutputTokens ?? 1024,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  }
}

export class LlmClient {
  private readonly fetchImpl: typeof fetch

  constructor(
    private readonly creds: LlmCredentials,
    fetchImpl: typeof fetch = globalThis.fetch,
  ) {
    this.fetchImpl = fetchImpl
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    // Garde-fou RGPD : refuse les modèles chinois sur endpoint non Western-managed.
    assertRgpdCompliance(req.modelConfig, req.hasPersonalData)

    const isAnthropic = req.modelConfig.provider.toLowerCase() === 'anthropic'
    const apiKey = isAnthropic ? this.creds.anthropicApiKey : this.creds.openrouterApiKey
    // Pour OpenRouter, le nom de modèle est le slug `openrouterModel`.
    const modelName = isAnthropic
      ? req.modelConfig.model
      : (req.modelConfig.openrouterModel ?? req.modelConfig.model)

    return this.callProvider(req, modelName, apiKey, isAnthropic)
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let attempt = 0
    for (;;) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const res = await this.fetchImpl(url, { ...init, signal: controller.signal })
        if (!res.ok && isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
          attempt += 1
          await sleep(RETRY_BACKOFF_MS * attempt)
          continue
        }
        if (!res.ok) {
          const bodyText = await safeReadText(res)
          throw new Error(`[llm] ${url} -> ${res.status} ${bodyText.slice(0, 200)}`)
        }
        return res
      } finally {
        clearTimeout(timer)
      }
    }
  }

  private async callProvider(
    req: LlmRequest,
    modelName: string,
    apiKey: string,
    isAnthropic: boolean,
  ): Promise<LlmResult> {
    if (isAnthropic) {
      const body = buildAnthropicBody(req, modelName)
      const res = await this.fetchWithRetry(`${req.modelConfig.endpoint}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as AnthropicMessage
      const text = data.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
      const tokensIn = data.usage.input_tokens
      const tokensOut = data.usage.output_tokens
      return { text, tokensIn, tokensOut, usdCost: estimateCostUsd(req.modelConfig, tokensIn, tokensOut) }
    }

    const body = buildOpenRouterBody(req, modelName)
    const res = await this.fetchWithRetry(`${req.modelConfig.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': OPENROUTER_REFERER,
        'X-Title': 'Morax',
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as OpenRouterMessage
    const text = data.choices[0]?.message.content ?? ''
    const tokensIn = data.usage.prompt_tokens
    const tokensOut = data.usage.completion_tokens
    return { text, tokensIn, tokensOut, usdCost: estimateCostUsd(req.modelConfig, tokensIn, tokensOut) }
  }
}
