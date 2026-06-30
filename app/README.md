# @morax/app

Front Next.js (App Router) + webhooks Edge, déployé sur Vercel (région UE).

- `src/app/api/webhooks/telegram/route.ts` et `.../postmark/route.ts` : valident le secret,
  authentifient, acquittent < 1s, empilent dans pgmq. Jamais d'IA synchrone, jamais de clé LLM.
- `src/lib/webhook-core.ts` : logique d'ingestion pure et testable (deps injectées).
- `src/lib/supabase-server.ts` : clients service role (serveur uniquement) + fabrique des deps.
- `src/app/timeline/` : chemin de lecture (zéro appel IA, Supabase seul).

```bash
pnpm --filter @morax/app test        # logique webhook (sans Next)
pnpm --filter @morax/app typecheck
pnpm --filter @morax/app build       # next build (à lancer en local/CI)
```

Reste à construire (Phase 4) : timeline réelle, vue calendrier, éditeur inline, dashboard crédits.
Voir `../docs/ADR-001-architecture-cible.md`.
