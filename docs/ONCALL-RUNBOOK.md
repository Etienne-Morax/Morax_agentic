# Runbook on-call — Morax prod

Monitoring assuré par la tâche planifiée `morax-observability-sentinel` (`~/.claude/scheduled-tasks/morax-observability-sentinel/SKILL.md`), toutes les 30 min, lecture seule + alerte Telegram. État/dédup dans `~/.claude/morax-sentinel-state.json`, log de chaque passage dans `~/.claude/morax-sentinel-log.md` (hors repo git, volontairement — voir §Limites).

## ⚠️ Limites connues de ce mécanisme (non un vrai cron serveur 24/7)

1. **Dépend de l'app Claude Code ouverte** : la tâche ne s'exécute que pendant que l'app tourne sur la machine d'Etienne. Si l'app est fermée à l'heure prévue, le passage manqué se rattrape au prochain lancement de l'app — pas d'exécution en arrière-plan pur pendant que l'app est fermée.
2. **Pré-approbation des outils recommandée** : au premier passage automatique, les outils utilisés (Bash, MCP Supabase, curl Telegram) peuvent déclencher une invite de permission qui bloquerait un passage non supervisé. Recommandé : cliquer **« Run now »** une fois dans la sidebar « Scheduled » pour pré-approuver — les approbations sont mémorisées pour les passages suivants.
3. Pour un vrai monitoring 24/7 indépendant de la machine locale, la plateforme OpenClaw (NAS always-on, voir `docs/PLATFORM-AND-TOOLS.md`) serait le bon porteur à terme (n8n / cron fleet) — hors scope de cette mise en place initiale.

## Que fait le sentinel à chaque passage

Checklist (miroir de `.claude/agents/observability-sentinel.md`) :
1. `getWebhookInfo` Telegram (pending_update_count, last_error_message)
2. Profondeur pgmq (`select count(*) from pgmq.q_morax_jobs`)
3. `job_runs` en erreur, hors tenants `test-*`, dernière heure
4. `pending_actions` expirées anormales, hors `test-*`, dernière heure
5. Runtime errors Vercel (fenêtre 1h)
6. Fraîcheur de la dernière exécution Cloud Run (`morax-worker`, doit être < 10 min)

Dédup : une même anomalie n'est ré-alertée que si elle persiste après 3h (pas de spam à chaque passage de 30 min).

## Comment réagir à chaque type d'alerte

| Signature | Signification | Action |
|---|---|---|
| `webhook_pending_high` | Telegram accumule des updates non traités | Vérifier `/api/webhooks/telegram` sur Vercel (`get_runtime_errors`, `get_deployment_build_logs`) — probable panne app ou webhook mal configuré |
| `pgmq_depth_high` | File > 50 messages sans baisse | Vérifier que le Cloud Scheduler tourne (`gcloud scheduler jobs describe morax-worker-poll --location europe-west1`) et que le worker ne boucle pas en erreur |
| `job_runs_error:<tenant>:<type>` | Un job réel (hors test) a échoué | Lire `job_runs.error` pour ce tenant/type, croiser avec les logs Cloud Run de la fenêtre concernée. **Piège connu** : un job qui échoue une fois n'est actuellement PAS réessayé proprement (bug ouvert, voir tâche `task_be1949ab` / mémoire projet) — il peut disparaître silencieusement de la file après une seule erreur. Traiter chaque `job_runs_error` comme potentiellement définitif, pas comme "va se corriger tout seul" |
| `pending_action_expired:<id>` | Une action HIGH a expiré sans décision (72h) | Etienne n'a probablement pas vu le message Telegram d'approbation — vérifier le chat, relancer manuellement si le client attend toujours |
| `vercel_runtime_error` | Erreur runtime app Next.js | `get_runtime_errors`/`get_deployment_build_logs` (MCP Vercel), corriger via `code-fixer` si reproductible |
| `worker_stale` | Dernière exécution Cloud Run > 10 min | Vérifier Cloud Scheduler (job `morax-worker-poll`, cron `* * * * *`) — pause/erreur possible. `gcloud scheduler jobs run morax-worker-poll --location europe-west1` pour forcer un tick manuel de diagnostic |

## Désarmer / modifier le cron

- Pause : `mcp__scheduled-tasks__update_scheduled_task({taskId:"morax-observability-sentinel", enabled:false})`
- Reprise : idem avec `enabled:true`
- Changer la fréquence : `update_scheduled_task` avec un nouveau `cronExpression` (utiliser `*/N * * * *`, éviter les listes `a,b * * * *` — le parser de cet outil ne les a pas gérées correctement en pratique, testé cette session)
- Voir/éditer le prompt : lire `~/.claude/scheduled-tasks/morax-observability-sentinel/SKILL.md`

## Escalade

Le sentinel ne corrige jamais lui-même. Toute anomalie confirmée réelle (pas un faux positif) →
- Bug applicatif reproductible → agent `code-fixer` (fix minimal + test TDD)
- Panne infra (Cloud Run, Scheduler, Vercel) → agent `cloudrun-deployer` ou intervention manuelle gcloud/Vercel
- Action HIGH bloquée → jamais d'approbation automatique à la place d'Etienne
