# MVP User Stories — Morax Admin Copilot (Tier Base)
**Version** : 2026-06 | **Scope** : 4 fonctions confirmées | **Stack** : Next.js / Supabase / n8n / Langfuse

---

## Périmètre confirmé du MVP

1. Capture de factures et reçus (upload + email entrant)
2. Rappels d'échéances (surfaçage humain, pas de paiement automatique)
3. Brouillons de devis et factures (dans la voix du client)
4. Compteur de crédits + écran d'usage + bouton upgrade

---

## Fonction 1 — Capture de documents

### US-1.1 — Envoi par email
**En tant que** freelance, **je peux** transférer un email contenant une facture ou un reçu à mon adresse Morax dédiée (`morax-[moncode]@morax.app`), **afin que** les champs clés (montant, date, échéance, émetteur) soient extraits automatiquement sans que je saisisse quoi que ce soit.

**Critères d'acceptation :**
- L'email entrant déclenche un webhook n8n (ou Supabase Edge Function)
- Les pièces jointes PDF/image sont extraites et transmises au workhorse (OCR + extraction)
- Les champs suivants sont identifiés : `montant`, `devise`, `date_emission`, `date_echeance`, `emetteur`, `destinataire`, `numero_document`
- Un document manquant un champ critique déclenche un flag `incomplete` (pas d'erreur silencieuse)
- Coût : 1 crédit par document traité
- Métering : 1 unité comptée dans Langfuse par tenant à la completion

**Dépendances stack :**
- n8n : workflow "email-to-document" (IMAP/webhook entrant → Supabase)
- Supabase : table `documents` avec schema défini, RLS par tenant
- LLM : workhorse via resolver de registre

---

### US-1.2 — Upload manuel
**En tant que** utilisateur, **je peux** uploader un PDF ou une image depuis l'interface web, **afin que** le document soit traité de la même manière qu'un email entrant.

**Critères d'acceptation :**
- Upload via drag-and-drop ou sélecteur de fichier dans l'app Next.js
- Formats acceptés : PDF, JPG, PNG, WEBP
- Taille max : 10 Mo par fichier
- Le traitement est identique à US-1.1 (même workflow n8n déclenché)
- L'utilisateur voit un état de traitement en temps réel : "Reçu → En traitement → Prêt"
- Coût : 1 crédit (identique à US-1.1)

---

### US-1.3 — Inbox documents
**En tant que** utilisateur, **je peux** voir tous mes documents capturés dans une inbox chronologique, **afin de** savoir ce qui a été traité, ce qui est incomplet, et ce qui est en attente.

**Critères d'acceptation :**
- Liste paginée, tri par date de capture (défaut : plus récent d'abord)
- Filtres : statut (nouveau, traité, incomplet, archivé), type (facture, reçu, devis)
- Chaque entrée affiche : émetteur, montant, date d'échéance, statut
- Click sur une entrée → vue détail avec les champs extraits + pièce jointe originale
- L'utilisateur peut corriger un champ extrait (correction sauvegardée dans Supabase)

---

## Fonction 2 — Rappels d'échéances

### US-2.1 — Détection automatique d'échéance
**En tant que** utilisateur, **je veux que** Morax détecte les dates d'échéance dans les documents capturés et crée des rappels automatiquement, **afin de** ne jamais manquer un paiement sans avoir à les saisir manuellement.

**Critères d'acceptation :**
- À chaque document traité, le champ `date_echeance` crée une entrée dans la table `reminders`
- Si `date_echeance` est absent, un flag `no_deadline_found` est posé (jamais d'invention de date)
- Le modèle utilisé pour lire la date est **obligatoirement le cerveau** (garde-fou finance critique)
- Les rappels sont créés à J-7, J-3, J-1 par défaut (configurable par utilisateur)

### US-2.2 — Notification de rappel
**En tant que** utilisateur, **je reçois** une notification avant chaque échéance, **afin d'** agir à temps.

**Critères d'acceptation :**
- Canal par défaut : email à l'adresse du compte
- Canal optionnel (v1.1) : push notification web, Slack
- Le message est en clair : "Ta facture de £340 chez Adobe UK est due le 15 juillet. Veux-tu que je te rappelle à nouveau ?"
- Le message **ne dit jamais** que Morax a payé ou va payer. L'humain valide toujours le paiement.
- Un bouton "Marqué comme payé" dans le email clôture le rappel dans l'app

### US-2.3 — Vue calendrier des échéances
**En tant que** utilisateur, **je peux** voir toutes mes échéances à venir sur une ligne de temps, **afin de** planifier ma trésorerie.

**Critères d'acceptation :**
- Vue liste (défaut) ou vue calendrier (toggle)
- Couleur : vert (> 7 jours), orange (3-7 jours), rouge (< 3 jours ou dépassé)
- Le statut "payé" est marqué manuellement par l'utilisateur, jamais déduit automatiquement

---

## Fonction 3 — Brouillons de devis et factures

### US-3.1 — Brouillon de devis en langage naturel
**En tant que** photographe indépendant, **je peux** décrire un projet en quelques phrases dans Morax, **afin d'** obtenir un brouillon de devis structuré dans ma voix professionnelle.

**Critères d'acceptation :**
- Champ de saisie libre : "Shooting portrait pour marque de mode, demi-journée, 4h studio, post-prod incluse, client à Chelsea"
- Le cerveau (brain model) génère un devis avec : intitulé de projet, postes de prestation, montants, conditions de paiement, validité
- Le brouillon respecte la charte de ton du client (exemples de voix saisis lors de l'onboarding)
- L'utilisateur peut itérer : "Ajoute une option vidéo highlights" → le devis se met à jour
- Coût : 3 crédits par devis généré (itérations dans la même session = incluses dans les 3 crédits)
- Output : texte éditable dans l'interface + export PDF ou copier-coller

### US-3.2 — Brouillon de facture depuis un devis
**En tant que** utilisateur, **je peux** demander à Morax de créer une facture à partir d'un devis accepté, **afin de** ne pas re-saisir les mêmes informations.

**Critères d'acceptation :**
- Déclenchement : "Le devis XYZ a été accepté, crée la facture"
- Le cerveau reprend les postes du devis, ajoute numéro de facture auto-incrémenté, date d'émission, conditions de paiement
- Champs obligatoires UK : TVA (si applicable), numéro de compte bancaire, conditions Net 30 (configurable)
- Coût : 2 crédits

### US-3.3 — Édition et export
**En tant que** utilisateur, **je peux** éditer le brouillon dans l'interface avant de l'exporter, **afin de** corriger sans re-générer.

**Critères d'acceptation :**
- Éditeur inline (pas de redirection vers un outil tiers)
- Export : copie texte, PDF en charte Morax (ink black / off-white), ou envoi direct par email (v1.1)
- Le document édité est sauvegardé dans Supabase avec historique des versions

---

## Fonction 4 — Compteur de crédits et écran d'usage

### US-4.1 — Dashboard d'usage
**En tant que** utilisateur, **je peux** voir en un coup d'oeil combien de crédits j'ai utilisés ce mois, **afin de** savoir si je dois modérer ou upgrader.

**Critères d'acceptation :**
- Affiché en haut du dashboard principal : "38 / 60 crédits utilisés"
- Barre de progression avec zones colorées : vert (0-70 %), orange (70-90 %), rouge (> 90 %)
- Pas de token, pas de modèle, pas d'API visible nulle part
- Le compteur se remet à zéro le 1er de chaque mois (pas de rollover)

### US-4.2 — Alerte d'upgrade contextuelle
**En tant que** utilisateur à 80 % de mon quota, **je vois** une suggestion d'upgrade non intrusive, **afin de** décider avant d'être bloqué.

**Critères d'acceptation :**
- Bandeau discret (pas de modal bloquant) : "Tu approches de ta limite. Avec le Pack Devis/Facture, tu aurais +40 crédits pour £15/mois de plus."
- L'alerte est personnalisée selon les catégories d'usage : si l'utilisateur n'utilise que des scans, on ne lui propose pas le pack Devis.
- À 100 % : les nouvelles demandes sont mises en queue + alerte claire non bloquante.

### US-4.3 — Explication des crédits
**En tant que** nouvel utilisateur, **je comprends** ce qu'est un crédit sans lire une documentation, **afin de** ne pas être perdu.

**Critères d'acceptation :**
- Au premier login : tooltip ou animation courte (< 15 secondes) : "Chaque chose que Morax fait pour toi utilise des crédits. Scanner une facture = 1 crédit. Rédiger un devis = 3 crédits."
- Un lien discret "Qu'est-ce qu'un crédit ?" dans le dashboard ouvre une modale claire avec exemples (pas de page FAQ externe)
- Le wording est toujours concret : on parle de ce que l'utilisateur voit faire, pas de technique

---

## Matrice d'acceptance globale MVP

| Fonction | Must Have | Nice to Have (v1.1) |
|---|---|---|
| Capture email | Webhook entrant, extraction, inbox | Forward automatique depuis Gmail/Outlook natif |
| Capture upload | PDF + image, drag-drop | OCR multi-langue |
| Rappels | Détection, J-7/3/1, email | Push web, Slack, marquage payé depuis email |
| Brouillons | Devis NL, facture depuis devis, édition inline | Export envoi email direct, signature numérique |
| Compteur | Barre d'usage, alerte 80 %, queue 100 % | Historique par catégorie, prévision fin de mois |

---

## Hypothèses techniques pour le sprint 1

- **Email entrant** : alias Mailgun ou Postmark → webhook → n8n. Un alias par tenant généré à l'onboarding.
- **OCR** : workhorse LLM vision (Sonnet 4.6 sur premium, MiniMax M3 sur intermédiaire) ou Tesseract local pour tier économique (à tester).
- **Métering** : chaque appel LLM déclenche un event Langfuse avec `tenant_id`, `action_category`, `credits_consumed`. Le compteur US-4.1 est une query Langfuse agrégée.
- **Voix client** : 3 à 5 exemples de devis saisis lors de l'onboarding, stockés dans Supabase, injectés dans le prompt du cerveau (few-shot).
