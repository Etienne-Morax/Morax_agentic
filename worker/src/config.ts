/**
 * Morax worker - configuration et secrets.
 * Validation au démarrage : fail-fast si un secret requis manque.
 * Les clés LLM ne vivent QUE dans le worker (jamais edge/client).
 *
 * Déclenchement (ADR 2026-06-30) : poll Cloud Run Scheduler ~1 min.
 * pg_net push écarté (complexité opérationnelle, pas de priorité v1).
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
  r2: {
    accountId: string
    accessKeyId: string
    secretAccessKey: string
    bucket: string
    endpoint: string
  }
  telegramBotToken: string
  postmarkServerToken: string
  mailFrom: string
  maxLoopsPerJob: number
  queueBatchSize: number
  /** Push web (PWA). Optionnel : absent en dev tant que non provisionne, push simplement desactive. */
  vapid: { publicKey: string; privateKey: string; subject: string } | null
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

function loadVapid(): WorkerConfig['vapid'] {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return null
  return { publicKey, privateKey, subject }
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
    r2: {
      accountId: required('R2_ACCOUNT_ID'),
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
      bucket: required('R2_BUCKET'),
      endpoint: required('R2_ENDPOINT'),
    },
    telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
    postmarkServerToken: required('POSTMARK_SERVER_TOKEN'),
    mailFrom: required('POSTMARK_FROM_EMAIL'),
    maxLoopsPerJob: optionalNumber('MORAX_MAX_LOOPS_PER_JOB', 8),
    queueBatchSize: optionalNumber('MORAX_QUEUE_BATCH_SIZE', 10),
    vapid: loadVapid(),
  }
}
