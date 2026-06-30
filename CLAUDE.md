# Project Working Agreement for Claude Code

This repo has two operating regimes. Behave according to the active one.

## Default regime (fast, autonomous) - when NOT in plan mode
This is the normal state (default / acceptEdits / auto). Optimise for speed and for finishing the task.

* Make the requested change directly. No plan document, no ceremony.
* When the task is clear, keep going through to completion without stopping for confirmation: run the build and checks, and proceed to publish if that was the stated intent.
* Use a subagent only when it clearly saves context (for example a large codebase search). Otherwise do the work inline.
* Do not over-decompose a small change. Do not assign models per step here. Reasoning depth is left to the model's adaptive thinking.

## Plan regime (full discipline) - only when the human is in plan mode
When the session is in plan mode (the human pressed Shift+Tab to plan, or used /plan), apply the rigorous workflow. This is for larger or infrastructure work.

* Produce a numbered plan with explicit acceptance criteria per step (files touched, expected behaviour, how to verify). Do not edit during planning.
* Assign an executor model per step:
   * haiku : search, reading, lint, tests, formatting, mechanical edits
   * sonnet : standard implementation, refactors, glue code
   * opus : hard sub-problems only (security, concurrency, tricky logic, non-trivial architecture). Justify each opus use in one sentence.
* Flag high-complexity steps.
* After approval, execute step by step, delegating to the subagents below.

## Subagents (used mainly during plan-regime execution)
* explorer (haiku, read-only): locate and map files before edits.
* implementer (sonnet): execute well-specified steps.
* hard-solver (opus): handle steps flagged high-complexity.
* Least privilege: read-only agents get no Write, Edit, or Bash.

## Context hygiene
* Keep stable context near the top of the prompt for prompt caching.
* In plan-regime execution, suggest /clear between planning and execution.

## What this file cannot do
This is guidance, not configuration. It does not set the model, the effort level, or the permission mode. The human controls those with /model, /effort, /plan, and settings.json.

## Plateforme Morax / OpenClaw - règles dures

Ce projet tourne dans la plateforme agentic always-on d'Etienne. Avant toute tâche
d'ampleur ou à effet de bord, lire le brief complet :
`/Users/etienne/Documents/Claude/Projects/Morax Agentic system/docs/PLATFORM-AND-TOOLS.md`
(et `morax-os/deploy/openclaw/PLATFORM-BRIEF.md` ; conteneur `/work/morax-os/...`).

5 règles non négociables :
1. Action HIGH externe (email, post social, dépense, facture, écriture tierce) =
   JAMAIS directe. Toujours le gate d'approbation ✅/❌ via Telegram (@SuperMorax_bot).
   Décision = Etienne uniquement. Côté code : passer par enqueueAction() (risk: 'HIGH'),
   jamais l'API d'envoi en direct. Table : events.pending_actions (Supabase).
2. Lire PLATFORM-BRIEF.md avant toute tâche à effet de bord.
3. Sérialisation par repo : jamais 2 agents sur le même index git. Pour Morax-Master
   (/Users/etienne/Pictures/Website 2026/Morax-Master, arbre dirty), worktree + patch
   depuis origin/main. Jamais `git add .`.
4. CLAUDE.md = read-only pour agents headless : proposer les changements, ne pas forcer.
5. Budget-aware : 1 siège Max partagé, quota Codex serré. Lire les budget guards
   (openclaw_get_max_state / openclaw_get_codex_state) avant de lancer du lourd.

Git : conventional commits, attribution off, gate avant push externe.
Tools : beaucoup sont déférés -> redécouvrir via ToolSearch (Supabase, Gmail, Notion,
Ahrefs, Vercel, Cloudflare, FreeAgent, Buffer, Higgsfield...). Agents : ~/.claude/agents/.
Règles code : ~/.claude/rules/ecc/ (langage > common).

## Structure du monorepo produit

* `packages/model-core/` : registre modèles (`models.registry.yaml`), resolver, garde-fous,
  crédits, contrats de file. Source de vérité du routage. Aucun modèle en dur ailleurs.
* `worker/` : worker stateless Cloud Run (pipeline déterministe, gate HIGH, idempotence).
* `app/` : Next.js (front + webhooks edge Telegram/Postmark). Webhook : valide, acquitte
  < 1s, empile. Jamais d'IA synchrone, jamais de clé LLM côté edge/client.
* `supabase/` : migrations, RLS multi-tenant, pgmq, fonctions wrapper.
* `config/` : déplacé vers `packages/model-core/src/` (voir `config/README.md`).
