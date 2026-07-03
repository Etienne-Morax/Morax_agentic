# Journal de déploiement Morax

Append-only. Un seul agent écrit à la fois (sérialisation par repo, voir CLAUDE.md). Chaque entrée : date, agent, action, résultat, décisions. Ne jamais réécrire une entrée passée — corriger en ajoutant une nouvelle entrée qui référence la précédente.

---

## 2026-07-03 — Phase 4 : monitoring armé (session 18, suite Phase 3)

**Bug réel trouvé en concevant le test d'alerte volontaire (pas corrigé ici, flag séparé)** : `job_runs` a une contrainte unique `(tenant_id, idempotency_key)` (0001_init.sql:124). Dans `worker/src/run.ts`, `begin()` traite tout conflit `23505` comme "déjà traité" → supprime le message de la file. Or si un job échoue à sa 1ère tentative, la ligne `job_runs` reste occupée en `status='error'` — au prochain poll, le conflit se reproduit, le message est supprimé silencieusement **sans jamais atteindre le chemin `read_ct`/DLQ prévu**. Un job qui échoue une fois disparaît donc pour toujours, sans retry, sans trace DLQ. Confirmé par lecture de schéma, pas reproduit en direct sur la prod (le test d'alerte ci-dessous l'a évité en gardant le tenant vivant pendant la 1ère tentative). Flag envoyé en tâche séparée (`task_be1949ab`), pas corrigé cette session (hors scope monitoring).

**Test d'alerte volontaire réalisé** : tenant `test-gamma` créé, job de type inconnu injecté (`unknown_job_type_qa_sentinel_test`) → worker → `job_runs.status='error'` confirmé. Vérifié que la requête de détection sentinel (`status='error' AND tenant_id NOT LIKE 'test-%'`) exclut bien ce tenant de test (0) tout en détectant l'erreur en clair sans le filtre (1) — les deux comportements attendus validés. **Incident mineur auto-corrigé** : le message pgmq de test est resté dans la file réelle après le delete du tenant (delete tenant ne cascade pas sur pgmq) — supprimé manuellement (`pgmq.delete`) avant qu'un tick scheduler ne le redrain contre un tenant supprimé. `test-gamma` entièrement purgé (tenants/job_runs/pgmq = 0).

**Cron `morax-observability-sentinel` armé** : `mcp__scheduled-tasks`, toutes les 30 min (`*/30 * * * *` — **piège trouvé** : une cron-list `"3,33 * * * *"` a été mal interprétée par le parser de cet outil, affichée comme "toutes les heures à :07" au lieu de deux fois par heure ; corrigé avec la syntaxe `*/N` qui elle fonctionne correctement, vérifié via `list_scheduled_tasks`). Prompt self-contained (checklist observability-sentinel.md : webhook Telegram, profondeur pgmq, job_runs erreur hors test, pending_actions expirées hors test, Vercel runtime errors, fraîcheur dernière exécution Cloud Run), dédup 3h par signature, alerte Telegram directe (chat_id lu depuis `channel_identities` tenant `morax-dev`). **Écart volontaire par rapport à la spec `observability-sentinel.md`** : le log d'alerte n'est PAS écrit dans `docs/DEPLOY-JOURNAL.md` par le cron lui-même (contrairement à ce que dit la spec) mais dans `~/.claude/morax-sentinel-log.md`, hors repo git — pour respecter la règle de sérialisation par repo (un cron non supervisé ne doit pas modifier le working tree partagé pendant qu'un autre agent pourrait y travailler). `docs/ONCALL-RUNBOOK.md` créé (seuils, réactions par type d'alerte, limites du mécanisme).

**Limites du mécanisme à connaître** (documentées aussi dans le runbook) : (1) le cron ne tourne que pendant que l'app Claude Code est ouverte sur la machine d'Etienne — pas un vrai cron serveur 24/7 indépendant ; rattrape au prochain lancement si fermé à l'heure prévue. (2) Premier passage automatique peut buter sur une invite de permission (Bash/MCP/curl) tant qu'un « Run now » manuel n'a pas pré-approuvé les outils — recommandé à Etienne.

**Reste** : gate humain Phase 3 (vraie photo Telegram, finalisation+approbation réelle, passkey optionnel), bug idempotence/retry (`task_be1949ab`) à traiter séparément.

---

## 2026-07-03 — GO BETA (décision Etienne)

Etienne a donné le **Go beta** en session (Phase 3 8/8 verte + Phase 4 sentinel armé). Feu vert technique uniquement — ne déclenche aucun envoi/action externe automatique. Reste non bloquant, à faire au rythme d'Etienne : gate humain (vraie photo Telegram → bot, finalisation+approbation réelle, test passkey optionnel), choix des beta-testeurs, approbation Postmark avant tout envoi à un vrai client externe, décision domaine `morax.app` (différé). Bug idempotence/retry (`task_be1949ab`) reste ouvert, à traiter séparément — ne bloque pas le Go (impact = jobs transitoirement en échec silencieusement non-retryés, pas un blocage du lancement).

---

## 2026-07-03 — Phase 3 : smoke E2E vert, 8/8 parcours (session 18)

**Contexte** : reprise du plan (`~/.claude/plans/tu-es-un-architecte-majestic-thunder.md`), exécution de la Phase 3. Etienne a confirmé en session : A2 (Postmark request approval) pas encore soumis, A3 (domaine `morax.app`) toujours différé → scope ajusté (email self-domaine uniquement, pas de parcours inbound/DKIM). Effets de bord réels autorisés (Live complet) : 1 vrai OCR + 1 vrai envoi Postmark self.

**Écart d'exécution relevé** : l'agent `qa-e2e` (`.claude/agents/qa-e2e.md`) n'a que `tools: Bash, Read` — insuffisant pour les tests RLS (nécessitent MCP Supabase `execute_sql` + claim JWT simulé) et le login navigateur (`worker/.env.local` n'a pas de `DATABASE_URL` psql, seulement `SUPABASE_URL`+service key). Exécuté inline dans la session principale à la place, spec `qa-e2e.md` utilisée comme checklist. Le fix (élargir les tools de l'agent) est noté mais pas fait, non bloquant.

**8/8 parcours automatisés verts** (détail complet + preuves : `docs/QA-SMOKE-REPORT.md`) :
1. Isolation RLS (2 tenants test, claim JWT simulé) : 0 fuite, insert cross-tenant refusé (`42501`), sans claim → 0 ligne.
2. Idempotence : même message pgmq envoyé 2×, `job_runs` = 1 seule ligne.
3. TTL 72h : `pending_action` antidatée → `expire_pending_actions()` → `expired`.
4. **OCR live réel** : facture JPEG générée (Python/Pillow) avec montant/échéance/émetteur connus, uploadée R2, job `capture_document` → extraction **exacte** via `claude-opus-4-8` (Anthropic direct, finance-critical pin confirmé en conditions réelles), coût `$0.006595`, `credits_ledger scan_document` poids 1.00.
5. **Envoi HIGH live réel** : draft finalisé + `pending_action approved` (simulé, équivalent du callback ✅) → job `action_execute` → Postmark accepté (zéro erreur), `envoi_document` poids 0.50, draft `sent`.
6. Latence ACK webhook Telegram prod : 0.24–0.44s à chaud (< 1s), chat inconnu → zéro effet de bord.
7. Santé worker : logs Cloud Run propres sur toutes les exécutions récentes, zéro erreur. Observation notée (pas un bug) : une exécution manuelle et un tick Cloud Scheduler se sont chevauchés à 13:04:48, la visibility timeout pgmq a empêché tout double-traitement.
8. Smoke navigateur léger : `/login` 200, `/` 307 (comportement attendu).

**Nettoyage** : `delete from tenants where tenant_id in ('test-alpha','test-beta')` a cascadé sur toutes les tables dépendantes (vérifié `count(*)=0` partout), 2 objets R2 supprimés, scripts jetables (`worker/tmp-qa-smoke-*.mts`) supprimés avant commit, jamais committés.

**Reste** : gate humain (Etienne, ~15 min — vraie photo Telegram, finalisation+approbation réelle, test passkey optionnel), puis Phase 4 (monitoring `observability-sentinel` + Go beta).

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
