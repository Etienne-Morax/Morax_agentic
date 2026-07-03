# Rapport smoke E2E — Phase 3

Date : 2026-07-03 (session 18). Exécuté inline dans la session principale (MCP Supabase + Bash + `gcloud`), pas via l'agent `qa-e2e` — voir écart documenté dans le plan (`~/.claude/plans/reprends-le-d-ploiement-morax-elegant-map.md`, tools `qa-e2e.md` insuffisants pour SQL RLS/claim JWT). Toutes les données utilisent des tenants `test-alpha`/`test-beta`, purgées en fin de session.

**Décisions de scope verrouillées avant exécution** : Postmark pas encore approuvé (A2) → email uniquement vers `info@moraxphotography.com` (self, même domaine) ; domaine `morax.app` toujours différé (A3) → pas de parcours inbound/DKIM/MX. Effets de bord réels autorisés (Live complet) : 1 vrai appel LLM OCR + 1 vrai envoi Postmark self.

## Résultats

| # | Parcours | Statut | Preuve |
|---|---|---|---|
| 1 | Isolation RLS | ✅ VERT | `test-alpha` claim → seul le doc alpha visible (0 fuite beta) ; insert cross-tenant `test-beta` sous claim alpha → **rejeté** (`42501 new row violates row-level security policy`) ; sans claim → `0` ligne visible |
| 2 | Idempotence pgmq | ✅ VERT | 2× `pgmq.send` même `idempotency_key=test-idem-001` (msg_id 4, 5) → 1 seul `job_runs` (`status=done`), queue vidée (0 restant) |
| 3 | Expiration TTL 72h | ✅ VERT | `pending_action` insérée `requested_at=now()-73h` → `expire_pending_actions()` → `status=expired`, `decided_by=system:expiration`, `decided_at` posé |
| 4 | OCR live (vrai LLM) | ✅ VERT | Facture JPEG synthétique (montant 249.99 GBP, échéance 2026-08-15, émetteur "Adobe UK Ltd") uploadée R2 → job `capture_document` → extraction **exacte** via `claude-opus-4-8` (Anthropic direct, finance-critical pin confirmé) : 879 tokens in / 88 out, coût `$0.006595`, `credits_ledger` `scan_document` poids 1.00, `job_runs=done` |
| 5 | Envoi HIGH live (Postmark self) | ✅ VERT | Draft `TEST-INV-001` finalisé + `pending_action` `approved` → job `action_execute` → `pending_actions→executed`, `document_drafts→sent`, `credits_ledger` `envoi_document` poids **0.50**, `job_runs=done` sans erreur (le mailer lève une exception sur toute réponse Postmark non-2xx — absence d'erreur = envoi accepté) |
| 6 | Latence ACK webhook Telegram | ✅ VERT | POST synthétique (chat_id inconnu → `enqueued:false, reason:unknown_chat`, zéro effet) : 1er appel 0.867s (cold), 3 rappels 0.24–0.44s (warm) — toujours < 1s |
| 7 | Santé worker (logs Cloud Run) | ✅ VERT | Toutes les exécutions récentes : `[worker] terminé. Jobs traités : N` + `Container called exit(0)`, zéro erreur/stack trace. Observation (non-bug) : une exécution manuelle et un tick scheduler se sont chevauchés à 13:04:48 — chacune a bien traité le job une seule fois grâce à la visibility timeout pgmq (idempotence confirmée par les résultats des parcours 2/5) |
| 8 | Smoke navigateur léger | ✅ VERT | Prod : `GET /login` → 200 (formulaire), `GET /` → 307 (redirect middleware, comportement attendu) |

**8/8 parcours automatisés verts.**

## Nettoyage effectué

- DB : `delete from tenants where tenant_id in ('test-alpha','test-beta')` → cascade a purgé `documents`, `document_drafts`, `pending_actions`, `job_runs`, `credits_ledger`, `cost_traces`, `channel_identities` (tous vérifiés à `0` après coup). `channel_identities` n'a jamais eu de ligne créée pour ces tenants (zéro Telegram parasite, conforme au scope verrouillé).
- pgmq : `0` message restant taggé `test-alpha`/`test-beta`.
- R2 : 2 objets supprimés (`tenants/test-alpha/telegram/smoke/test-invoice.jpg`, `tenants/test-alpha/drafts/qa-smoke/TEST-INV-001.pdf`), confirmé `204`.
- Scripts jetables (`worker/tmp-qa-smoke-upload.mts`, `worker/tmp-qa-smoke-cleanup.mts`) et fichiers scratch locaux supprimés, jamais commités.
- Advisors Supabase non re-vérifiés après coup (aucune DDL exécutée cette session, pas de changement de surface attendu).

## Hors scope (différé, non bloquant)

- Envoi email vers un **destinataire externe réel** (domaine tiers) : bloqué tant que A2 (approbation Postmark) n'est pas soumise/acceptée.
- Parcours **inbound email** (MX Postmark) : bloqué tant que A3 (domaine `morax.app`) reste différé.

## Gate humain restant (Etienne, ~15 min)

Le seul chemin non automatisable de bout en bout (vrai Telegram + vrai clic) :
1. Envoyer une vraie photo de facture à `@morax_assistant_bot` → voir le document apparaître (OCR réel, tenant `morax-dev`).
2. Finaliser un brouillon dans la web app → recevoir le clavier ✅/❌ sur Telegram → presser ✅.
3. (Optionnel) tester le login passkey (Touch ID) sur `morax-app.vercel.app/login`.

## Definition of done — Phase 3

Atteinte : 8/8 parcours automatisés verts, RLS étanche, idempotence=1, TTL fonctionnel, OCR live exact, Postmark self 200, ACK < 1s, worker sain, données test purgées. **Phase 3 terminée.** Reste le gate humain ci-dessus (non bloquant pour armer le monitoring) avant Go beta.
