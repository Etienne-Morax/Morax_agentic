# Morax

Produit Morax : assistant agentic d'administration (factures, reçus, échéances, devis, emails) pour indépendants et PME au Royaume-Uni. Multi-tenant, événementiel, asynchrone.

## Structure (monorepo pnpm)

- `app/` : front Next.js + webhooks Edge Telegram/Postmark (Vercel, région UE)
- `worker/` : worker stateless du pipeline déterministe (Google Cloud Run, Job + Cloud Scheduler)
- `packages/model-core/` : registre de modèles (`models.registry.yaml`), resolver, garde-fous, crédits, contrats de file
- `supabase/` : migrations, RLS multi-tenant, queue pgmq, fonctions wrapper
- `config/` : déplacé vers `packages/model-core/src/` (voir `config/README.md`)
- `docs/` : ADR, schéma d'infrastructure, prompts (plan d'implantation, setup Claude Code)

## Développement

Prérequis : Node 22+, pnpm 11.

```bash
pnpm install
pnpm --filter @morax/model-core build   # émet les types partagés
pnpm -r typecheck
pnpm -r test
pnpm lint
```

Variables d'environnement : copier `.env.example` vers `.env.local`. Les clés LLM ne
vivent que dans le worker, jamais côté edge ou client.

Base de données locale : `supabase start` applique `supabase/migrations/` et le seed
synthétique (`supabase/seed.sql`). Données synthétiques uniquement hors production.

## État d'avancement (Phase 1)

Fondations posées et vérifiées : `packages/model-core` (resolver + garde-fous + crédits,
27 tests), `worker` (orchestration, idempotence, Max Loops, gate HIGH, 5 tests),
webhooks edge `app` (validation + empilage < 1s, 5 tests), migrations Supabase
(schéma multi-tenant + RLS + pgmq). Le provisioning cloud (Supabase, Vercel, Cloud Run,
R2, Langfuse, Postmark) et les appels LLM réels restent à brancher (Phases 2 à 4).

## Références

- Architecture cible : `docs/ADR-001-architecture-cible.md`
- Schéma infra détaillé : `docs/architecture-cible-morax.svg`
- Règles de travail des agents : `CLAUDE.md`

Repo distinct de la plateforme interne `morax-os` et du site `Morax-Master`. Aucune donnée client réelle hors production (cloud managé UE) ; jamais sur le NAS.
