# Prompt : installer la configuration Claude Code autonome

But : installer dans le repo produit la configuration Claude Code "autonome par défaut" (settings.json + working agreement dans CLAUDE.md). Idempotent et non destructif.

Mode d'emploi : ouvrir le repo produit dans Claude Code, puis copier tout le bloc ci-dessous comme message.

```text
Install the standard autonomous-by-default Claude Code setup in this project.
Be idempotent and non-destructive. Make no other changes.

1. .claude/settings.json
   - If absent, create it with the SETTINGS JSON below.
   - If present, merge: set permissions.defaultMode to "acceptEdits", and add any
     missing entries from my allow/deny lists below without removing existing
     ones. Adjust the allow list to THIS project's real build/deploy commands
     if they differ, and tell me what you changed.

2. CLAUDE.md
   - If absent, create it with the CLAUDE.md BLOCK below.
   - If present, replace only the section under the heading
     "# Project Working Agreement for Claude Code" with the version below;
     preserve all project-specific content. Append it if that heading is absent.

3. Print a short summary of what you created, merged, or left untouched.

========================= SETTINGS JSON =========================
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [
      "Bash(npm run build)",
      "Bash(npm run lint)",
      "Bash(npm run dev)",
      "Bash(npm test*)",
      "Bash(npm install*)",
      "Bash(pnpm *)",
      "Bash(ls *)",
      "Bash(cat *)",
      "Bash(find *)",
      "Bash(grep *)",
      "Bash(rg *)",
      "Bash(npx supabase*)",
      "Bash(supabase *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git push*)",
      "Bash(vercel*)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force*)",
      "Bash(git push -f*)",
      "Bash(git reset --hard*)",
      "Bash(git clean -fd*)"
    ]
  }
}

========================= CLAUDE.md BLOCK =========================
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
```

## Notes

Correction apportée : ton bloc commençait par "Claude Code" alors que l'étape 2 cible le titre "# Project Working Agreement for Claude Code". J'ai aligné le bloc sur ce titre pour que le remplacement idempotent fonctionne, et j'ai mis le reste en markdown propre (titres et listes). Le texte est inchangé sur le fond.

Ajout projet : j'ai ajouté `Bash(npx supabase*)` et `Bash(supabase *)` à l'allow list, car Morax utilise les migrations Supabase. Le worker se déploie sur Cloud Run, donc tu voudras peut-être aussi `Bash(gcloud *)` ; je ne l'ai pas mis par défaut (voir l'avertissement ci-dessous).

Avertissement de sécurité (à arbitrer) : l'allow list auto-autorise `git push*` et `vercel*`, donc en régime autonome Claude Code peut pousser et déployer sans te demander. C'est en tension avec ta règle dure OpenClaw n°1 (action HIGH externe via le gate) et ton workflow git (gate avant push externe). Deux options :

- Si tu veux respecter le gate : retire `git push*` et `vercel*` de l'allow (ou limite Vercel aux previews et laisse le push/déploiement prod en validation manuelle). Idem, ne mets pas `gcloud run deploy` en auto.
- Si tu assumes l'autonomie totale sur ce repo produit en dev : garde la liste telle quelle, mais ne l'applique pas au repo `morax-os` (plateforme) où le gate doit rester strict.

Rappel : `defaultMode: acceptEdits` accepte les éditions de fichiers sans confirmation. Le deny list bloque déjà les commandes destructrices (`rm -rf`, force push, reset hard, clean).
