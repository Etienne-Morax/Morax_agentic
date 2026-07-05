# État d'implantation — Morax MVP

Source unique de vérité sur l'avancement, consolidée depuis la roadmap produit
(`Morax_MVP_Plan_resserre.md`), le runbook de provisioning
(`docs/PROVISIONING-RUNBOOK.md`), l'historique git et le code actuel.

**Statut :** Canonique · **Propriétaire logique :** Etienne · **Dernière vérification :**
2026-07-05 · **Commit audité :** `1a0c345` (`feat/phase1-foundations`) · **Prochaine révision
déclenchée par :** tout changement d'état de provisioning (Cloud Run, domaine, Postmark,
Passkeys) ou merge vers `main`.

Historique : mise à jour initiale 2026-07-02 (session 16) ; Cloud Run + Go beta confirmés
2026-07-03 (`docs/DEPLOY-JOURNAL.md`) ; Launchpad câblé sur de vrais handlers 2026-07-04 ;
consolidée et corrigée lors de l'audit documentaire 2026-07-05.

## Légende

- ✅ validé / vérifié en réel
- 🟡 partiel — code prêt, action live restante
- ⬜ à faire
- ❓ à confirmer — état probable mais non vérifiable depuis le repo seul

## TL;DR

- **Couche produit (E1→E4 + socle + Launchpad)** : ✅ 100 % codée et testée. Chiffre
  d'exécution réelle (`pnpm test`, 2026-07-05, commit `1a0c345`) : **352 tests verts sur 38
  fichiers, 0 skip** (model-core 50 tests / 3 fichiers, worker 117 tests / 15 fichiers,
  app 185 tests / 20 fichiers). Ajouts hors-plan : auth passkey/WebAuthn (code prêt, opt-in
  expérimental), Launchpad (5 job types avec handler worker réel, cf. Couche A).
- **Couche mise en ligne (Milestone C, runbook étapes 0→10)** : ~85 % vérifié en réel.
  Langfuse, Vercel, webhook Telegram, Postmark sortant (sender simple), Cloud Run Job +
  Scheduler tous live et vérifiés (`docs/DEPLOY-JOURNAL.md`, 2026-07-03). Smoke E2E : 8/8
  parcours verts (`docs/QA-SMOKE-REPORT.md`, 2026-07-03). Go beta donné le 2026-07-03.
  Reste bloqué : domaine `morax.app` (différé, décision produit), approbation Postmark
  (compte en mode test), test Passkey avec authenticator physique réel.

Il faut distinguer les deux couches : une intégration peut être **✅ codée et testée**
mais **⬜ pas encore branchée en production**. Distinguer aussi **fait** (mesuré/exécuté),
**estimation** (modélisation coûts/marge, non mesurée en volume réel) et **différé**
(décision produit en attente).

---

## Couche A — Fonctionnalités produit (code + tests)

| Épic | Livrable | État |
|------|----------|------|
| **E1** | Auth Supabase, timeline/inbox/credits en lecture, éditeur inline, webhook Telegram (ACK <1s + enqueue) | ✅ |
| **E2** | Brouillons devis/facture (CRUD RLS, line items), rendu PDF (`@react-pdf/renderer`), export | ✅ |
| **E3** | Rappels d'échéance : `pg_cron` → `pgmq` → Telegram, jalons J-7/J-3/J-1, calendrier, marquer payé/ignoré | ✅ |
| **E4** | Gate HIGH : finalisation → PDF sur R2 → `pending_actions` → approbation Telegram → envoi Postmark ; verrou `doc_number`, TTL 72 h, débit crédit, email HTML+CC | ✅ |
| **Socle** | `model-core` (registre YAML, resolver 3 paliers, garde-fous finance→Opus / planner→Sonnet, crédits), migrations `0001`→`0007`, RLS multi-tenant + JWT claim, idempotence `job_runs`, pipeline worker 4 étages | ✅ |
| **Launchpad** | Centre de commande mobile : grille de raccourcis, 5 job types avec handler worker réel (`chase_unpaid`, `check_deadlines`, `daily_summary`, `sort_inbox`, `command_reply` — `worker/src/tasks/registry.ts`), pièces jointes + saisie vocale, feedback temps réel. Design générique `agent_task` (migration `0008`) abandonné, remplacé par migration `0013`. | ✅ **migrations `0013`/`0014` vérifiées appliquées en prod le 2026-07-05** (`list_migrations` projet `pmeokfxtvjrrpencrklf`) |

Chemins de code représentatifs :
- `packages/model-core/src/model-resolver.ts` — routage par palier + garde-fous finance/planner
- `packages/model-core/src/models.registry.yaml` — source de vérité des modèles (aucun modèle en dur ailleurs)
- `worker/src/pipeline.ts` — pipeline 4 étages (OCR, Planner, Draft, comptabilité coûts)
- `worker/src/action-gate-core.ts` — logique de la gate HIGH (zéro LLM, zéro crédit)
- `app/src/lib/finalize-draft-core.ts` — finalisation + construction du payload PDF
- `app/src/lib/webhook-core.ts` — parsing Telegram + routage des callbacks d'approbation
- `supabase/migrations/0001_init.sql` → `0007_expire_pending_actions.sql`

Trous connus non bloquants (hors MVP) : handler worker `third_party_write` non implémenté,
gestion des bounces Postmark partielle, pas de pinning modèle vision dédié pour l'OCR, pas de
conversion de devise (spec écrite, non codée, `docs/SPEC-currency-conversion.md`).

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
| 9 | Cloud Run Job (worker) + Cloud Scheduler | ✅ **vérifié live 2026-07-03** | Claude (`deploy/cloud-run.sh`) + Etienne (projet GCP + billing) | — |
| 10 | Smoke live bout-en-bout (8 parcours : RLS, idempotence, TTL, OCR live, envoi HIGH, latence ACK, santé worker, smoke navigateur) | ✅ **8/8 verts, 2026-07-03** (`docs/QA-SMOKE-REPORT.md`) | Claude + Etienne | — |

**Go beta donné le 2026-07-03** (feu vert technique d'Etienne, Phase 3 8/8 verte + Phase 4
sentinel de monitoring armé). Ne déclenche aucune action externe automatique — reste soumis
au gate HIGH pour tout envoi réel.

Hors runbook initial, ajouté en cours de route : **auth passkey/WebAuthn** (code client câblé,
`experimental.passkey` — activation serveur Supabase à confirmer, test réel navigateur avec
authenticator physique non fait) ; **fix 500 prod** sur les routes lisant
`models.registry.yaml` (`outputFileTracingIncludes`, corrigé et vérifié) ; **Launchpad**
câblé sur 5 job types réels (2026-07-04, cf. Couche A).

## Prochaines actions (ordre d'exécution recommandé)

1. **Étape 8bis** — Domaine `morax.app` : achat + délégation DNS Cloudflare, puis
   DKIM/Return-Path Postmark + bascule `POSTMARK_FROM_EMAIL` (décision différée,
   à reprendre quand Etienne est prêt).
2. Soumettre `Request approval` côté Postmark avant tout envoi à un vrai client
   (sinon restriction "même domaine que le sender" en prod).
3. Test réel navigateur avec authenticator physique : login magic-link + Passkey (réglages
   Supabase Auth déjà faits côté Etienne, activation serveur à reconfirmer).

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
