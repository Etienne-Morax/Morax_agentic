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
