# Carte documentaire — Morax

Point d'entrée officiel. Un nouveau lecteur devrait trouver la source de vérité en moins de
deux minutes : commencez par **État courant** ci-dessous.

## État courant (commencez ici)

| Document | Statut | Propriétaire | Dernière vérif. | Lecteurs |
|---|---|---|---|---|
| [`ETAT-IMPLANTATION.md`](ETAT-IMPLANTATION.md) | **Canonique** | Etienne | 2026-07-05 (commit `1a0c345`) | Tous — avancement réel : codé / testé / déployé / vérifié en live |
| [`PRESENTATION-PROJET-MORAX.md`](PRESENTATION-PROJET-MORAX.md) | Snapshot corrigé, pas canonique | Etienne | 2026-07-05 | Vue d'ensemble longue (vision + technique + reste à faire) — renvoie à ETAT-IMPLANTATION pour l'état courant |

## Décisions durables (ADR)

| Document | Statut | Propriétaire | Dernière vérif. | Lecteurs |
|---|---|---|---|---|
| [`ADR-001-architecture-cible.md`](ADR-001-architecture-cible.md) | Canonique | Etienne | 2026-07-05 | Développeurs — architecture cible figée du produit |
| [`../grille-actions-poids.md`](../grille-actions-poids.md) | Canonique | Etienne | 2026-07-05 | Pricing / crédits |
| [`../packages/model-core/src/models.registry.yaml`](../packages/model-core/src/models.registry.yaml) | Canonique (code) | Etienne | continu | Registre des modèles LLM — aucun modèle en dur ailleurs |
| [`PLATFORM-AND-TOOLS.md`](PLATFORM-AND-TOOLS.md) | Canonique | Etienne | 2026-07-05 | Plateforme OpenClaw (outillage interne) — **≠ produit Morax** |

## Runbooks (opératoires)

| Document | Statut | Lecteurs |
|---|---|---|
| [`PROVISIONING-RUNBOOK.md`](PROVISIONING-RUNBOOK.md) | Actif | Checklist provisioning cloud (étapes 0→10) |
| [`ONCALL-RUNBOOK.md`](ONCALL-RUNBOOK.md) | Actif | Monitoring, seuils d'alerte, escalade |
| [`PREVIEW.md`](PREVIEW.md) | Actif | Boucle de validation (Vercel preview / local) |
| [`CONNECT-PHONE.md`](CONNECT-PHONE.md) | Actif | Connexion téléphone (Telegram + PWA) |

## Journaux (historique daté, preuve — ne pas réécrire)

| Document | Nature |
|---|---|
| [`DEPLOY-JOURNAL.md`](DEPLOY-JOURNAL.md) | Journal append-only du déploiement (bugs, décisions, Go beta) |
| [`QA-SMOKE-REPORT.md`](QA-SMOKE-REPORT.md) | Rapport de smoke test E2E daté (8/8 parcours, 2026-07-03) |

## Specs actives (non implémentées ou en cours)

| Document | Statut |
|---|---|
| [`SPEC-currency-conversion.md`](SPEC-currency-conversion.md) | Spec écrite, **non implémentée** (v1.1+) |
| [`PLAN-QA-UI-UX.md`](PLAN-QA-UI-UX.md) | Plan uniquement, aucune implémentation (2026-07-04) |

## Référence (specs produit d'origine, figées)

| Document | Statut |
|---|---|
| [`../Morax_MVP_Plan_resserre.md`](../Morax_MVP_Plan_resserre.md) | **Figé** — ne décrit pas l'état courant, voir ETAT-IMPLANTATION |
| [`../mvp-user-stories.md`](../mvp-user-stories.md) | **Figé** — idem |
| [`PROMPT-plan-implantation.md`](PROMPT-plan-implantation.md) | Prompt réutilisable (génération de plan technique) |
| [`PROMPT-setup-claude-code.md`](PROMPT-setup-claude-code.md) | Prompt réutilisable (setup Claude Code) |

## Vision future

| Emplacement | Statut |
|---|---|
| [`VISION/README.md`](VISION/README.md) | Réservé, vide — accueillera la refonte de la vision produit |

## Archive

| Emplacement | Contenu |
|---|---|
| [`archive/2026-07-pre-vision-reset/`](archive/2026-07-pre-vision-reset/README.md) | Prompt de feature consommé + explorations créatives (mascotte, prototype dashboard) — voir le manifeste pour le détail |

## Autres

- Racine du monorepo : `README.md` (entrée), `CLAUDE.md` (working agreement, read-only), `AGENTS.md` (règles agents headless, read-only)
- Stubs de workspace : `app/README.md`, `worker/README.md`, `supabase/README.md`, `config/README.md`
- Agents spécialisés : `.claude/agents/*.md` (cloudrun-deployer, code-fixer, infra-email-dns, observability-sentinel, qa-e2e)
- Diagramme : `architecture-cible-morax.svg`
