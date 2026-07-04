/**
 * Morax worker - "Reponse chat" (Centre de Commandement, bouton Envoyer du chat web).
 * Repond au dernier message utilisateur avec le contexte des tours recents
 * (command_messages), redige par le LLM (role cerveau : le chat peut toucher
 * montant/echeance -- garde-fou financier, cf. grille-actions-poids.md).
 * N'execute jamais d'action a effet de bord ici (envoi email, creation
 * document) : ces actions restent derriere le gate HIGH / les boutons
 * Launchpad dedies.
 */

import { creditCost, resolveModel } from '@morax/model-core'
import type { LlmMessage } from '../llm.js'
import type { TaskContext } from './types.js'

const COMMAND_REPLY_SYSTEM = `Tu es l'assistant Morax, copilote administratif d'un
artisan/independant britannique (devis, factures, relances, echeances).
Reponds au dernier message de l'utilisateur de maniere concise, utile, en
francais, ton direct et chaleureux. Tu ne peux executer aucune action toi-meme
(envoi d'email, creation de document, relance) : si l'utilisateur en demande
une, explique-le et oriente-le vers le bouton Launchpad correspondant plutot
que d'inventer un resultat.`

const COMMAND_REPLY_MAX_OUTPUT_TOKENS = 500
const COMMAND_REPLY_HISTORY_LIMIT = 10

export async function commandReply(ctx: TaskContext): Promise<void> {
  const tenantId = ctx.tenant.tenant_id
  const history = await ctx.ports.commandChat.listRecent(tenantId, COMMAND_REPLY_HISTORY_LIMIT)

  // Garde-fou anti-doublon : si le dernier tour n'est pas un message utilisateur
  // (ex. un autre job command_reply a deja repondu entre-temps), rien a faire.
  const last = history[history.length - 1]
  if (!last || last.role !== 'user') return

  const modelConfig = resolveModel({ tenantConfig: ctx.tenant, role: 'cerveau' })
  const messages: LlmMessage[] = [
    { role: 'system', content: COMMAND_REPLY_SYSTEM },
    ...history.map((m) => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.body }) as const),
  ]

  const llmResult = await ctx.llm.complete({
    modelConfig,
    messages,
    hasPersonalData: true,
    maxOutputTokens: COMMAND_REPLY_MAX_OUTPUT_TOKENS,
  })

  await ctx.ports.commandChat.reply(tenantId, llmResult.text.trim())

  await ctx.ports.credits.record({
    tenantId,
    jobRunId: ctx.jobRunId,
    actionCategory: 'chat_reply',
    weight: creditCost('chat_reply'),
    ...(ctx.traceId ? { langfuseTraceId: ctx.traceId } : {}),
  })
  await ctx.ports.credits.recordCost({
    tenantId,
    jobRunId: ctx.jobRunId,
    role: modelConfig.financePinned ? 'cerveau:finance' : 'pipeline',
    model: modelConfig.model,
    provider: modelConfig.provider,
    tokensIn: llmResult.tokensIn,
    tokensOut: llmResult.tokensOut,
    usdCost: llmResult.usdCost,
    ...(ctx.traceId ? { langfuseTraceId: ctx.traceId } : {}),
  })
}
