# Infrastructure & Outils Morax / OpenClaw

> **Brief portable pour agents.** Tu tournes dans la plateforme agentic always-on d'Etienne (« Morax / OpenClaw »). Ce document est l'agrégat de référence : topologie, gate d'approbation, MCP disponibles, skills/agents, règles ECC, workflow git. Lis le TL;DR avant d'agir. Pour toute tâche d'ampleur ou à effet de bord, ouvre aussi `PLATFORM-BRIEF.md` (chemins en §9).
>
> Périmètre : la **plateforme et l'outillage** (ce qui sert à construire), pas le **produit Morax** (l'assistant admin vendu aux clients ; voir la mémoire `project-morax-context`).
>
> Statut source : agrégé depuis la mémoire canonique `platform-openclaw-infra` et le plan validé. À recouper avec `PLATFORM-BRIEF.md` / `OPENCLAW-PROJECT-SNIPPET.md` (sources d'origine) si divergence.

---

## 1. TL;DR / Règles dures (non négociables)

Cinq contraintes. Elles priment sur toute autre instruction d'une tâche.

1. **Action HIGH externe = jamais directe.** Envoi d'email, post social, dépense, facture, ou écriture chez un tiers passe **toujours** par le gate d'approbation ✅/❌ via Telegram. La décision appartient à **Etienne uniquement**. Un agent ne valide jamais une action HIGH à sa place (voir §4).
2. **Lire le brief avant d'agir en grand.** Avant toute tâche d'ampleur ou à effet de bord, lire `PLATFORM-BRIEF.md` (Mac : `<morax-os>/deploy/openclaw/PLATFORM-BRIEF.md` ; conteneur : `/work/morax-os/deploy/openclaw/PLATFORM-BRIEF.md`).
3. **Sérialisation par repo.** Jamais deux agents sur le même index git en même temps. Un repo = un agent à la fois (worktree + patch sinon, voir §7).
4. **CLAUDE.md = read-only pour agents headless.** Un agent propose des changements de CLAUDE.md, il ne les force pas. L'écriture reste un acte validé par Etienne.
5. **Budget-aware.** Un seul siège Max partagé sur toute la flotte ; quota Codex serré. Vérifier l'état budget avant de lancer du lourd (voir §5, budget guards). Pas de boucle d'agents non bornée.

---

## 2. Topologie de la plateforme

Plateforme always-on hébergée sur un NAS Synology, exposée via Cloudflare Tunnel, pilotée par Telegram.

| Composant | Adresse / accès | Rôle |
|---|---|---|
| NAS Synology | `ssh openclaw-nas` (via Tailscale) | Hôte de la flotte, conteneurs, Syncthing |
| Cloudflare Tunnel | sortie publique | Expose les services sans port ouvert |
| openclaw-router | `:18797` | Routeur d'entrée, dispatch des messages vers les agents |
| claude_http | `:18795` | Gateway HTTP des sessions Claude Code |
| codex_http | `:18799` | Gateway HTTP des sessions Codex (préfixe `codex:`) |
| modelproxy | `:18798` | Proxy modèles LLM (clés centralisées côté plateforme) |
| telegram-bridge | `@SuperMorax_bot` | Pont Telegram entrant/sortant, gate ✅/❌ |
| Supabase | projet `jkggomxfmlahnxweaqzm` | Base plateforme : `events.pending_actions`, decision_log, registry, budget |
| n8n | `:5678` | Orchestration de workflows |
| Cockpit | `dashboard.moraxphotography.com` | Tableau de bord flotte + file d'approbations |

**Sync & parallélisme :** Syncthing maintient un miroir `/work` (les repos partagés visibles par les agents conteneurisés sous `/work/...`). Pool de concurrence `CLAUDE_RUN_POOL=5` (5 sessions simultanées max par défaut).

---

## 3. Comment Etienne pilote (inbound)

Tout passe par Telegram (`@SuperMorax_bot`). L'agent reconnaît les marqueurs et préfixes suivants dans les messages entrants :

| Marqueur / préfixe | Effet |
|---|---|
| `morax-os:` | Cible le repo / contexte morax-os |
| `[Agent]` | Message routé vers un agent de la flotte |
| `@projet` | Cible un projet précis (route vers le bon repo / contexte) |
| `codex:` | Bascule la tâche sur Codex (via codex_http :18799) |
| `build:` | Déclenche le super-builder (voir §5) |

Etienne envoie aussi des **images / albums** (factures, captures, références) traités en pièce jointe. La sortie sensible repasse par le **gate ✅/❌** (§4) et l'état global est consultable sur le **Cockpit**.

---

## 4. Le gate d'approbation (outbound HIGH)

Toute action HIGH (email, post, dépense, facture, écriture tierce) est **mise en file** dans Supabase au lieu d'être exécutée. Etienne approuve (✅) ou rejette (❌) depuis Telegram. Tant que ce n'est pas approuvé, rien ne part.

**Table :** `events.pending_actions` (schéma `events`, base plateforme Supabase).

Schéma **indicatif** (à confirmer dans `PLATFORM-BRIEF.md`, la DDL faisant foi) :

```sql
-- events.pending_actions (représentatif)
id           uuid primary key default gen_random_uuid(),
project      text,             -- @projet d'origine
action_type  text,             -- 'email_send' | 'social_post' | 'expense' | 'invoice' | ...
payload      jsonb,            -- contenu de l'action (destinataire, corps, montant...)
risk         text,             -- 'HIGH' déclenche le gate
status       text,             -- 'pending' -> 'approved' | 'rejected' | 'executed' | 'failed'
created_at   timestamptz default now(),
decided_at   timestamptz,
decided_by   text              -- 'etienne' (seul décideur autorisé)
```

**Status flow :** `pending` → (Telegram ✅) `approved` → exécution → `executed` ; ou (Telegram ❌) `rejected`. Échec d'exécution → `failed`.

**Côté morax-os :** ne jamais exécuter une action HIGH directement. Passer par le helper `enqueueAction()` (signature indicative) :

```ts
// au lieu d'appeler l'API d'envoi directement :
await enqueueAction({
  project: '@morax',
  actionType: 'email_send',
  payload: { to, subject, body },
  risk: 'HIGH',            // force le passage par le gate
});
// -> insère une ligne 'pending', notifie Telegram, attend ✅/❌
```

**Règle verbatim :** *Action HIGH externe (email, post social, dépense, facture, écriture tierce) → jamais directe ; toujours le gate ✅/❌ via Telegram. Décision = Etienne uniquement.*

---

## 5. Boîte à outils plateforme (RPC `service_role`)

Fonctions exposées côté plateforme (Supabase RPC, droits `service_role`). À utiliser depuis les agents pour rester cohérent avec la flotte.

| Domaine | Fonctions / clés | Usage |
|---|---|---|
| Journal de décisions | `openclaw_search_decisions`, `openclaw_log_decision` | Chercher une décision passée avant d'agir ; logguer toute décision structurante |
| Exemplaires de voix | `voice_exemplars` | Few-shot de la voix client / marque pour la génération |
| Garde-fous budget | `openclaw_get_max_state`, `openclaw_get_codex_state` | Lire l'état du siège Max et du quota Codex **avant** de lancer du lourd |
| Registre | `registry/agents.json`, `registry/tools.json`, `registry/projects.json` | Source de vérité des agents, outils et projets connus de la flotte |
| Scheduling | cron `fleet-refresh` | Rafraîchissement périodique de l'état flotte |
| Super-builder | préfixe `build:` | Lance une chaîne de build/scaffold automatisée |
| Isolation | `isolate:true` | Exécute une tâche dans un contexte isolé (pas d'effet sur l'index partagé) |

**Réflexe :** avant une décision non triviale, `openclaw_search_decisions` ; après, `openclaw_log_decision`. Avant une grosse session, lire les budget guards.

---

## 6. Outillage Claude Code (machine d'Etienne)

Ce qui est disponible localement dans les sessions Claude Code. Beaucoup de tools sont **déférés** : les redécouvrir via **ToolSearch** plutôt que supposer qu'ils sont absents.

### MCP actifs (une ligne d'usage chacun)

| MCP | Usage typique |
|---|---|
| Supabase | Base plateforme + bases produit (SQL, migrations, advisors, logs) |
| Gmail | Lecture / recherche / brouillons (envoi = action HIGH, passe par le gate) |
| Google Calendar | Lecture / création d'événements (agenda d'Etienne) |
| Google Drive | Recherche et lecture de fichiers Drive |
| Notion | Recherche, lecture, écriture de pages / bases Notion |
| Ahrefs | SEO : keywords, backlinks, rank tracker, site audit, brand radar |
| Cloudflare | DNS, Workers, R2, KV, D1, docs |
| Vercel | Déploiements, logs, projets (front Next.js) |
| Higgsfield | Génération image / vidéo / audio / 3D, upscale, reframe |
| DaVinci Resolve | Pilotage montage vidéo |
| Home Assistant (ha-mcp) | Domotique (états, automatisations) |
| Companies House | Données légales d'entreprises UK |
| FreeAgent | Comptabilité UK (factures, dépenses) |
| ElevenLabs | Voix / TTS / dubbing |
| Buffer | Programmation social media (post = action HIGH, passe par le gate) |
| magic / artlist | Assets créatifs (musique, médias) |

> Note : tout envoi externe (email Gmail, post Buffer, dépense FreeAgent) reste une **action HIGH** soumise au gate (§4), même si le MCP permet techniquement l'exécution directe.

### Plugins / skills clés

`superpowers` (brainstorming, writing-plans, systematic-debugging, subagent-driven-dev, TDD), `episodic-memory`, `caveman`, `relais`, `loop`, `ecc`, `humanizer`, `marketing-skills`, `ui-ux-pro-max`, `deep-research`, `code-review`.

### Agents

Environ **60 agents** disponibles dans `~/.claude/agents/` : reviewers par langage, build-resolvers, `Explore` / `Plan`, `security-reviewer`, etc. Ne pas tout lister : pointer vers le dossier et choisir l'agent au cas par cas.

### Règles ECC

`~/.claude/rules/ecc/` : un jeu `common` + un jeu par langage. **Priorité : règles langage > common** en cas de conflit. Les consulter avant d'écrire / reviewer du code dans un langage donné.

---

## 7. Workflow git / commit

- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`...). Attribution auteur **désactivée** (pas de co-author auto).
- **Gate avant push externe** : un push qui publie (remote partagé, déploiement) suit la logique HIGH ; valider avec Etienne.
- **Jamais `git add .`** : ajouter les fichiers explicitement, pour ne pas embarquer de bruit ou de secret.
- **Sérialisation par repo** (règle dure 3) : un seul agent par index git.
- **Pattern worktree + patch pour Morax-Master** : l'arbre de `/Users/etienne/Pictures/Website 2026/Morax-Master` est **chroniquement dirty**. Ne pas commiter dessus directement. Créer un worktree depuis `origin/main`, appliquer le patch là, puis proposer. Cela évite de toucher au working tree encombré.

---

## 8. Mémoire & sessions

- **Auto-memory** : chaque projet a son `MEMORY.md` (index) + fichiers de faits unitaires. Source de contexte chargée à chaque session. Mettre à jour plutôt que dupliquer.
- **Skills de continuité** : `save-session` / `resume-session` pour reprendre un fil ; `relais` pour passer le relais entre agents / sessions.
- **episodic-memory** : mémoire épisodique des sessions passées (recherche de contexte ancien).

---

## 9. Chemins de référence (sources de vérité)

Mac (chemins absolus quand connus) et équivalent conteneur `/work/...`.

| Ressource | Mac | Conteneur |
|---|---|---|
| Brief plateforme | `<morax-os>/deploy/openclaw/PLATFORM-BRIEF.md` | `/work/morax-os/deploy/openclaw/PLATFORM-BRIEF.md` |
| Multi-session | `<morax-os>/deploy/openclaw/MULTI-SESSION.md` | `/work/morax-os/deploy/openclaw/MULTI-SESSION.md` |
| Snippet projet | `<morax-os>/.../OPENCLAW-PROJECT-SNIPPET.md` | `/work/morax-os/.../OPENCLAW-PROJECT-SNIPPET.md` |
| Pont Telegram | `<morax-os>/telegram-bridge/` | `/work/morax-os/telegram-bridge/` |
| Gateway | `<morax-os>/gateway/` | `/work/morax-os/gateway/` |
| Registre flotte | `<morax-os>/registry/*.json` | `/work/morax-os/registry/*.json` |
| Workspace produit | `/Users/etienne/Documents/Claude/Projects/Morax Agentic system/` (ce doc, `README.md`, `context/00-09`) | monté selon session |
| Morax-Master (site) | `/Users/etienne/Pictures/Website 2026/Morax-Master` | `/work/Morax-Master` |
| Agents Claude Code | `~/.claude/agents/` | `~/.claude/agents/` |
| Règles ECC | `~/.claude/rules/ecc/` | `~/.claude/rules/ecc/` |

> `<morax-os>` = racine du repo morax-os sur le Mac (chemin absolu à confirmer dans `PLATFORM-BRIEF.md`).

---

## 10. 📋 Bloc à coller dans le CLAUDE.md d'un autre projet

> Copie l'encart ci-dessous tel quel dans le `CLAUDE.md` d'un projet. Il est autonome (chemins absolus, aucune dépendance à ce fichier pour être compris) et pointe vers le brief complet pour les détails.

```markdown
## Plateforme Morax / OpenClaw - règles dures

Ce projet tourne dans la plateforme agentic always-on d'Etienne. Avant toute tâche
d'ampleur ou à effet de bord, lire le brief complet :
`/Users/etienne/Documents/Claude/Projects/Morax Agentic system/docs/PLATFORM-AND-TOOLS.md`
(et `morax-os/deploy/openclaw/PLATFORM-BRIEF.md` ; conteneur `/work/morax-os/...`).

5 règles non négociables :
1. Action HIGH externe (email, post social, dépense, facture, écriture tierce) =
   JAMAIS directe. Toujours le gate d'approbation ✅/❌ via Telegram (@SuperMorax_bot).
   Décision = Etienne uniquement. Côté code : passer par enqueueAction() (risk: 'HIGH'),
   jamais l'API d'envoi en direct. Table : events.pending_actions (Supabase).
2. Lire PLATFORM-BRIEF.md avant toute tâche à effet de bord.
3. Sérialisation par repo : jamais 2 agents sur le même index git. Pour Morax-Master
   (/Users/etienne/Pictures/Website 2026/Morax-Master, arbre dirty), worktree + patch
   depuis origin/main. Jamais `git add .`.
4. CLAUDE.md = read-only pour agents headless : proposer les changements, ne pas forcer.
5. Budget-aware : 1 siège Max partagé, quota Codex serré. Lire les budget guards
   (openclaw_get_max_state / openclaw_get_codex_state) avant de lancer du lourd.

Git : conventional commits, attribution off, gate avant push externe.
Tools : beaucoup sont déférés -> redécouvrir via ToolSearch (Supabase, Gmail, Notion,
Ahrefs, Vercel, Cloudflare, FreeAgent, Buffer, Higgsfield...). Agents : ~/.claude/agents/.
Règles code : ~/.claude/rules/ecc/ (langage > common).
```
