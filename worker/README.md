# @morax/worker

Worker stateless du pipeline déterministe. Cible : Google Cloud Run (Job + Cloud
Scheduler, scale-to-zero, région UE). Draine la file pgmq puis sort.

- `src/run.ts` : orchestration pure (idempotence, Max Loops, comptabilisation crédits/coût). Testable avec des fakes.
- `src/pipeline.ts` : étages (OCR, Planificateur TDAH, brouillons). Lecture finance -> Opus, jamais d'écriture agenda sans validation humaine.
- `src/llm.ts` : client LLM, dispatch Anthropic direct / reste via OpenRouter, `assertRgpdCompliance` avant tout appel.
- `src/adapters/supabase.ts` : ports concrets (pgmq via RPC, repos, notifier Telegram).

```bash
pnpm --filter @morax/worker test
pnpm --filter @morax/worker build
```

Reste à brancher (Phase 3) : appels LLM HTTP réels, SDK Langfuse, téléchargement R2.
Voir `../docs/ADR-001-architecture-cible.md`.
