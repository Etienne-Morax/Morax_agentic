# État d'implantation — Morax MVP

Source unique de vérité sur l'avancement, consolidée depuis la roadmap produit
(`Morax_MVP_Plan_resserre.md`), le runbook de provisioning
(`docs/PROVISIONING-RUNBOOK.md`), l'historique git et le code actuel.
Dernière mise à jour : 2026-07-02 (session 16).

## Légende

- ✅ validé / vérifié en réel
- 🟡 partiel — code prêt, action live restante
- ⬜ à faire

## TL;DR

- **Couche produit (E1→E4 + socle)** : ✅ 100 % codée et testée (161 fichiers de test, 0 skip).
  Ajout hors-plan : auth passkey/WebAuthn (opt-in expérimental, activée côté Supabase).
- **Couche mise en ligne (Milestone C, runbook étapes 0→10)** : ~85 % vérifié en réel.
  Langfuse, Vercel, webhook Telegram, Postmark sortant (sender simple) tous live.
  Reste bloqué : domaine `morax.app` (différé, décision produit), Cloud Run
  (GCP projet+billing Etienne), smoke E2E complet.

Il faut distinguer les deux couches : une intégration peut être **✅ codée et testée**
mais **⬜ pas encore branchée en production** (ex. Langfuse, Postmark outbound réel,
Vercel, Cloud Run).

---

## Couche A — Fonctionnalités produit (code + tests)

| Épic | Livrable | État |
|------|----------|------|
| **E1** | Auth Supabase, timeline/inbox/credits en lecture, éditeur inline, webhook Telegram (ACK <1s + enqueue) | ✅ |
| **E2** | Brouillons devis/facture (CRUD RLS, line items), rendu PDF (`@react-pdf/renderer`), export | ✅ |
| **E3** | Rappels d'échéance : `pg_cron` → `pgmq` → Telegram, jalons J-7/J-3/J-1, calendrier, marquer payé/ignoré | ✅ |
| **E4** | Gate HIGH : finalisation → PDF sur R2 → `pending_actions` → approbation Telegram → envoi Postmark ; verrou `doc_number`, TTL 72 h, débit crédit, email HTML+CC | ✅ |
| **Socle** | `model-core` (registre YAML, resolver 3 paliers, garde-fous finance→Opus / planner→Sonnet, crédits), migrations `0001`→`0007`, RLS multi-tenant + JWT claim, idempotence `job_runs`, pipeline worker 4 étages | ✅ |

Chemins de code représentatifs :
- `packages/model-core/src/model-resolver.ts` — routage par palier + garde-fous finance/planner
- `packages/model-core/src/models.registry.yaml` — source de vérité des modèles (aucun modèle en dur ailleurs)
- `worker/src/pipeline.ts` — pipeline 4 étages (OCR, Planner, Draft, comptabilité coûts)
- `worker/src/action-gate-core.ts` — logique de la gate HIGH (zéro LLM, zéro crédit)
- `app/src/lib/finalize-draft-core.ts` — finalisation + construction du payload PDF
- `app/src/lib/webhook-core.ts` — parsing Telegram + routage des callbacks d'approbation
- `supabase/migrations/0001_init.sql` → `0007_expire_pending_actions.sql`

Trous connus non bloquants (hors MVP) : handler worker `third_party_write` non implémenté,
gestion des bounces Postmark partielle, pack `voix` non intégré, pas de pinning modèle vision
dédié pour l'OCR, pas de conversion de devise.

---

## Couche B — Provisioning cloud live (Milestone C — runbook étapes 0→10)

| # | Étape | État | Qui agit | Blocage |
|---|-------|------|----------|---------|
| 0 | Préflight (`.gitignore`, projet Supabase dev `eu-west-2`, team Vercel) | ✅ fait | Claude | — |
| 1 | Supabase `service_role` + `DATABASE_URL` + login magic-link réel | ✅ **vérifié live 2026-07-02** | Claude + Etienne (dashboard) | — |
| 2 | Cloudflare R2 `morax-media` (juridiction UE), round-trip put/get | ✅ **vérifié live** | Etienne (bucket EU, dashboard only) + Claude (vérif) | — |
| 3 | Bot Telegram + `channel_identities` (`sendMessage` OK) | ✅ **vérifié live** | Claude (via `claude-in-chrome`) + Etienne (compte Telegram) | `setWebhook` différé → étape 7 |
| 4 | Langfuse Cloud UE | ✅ **vérifié live** | Claude | — |
| 5 | Clés LLM live (Anthropic + OpenRouter, résolution registre) | ✅ **vérifié live** | Claude | — |
| 6 | Déploiement Vercel | ✅ **vérifié live** (`https://morax-app.vercel.app`) | Claude (config + Root Dir via REST) + Etienne (env vars validées) | — |
| 7 | `setWebhook` Telegram → URL Vercel publique | ✅ **vérifié live** | Claude | — |
| 8 | Postmark sortant (sender simple `info@moraxphotography.com`) | ✅ **vérifié live** — worker **14/14** vars | Claude (navigateur d'Etienne, compte Postmark existant) | Compte en attente d'approbation Postmark (100 emails test, envoi restreint au même domaine que le sender) — à soumettre avant usage client réel |
| 8bis | Domaine `morax.app` + DKIM + MX inbound | ⬜ différé (décision produit) | Etienne (achat + dashboard Cloudflare, pas d'outil MCP DNS) | Domaine non délégué (`dig NS`/`SOA` vides) |
| 9 | Cloud Run Job (worker) + Cloud Scheduler | 🟡 partiel | Claude (script prêt, `deploy/cloud-run.sh`) + Etienne (projet GCP + billing) | `gcloud auth login`, projet + billing actifs, APIs Cloud Run/Build/Artifact Registry |
| 10 | Smoke live bout-en-bout (note vocale → timeline) | ⬜ à faire | Claude + Etienne | Bloqué par étape 9 |

Hors runbook initial, ajouté en cours de route : **auth passkey/WebAuthn**
(codée + activée côté Supabase, reste un test réel navigateur avec
authenticator physique) ; **fix 500 prod** sur les routes lisant
`models.registry.yaml` (`outputFileTracingIncludes`, corrigé et vérifié).

## Prochaines actions (ordre d'exécution recommandé)

1. **Étape 9** — Exécuter `deploy/cloud-run.sh` (dépend du projet GCP + billing Etienne).
2. **Étape 8bis** — Domaine `morax.app` : achat + délégation DNS Cloudflare, puis
   DKIM/Return-Path Postmark + bascule `POSTMARK_FROM_EMAIL` (décision différée,
   à reprendre quand Etienne est prêt).
3. Soumettre `Request approval` côté Postmark avant tout envoi à un vrai client
   (sinon restriction "même domaine que le sender" en prod).
4. **Étape 10** — Smoke test bout-en-bout réel (note vocale Telegram → traitement → timeline).
5. Smoke réel navigateur (pas l'outil Preview headless) : login magic-link +
   passkey, réglages Supabase Auth déjà faits côté Etienne.

## Au-delà de v1.0 (différé)

- Beta fermée 10–20 testeurs (recrutement, onboarding, UX capture vocale, message de latence).
- v1.1+ : multi-provider simultané (4+ fournisseurs), Live API audio, condensation de contexte,
  body-double avancé (tâches planifiées), envoi email direct (hors gate), UI riche, signature.

## Documents sources

- `docs/ADR-001-architecture-cible.md` — décisions d'architecture figées
- `Morax_MVP_Plan_resserre.md` — plan MVP en 4 phases
- `docs/PROVISIONING-RUNBOOK.md` — runbook de provisioning détaillé (Milestone C)
- `docs/architecture-cible-morax.svg` — diagramme d'architecture cible
- `mvp-user-stories.md`, `grille-actions-poids.md` — user stories et grille de crédits
