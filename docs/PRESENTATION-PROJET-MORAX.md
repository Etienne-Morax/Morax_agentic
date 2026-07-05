# Morax — Présentation du projet

> Document de synthèse — vue d'ensemble du produit, de sa construction technique et de ce qu'il reste à faire.
> **Date :** 2026-07-05 · **Statut global :** code Phase 1→4 complet, Beta approuvée, ~85 % vérifié en production.
> **Branche de travail :** `feat/phase1-foundations` (non encore mergée sur `main`).
> **Snapshot figé au commit `1a0c345`** — corrigé lors de l'audit documentaire du 2026-07-05
> (Launchpad, RGPD, coûts). Pour l'état courant vérifié, voir
> [`docs/ETAT-IMPLANTATION.md`](ETAT-IMPLANTATION.md), la source de vérité qui évolue.

---

## Comment lire ce document

Ce document est **autoportant** : il rassemble en une lecture ce qui est aujourd'hui dispersé
dans une dizaine de documents techniques et 23 sessions de développement.

| Vous êtes… | Lisez en priorité |
|---|---|
| **Commercial / dirigeant** | Résumé exécutif → **Partie A (Vision & Business)** → **Partie C (Reste à faire)** |
| **Développeur / CTO** | Résumé exécutif → **Partie B (Construction technique)** → **Partie C** |
| **Investisseur / partenaire** | Résumé exécutif + Partie A §5 (économie) + Partie C §17 |

Chaque partie se lit indépendamment. Les liens en fin de document renvoient aux sources de vérité.

---

## Résumé exécutif

**Morax** est un assistant agentique d'administration et de finance pour **indépendants et
très petites entreprises (TPE) au Royaume-Uni**. L'utilisateur capture une facture (photo) ou
donne une instruction (note vocale) via **Telegram** ; le système traite en arrière-plan
(OCR, extraction, rédaction de brouillons) et présente une **timeline d'actions structurées**
(échéances, relances, devis, factures). Aucun appel d'IA n'est fait à la lecture : consulter
est instantané et gratuit ; l'intelligence est dépensée à l'ingestion, en asynchrone.

Point de conception central : **toute action externe** (envoi d'email, dépense, écriture chez
un tiers) passe par un **gate d'approbation humain** — une proposition ✅/❌ envoyée sur
Telegram. Rien ne part sans validation. Cela transforme un risque (l'automatisation qui
dérape) en argument de confiance.

Économiquement, le coût d'infrastructure du socle est **estimé** à environ **99 $/mois**, et le
coût LLM par utilisateur actif **estimé** inférieur à **0,30 $** (seule mesure réelle à ce jour :
un appel OCR facturé $0.006595, cf. `docs/QA-SMOKE-REPORT.md`). Le prix étant exprimé en
**crédits** (découplés des tokens), la marge est **estimée à ~93 %** sur le plan de base à 50
utilisateurs, avec un coût LLM représentant moins de 1 % du revenu — hypothèses de modélisation,
non issues d'une mesure en volume réel.

L'ensemble est **provisionné en région EU** (Vercel fra1, Supabase eu-west-2, Cloudflare R2 EU,
Google Cloud Run europe-west1, Langfuse Cloud UE, Postmark) avec isolation multi-tenant testée
(RLS Postgres — un test d'accès cross-tenant a été rejeté par la base, cf.
`docs/QA-SMOKE-REPORT.md`). Cela ne constitue pas un audit de conformité RGPD formel.

---
---

# PARTIE A — Vision & Business

## 1. Le problème

Les indépendants et TPE croulent sous l'administratif à faible valeur : suivre les factures à
payer et à encaisser, relancer les impayés, garder les reçus, produire devis et factures,
trier les emails. Ces tâches sont chronophages, faciles à oublier, et anxiogènes — surtout
pour les profils qui gèrent mal la charge administrative (angle **« ADHD-friendly / mains
libres »** revendiqué par le produit).

Les outils existants (logiciels de comptabilité, CRM) supposent qu'on s'assoie devant un
écran et qu'on saisisse. Morax part de l'inverse : **capturer en 3 secondes depuis le
téléphone** (une photo, une phrase dictée) et laisser le système faire le reste.

## 2. La solution en une phrase

> L'utilisateur envoie une note vocale ou une photo de facture sur Telegram → le système la
> traite en arrière-plan sous forme de micro-tâches et d'échéances → tout s'affiche dans une
> timeline consultable, sans aucun appel d'IA à la lecture.

**Parcours concret :**

1. L'utilisateur prend en photo une facture fournisseur et l'envoie au bot Telegram.
2. Le webhook accuse réception en moins d'une seconde et met la tâche en file.
3. En arrière-plan, le worker lit la facture (**OCR par Claude Opus**), extrait montant, date,
   émetteur, échéance de paiement.
4. Le système génère un **brouillon** (ex. une relance, ou une facture client) et le pose sur
   la timeline.
5. Quand une action externe est prête (envoi d'email au client), Morax envoie une
   **proposition ✅/❌ sur Telegram**.
6. L'utilisateur approuve → l'email part via Postmark, le crédit est débité, la timeline se met à jour.

## 3. Public cible & positionnement

- **Cible initiale :** indépendants au Royaume-Uni (photographes, artisans, consultants…).
  Sert de preuve de concept et de premier marché.
- **Extension B2B :** petites équipes (sièges partagés, boîte de réception commune, journal
  d'audit, SSO). Prévu en v1.1+.
- **Un seul cœur logiciel** sert les deux segments : le B2B est le même moteur + une fine
  surcouche (add-ons), pas une duplication. Cela réduit le coût de maintenance et accélère
  l'itération.

## 4. Modèle de valeur — les crédits

Le prix est exprimé en **crédits**, pas en tokens. Chaque action a un poids fixe :

| Action | Crédits |
|---|---|
| Rappel automatique | 0,5 |
| Classification | 0,5 |
| Transcription vocale | 0,5 |
| Scan de document | 1 |
| Analyse d'email | 1 |
| Résumé financier | 1,5 |
| Réponse chat (command center) | 1,5 |
| Brouillon de facture | 2 |
| Brouillon de devis | 3 |
| Devis complexe | 5 |

**Packs** (crédits ajoutés par mois) : Base **60** (toujours inclus), Reçus & dépenses **+40**,
Devis & factures **+40**, Voix **+20**, Premium (passe le « cerveau » en Opus, sans crédits
additionnels).

**Pourquoi c'est malin commercialement :**
- On cache la complexité du coût LLM à l'utilisateur (il raisonne en « actions », pas en tokens).
- On aligne le prix sur la **valeur perçue** (un devis complexe « vaut » plus qu'un rappel),
  pas sur le coût brut.
- Zones d'usage lisibles : **vert** (< 80 % du quota), **orange** (80–90 %), **rouge** (≥ 90 %),
  puis blocage — ce qui crée un chemin naturel d'upsell vers un pack supérieur.

## 5. Économie

**Coût du socle (mensuel, tout compris) :**

| Poste | Coût |
|---|---|
| Vercel Pro | 20 $ |
| Supabase Pro | 25 $ |
| Cloudflare R2 | ~3 $ |
| Postmark | 16,50 $ |
| Google Cloud Run (scale-to-zero) | ~5 $ |
| Langfuse Cloud | 29 $ |
| **Total socle** | **~99 $/mois (~78 £)** |

**Coût variable par utilisateur actif :** < **0,30 $** de LLM + < 0,01 £ d'infra pour un quota
de 60 crédits.

**Marge estimée :** ~**93 %** sur le plan Base (£25) à 50 utilisateurs (modélisation, pas une
mesure réelle en volume). Message clé pour un investisseur : le coût LLM représente
**estimé à moins de 1 % du revenu** ; le vrai levier de rentabilité n'est pas le
token mais le **coût d'onboarding et de support** par client.

Les prix LLM réels sont maîtrisés par le routage (voir Partie B §12) : le modèle premium
(Claude Opus, 5 $/25 $ par million de tokens entrée/sortie) n'est utilisé que là où c'est
critique (finance) ; le reste route vers des modèles à 0,10–0,30 $ le million.

## 6. Conformité & confiance

- **100 % EU :** toutes les données au repos en région européenne (Vercel, Supabase EU,
  Cloudflare R2 juridiction EU, Cloud Run EU, Langfuse EU, Postmark).
- **DPA** (accord de traitement de données) couvert par chaque fournisseur.
- **Isolation multi-tenant** stricte : chaque client ne voit que ses données, garantie au
  niveau base (RLS Postgres, voir Partie B §13). Testé : une tentative d'accès inter-tenant
  est rejetée par la base.
- **Garde-fou RGPD sur les modèles :** les données personnelles ne sont jamais routées vers un
  endpoint chinois direct ; les modèles d'origine chinoise (MiniMax, DeepSeek) ne sont
  accessibles que via une passerelle « Western-managed » (OpenRouter).
- **Aucune donnée client sur l'infra interne (NAS) :** la plateforme d'orchestration d'Etienne
  (voir Partie B §16) est séparée du produit ; le produit ne tourne que sur des services cloud managés.

## 7. Différenciateurs

1. **Gate humain sur toute action externe** — contrôle et sécurité par conception ; argument
   de confiance fort, surtout sur des données financières.
2. **Lecture sans coût IA** — consulter sa timeline est instantané et gratuit ; l'IA ne
   travaille qu'à l'ingestion.
3. **Pipeline déterministe et traçable** — pas un « essaim d'agents » opaque ; chaque appel
   LLM est tracé dans Langfuse (coût, latence, précision), ce qui rend le système auditable.
4. **Routage multi-modèles** — on paie le bon modèle pour le bon rôle, sans dépendre d'un
   seul fournisseur, avec un modèle premium épinglé là où l'exactitude est non négociable.

## 8. État commercial

- **Beta approuvée** (feu vert technique d'Etienne). Le produit tourne en production.
- **Ce qui bloque la première facture envoyée à un vrai client** (non technique — voir Partie C §17) :
  1. **Approbation du compte Postmark** (aujourd'hui en mode test : 100 emails/mois, envoi
     uniquement vers le domaine de l'expéditeur).
  2. **Achat et délégation du domaine `morax.app`** (nécessaire pour un expéditeur pro et
     l'email entrant).

Autrement dit : la mécanique fonctionne de bout en bout (démontré en smoke test) ; il reste
des démarches administratives d'activation, pas du développement.

---
---

# PARTIE B — Construction technique

## 9. Vue d'ensemble de l'architecture

Principe directeur (voir `docs/ADR-001-architecture-cible.md`) : **un seul pipeline
déterministe, événementiel, sans état, avec Postgres comme unique source de vérité, et zéro
appel d'IA sur le chemin de lecture.**

```
┌──────────────┐   photo / voix / commande
│   Telegram   │ ───────────────────────────┐
└──────────────┘                             ▼
                              ┌─────────────────────────────┐
   Email (Postmark) ────────► │  Webhook edge (Next.js)      │
                              │  valide, ACK < 1s, N'APPELLE  │
                              │  JAMAIS d'IA, met en file     │
                              └───────────────┬──────────────┘
                                              ▼
                              ┌─────────────────────────────┐
                              │   File pgmq (dans Postgres)  │
                              └───────────────┬──────────────┘
                                              ▼  (poll ~1/min)
                              ┌─────────────────────────────┐
                              │  Worker (Cloud Run Job)      │
                              │  OCR → planner → draft →     │
                              │  compta. Idempotent, stateless│
                              └───────┬──────────────┬───────┘
                                      ▼              ▼
                          ┌────────────────┐   ┌──────────────┐
                          │ Postgres       │   │  Notif        │
                          │ (source vérité)│   │  Telegram/push│
                          └────────────────┘   └──────────────┘
```

**Les 3 règles d'or de l'architecture :**
- Le **webhook** valide, accuse réception en moins d'une seconde, et se contente de mettre en
  file. Jamais d'IA synchrone, jamais de clé LLM côté edge/client.
- Le **worker** est sans état : il tire un message de la file, le traite, écrit en base, sort.
- La **lecture** (dashboard, timeline) ne déclenche aucun appel LLM — elle lit Postgres.

## 10. Le monorepo

Outillage : **pnpm workspaces**, Node ≥ 22, TypeScript, Vitest, ESLint, Prettier.
Quatre briques :

### `packages/model-core/` — le cerveau du routage
Bibliothèque partagée par l'app et le worker. Source de vérité du routage LLM.
- **`src/models.registry.yaml`** — registre central : **3 paliers × 3 rôles**, tous les
  modèles et leurs prix. Le routeur ne connaît **aucun modèle en dur**, il lit ce fichier.
- **`src/model-resolver.ts`** — route une requête vers le bon modèle selon l'offre du tenant,
  le rôle demandé, et les garde-fous. Applique l'épinglage (finance = Opus, planner = Sonnet),
  le plafond de contexte, la conformité RGPD, et l'ordre de fallback.
- **`src/credits.ts`** — poids des actions, définition des packs, calcul des zones d'usage
  (vert/orange/rouge/bloqué).
- **`src/tenant.schema.yaml` / `tenant.types.ts`** — schéma de configuration d'un tenant
  (offre, packs, quotas, intégrations, conformité).

### `worker/` — le processeur d'événements
Processus sans état, déployé en **Cloud Run Job** (région `europe-west1`, scale-to-zero),
déclenché par **Cloud Scheduler** (~1 fois/min).
- **`src/run.ts`** — orchestration : lecture des messages, garde **MAX_LOOPS** (un message lu
  trop de fois → archivé en DLQ), contrôle d'**idempotence** (`idempotency_key` dans
  `job_runs` : un même message ne s'exécute jamais deux fois), comptage des crédits **à la
  clôture** du job (pas au webhook), notification en cas d'échec.
- **`src/pipeline.ts`** — les étapes : OCR document → planification des tâches → rédaction de
  brouillons → comptabilité. Chaque étape résout son modèle par rôle et valide sa sortie.
- **`src/action-gate-core.ts`** — logique du **gate HIGH** (voir §11) : formate la proposition
  Telegram, construit les boutons ✅/❌, prépare l'email + PDF. Zéro appel LLM, zéro crédit.
- **`src/ports.ts` + `src/adapters/supabase.ts`** — architecture **ports & adapters** : la
  logique dépend d'interfaces (file, repo documents, repo job_runs, crédits, notifier),
  implémentées par des adaptateurs concrets (Supabase/pgmq, Telegram, Postmark). Testable avec
  des faux.
- **`src/tasks/*`** — un handler par type de job (relance impayés, vérif échéances, résumé
  quotidien, tri inbox, réponse chat, capture document, brouillon devis/facture).

### `app/` — le front & les webhooks
**Next.js 15 / React 19**, déployé sur **Vercel** (EU). SSR + routes API.
- **Routes applicatives `(app)`** : dashboard (accueil), calendar (échéances), documents (+
  détail/éditeur), inbox (à classer) + détail, scan (upload), credits (usage), admin/models-quota.
- **Routes command `(command)`** : command (chat console temps réel), launchpad (grille
  d'actions rapides), operations (flux des jobs).
- **Auth** : login (passkey/magic-link Supabase), callback, signout. Middleware qui
  redirige tout utilisateur non authentifié vers `/login`.
- **Webhooks edge** : `api/webhooks/telegram` (messages, photos, voix, callbacks
  d'approbation) et `api/webhooks/postmark` (email entrant, bounces).
- **Cœurs testables** : la logique métier vit dans `src/lib/*-core.ts` (webhook-core,
  dashboard-core, document-draft-core, finalize-draft-core, credits-core, timeline-core…),
  découplée du framework. **Jamais de clé LLM côté edge/client.**

### `supabase/` — base de données & file
**14 migrations** (`0001` → `0014`), appliquées à Supabase Cloud EU.

| Migration | Objet |
|---|---|
| `0001_init` | Schéma de base : extensions (pgcrypto, pgmq), tenants/users, RLS, `custom_access_token_hook`, `current_tenant_id()` |
| `0002_tighten_function_grants` | Durcissement sécurité des fonctions SECURITY DEFINER |
| `0003_document_drafts` | Table des brouillons sortants (devis/factures) |
| `0004_reminder_cron` | pg_cron : enfile les vérifications d'échéances |
| `0005_send_document` | Table `pending_actions` (gate HIGH) |
| `0006_doc_number_unique` | Unicité des numéros de doc par tenant |
| `0007_expire_pending_actions` | Auto-rejet des actions en attente > 72 h (TTL) |
| `0008_agent_task_gate` | RPC d'enfilement des `agent_task` (raccourcis Launchpad) |
| `0009_users_admin_role` | Rôle admin sur `users` (dashboard admin cross-tenant) |
| `0010_command_messages` | Table de l'historique du chat (command center) |
| `0011_bounce_refund` | Bounces Postmark → `pending_actions` en échec + remboursement crédit |
| `0012_push_subscriptions` | Table des abonnements push (PWA) |
| `0013_launchpad_jobs` | Active les boutons Launchpad (enfile des JobTypes concrets) |
| `0014_realtime_launchpad` | Active Supabase Realtime sur job_runs / command_messages / documents |

**Tables clés :** `tenants`, `users`, `documents`, `document_drafts`, `pending_actions`,
`job_runs`, `credits_ledger`, `command_messages`, `reminders`, `push_subscriptions`.
**File :** pgmq `morax_jobs` (dans Postgres, pas de broker externe).

> Note de rollout : les migrations `0013`–`0014` sont récentes et **pas encore appliquées en
> prod** — à faire quand le handler Launchpad sera complet (voir Partie C §18).

## 11. Le gate HIGH — mécanisme central

Toute action à effet de bord externe passe par une approbation humaine asynchrone :

```
1. PROPOSE   worker enfile une pending_action (ex. send_email) avec le payload complet
2. TELEGRAM  le notifier envoie un message avec boutons inline  [✅ Approuver] [❌ Rejeter]
3. CALLBACK  le webhook Telegram reçoit le clic, met à jour pending_actions.status
4. EXECUTE   le worker détecte l'action approuvée, exécute (envoi email via Postmark)
5. TTL       une action non traitée sous 72 h → auto-rejetée, tenant notifié
```

Aucune API d'envoi n'est jamais appelée directement. Côté code, on passe **toujours** par
`enqueueAction()` (risk: 'HIGH'), jamais par l'API d'envoi en direct. La décision appartient à
l'humain, point unique de contrôle.

## 12. Routage LLM & garde-fous

Trois paliers, chacun avec 3 rôles (cerveau / workhorse / micro) :

| Palier | Cerveau | Workhorse | Micro |
|---|---|---|---|
| **Premium** (Anthropic mono-vendeur, cache prompt) | Claude Opus 4.8 (5 $/25 $ /M) | Claude Sonnet 4.6 (3 $/15 $) | Claude Haiku 4.5 (1 $/5 $) |
| **Intermédiaire** (multi-vendeur via OpenRouter) | Gemini 3.1 Pro (2 $/12 $) | MiniMax M3 (0,30 $/1,20 $) | DeepSeek V4 Flash (0,10 $/0,20 $) |
| **Économique** | Gemini 3.1 Pro + quota mensuel | MiniMax M2.5 (0,12 $/0,48 $) | Gemini 2.5 Flash-Lite (0,10 $/0,40 $) |

**Garde-fous appliqués par le resolver, quel que soit le palier du tenant :**
- **Plafond de contexte 100k tokens/appel** — au-delà, on déclenche du retrieval (neutralise
  la falaise de prix des gros contextes).
- **Épinglage finance-critique → Opus 4.8, toujours** (rôles : extraction d'échéance,
  vérification de montant, contrôle de pénalité de retard, résumé de montant de facture).
  Segment ADHD = zéro hallucination tolérée sur les chiffres. Le surcoût est absorbé en marge.
- **Épinglage planificateur → Sonnet 4.6, toujours.** Non dégradable (si indisponible : rejet,
  pas de bascule vers un modèle inférieur).
- **Épinglage transcription vocale → Gemini Flash-Lite** (coût infra, pas une offre payante).
- **Ordre de fallback :** intra-palier → montée de palier (plafonnée par le quota du tenant) →
  rejet explicite. Jamais de fallback gratuit non borné.
- **Garde-fou RGPD :** modèles chinois uniquement via passerelle Western-managed, jamais de
  donnée personnelle identifiable vers un endpoint chinois direct.
- **Politique de promotion :** un nouveau modèle passe par un **eval gate** (tests dorés
  mesurés dans Langfuse : précision, latence, coût sur 100 requêtes réelles) + **canary 5 %**
  avant promotion. Jamais automatique.

## 13. Sécurité & multi-tenant

- **RLS partout :** chaque table applicative est protégée par une politique row-level scoping
  sur `current_tenant_id()`, injecté dans le JWT par `custom_access_token_hook`.
- **Worker en `service_role`** (bypass RLS) mais qui **filtre toujours explicitement par
  `tenant_id`** dans chaque requête — ceinture + bretelles contre les fuites inter-tenant.
- **Webhook Telegram** protégé par secret HMAC (comparaison à temps constant).
- **Isolation vérifiée :** une insertion cross-tenant est rejetée par la base (code Postgres
  `42501`), démontré en smoke test.
- **Aucune clé LLM côté edge/client** — les clés vivent uniquement dans l'environnement du
  worker (et à la racine), jamais dans l'app.

## 14. Déploiement & où ça tourne

| Couche | Plateforme | Région |
|---|---|---|
| Front + webhooks edge | Vercel | EU (`fra1`) |
| Base, Auth, file pgmq | Supabase | EU (`eu-west-2`) |
| Stockage média (audio, images, PDF) | Cloudflare R2 | EU |
| Worker (pipeline) | Google Cloud Run Job | EU (`europe-west1`) |
| Observabilité LLM | Langfuse Cloud | EU |
| Email | Postmark | EU |
| APIs LLM | Anthropic / Google / OpenRouter | EU / Western-managed |

**Boucle de validation (voir `docs/PREVIEW.md`) :**
modif → commit → push sur la branche **`preview`** → Vercel déploie automatiquement sur une URL
de preview → Etienne valide sur cette URL → merge vers **`main`** (prod : `morax-app.vercel.app`).
On ne valide **jamais** sur `localhost` (l'app est derrière un mur d'auth ; sans session, tout
redirige vers `/login`). Le push reste une action externe soumise au gate.

**Runbook de provisionnement en 10 étapes** (voir `docs/PROVISIONING-RUNBOOK.md`, vérifié live
2026-07-02/03) : (1) Supabase `service_role` + `DATABASE_URL`, (2) bucket R2 EU, (3) bot
Telegram, (4) Langfuse, (5) clés LLM, (6) déploiement Vercel, (7) webhook Telegram,
(8) Postmark, (9) Cloud Run Job + Scheduler, (10) smoke tests E2E.

## 15. Qualité

- **204 tests** verts (37 model-core + 86 worker + ~166 app) : couverture RLS complète,
  preuves d'idempotence, sûreté de types.
- **Gate pré-commit** : `pnpm lint && pnpm typecheck && pnpm -r test && pnpm build` — tout vert
  avant chaque push. `tsc` et `eslint` propres sur les 3 workspaces.
- **Smoke E2E 8/8 verts** (voir `docs/QA-SMOKE-REPORT.md`) : isolation RLS, idempotence, TTL
  72 h, OCR live (facture réelle extraite, coût loggé), envoi email HIGH live, latence webhook
  < 0,5 s, santé worker Cloud Run, smoke HTTP.
- **Sentinelle d'observabilité** : tâche planifiée (cron 30 min) qui détecte les anomalies
  (types de jobs inconnus, violations RLS, échecs worker) et alerte sur Telegram.

## 16. La plateforme « always-on » (contexte, hors produit)

Morax est développé et opéré via une infrastructure interne d'Etienne — **Morax OS /
OpenClaw** : un NAS Synology hébergeant un orchestrateur multi-agents (routeur, passerelles
Claude Code / Codex, proxy de clés LLM, bridge Telegram `@SuperMorax_bot`, n8n, dashboard
Cockpit). C'est là que vivent le gate d'approbation des agents de dev, les garde-fous de
budget (un siège Max partagé), et la règle « un seul agent par repo ».

**Point important pour un relecteur :** cette plateforme est l'**outil de fabrication**, pas le
produit. **Aucune donnée client ne touche le NAS** — le produit tourne à 100 % sur services
cloud managés (Supabase, Vercel, etc.). Détails dans `docs/PLATFORM-AND-TOOLS.md`.

---
---

# PARTIE C — Ce qui reste à faire

## 17. Bloquants go-live client réel (actions non-code, côté Etienne)

Ces trois points n'impliquent pas de développement, seulement des démarches d'activation :

1. **Approbation du compte Postmark** — soumettre le formulaire *Request approval*. Aujourd'hui
   le compte est en mode test (100 emails/mois, envoi uniquement vers le domaine de
   l'expéditeur). Sans ça, impossible d'écrire à un vrai client. Délai ~24–48 h après soumission.
2. **Achat + délégation du domaine `morax.app`** vers Cloudflare DNS, puis configuration
   DKIM/Return-Path/MX pour Postmark. Débloque à la fois l'expéditeur pro et l'email entrant.
3. **Activation des Passkeys** sur le dashboard Supabase (toggle manuel — aucun outil MCP ne
   l'expose). Le code client est câblé (`experimental.passkey`) ; reste à confirmer
   l'activation serveur et à faire un test réel avec un authenticator physique.

## 18. En cours / à moitié câblé

- **Launchpad `agent_task`** — *corrigé au 2026-07-05 : ce point était périmé.* Le design
  générique `agent_task` (migration `0008`) a été abandonné et remplacé par 5 job types
  concrets avec handler worker réel (`worker/src/tasks/registry.ts` : `chase_unpaid`,
  `check_deadlines`, `daily_summary`, `sort_inbox`, `command_reply`, câblés migration `0013`,
  commit `afcb021` du 2026-07-04). Migrations `0013`/`0014` **vérifiées appliquées en prod**
  le 2026-07-05 (`list_migrations`, projet `pmeokfxtvjrrpencrklf`).
- **Email entrant** (`api/webhooks/postmark`) — route et handler RLS-scopé écrits et testés,
  bloqués uniquement par l'achat du domaine (point §17.2).
- **Passkey / WebAuthn** — bouton d'inscription et de connexion câblés côté client ; en
  attente du toggle Supabase (point §17.3).

## 19. Non démarré / v1.1+

Fonctionnalités hors périmètre MVP, prévues plus tard :

- **Body Double** — planification récurrente (« envoie cette facture chaque lundi 10 h »). Les
  rappels ponctuels existent (calendrier), mais pas la logique de récurrence.
- **Multi-provider simultané** — le registre est conçu pour ≥ 4 fournisseurs, mais la logique
  de fallback suppose aujourd'hui 2 paliers maximum.
- **Conversion de devises** — spec écrite (`docs/SPEC-currency-conversion.md`), pas de code ;
  décision ouverte sur la source des taux.
- **Condensation de contexte** — résumé périodique pour les longues conversations.
- **Audio temps réel** — le registre mentionne un modèle audio live ; le MVP est en file async.
- **UI riche** — prévisualisation, signature électronique, CC multi-destinataires (le champ CC
  existe mais n'est que stocké).
- **Écriture chez un tiers** (`third_party_write`) — handler stub, jamais implémenté (API vers
  des systèmes comptables externes).
- **API / CLI programmatique** — aujourd'hui seulement UI web + commandes Telegram + webhooks.
- **Reporting & analytics** — le dashboard affiche le COGS brut ; pas encore de rapports exportables.
- **Suite E2E Playwright** — plan écrit (`docs/PLAN-QA-UI-UX.md`), **bloquée par le verrou
  d'auth** (magic-link non cliquable en headless). Stratégie d'injection de session à décider.

## 20. Dette technique & garde-fous connus

- **Advisors Supabase** (non urgents) : protection contre les fuites de mot de passe désactivée,
  3 clés étrangères non indexées, 1 politique RLS qui ré-évalue `auth.fn()`.
- **Contraintes *by-design* (ce ne sont pas des bugs) :**
  - Gate d'approbation **Telegram uniquement** — pas de bouton d'approbation web (choix de
    sécurité : point de contrôle unique sur le téléphone d'Etienne).
  - Pas de flux de paiement web (hors périmètre MVP).
  - OCR asynchrone sans feedback temps réel (la timeline se met à jour au refresh).

## 21. Prochaines étapes recommandées (dans l'ordre)

| # | Étape | Type |
|---|---|---|
| 1 | Soumettre l'approbation Postmark | **Etienne** |
| 2 | Acheter + déléguer le domaine `morax.app` (DNS/DKIM/MX) | **Etienne** |
| 3 | Tester le flux email entrant une fois le domaine actif | Dev |
| 4 | Activer les Passkeys (dashboard Supabase) + re-tester login réel (authenticator physique) | **Etienne** |
| 5 | Décider la stratégie d'injection de session, puis suite E2E Playwright | Dev (post-MVP) |

---
---

## Annexe A — Glossaire

- **Tenant** — un client isolé (un utilisateur ou une équipe) ; toutes ses données sont
  cloisonnées par RLS.
- **pgmq** — extension Postgres qui fournit une file de messages *dans* la base (pas de broker
  externe type Redis/SQS).
- **RLS (Row-Level Security)** — sécurité au niveau ligne : Postgres n'expose à chaque tenant
  que ses propres lignes.
- **Gate HIGH** — mécanisme d'approbation humaine (✅/❌ via Telegram) obligatoire avant toute
  action externe.
- **Crédits** — unité de facturation abstraite, découplée des tokens LLM.
- **DLQ (Dead-Letter Queue)** — file des messages qui ont échoué trop de fois (au-delà de MAX_LOOPS).
- **Palier / rôle** — le palier (premium/intermédiaire/économique) et le rôle
  (cerveau/workhorse/micro) déterminent quel modèle LLM est utilisé.
- **COGS** — coût réel de production (ici surtout le coût LLM), suivi via Langfuse pour piloter la marge.
- **Idempotence** — garantie qu'un même message n'est traité qu'une fois, même s'il est relivré.

## Annexe B — Documents sources

- [ADR-001 — architecture cible](ADR-001-architecture-cible.md) — décisions d'architecture.
- [Runbook de provisionnement](PROVISIONING-RUNBOOK.md) — les 10 étapes de mise en production.
- [État d'implantation](ETAT-IMPLANTATION.md) — statut détaillé code vs. vérifié live.
- [Rapport smoke QA](QA-SMOKE-REPORT.md) — les 8 parcours E2E.
- [Journal de déploiement](DEPLOY-JOURNAL.md) — journal des 23 sessions.
- [Preview & validation](PREVIEW.md) — la boucle de validation.
- [Plan QA UI/UX](PLAN-QA-UI-UX.md) — futur harnais de tests (verrou auth).
- [Plan MVP resserré](../Morax_MVP_Plan_resserre.md) — la feuille de route 4 phases.
- [Grille des poids d'actions](../grille-actions-poids.md) — détail des crédits par action.
- [User stories MVP](../mvp-user-stories.md) — parcours utilisateurs.
- [Plateforme & outils](PLATFORM-AND-TOOLS.md) — l'infra always-on (hors produit).
- [Registre des modèles](../packages/model-core/src/models.registry.yaml) — source de vérité du routage.
