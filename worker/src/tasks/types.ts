/**
 * Morax worker - contexte des taches Launchpad (chase_unpaid, check_deadlines,
 * daily_summary, sort_inbox). Decouple volontairement de PipelineContext
 * (pipeline.ts = capture/OCR/redaction finance-critique, tasks/ = corvees
 * declenchees par bouton) meme si la forme est identique.
 */

import type { TenantConfig } from '@morax/model-core'
import type { LlmClient } from '../llm.js'
import type { Ports } from '../ports.js'

export interface TaskContext {
  tenant: TenantConfig
  ports: Ports
  llm: LlmClient
  jobRunId: string
  traceId?: string
}
