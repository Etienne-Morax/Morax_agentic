# Prompt agent : vue UI "Modèles actifs + Quota de crédits"

> À coller tel quel dans l'agent travaillant sur le repo Morax. Rédigé pour être exécuté selon le régime défini dans `CLAUDE.md` (plan mode = plan numéroté avant écriture ; sinon exécution directe).

---

## Rôle et objectif

Tu travailles sur la plateforme agentic Morax / OpenClaw. Ajoute à l'interface une fonctionnalité qui expose deux informations :

1. **Les modèles actuellement utilisés par le système** (quel modèle sert quelle tâche, statut).
2. **Le quota de requêtes disponible**, exprimé en **crédits du modèle mixte d'actions** (crédits consommés et restants), pas le quota infra.

Deux surfaces à couvrir avec **un composant partagé** :

- **Dashboard admin (Etienne)** : détail complet.
- **Front produit (clients SaaS)** : version réduite, sans détail infra.

## Contexte plateforme à lire AVANT de coder (obligatoire)

- Lis le brief complet : `docs/PLATFORM-AND-TOOLS.md` et `morax-os/deploy/openclaw/PLATFORM-BRIEF.md`.
- **Source de vérité du routage modèles** : `packages/model-core/` (`models.registry.yaml`, resolver, garde-fous, crédits). Aucun modèle en dur ailleurs, jamais.
- **Quota = crédits du modèle mixte d'actions** : le barème crédits/actions est défini dans `packages/model-core`. Le solde par client est stocké côté Supabase. Tu dois lire ces deux sources, pas réinventer un barème.
- Rappel des 5 règles dures : action HIGH externe jamais directe (gate d'approbation), lire le brief avant tout effet de bord, sérialisation par repo (pas de `git add .`, worktree si arbre dirty), `CLAUDE.md` en lecture seule pour agent headless (proposer, ne pas forcer), budget-aware.

## Étape 0 : Exploration (obligatoire, aucune écriture avant)

Cartographie et rapporte, sources à l'appui :

- Comment `model-core` expose la **liste des modèles actifs** et leur rôle/tâche (registry + resolver). Y a-t-il déjà une fonction/API qui renvoie l'état courant du routage ?
- Où et comment sont stockés **les crédits par tenant** dans Supabase (table `usage` / `credits` / consommation, colonnes, RLS). Comment un crédit est débité (worker ? pgmq ?).
- Structure de `app/` (Next.js) : composants UI existants, système d'auth, distinction rôle **admin vs client**, politique RLS multi-tenant.
- Existe-t-il déjà une route API interne exposant modèles ou crédits ? Réutilise plutôt que dupliquer.
- Instrumentation Langfuse : y a-t-il déjà une source d'historique/tendance de consommation exploitable ?

Livre un court récap de l'existant + le plan avant d'implémenter (respecte le régime `CLAUDE.md`).

## Périmètre fonctionnel

**Vue admin (détail complet)**
- Liste des modèles actifs : label lisible, rôle/tâche, provider, version, statut (actif / déprécié / fallback).
- Crédits : consommés et restants au global + ventilation par tenant.
- Tendance de consommation sur une période si une source existe (Langfuse ou table usage).
- État des budget guards infra en **lecture seule** (indicatif), clairement séparé des crédits produit.

**Vue client (réduite)**
- Le ou les modèles utilisés pour SES actions, en label produit lisible (aucun détail infra, aucun nom technique de provider si non pertinent).
- Crédits restants et consommés sur la période courante, avec une jauge visuelle.
- Rien qui expose les autres tenants ni la plomberie interne.

**Composant partagé** : un seul composant avec une prop de niveau de détail (`admin` | `client`) qui conditionne les sections affichées.

## Contraintes techniques

- **Lecture seule** sur les données : cette fonctionnalité n'écrit rien de sensible et ne déclenche **aucune action HIGH** ni envoi tiers.
- **RLS multi-tenant strict** : un client ne voit QUE ses propres crédits. À tester explicitement.
- **Aucune clé LLM ni secret côté edge/client**. L'agrégation modèles + crédits passe par une route serveur / API interne.
- Les modèles sont **lus depuis `model-core`**, jamais recopiés ni codés en dur dans l'UI.
- Définis explicitement la stratégie de rafraîchissement (SSR, revalidation, ou polling léger). Pas d'IA synchrone, jamais dans un webhook edge.
- Si tu ajoutes des requêtes Supabase, régénère les types TypeScript.
- Conventional commits, attribution off. Gate d'approbation avant tout push externe.

## Livrables attendus

- Route API / couche serveur qui agrège : modèles actifs (depuis `model-core`) + crédits (depuis Supabase, filtrés RLS).
- Composant UI partagé + intégration dans la vue admin et dans le front client.
- Types Supabase régénérés si nécessaire.
- Tests (unitaires sur l'agrégation, + un test de cloisonnement RLS).
- Aucune modification forcée de `CLAUDE.md` : si un changement est utile, le proposer.

## Critères d'acceptation

- La liste des modèles affichée correspond exactement au registre `model-core` (aucune valeur en dur, changer le registre change l'UI).
- Les crédits affichés correspondent au barème du modèle mixte d'actions et au solde réel du tenant.
- Vue admin : global + par tenant visibles. Vue client : uniquement le tenant courant.
- Un client A ne peut en aucun cas voir les crédits d'un client B (vérifié par test RLS).
- `build`, `lint` et tests passent.

## Vérification finale (inclure dans le rendu)

- Exécuter build + lint + tests et coller le résultat.
- Prouver le cloisonnement RLS (test ou requête montrant qu'un tenant ne lit que ses crédits).
- Vérifier la cohérence des chiffres crédits contre le registre / la table usage.
- Capture ou description des deux vues rendues (admin et client).

## À NE PAS faire

- Aucun modèle, provider ou barème de crédits codé en dur dans l'UI.
- Aucune action externe, envoi, dépense ou écriture tierce (respecter le gate HIGH).
- Pas de `git add .` ; si l'arbre est dirty, worktree + patch depuis `origin/main`.
- Aucun secret ou clé LLM exposé côté client/edge.
- Ne pas modifier `CLAUDE.md` sans proposition validée.
