# Connecter ton téléphone à Morax

Deux voies existent. La première marche déjà, en production. La seconde est
installable mais a un prérequis cassé (voir réserve).

## Voie 1 — Telegram (recommandée, fonctionnelle aujourd'hui)

Bot produit : `@morax_assistant_bot`. À ne pas confondre avec `@SuperMorax_bot`
(bot de la plateforme interne OpenClaw, sans rapport avec le produit — voir
encadré §3 de `PROVISIONING-RUNBOOK.md`).

1. Ouvre Telegram sur ton téléphone, cherche `@morax_assistant_bot`.
2. Envoie `/start` (déjà fait une fois pour le tenant `morax-dev` — ton chat_id
   `5546013376` est enregistré et vérifié dans `channel_identities`).
3. Envoie une photo de facture, un PDF, ou une note vocale. Le bot accuse
   réception en moins d'une seconde et traite en tâche de fond
   (`app/src/app/api/webhooks/telegram/route.ts` → queue pgmq → worker).
4. Quand une action à risque (email, devis, facture) est prête, le bot envoie
   un message avec deux boutons ✅ / ❌. Tape pour approuver ou rejeter — rien
   ne part jamais sans cette validation (gate HIGH, table `pending_actions`).

Vérifié live (2026-07-04) : `getWebhookInfo` → `pending_update_count: 0`, pas
d'erreur, URL webhook correcte (`https://morax-app.vercel.app/api/webhooks/telegram`).

## Voie 2 — PWA (installable, réserve bloquante)

Le manifest PWA existe (`app/src/app/manifest.ts`, `start_url: /launchpad`,
icônes posées) : depuis Safari/Chrome mobile sur `https://morax-app.vercel.app`,
« Ajouter à l'écran d'accueil » installe l'app comme une icône standalone.

**Réserve connue** : le login magic-link est cassé en prod (voir commentaire
`app/src/app/manifest.ts:3` et mémoire de session). Sans login mobile
fonctionnel, l'app installée reste bloquée à l'écran de connexion. Ne pas
compter sur cette voie tant que le fix n'est pas fait (chantier séparé).

**Aussi absent aujourd'hui** : notifications push. Aucun service worker ni
web-push n'est câblé dans le repo — l'app installée n'alerte de rien tant
qu'elle n'est pas ouverte manuellement. Les rappels d'échéances et les
demandes d'approbation passent donc exclusivement par Telegram pour l'instant.

## En résumé

| | Telegram | PWA |
|---|---|---|
| Fonctionne aujourd'hui | ✅ | ⚠️ bloqué par le login |
| Notifications | ✅ (messages bot) | ❌ (pas de push) |
| Approbation actions HIGH | ✅ boutons ✅/❌ | — |
| Consultation dashboard | — | ✅ une fois login réparé |

Pour l'usage courant : **Telegram**. La PWA devient pertinente une fois le
login prod réparé et le push implémenté (voir plan de chantier séparé).
