# Milestone C — Runbook de provisioning (Morax MVP)

Checklist pas-à-pas pour brancher les services cloud réels. Consolide ce qui
était éparpillé (ADR-001 §8, `PROMPT-plan-implantation.md`, `.env.example`).
Chaque étape indique **qui agit** (Claude via MCP/CLI, ou Etienne via
compte/console) et **où vit le secret produit** (nom de variable + fichier,
jamais la valeur).

Contrainte transverse : toutes les ressources doivent être en juridiction UE
(RGPD). Vérifier explicitement la région à chaque création.

## 0. Préflight

- `.gitignore` couvre `.env.*` (racine + tous les workspaces) → confirmé.
- Projet Supabase dev `pmeokfxtvjrrpencrklf` (région `eu-west-2`) → healthy.
- Team Vercel déjà existante (`Morax's projects`).
- Pas d'outil MCP de gestion de zone DNS Cloudflare exposé dans cette session
  (seulement R2/D1/KV/Workers) → toute la partie DNS/MX/DKIM (step 8) se fait
  via le dashboard Cloudflare par Etienne.

## 1. Supabase `service_role` + `DATABASE_URL`

- **Etienne** : Dashboard projet → Settings → API Keys → onglet "Publishable
  and secret API keys" → révéler la clé `secret` (format `sb_secret_...`).
  **Piège évité** : ce nouveau format fonctionne comme remplacement complet
  de l'ancien `service_role` JWT (vérifié : accepté par l'API Admin GoTrue
  `/auth/v1/admin/generate_link`). Pas besoin de basculer sur l'onglet
  "Legacy anon, service_role API keys".
- Connection string directe : Settings → Database → Connection string → URI
  (port 5432, direct, pas le pooler 6543) → `DATABASE_URL`.
- **Écrit dans** : `.env.local` (racine), `app/.env.local`, `worker/.env.local`
  (`SUPABASE_SERVICE_ROLE_KEY`) ; `DATABASE_URL` racine + worker uniquement
  (non consommé par `app/src`, seulement outillage worker/migrations).
- **Vérif** : `pnpm --filter @morax/app dev` boote, `/login` sert le
  formulaire, middleware redirige bien le non-authentifié.

### Piège : magic link admin-généré ≠ flux réel du navigateur

`admin.generateLink` / `POST /auth/v1/admin/generate_link` ne passe pas par
le flux PKCE du SDK client (`signInWithOtp` génère un `code_verifier` stocké
côté navigateur puis envoie un `code_challenge`). Un lien admin-généré ou un
appel direct à `POST /auth/v1/otp` sans `code_challenge` retombe en flux
**implicite** : le callback redirige avec les tokens dans le **fragment URL**
(`#access_token=...`), pas en `?code=`. Notre route `/auth/callback` ne lit
que `?code=` (voir `app/src/app/auth/callback/route.ts`) — un lien
admin-généré rebondit donc silencieusement vers `/login` sans erreur visible.
**Seul le vrai formulaire `/login` (navigateur réel, pas le navigateur headless
de l'outil Preview) produit un lien exploitable.**

### Piège outillage : `navigator.locks` bloque signInWithOtp en navigateur headless

Le SDK `@supabase/supabase-js` v2 sérialise ses appels auth via
`navigator.locks.request`. Dans le navigateur headless piloté par l'outil
Preview (CDP), cet appel semble ne jamais se résoudre : le formulaire reste
bloqué sur "Envoi en cours..." indéfiniment, sans requête réseau émise, même
après reload. **Ce n'est pas un bug applicatif** (confirmé : un appel direct
`fetch()` au REST `/auth/v1/otp` depuis la même page aboutit en 200 OK
immédiatement). Contournement : faire le smoke-test de login dans un vrai
navigateur (Etienne), pas via l'outil Preview automatisé.

### Bug réel trouvé et corrigé : `NEXT_PUBLIC_*` via accès dynamique cassé côté navigateur

`app/src/lib/supabase/client.ts` (composant `'use client'`) lisait les
variables d'env via un helper générique `requiredEnv(name)` faisant
`process.env[name]` (accès dynamique par variable). Next.js n'inline les
variables `NEXT_PUBLIC_*` côté navigateur que pour un accès **statique
littéral** (`process.env.NEXT_PUBLIC_X`) — un accès dynamique n'est jamais
remplacé au build et reste `undefined` dans le bundle client (le navigateur
n'a pas de vrai `process.env`). Résultat : `createClient()` levait toujours
`[supabase] env manquante : NEXT_PUBLIC_SUPABASE_URL` dès le premier clic
réel sur "Recevoir le lien de connexion", jamais détecté avant car ce chemin
(signInWithOtp déclenché par un vrai clic navigateur) n'avait jamais été
exercé de bout en bout en amont (bloqué par `SUPABASE_SERVICE_ROLE_KEY`
placeholder depuis Milestone E2). **Corrigé** : accès statique littéral direct
dans `createClient()`, plus de helper générique. Vérifié : aucun autre
composant `'use client'` n'utilise ce pattern dynamique (`app/src/lib/supabase/server.ts`
utilise le même helper mais côté serveur, où `process.env` réel existe à
l'exécution — pas de bug là). `requiredEnv` reste utilisé côté serveur
(`server.ts`, `supabase-server.ts`, `worker/src/config.ts`) où c'est correct.

**Résultat du smoke-test (2026-07-02)** : login magic-link réel bout-en-bout
réussi pour la première fois (formulaire → email réel → clic → session
établie). Timeline rend les données réelles du tenant `morax-dev` contre le
cloud (échéances, documents reçus Telegram/Email, brouillon facture, action
à approuver). Confirme service_role + RLS + middleware + toutes les pages
lecture E1-E4 fonctionnelles en live.

## 2. Cloudflare R2 — bucket `morax-media` — TERMINÉ ET VÉRIFIÉ LIVE

**Piège trouvé** : l'outil MCP `r2_bucket_create` n'expose pas de paramètre
de juridiction — un premier essai a créé le bucket en `ENAM` (Amérique du
Nord), supprimé immédiatement (`r2_bucket_delete`, aucune donnée perdue).
**Création du bucket EU = dashboard uniquement** (le MCP ne le permet pas) :
Cloudflare dashboard → R2 → Create bucket → nom `morax-media` → Location:
**European Union (jurisdictional restriction)**. Fait par Etienne (session
suivante), bucket confirmé `morax-media | EU`.

- Token S3 : R2 → Manage API tokens → Create → Object Read & Write,
  scopé au bucket `morax-media` → `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`.
- **Piège** : pour un bucket en juridiction EU, utiliser l'**endpoint
  jurisdiction-specific** affiché par le dashboard (`https://<account>.eu.r2.cloudflarestorage.com`,
  suffixe `.eu.`), pas l'endpoint générique `https://<account>.r2.cloudflarestorage.com`.
- **Écrit dans** : `.env.local` (racine) + `worker/.env.local`. Pas dans
  `app/.env.local` (l'app n'a besoin des creds R2 en prod que pour l'upload
  inbound Postmark, hors périmètre de cette vérif).
- **Vérif réussie** : round-trip put/get jetable — PUT via l'adapter
  app-side `app/src/lib/r2.ts` `putObject()`, GET via l'adapter worker-side
  `worker/src/adapters/r2.ts` `makeMedia().getObject()` (config R2 partielle
  construite à la main, sans passer par `loadConfig()` qui fail-fast sur les
  14 vars worker requises). Bytes + `contentType` identiques confirmés.
  Script jetable supprimé après vérif.

## 3. Bot Telegram + `channel_identities`

- **Etienne** connecté à Telegram Web dans son navigateur réel ; piloté par
  Claude via l'extension Chrome (`claude-in-chrome` MCP) plutôt que manuel.
- BotFather → `/newbot` → nom "Morax Assistant", username `morax_assistant_bot`
  → `TELEGRAM_BOT_TOKEN` récupéré, écrit dans `worker/.env.local` + `.env.local` racine.
- `TELEGRAM_WEBHOOK_SECRET` généré aléatoirement (`openssl rand -hex 32`),
  écrit dans `.env.local` racine + `app/.env.local`.
- **Piège évité** : un bot Telegram ne peut PAS envoyer de message à un
  utilisateur qui n'a jamais initié de conversation avec lui. Avant de
  seeder `channel_identities`, un `/start` a été envoyé au nouveau bot depuis
  le compte d'Etienne (identifié via `@userinfobot` : `Id: 5546013376`,
  `First: Etienne`, `Last: Morax`) pour établir le chat.
- Seed SQL (`channel_identities` : `tenant_id='morax-dev'`, `channel='telegram'`,
  `external_id='5546013376'`, `verified=true`).
- **Vérif live** : `POST https://api.telegram.org/bot<token>/sendMessage` direct
  → `"ok":true`, message reçu par Etienne. Bot Telegram fonctionnel de bout en bout.
- `setWebhook` différé au step 7 (nécessite l'URL publique Vercel).

## 4. Langfuse Cloud UE

_À dérouler._

## 5. Clés LLM + validation live — TERMINÉ ET VÉRIFIÉ LIVE

**Trouvaille** : `ANTHROPIC_API_KEY` et `OPENROUTER_API_KEY` étaient déjà
réelles mais mal placées dans `app/.env.local` (vides côté `worker/.env.local`,
là où elles sont réellement consommées par `worker/src/config.ts` /
`worker/src/llm.ts`). L'app ne doit jamais détenir de clé LLM (edge/client
interdit, cf. CLAUDE.md) — clés retirées de `app/.env.local`, mirrorées vers
`worker/.env.local` + `.env.local` racine.

**Vérif réussie (2026-07-02)** : script jetable instanciant `LlmClient`
(`worker/src/llm.ts`) avec un `ModelConfig` résolu via `resolveModel()`
(`@morax/model-core`, source `models.registry.yaml`) :
- Anthropic (`claude-haiku-4-5-20251001`, palier premium/micro) → appel réel
  `POST https://api.anthropic.com/v1/messages` → réponse texte reçue.
- OpenRouter (`google/gemini-2.5-flash-lite`, palier économique/micro) →
  appel réel `POST https://openrouter.ai/api/v1/chat/completions` → réponse
  texte reçue.

Confirme : routage registre (paliers/rôles), les deux suffixes d'endpoint
(`/messages` vs `/chat/completions`), passerelle RGPD (`assertRgpdCompliance`,
non bloquante ici car `hasPersonalData:false`). Coût réel négligeable (few
tokens). Script jetable supprimé après vérif.

**Piège outillage rencontré** : le premier essai réseau (Anthropic) a échoué
avec `ECONNRESET` / `TLS socket disconnected` — confirmé transitoire (retry
immédiat réussi). Pas un bug applicatif ni un problème de clé/config.

## 6. Déploiement Vercel

`app/vercel.json` créé (région `fra1`, UE). Route PDF (`documents/[id]/pdf/route.tsx`)
déclare déjà `export const runtime = 'nodejs'` dans le code — pas besoin de
config supplémentaire dans `vercel.json` pour ça.

_Reste à dérouler : configuration Root Directory = `app` côté projet Vercel
(monorepo pnpm), variables d'env du projet, déploiement._

## 7. setWebhook Telegram

_À dérouler._

## 8. Domaine `morax.app` + Postmark

_À dérouler._

## 9. Cloud Run Job (worker) + Cloud Scheduler

`deploy/cloud-run.sh` créé (build via Cloud Build depuis `worker/Dockerfile`,
déploie un Cloud Run **Job** `europe-west1`, env vars lues depuis
`worker/.env.local`). Usage : `GCP_PROJECT_ID=... ./deploy/cloud-run.sh`.
Prérequis Etienne : `gcloud auth login`, projet + billing actifs, APIs
`run.googleapis.com`/`artifactregistry.googleapis.com`/`cloudbuild.googleapis.com`
activées.

**Reste à dérouler** : exécution réelle du script (bloquée sur projet GCP +
billing d'Etienne), puis Cloud Scheduler (`gcloud scheduler jobs create http`
ciblant l'API REST `:run` du Job, ~1 min, OAuth via service account
`run.invoker`).

## 10. Smoke live bout-en-bout

_À dérouler._
