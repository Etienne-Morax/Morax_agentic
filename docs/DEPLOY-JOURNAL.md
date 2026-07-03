# Journal de déploiement Morax

Append-only. Un seul agent écrit à la fois (sérialisation par repo, voir CLAUDE.md). Chaque entrée : date, agent, action, résultat, décisions. Ne jamais réécrire une entrée passée — corriger en ajoutant une nouvelle entrée qui référence la précédente.

---

## 2026-07-03 — Phase 1 : Cloud Run live (cloudrun-deployer)

**A1 débloqué par Etienne en session** : projet GCP `morax-prod` (numéro 182255903788) créé, billing lié (compte existant `01AC0B-7FC39B-365A70`, actif depuis 2026-06-15), `gcloud auth login` complété (`etienne0moreau@gmail.com`). Project ID trouvé via claude-in-chrome (lecture `console.cloud.google.com/home/dashboard`), pas besoin de le demander une 2e fois.

**3 bugs réels trouvés au premier vrai déploiement (jamais construit avant cette session)** :
1. `gcloud builds submit` → `PERMISSION_DENIED` sur l'upload du tarball. Cause : propagation IAM juste après activation de `cloudbuild.googleapis.com` (Owner confirmé sur le compte, donc pas un vrai problème de droits). Résolu par un retry après ~40s.
2. `pnpm --filter @morax/worker --prod deploy /out` échoue dans le Dockerfile : pnpm v10+ refuse `pnpm deploy` sans `inject-workspace-packages=true` (jamais configuré dans ce monorepo). Fix : `--legacy` (flag suggéré par pnpm lui-même), scope limité à cette seule commande. Validé en local avant de relancer le build cloud (dossier de sortie simulé, `dist/index.js` + `@morax/model-core` bien présents). Commit `7146b14`.
3. Push d'image échoue : `Repository "morax" not found` — le repo Artifact Registry n'existait pas, le script le supposait déjà créé. Créé manuellement (`gcloud artifacts repositories create`) puis rendu idempotent dans `deploy/cloud-run.sh` (describe puis create si absent) pour les futurs redeploys. Commit `a66f655`.
4. Cloud Scheduler : `cloudscheduler.googleapis.com` pas dans la liste initiale des 3 APIs du plan — ajoutée à la volée.

**Build + deploy réussis** : image poussée (`europe-west1-docker.pkg.dev/morax-prod/morax/worker`), Cloud Run Job `morax-worker` créé (europe-west1).

**Test manuel réel** : `gcloud run jobs execute morax-worker --wait` → succès, exit 0. Log worker : "terminé. Jobs traités : 1". Vérifié en base (`job_runs`) : c'est un vrai job `reminder_notify` (tenant `morax-dev`), passé `done` — **premier traitement réel du worker en prod**, drainé depuis pgmq où il attendait depuis le Milestone E3 (session 9, jamais de worker déployé jusqu'ici). Ce job a probablement déclenché un vrai message Telegram vers le chat lié à `morax-dev` (= Etienne) : signalé pour ne pas le surprendre.

**Cloud Scheduler créé** : service account dédié minimal `morax-scheduler@morax-prod.iam.gserviceaccount.com`, rôle `roles/run.invoker` accordé uniquement sur le job `morax-worker` (pas de rôle projet large). Job `morax-worker-poll`, cron `* * * * *`, cible l'API Cloud Run Jobs v1 (`.../namespaces/morax-prod/jobs/morax-worker:run`). Manquait `cloudscheduler.googleapis.com` dans les APIs activées initialement — ajoutée à la volée.

**Cycle automatique confirmé** : tick scheduler à 12:17:01, exécution `morax-worker-6rmvv` complétée 12:18:04 (log "terminé. Jobs traités : 0" — normal, pgmq déjà vidé par le test manuel). Boucle complète validée : Cloud Scheduler → Cloud Run Job → worker boot/pgmq/exit propre, sans intervention. **Phase 1 terminée.**

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
