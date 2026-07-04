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

> **Deux bots Telegram distincts, ne pas confondre** :
> - `@SuperMorax_bot` = bot de la **plateforme** OpenClaw (opérations agentic
>   internes d'Etienne, gate d'approbation des actions HIGH côté plateforme —
>   voir `docs/PLATFORM-AND-TOOLS.md`). Rien à voir avec le produit Morax.
> - `@morax_assistant_bot` (ci-dessous) = bot du **produit** Morax, canal
>   utilisateur pour capturer factures/devis/rappels. C'est celui-ci que tout
>   testeur ou utilisateur final utilise. Voir `docs/CONNECT-PHONE.md`.

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

## 4. Langfuse Cloud UE — TERMINÉ ET VÉRIFIÉ LIVE

- **Etienne** : signup `cloud.langfuse.com` région UE, projet créé →
  `LANGFUSE_PUBLIC_KEY` (`pk-lf-...`) / `LANGFUSE_SECRET_KEY` (`sk-lf-...`)
  fournies.
- **Piège évité** : clés collées initialement aussi dans `app/.env.local` (0
  import Langfuse côté app, confirmé par grep) — retirées, Langfuse reste
  **worker-only**. **Écrit dans** : `worker/.env.local` + `.env.local`
  (racine) uniquement.
- Pas de `LANGFUSE_HOST` à définir : `worker/src/config.ts` défaut sur
  `https://cloud.langfuse.com` = région UE. Init exacte dans
  `worker/src/adapters/supabase.ts:287` (`new Langfuse({ publicKey, secretKey, baseUrl })`).
- **Vérif réussie (2026-07-02)** : script jetable dans `worker/` — (1) GET
  Basic-auth `https://cloud.langfuse.com/api/public/projects` → **200**
  (contrôle déterministe, le SDK avale les erreurs d'auth silencieusement) ;
  (2) `client.trace(...)` + `trace.update(...)` + `await client.flushAsync()`
  → trace visible côté Langfuse, aucune erreur. Script jetable supprimé après
  usage.
- Worker passe à **12/14** vars requises (`worker/src/config.ts`). Restent
  vides : `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM_EMAIL` (step 8).

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

## 6. Déploiement Vercel — TERMINÉ ET VÉRIFIÉ LIVE

`app/vercel.json` : région `fra1` (UE) + `buildCommand` explicite
(`pnpm --filter @morax/model-core build && pnpm build` — `packages/model-core/dist/`
n'est pas git-tracké, doit être construit avant `next build`, sinon la
résolution du package `@morax/model-core` échoue au build). Route PDF
(`documents/[id]/pdf/route.tsx`) déclare déjà `export const runtime = 'nodejs'`.

- Projet Vercel créé : `morax-app`, team `moraxs-projects-87e060cc` (`Morax's
  projects`), via Vercel CLI (déjà authentifié localement, `etienne0moreau-4100`).
- **Piège trouvé** : `vercel link` exécuté depuis `app/` (sous-répertoire) ne
  fait remonter QUE le contenu de `app/` au déploiement CLI (75 fichiers,
  ~330 Ko) — le `pnpm-lock.yaml`/`pnpm-workspace.yaml` racine et
  `packages/model-core` ne sont pas inclus, donc pnpm n'est jamais détecté et
  le build tente `npm install`, qui échoue sur `workspace:*`
  (`EUNSUPPORTEDPROTOCOL`). **Root Directory** (setting projet, pas
  `vercel.json`) n'est pas exposé par la CLI (`vercel link`/`vercel project`)
  ni par le MCP Vercel connecté → posé via un appel REST direct
  `PATCH /v9/projects/{id}?teamId=...` avec `{"rootDirectory":"app"}`, token
  réutilisé depuis le store local de la CLI (`~/Library/Application
  Support/com.vercel.cli/auth.json`, jamais affiché).
- **Piège lié** : une fois `rootDirectory=app` posé côté projet, la CLI
  interprète ce chemin comme **relatif au `cwd` du lien** — relancer depuis
  `app/` cherche alors `app/app` (inexistant). Correction : relier
  (`vercel link`) et déployer **depuis la racine du repo**, pas depuis `app/`.
  Le `.vercel/` de `app/` a été déplacé (pas supprimé) hors du repo.
- Une fois relié depuis la racine avec `rootDirectory=app` posé : upload
  205 fichiers (tout le monorepo), pnpm détecté (`pnpm-lock.yaml` v9), scope
  workspace 4 projets, `@morax/model-core` build puis `next build` — succès.
- **10 variables d'env production** posées via `vercel env add <NOM>
  production --value ... --yes` (valeurs lues depuis les `.env.local` locaux,
  jamais retapées) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (public), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `TELEGRAM_WEBHOOK_SECRET`, `POSTMARK_INBOUND_SECRET`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` (serveur) + `MORAX_ENV=prod`.
  Exclu volontairement : clés LLM et Langfuse (worker-only).
- `POSTMARK_INBOUND_SECRET` était vide (`app/.env.local` + racine) — généré
  (`openssl`-équivalent, 32 octets hex) et écrit avant le déploiement (route
  `app/src/app/api/webhooks/postmark/route.ts` compare déjà correctement
  contre une valeur non-vide, aucune faille avec le secret vide, juste
  incohérent à laisser vide).
- **URL production** : `https://morax-app.vercel.app`. Déploiement `READY`,
  0 erreur runtime (`get_runtime_errors`, fenêtre 1h).

## 7. setWebhook Telegram — TERMINÉ ET VÉRIFIÉ LIVE

- `POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook` avec
  `url=https://morax-app.vercel.app/api/webhooks/telegram` et
  `secret_token=<TELEGRAM_WEBHOOK_SECRET>` → `{"ok":true,"result":true}`.
- **Vérif** `getWebhookInfo` : URL posée confirmée, `pending_update_count:0`,
  pas de `last_error_message`.

## 8. Postmark (sortant) — TERMINÉ (sender simple) ET VÉRIFIÉ LIVE ; domaine `morax.app` différé

- Compte Postmark **déjà existant** (Etienne), réutilisé — pas de nouveau
  signup. Server `My First Server` (id `19786732`), Server API Token récupéré
  via **Claude piloté au navigateur réel d'Etienne** (`claude-in-chrome` MCP,
  Etienne déjà loggé) : Servers → server → onglet **API Tokens** → copie du
  Server API token affiché en clair sur la page.
- **Sender = signature simple, pas domaine DKIM** : `info@moraxphotography.com`
  (signature déjà confirmée de longue date sur le compte Postmark d'Etienne,
  domaine `moraxphotography.com` — son activité photo existante, sans lien
  avec Morax). Choisi car **`morax.app` n'est pas délégué** (`dig NS`/`dig
  SOA morax.app` → vide, aucune zone DNS active) → décision explicite
  d'Etienne : différer l'achat du domaine, débloquer le worker avec un sender
  existant en attendant. Le domaine `morax.app` est déjà ajouté côté Postmark
  (`DKIM Not Verified` / `Return-Path Not Verified`, aucune signature) — prêt
  à recevoir les enregistrements DNS le jour où le domaine sera acheté +
  délégué chez Cloudflare, mais rien à faire côté Postmark avant ça.
- **Écrit dans** : `worker/.env.local` + `.env.local` (racine) uniquement —
  `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM_EMAIL=info@moraxphotography.com`.
  **Piège évité** : ce sont des secrets **outbound, worker-only** — jamais dans
  `app/.env.local` (confirmé par grep, seul `POSTMARK_INBOUND_SECRET` y vit,
  consommé par la route inbound `app/src/app/api/webhooks/postmark/route.ts`)
  ni sur Vercel (aucune var outbound Postmark posée côté app, l'app n'en a pas
  besoin).
- **Piège trouvé (compte en attente d'approbation)** : premier essai d'envoi
  réel vers une adresse Gmail externe → `422`
  `{"ErrorCode":412,"Message":"While your account is pending approval, all
  recipient addresses must share the same domain as the 'From' address..."}`.
  Tant qu'un compte Postmark n'est pas approuvé (`Request approval`, limite
  100 emails en mode test), il ne peut envoyer qu'à des destinataires du
  **même domaine** que l'adresse `From`. Contournement pour le smoke-test :
  envoyer à `info@moraxphotography.com` (même domaine que le sender) plutôt
  qu'à l'adresse Gmail personnelle d'Etienne. Sans impact sur le fonctionnement
  produit réel (les vraies factures/devis partent vers les clients d'Etienne,
  domaines variés) — **`Request approval` à soumettre avant tout envoi client
  réel en dehors de test**, sinon mêmes 422 en prod.
- **Vérif réussie (2026-07-02)** : script jetable dans `worker/` — (1)
  `loadConfig()` → succès, **worker 14/14 vars** ; (2) `makeMailer(config)`
  (`worker/src/adapters/postmark.ts`) `.sendDocumentEmail(...)` avec pièce
  jointe texte réelle → `200`, `MessageID` retourné, email reçu. Script
  jetable supprimé après usage.

### Reste à dérouler (différé, décision Etienne)

- **Domaine `morax.app`** : achat (registrar) + délégation DNS chez
  Cloudflare (manuel Etienne, anti-bot confirmé). Une fois fait : ajouter les
  enregistrements DKIM/Return-Path Postmark affichés sur la page domaine déjà
  créée (`DNS Settings`), confirmer, puis basculer `POSTMARK_FROM_EMAIL` sur
  `x@morax.app`.
- **Approbation compte Postmark** (`Request approval`) : à soumettre avant tout
  envoi à un vrai client (destinataire hors domaine `moraxphotography.com`),
  sinon 422 identique au piège ci-dessus. Non fait cette session (pas demandé,
  décision produit à confirmer avec Etienne — implique de décrire l'usage
  auprès de Postmark).
- **Inbound email** (MX + webhook `/api/webhooks/postmark`) : dépend aussi du
  domaine `morax.app`. **Risque à vérifier avant activation** : la route app
  exige un header custom `x-morax-inbound-secret`
  (`app/src/app/api/webhooks/postmark/route.ts`), or la configuration webhook
  inbound de Postmark ne propose qu'une authentification par Basic Auth dans
  l'URL, pas de header arbitraire — à confirmer/adapter quand l'inbound sera
  activé.

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
