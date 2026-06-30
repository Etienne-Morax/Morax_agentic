# Morax

Produit Morax : assistant agentic d'administration (factures, reçus, échéances, devis, emails) pour indépendants et PME au Royaume-Uni. Multi-tenant, événementiel, asynchrone.

## Structure (monorepo)

- `app/` : front Next.js + webhook Edge (déployé sur Vercel, région UE)
- `worker/` : orchestration asynchrone du pipeline (Google Cloud Run, Job + Cloud Scheduler)
- `supabase/` : migrations, RLS multi-tenant, queue pgmq
- `config/` : registre de modèles (`models.registry.yaml`) + resolver
- `docs/` : ADR, schéma d'infrastructure, prompts (plan d'implantation, setup Claude Code)

## Références

- Architecture cible : `docs/ADR-001-architecture-cible.md`
- Schéma infra détaillé : `docs/architecture-cible-morax.svg`
- Règles de travail des agents : `CLAUDE.md`

Repo distinct de la plateforme interne `morax-os` et du site `Morax-Master`. Aucune donnée client réelle hors production (cloud managé UE) ; jamais sur le NAS.
