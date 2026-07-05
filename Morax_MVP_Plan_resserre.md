# Morax, Plan MVP resserré (v2)

Date : 30 juin 2026
Statut : **Figé** — plan d'origine du MVP, accepté et globalement implémenté. Ne décrit pas
l'état courant du système ; voir `docs/ETAT-IMPLANTATION.md` pour l'avancement vérifié.
Conservé comme référence historique de la décision de périmètre.
Principe directeur : un MVP doit tenir en une phrase exécutable. Tout le reste est de la v1.1+.

---

## 0. La phrase MVP

> L'utilisateur envoie une note vocale ou une photo de facture sur Telegram. Le système la traite en tâche de fond, la transforme en liste de micro-actions et/ou en échéance, et l'affiche dans une timeline consultable sans aucun appel IA.

Tout ce qui ne sert pas directement cette phrase est repoussé.

---

## 1. Périmètre : ce qui entre, ce qui sort

Aligné sur les 4 fonctions Base déjà actées.

### Dans le MVP (tier Base, plafond 60 crédits)
1. Capture factures/reçus (upload Telegram + email entrant via alias Mailgun/Postmark).
2. Rappels d'échéances (surfaçage humain, jamais de paiement automatique).
3. Brouillons de devis et factures (voix client via few-shot onboarding).
4. Compteur de crédits + écran usage + bouton upgrade contextuel.
5. Brain dump vocal court (limite assumée, voir contrainte Telegram ci-dessous) découpé en micro-tâches < 5 min.

### Repoussé en v1.1+ (à ne pas construire maintenant)
- Multi-fournisseurs simultanés (4 providers). On démarre avec 2 fournisseurs max.
- Connecteur email Pub/Sub Google Cloud (remplacé par alias Mailgun/Postmark, plus simple).
- Condensation de contexte périodique (inutile tant que les historiques sont courts).
- Body double virtuel avancé. Un rappel cron simple suffit au départ.
- Mini-app riche. On commence par une Web View read-only minimale.

---

## 2. Correction des modèles (vérifié le 30 juin 2026)

| Rôle | Modèle dans l'ancien plan | À utiliser | ID API |
|---|---|---|---|
| Réceptionniste (audio natif temps réel) | Gemini 3.5 Flash | Gemini 2.5 Flash Live (variante Live API) | `gemini-2.5-flash-live` |
| Transcription/structuration simple | Gemini 3.5 Flash | Gemini 3.5 Flash | `gemini-flash-latest` |
| Analyseur TDAH (découpage tâches) | Claude Sonnet 4.7 (inexistant) | Claude Sonnet 4.6 | `claude-sonnet-4-6` |
| Rôles finance-critiques (deadline, montant) | non spécifié | Claude Opus 4.8 (cerveau) | `claude-opus-4-8` |
| Exécuteur brouillons | DeepSeek V4-Flash / Qwen 3.7-Plus | DeepSeek V4-Flash (via OpenRouter, Western-managed) | `deepseek-v4-flash` |
| Condensation (repoussé) | Gemini 3.1 Flash-Lite | Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite` |

Notes :
- Claude Sonnet 4.7 n'existe pas. Dernier Sonnet = 4.6.
- L'audio temps réel "latence quasi nulle" exige la variante Live API, pas le Flash standard.
- `deepseek-chat` / `deepseek-reasoner` sont retirés le 24 juillet 2026 : utiliser directement `deepseek-v4-flash`.
- Rappel RGPD déjà acté : DeepSeek et modèles chinois uniquement via endpoint Western-managed (OpenRouter, Azure AI Foundry, Alibaba Singapour). Jamais de donnée finance/visage/email via endpoint chinois direct.
- Aucun modèle en dur : tout passe par le registre `models.registry.yaml` (décision déjà actée).

---

## 3. Les deux trous structurants à combler dès la Phase 1

### 3.1 Couche queue + worker (le trou principal de l'ancien plan)

Problème : les Edge Functions Vercel ont un timeout court et ne peuvent pas exécuter une chaîne multi-agents sur un brain dump vocal. L'ancien plan revendiquait "asynchrone" sans jamais décrire le mécanisme.

Solution MVP :
- L'Edge Function (webhook Telegram) ne fait que **valider, accuser réception et empiler un job**. Elle répond en moins d'une seconde.
- Un worker de fond consomme la file et exécute l'orchestration multi-agents (longue, tolérante au temps).

Choix de file recommandé pour rester dans la stack Supabase :
- **Option A (recommandée MVP)** : Supabase Queues (pgmq) + un worker déclenché par Cron Supabase ou un service worker dédié. Tout reste dans Postgres, zéro infra en plus.
- Option B : Upstash QStash (HTTP-based, simple, gratuit au début) si tu veux découpler du DB.

Règle : le webhook ne traite jamais l'IA en synchrone. Il empile, point.

### 3.2 Observabilité (absente de l'ancien plan, déjà actée en mémoire)

Tu avais déjà tranché Langfuse comme eval gate. Il doit être présent dès le jour 1, pas après.
- Chaque appel LLM tracé dans Langfuse : modèle, tokens in/out, coût, latence, rôle.
- Dashboard coût par catégorie (aligné sur la grille de crédits).
- Sans ça, l'audit COGS de la Phase 6 est aveugle et le contrôle Max Loops est invérifiable.

---

## 4. Plan d'exécution resserré (4 phases au lieu de 6)

### Phase 1, Fondations + garde-fous (la plus importante)
- Projet Vercel (Next.js) + Supabase (Postgres) + bucket R2.
- Supabase Auth.
- **Supabase Queues (pgmq) + worker de fond.**
- **Langfuse branché sur tous les appels LLM.**
- **Registre `models.registry.yaml` + routeur qui le lit.**
- **Garde-fous codés d'emblée** : `max_context_tokens_per_call: 100000`, Max Loops par job, plafond crédits par utilisateur, fallback intra-tier puis tier-upgrade plafonné puis reject.
- **RGPD** : endpoints région UE, chiffrement des tokens OAuth au repos, table sous-traitants/régions.

### Phase 2, Capture
- Bot Telegram (BotFather).
- Webhook Edge Function : valide + empile + accuse réception (< 1 s).
- Téléchargement médias vers R2 (audio + image).
- **Contrainte assumée** : l'API Bot Telegram plafonne le téléchargement (around 20 Mo). Le brain dump "sans limite" est donc borné côté plateforme. Soit on documente la limite (around 10 à 15 min d'audio), soit on découpe l'enregistrement. Ne pas promettre l'illimité.

### Phase 3, Traitement (le worker)
- Routeur via registre YAML, 2 fournisseurs max au départ.
- Réceptionniste : audio Live API -> JSON structuré.
- Analyseur TDAH (Sonnet 4.6) : macro-tâche -> micro-actions < 5 min.
- Exécuteur (DeepSeek V4-Flash via OpenRouter) : extraction d'entités, brouillons.
- OCR factures/amendes (Gemini 3.5 Flash) **avec validation humaine obligatoire avant écriture agenda** (une date mal lue = paiement raté).
- Rôles finance-critiques routés sur le cerveau (Opus 4.8), jamais sur un modèle micro.

### Phase 4, Restitution + lancement

Deux surfaces, pas une seule :

- **Consultation (read-only, zéro IA)** : timeline inversée, cartes, estompage des éléments terminés.
  - **Caching sémantique** : la consultation lit uniquement Supabase, zéro appel IA (déjà acté, bon réflexe).
- **Centre de Commandement** (shell `(command)`, PWA `start_url: /launchpad`) : trois onglets.
  - **Launchpad** : grille de raccourcis prédéfinis (scanner un document, relancer un impayé, générer un devis, vérifier les échéances, résumé du jour...). Chaque raccourci déclenche une action HIGH via le gate `pending_actions` — ce n'est donc pas du read-only pur, l'approbation Telegram reste obligatoire avant exécution.
  - **Operations** : feed des `job_runs` en cours/terminés.
  - **Commande** : interface de chat.
- Compteur de crédits + écran usage.
- Rappels via Cron Supabase (body double simple).
- Bêta fermée 10 à 20 testeurs (profils TDAH + micro-entrepreneurs).
- Audit COGS via les traces Langfuse (pas de simulation à l'aveugle).

---

## 5. Ce que ce plan change par rapport à l'ancien

| Sujet | Ancien plan | Plan resserré |
|---|---|---|
| Nombre de phases | 6 | 4 |
| Fournisseurs LLM au lancement | 4 simultanés | 2 max |
| Traitement async | revendiqué, non décrit | queue pgmq + worker explicite |
| Observabilité | absente | Langfuse dès le jour 1 |
| Registre de modèles | absent | `models.registry.yaml` |
| RGPD | absent | endpoints UE + chiffrement tokens dès Phase 1 |
| Email entrant | Pub/Sub Google Cloud | alias Mailgun/Postmark |
| OCR financier | écriture directe | validation humaine avant agenda |
| Modèle Sonnet 4.7 | inexistant | Sonnet 4.6 |
| Audio temps réel | Flash standard | variante Live API |
| Note vocale | "sans limite" | bornée (contrainte Telegram assumée) |
| Restitution | Web View read-only seule | + Centre de Commandement (Launchpad/Operations/Commande), déjà bâti en code, PWA `/launchpad` |

---

## 6. Risques résiduels à surveiller

- **Coût Live API audio** : le natif temps réel est plus cher que la transcription batch. À bencher avant de le généraliser.
- **Latence worker** : un brain dump long peut prendre 30 à 60 s de traitement. Prévoir un message "je travaille dessus" côté Telegram pour éviter l'angoisse d'attente (pertinent pour un public TDAH).
- **Refresh tokens OAuth** : gestion de l'expiration et du re-consentement non triviale, à ne pas sous-estimer.
- **Qwen 3.7-Plus** : disponible mais API-only via Alibaba. Garder en candidat eval, pas en dépendance MVP.
