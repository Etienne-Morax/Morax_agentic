/**
 * Morax worker - entrypoint Cloud Run Job.
 * Déclenché par Cloud Scheduler (~1 min). Draine la file puis sort (scale-to-zero).
 */

import { loadConfig } from './config.js'
import { LlmClient } from './llm.js'
import { createPorts } from './adapters/supabase.js'
import { runOnce, type RunConfig } from './run.js'

const MAX_PASSES = 20
const VISIBILITY_TIMEOUT_SEC = 120

async function main(): Promise<void> {
  const config = loadConfig()
  const ports = createPorts(config)
  const llm = new LlmClient({
    anthropicApiKey: config.anthropicApiKey,
    openrouterApiKey: config.openrouterApiKey,
  })

  const runConfig: RunConfig = {
    maxLoopsPerJob: config.maxLoopsPerJob,
    queueBatchSize: config.queueBatchSize,
    visibilityTimeoutSec: VISIBILITY_TIMEOUT_SEC,
  }

  let totalProcessed = 0
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const results = await runOnce(ports, llm, runConfig)
    if (results.length === 0) break
    totalProcessed += results.length
  }

  console.log(`[worker] terminé. Jobs traités : ${totalProcessed}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[worker] échec : ${message}`)
  process.exitCode = 1
})
