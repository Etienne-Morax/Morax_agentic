/**
 * Morax worker - configuration et secrets.
 * Validation au démarrage : fail-fast si un secret requis manque.
 * Les clés LLM ne vivent QUE dans le worker (jamais edge/client).
 */

export interface WorkerConfig {
  env: string
  supabaseUrl: string
  supabaseServiceRoleKey: string
  anthropicApiKey: string
  openrouterApiKey: string
  langfuse: {
    publicKey: string
    secretKey: string
    host: string
  }
  telegramBotToken: string
  maxLoopsPerJob: number
  queueBatchSize: number
}

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`[config] Variable d'environnement requise manquante : ${name}`)
  }
  return value
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function loadConfig(): WorkerConfig {
  return {
    env: process.env.MORAX_ENV ?? 'dev',
    supabaseUrl: required('SUPABASE_URL'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    openrouterApiKey: required('OPENROUTER_API_KEY'),
    langfuse: {
      publicKey: required('LANGFUSE_PUBLIC_KEY'),
      secretKey: required('LANGFUSE_SECRET_KEY'),
      host: process.env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com',
    },
    telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
    maxLoopsPerJob: optionalNumber('MORAX_MAX_LOOPS_PER_JOB', 8),
    queueBatchSize: optionalNumber('MORAX_QUEUE_BATCH_SIZE', 10),
  }
}
