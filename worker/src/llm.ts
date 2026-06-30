/**
 * Morax worker - client LLM.
 * Dispatch par fournisseur : Anthropic en direct, tout le reste via OpenRouter.
 * Applique assertRgpdCompliance AVANT tout appel sortant.
 *
 * NOTE: l'appel HTTP réel est encapsulé dans `callProvider`. Au MVP il est
 * volontairement minimal ; brancher le SDK/HTTP réel lors de la Phase 3.
 */

import { assertRgpdCompliance } from '@morax/model-core'
import type { ModelConfig } from '@morax/model-core'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  modelConfig: ModelConfig
  messages: LlmMessage[]
  hasPersonalData: boolean
  maxOutputTokens?: number
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

export class LlmClient {
  constructor(private readonly creds: LlmCredentials) {}

  async complete(req: LlmRequest): Promise<LlmResult> {
    // Garde-fou RGPD : refuse les modèles chinois sur endpoint non Western-managed.
    assertRgpdCompliance(req.modelConfig, req.hasPersonalData)

    const isAnthropic = req.modelConfig.provider.toLowerCase() === 'anthropic'
    const apiKey = isAnthropic ? this.creds.anthropicApiKey : this.creds.openrouterApiKey
    // Pour OpenRouter, le nom de modèle est le slug `openrouterModel`.
    const modelName = isAnthropic
      ? req.modelConfig.model
      : (req.modelConfig.openrouterModel ?? req.modelConfig.model)

    return this.callProvider(req, modelName, apiKey)
  }

  /**
   * Appel sortant réel. Stub au MVP : à remplacer par fetch vers
   * `${modelConfig.endpoint}` avec le payload du fournisseur.
   */
  private async callProvider(
    req: LlmRequest,
    modelName: string,
    _apiKey: string,
  ): Promise<LlmResult> {
    void modelName
    // TODO Phase 3 : implémenter l'appel HTTP (Anthropic Messages API / OpenRouter).
    const tokensIn = req.messages.reduce((n, m) => n + Math.ceil(m.content.length / 4), 0)
    const tokensOut = 0
    return {
      text: '',
      tokensIn,
      tokensOut,
      usdCost: estimateCostUsd(req.modelConfig, tokensIn, tokensOut),
    }
  }
}
