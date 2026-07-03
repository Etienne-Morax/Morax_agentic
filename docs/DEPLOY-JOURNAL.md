# Journal de déploiement Morax

Append-only. Un seul agent écrit à la fois (sérialisation par repo, voir CLAUDE.md). Chaque entrée : date, agent, action, résultat, décisions. Ne jamais réécrire une entrée passée — corriger en ajoutant une nouvelle entrée qui référence la précédente.

---

## 2026-07-03 — Phase 0 (deploy-conductor)

**Contexte** : reprise du plan de déploiement final (`~/.claude/plans/tu-es-un-architecte-majestic-thunder.md`), exécution autonome de la Phase 0.

**Découvertes (hors plan initial, trouvées en vérifiant plutôt qu'en supposant)** :
- CI (`ci.yml`) ne se déclenchait que sur push vers `main` littéral — jamais sur `feat/phase1-foundations`, la branche réellement utilisée. Aucun CI ne tournait après merge depuis le début du projet.
- Job `migrations` cassé en boucle : `supabase/config.toml` avait `major_version = 16`, rejeté par supabase-cli 2.101.0+ (`Invalid db.major_version: 16`). Le projet Supabase managé (`pmeokfxtvjrrpencrklf`) tourne déjà Postgres 17.6.1.
- Le fix `outputFileTracingRoot` (commit d181c6d) était déjà déployé en prod (READY, Vercel) contrairement à ce qu'indiquait la mémoire projet — `/credits` renvoie 307 (redirect login, comportement normal sans session), plus de 500. Confirmé aussi par l'arrêt des runtime errors Vercel avant ce déploiement.
- Webhook inbound Postmark (`app/src/app/api/webhooks/postmark/route.ts`) vérifiait un header `x-morax-inbound-secret` que Postmark ne peut pas envoyer (pas de champ custom header dans leur config webhook). Le mécanisme réel supporté : Basic Auth encodé dans l'URL.
- `InboundHookUrl` n'était pas configuré du tout côté Postmark (vide) — l'inbound email n'a jamais été branché, indépendamment de l'achat du domaine `morax.app` (Postmark route déjà via son adresse générique `inbound.postmarkapp.com`).
- Référence Supabase produit erronée dans la mémoire projet (`jkggomxfmlahnxweaqzm` — c'est en fait le projet plateforme OpenClaw, un compte/org différent). Le vrai ref produit : `pmeokfxtvjrrpencrklf` (eu-west-2, Postgres 17.6.1).

**Actions effectuées** :
1. Fix `ci.yml` : trigger push sur `[main, feat/phase1-foundations]` — commit `4fb8211`
2. Fix `supabase/config.toml` : `major_version` 16→17 — commit `4fb8211`
3. Vérifié localement (best-effort, pas de Docker) : l'erreur de config a disparu, échoue maintenant sur "Docker daemon absent" (attendu, non-bloquant en CI qui a Docker)
4. Fix auth webhook Postmark inbound : Basic Auth via `verifyPostmarkBasicAuth()` dans `webhook-core.ts`, testé (6 nouveaux tests), commit `f74d926`
5. Push → premier run CI réel sur `feat/phase1-foundations` : **succès** (migrations + build-test tous verts, run 28656495272)
6. Configuré `InboundHookUrl` Postmark via API (`https://morax:***@morax-app.vercel.app/api/webhooks/postmark`) — diff avant/après confirmé : aucun autre champ du serveur Postmark affecté
7. Health-check baseline : Telegram webhook sain (0 pending, pas d'erreur), advisors Supabase reviewés (que du WARN/INFO, rien de bloquant — voir rapport de statut pour détail)
8. Créé les 5 agents spécialistes (`.claude/agents/cloudrun-deployer.md`, `infra-email-dns.md`, `qa-e2e.md`, `observability-sentinel.md`, `code-fixer.md`)

**Bloqué, en attente d'Etienne (A1/A2/A3 du plan)** :
- Phase 1 (Cloud Run) : besoin projet GCP + billing actif + `gcloud auth login`
- Phase 2 (email complet) : besoin approbation Postmark (formulaire dashboard) + décision domaine `morax.app`
- Phase 3 (smoke E2E) : dépend de Phase 1

**Non fait, noté pour plus tard (P2, non bloquant)** :
- Supabase Auth : "leaked password protection" désactivé (WARN sécurité, 1 toggle dashboard)
- 3 foreign keys sans index (cost_traces, credits_ledger, reminders) — perf mineure à ce stade de volume
- RLS policy `users_self` réévalue `auth.<fn>()` par ligne au lieu de `(select auth.<fn>())` — perf mineure
