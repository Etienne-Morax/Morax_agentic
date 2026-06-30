# Prompt : générer le plan d'implantation Morax

But de ce fichier : prompt autonome à coller dans une session Claude Code / agent de planification pour produire le plan d'implantation technique de Morax. Il encode les décisions déjà actées (ADR-001) pour que le plan soit grimpable directement, pas réinventé.

Mode d'emploi : copier tout le bloc ci-dessous (entre les lignes de séparation). Si la skill `writing-plans` (superpowers) est disponible, l'invoquer avant de coller le prompt.

---

## PROMPT (à copier tel quel)

Tu es architecte logiciel senior. Produis le **plan d'implantation technique** du produit Morax, prêt à exécuter par une petite équipe (1 à 2 devs). N'écris pas de code ici : produis un plan.

### Style imposé
Réponds en français, structuré, concret, sans flatterie. N'utilise jamais le caractère tiret cadratin. Distingue explicitement les faits, les hypothèses et les déductions. Si une décision te manque, liste-la en « Questions ouvertes » au lieu d'inventer. Adapte-toi à un niveau technique avancé (pas d'explication des bases : webhooks, RLS, queue, YAML).

### Contexte (décisions déjà actées, ne pas rouvrir)
Source de vérité : `docs/ADR-001-architecture-cible.md` et `docs/architecture-cible-morax.svg`. Complété par `Morax_MVP_Plan_resserre.md`, `grille-actions-poids.md`, `mvp-user-stories.md`, `config/models.registry.yaml`, `config/tenant.schema.yaml`, `config/model-resolver.ts`. Lis-les avant de planifier.

Résumé exécutable :
- Produit : assistant agentic d'administration pour indépendants et PME UK (factures, reçus, échéances, devis, emails). Segment d'entrée prioritaire : profils TDAH (positionnement « zéro retard », l'humain valide toujours le paiement). Devise GBP. Marché UK.
- Phrase MVP : l'utilisateur envoie une note vocale ou une photo de facture sur Telegram ; le système la traite en tâche de fond, la transforme en micro-actions et/ou échéance, et l'affiche dans une timeline consultable sans aucun appel IA.
- 4 fonctions Base (plafond 60 crédits) : capture factures/reçus, rappels d'échéances, brouillons de devis/factures (voix client), compteur de crédits + upgrade contextuel.
- Architecture : cœur unique multi-tenant, événementiel, stateless. Webhook (valide + accuse réception en moins d'une seconde + empile, jamais d'IA synchrone) → file pgmq → worker stateless → Postgres source de vérité → lecture à zéro appel IA. Couche d'adaptateurs canaux + surcouche B2B au-dessus du même moteur.
- Pipeline déterministe (pas essaim d'agents) : Réceptionniste (Gemini Flash batch, Live API repoussée en v1.1+) → Planificateur (Claude Sonnet 4.6) → Exécuteur (DeepSeek V4-Flash via OpenRouter) → OCR (Gemini 3.5 Flash) + validation humaine. Finance-critique (date, montant, pénalité) → Cerveau Claude Opus 4.8, toujours. Aucun modèle en dur : registre YAML + eval gate Langfuse.
- Hébergement : 100 % cloud managé région UE avec DPA. Front + webhook Vercel ; Postgres + Auth + pgmq Supabase ; médias Cloudflare R2 ; worker Google Cloud Run (Job + Cloud Scheduler, scale-to-zero) ; observabilité Langfuse Cloud UE ; email entrant Postmark (alias). Le NAS OpenClaw est interne uniquement (dev, staging, agents), jamais de donnée client.
- Coûts repères : socle managé ≈ $90/mois ; coût/utilisateur ≈ $0.30 à $1.00/mois. Levier de rentabilité réel = coût humain (onboarding, capture de voix, support), pas l'infra.

### Contraintes dures (non négociables dans le plan)
1. Le webhook ne fait jamais d'IA synchrone : il valide, authentifie, accuse réception en moins d'une seconde, empile.
2. Tout rôle finance-critique passe par le cerveau (Opus 4.8) ; OCR financier avec validation humaine obligatoire avant écriture agenda.
3. RGPD : data-at-rest région UE, chiffrement au repos et en transit, tokens OAuth chiffrés, registre des sous-traitants, modèles chinois uniquement via endpoint Western-managed, modèle de DPA client.
4. Gate d'approbation des actions HIGH (envoi, dépense, écriture tierce) côté utilisateur, asynchrone non bloquant ; jamais de paiement automatique.
5. Garde-fous codés dès la Phase 1 : max_context 100k, Max Loops par job, plafond crédits par tenant, fallback borné (intra-tier → tier-up plafonné → rejet).
6. 2 fournisseurs LLM maximum au lancement. Aucun modèle en dur.
7. Multi-tenant par RLS dès le départ.
8. Repo produit séparé de la plateforme morax-os : un monorepo dédié, avec un CLAUDE.md portant les règles dures OpenClaw. Conventional commits, gate avant tout push externe.
9. Données client réelles uniquement en production (cloud managé UE). Dev et staging sur données synthétiques uniquement. Worker et observabilité de production jamais sur le NAS ; le NAS reste interne (dev/staging synthétique, agents de build).

### Ce que le plan doit contenir
Structure-le selon les 4 phases de `Morax_MVP_Plan_resserre.md` (1 Fondations + garde-fous, 2 Capture, 3 Traitement, 4 Restitution + bêta), et pour CHAQUE phase fournis :
- Objectif de la phase en une phrase.
- Tâches d'ingénierie concrètes et ordonnées (granularité : une tâche = une PR raisonnable).
- Livrables vérifiables.
- Critères d'acceptation (comment on sait que c'est fini).
- Dépendances (intra et inter-phases) et ce qui peut être parallélisé.
- Risques de la phase et parade.

Ajoute ensuite ces annexes :
- A. Schéma de données initial : tables clés et colonnes principales (tenants, users + RLS, jobs/queue pgmq, credits_ledger, documents/médias, échéances, pending_actions pour le gate HIGH, traces de coût). Indique les politiques RLS par tenant.
- B. Mise en place infra étape par étape : projet Vercel (régions UE), projet Supabase (région UE, pgmq, Auth, RLS, chiffrement), bucket Cloudflare R2 (juridiction UE), service Google Cloud Run + Cloud Scheduler pour le worker, Langfuse Cloud UE, Postmark (alias inbound), registre `models.registry.yaml` + routeur. Variables d'environnement et gestion des secrets (jamais d'appel LLM depuis l'edge ou le client).
- C. Couche modèles : intégration du routeur via registre, rôles → modèles, eval gate Langfuse (tests dorés, contrôle coût, canary 5 %), fallback borné.
- D. Facturation : implémentation des crédits selon `grille-actions-poids.md` (poids par catégorie), compteur, alerte 80 %, blocage 100 %, upgrade contextuel.
- E. Checklist RGPD et sécurité prête pour audit B2B (résidence UE, DPA par sous-traitant, chiffrement, registre, DPA client). Inclure une ligne vérifiable : worker et observabilité de production jamais sur le NAS ; aucune donnée client réelle hors production.
- F. Observabilité et eval : ce qui est tracé dans Langfuse dès le jour 1, dashboard coût par catégorie, audit COGS.
- G. Plan de bêta : 10 à 20 testeurs (profils TDAH + micro-entrepreneurs), métriques à collecter, critères de passage en v1.1.
- H. Estimation d'effort par phase (en jours-homme, fourchette basse et haute) et chemin critique.
- I. Repo et structure du projet (prérequis Phase 1) : initialiser ce dossier en repo produit (git init), monorepo `app/` (Next.js, front + webhook), `worker/` (Cloud Run), `supabase/` (migrations, RLS, pgmq), `config/` (registre modèles, resolver), `docs/` (ADR, schéma, ce prompt). Ajouter un `CLAUDE.md` avec le bloc de règles OpenClaw (voir `docs/PLATFORM-AND-TOOLS.md` section 10). Repo distinct de `morax-os` et du site `Morax-Master`. CI de base (lint, build, migrations) et stratégie de branches.
- J. Stratégie d'environnements (dev / staging / production) : pour chacun, indiquer l'hébergement, la source des données et les services. Dev : free tiers cloud (Langfuse Hobby gratuit, Supabase free, Vercel preview, Cloud Run free tier) ou NAS, données synthétiques uniquement. Staging : managé UE ou NAS, données synthétiques. Production : 100 % cloud managé UE avec DPA, Langfuse Cloud UE. Décrire la promotion entre environnements (migrations, secrets, eval gate Langfuse) et la règle dure : aucune donnée client réelle hors production, jamais sur le NAS.

### Format de sortie
Un document Markdown unique, titres clairs, tableaux quand c'est utile (tâches, critères, risques), pas de remplissage. Termine par une section « Questions ouvertes » et une section « Hypothèses retenues ».

### Hypothèses de cadrage (à confirmer ou ajuster en début de plan)
- Équipe : 1 à 2 développeurs. Si différent, ajuste l'effort et la parallélisation.
- Objectif de date de bêta fermée : à proposer en fonction de l'effort estimé, pas imposé.
- Volume cible bêta : quelques dizaines d'utilisateurs (le socle et les free tiers le couvrent).

---

## Notes d'usage

- Pour un plan exécutable par des agents, enchaîner ensuite avec une skill de type `subagent-driven-dev` ou découper les tâches du plan en issues.
- Mettre à jour ce prompt si l'ADR évolue (modèles, hébergeur, coûts).
