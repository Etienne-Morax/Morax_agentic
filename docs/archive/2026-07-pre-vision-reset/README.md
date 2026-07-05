# Archive — 2026-07 pre-vision-reset

Documents déplacés ici lors de l'audit documentaire du 2026-07-05, en préparation de la
refonte de la vision produit. Aucun de ces fichiers n'a été supprimé — déplacement
réversible uniquement (`git mv` / `mv`).

| Document | Pourquoi archivé | Remplacé par | Valeur historique | Supprimable plus tard ? |
|---|---|---|---|---|
| `PROMPT-feature-ui-modeles-quota.md` | Prompt d'instruction pour la feature « Modèles + Quota », déjà mergée sur `feat/phase1-foundations` (commit `4d3cc1d`). Prompt consommé, plus d'usage actif. | Le code lui-même (`app/src/app/(app)/admin/models-quota/`) + `docs/ETAT-IMPLANTATION.md` | Trace de la façon dont la feature a été spécifiée à l'agent | Oui, après validation explicite d'Etienne |
| `creative/morax-mascotte-prompts.md` | Exploration créative (prompts génération mascotte, variantes animales) non liée au code produit. | — (aucun remplacement, travail créatif autonome) | Référence pour de futures itérations mascotte | À la discrétion d'Etienne, pas de valeur technique |
| `creative/morax-mascotte-prompts-non-animal.md` | Exploration créative (variantes non-animales) non liée au code produit. | — | Idem | À la discrétion d'Etienne |
| `creative/morax-progression-dashboard.html` | Prototype HTML de maquette (dashboard de progression), non branché à l'app réelle. | Launchpad réel (`app/src/app/(command)/launchpad/`) si le concept a été retenu | Référence visuelle d'une itération de design | À la discrétion d'Etienne |

Aucun de ces documents n'est promu automatiquement en source de vérité. Pour toute
question sur l'état courant du produit, voir `docs/README.md` et `docs/ETAT-IMPLANTATION.md`.
