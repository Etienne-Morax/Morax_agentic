# SPEC — Conversion de devise pour les brouillons devis/facture

Statut : **spec, non implémenté**. Décision de source de taux à prendre par
Etienne avant tout travail d'implémentation. Ce document ne modifie aucun code.

## 1. État actuel (GBP-only de fait)

Le système ne fait aucune conversion de devise. `currency` est un champ texte
libre transporté tel quel, jamais interprété comme un taux de change :

- **Schéma** : `document_drafts.currency` (`supabase/migrations/0003_document_drafts.sql:16`)
  — `text not null default 'GBP'`. `tenants.currency` (`supabase/migrations/0001_init.sql:60`)
  a le même défaut `'GBP'`.
- **Validation formulaire** : `app/src/lib/document-draft-core.ts:79` —
  `currency: z.preprocess(emptyToUndefined, z.string().length(3).optional())`.
  Seule contrainte : 3 caractères (code ISO 4217 plausible), aucune liste
  fermée, aucune conversion. `DraftFields.currency` (ligne 27) est optionnel.
- **Calcul des totaux** : `computeDraftTotals()` (`app/src/lib/document-draft-core.ts:104-113`)
  fait des opérations arithmétiques pures sur `quantity * unitPrice` — aucune
  notion de devise n'entre dans le calcul. Un devis en EUR et un devis en GBP
  sont calculés identiquement ; `currency` n'est qu'une étiquette d'affichage.
- **Finalisation** : `finalize-draft-core.ts:80,93` transporte `currency`
  telle quelle dans le payload PDF, sans validation ni conversion.
- **OCR extraction** : `worker/src/prompts.ts:7` cadre explicitement le prompt
  système sur « une facture ou un reçu **britannique** », et `prompts.ts:11`
  demande d'extraire un « code ISO 4217, ex. "GBP" ». Le prompt sait donc
  techniquement extraire n'importe quel code devise present sur le document,
  mais l'hypothèse GBP est présente jusque dans la formulation du prompt —
  pas seulement dans le schéma. Un document source en EUR ou USD serait
  probablement lu correctement (le LLM extrait ce qu'il voit), mais rien en
  aval ne convertit ce montant vers la devise du tenant, et le prompt n'est
  pas conçu/testé pour ce cas.
- **Affichage** : `timeline-core.ts:108`, `reminder-notify-core.ts:21-23`,
  `action-gate-core.ts` (`amountLabel`) concatènent `${amount} ${currency}`
  en texte brut. Aucun de ces points ne fait de conversion ni de formatage
  monétaire localisé (pas de symbole, pas de séparateur de milliers adapté).

**Conséquence concrète** : si un tenant scanne une facture fournisseur en EUR
puis émet un devis client en GBP, les deux montants coexistent dans le système
sans jamais être rendus comparables. Le champ `currency` est aujourd'hui un
simple label, pas une dimension calculée.

## 2. Ce qui n'est PAS concerné

- **Crédits/quota** (`packages/model-core/src/credits.ts` — `ACTION_WEIGHTS`,
  `PACK_CREDITS`) : unité interne (crédits), jamais exprimée en devise. Aucun
  impact de ce chantier sur la tarification Morax elle-même.
- **Coûts LLM** (`cost_traces.usd_cost`) : toujours en USD (prix du registre
  modèles), non lié à la devise du tenant. Hors périmètre.

## 3. Décision à prendre : source du taux de change

| Option | Avantages | Inconvénients |
|---|---|---|
| **A. API de taux live** (ex. exchangerate.host, Frankfurter, ECB feed) | Toujours à jour, pas de maintenance manuelle | Dépendance externe supplémentaire (disponibilité, coût, clé API) ; taux au moment de la conversion peut différer du taux à la date d'émission de la facture (question comptable/légale) |
| **B. Table de taux fixes en base** (mise à jour manuelle ou cron mensuel) | Pas de dépendance runtime ; traçable (une ligne = un taux à une date) ; cohérent avec la philosophie "worker stateless + Postgres source de vérité" du repo | Nécessite un job de mise à jour (cron pg déjà utilisé ailleurs, cf. `0004_reminder_cron.sql`) ; taux jamais "temps réel" |
| **C. Saisie manuelle par tenant** (le taux est un champ du formulaire de brouillon, comme `vat_rate`) | Zéro dépendance, zéro ambiguïté légale (le tenant assume le taux) ; cohérent avec le fait que `vat_rate` est déjà manuel | UX dégradée (l'utilisateur ADHD-friendly du produit doit chercher le taux lui-même) ; pas de garde-fou anti-erreur |

Recommandation à discuter avec Etienne : **B** est le plus cohérent avec
l'architecture existante (worker stateless, Postgres source de vérité, pas
d'appel réseau synchrone côté edge/webhook — cf. `CLAUDE.md`), mais nécessite
de trancher la fréquence de rafraîchissement et la marge de tolérance
comptable (taux du jour d'émission vs taux du jour de paiement).

## 4. Ce qu'il faudrait changer (si/quand implémenté)

1. **Schéma** : soit une table `exchange_rates (from_currency, to_currency,
   rate, valid_from)` (option B), soit un champ `document_drafts.exchange_rate`
   saisi (option C). Migration additive, ne touche pas aux tables existantes.
2. **`document-draft-core.ts`** : `computeDraftTotals()` devrait accepter une
   devise cible optionnelle (devise du tenant) et retourner un total converti
   en plus du total natif — ou bien la conversion reste un problème d'affichage
   pur (afficher les deux montants côte à côte) sans jamais toucher au calcul
   HT/TVA/TTC natif, qui doit rester dans la devise du document source pour
   rester légalement correct (une facture émise en EUR reste une facture EUR).
3. **PDF rendering** (`finalize-draft-core.ts` + le générateur PDF en aval) :
   formatage monétaire localisé par devise (symbole, position, séparateurs) —
   actuellement `${amount} ${currency}` brut partout.
4. **Crédits/pricing** : aucun changement attendu (section 2) — à confirmer
   explicitement avec Etienne si la stratégie de pricing devait un jour
   dépendre de la devise du tenant (actuellement non, crédits = unité interne
   fixe indépendante de `tenants.currency`).
5. **Affichage timeline/rappels/notifications** (`timeline-core.ts`,
   `reminder-notify-core.ts`, `action-gate-core.ts`) : mise à jour du format
   `${amount} ${currency}` si un formatage localisé est retenu.
6. **OCR** (`worker/src/prompts.ts`) : déjà correct (extrait la devise réelle
   du document source) — pas de changement nécessaire côté extraction, la
   conversion serait une étape strictement postérieure à l'OCR.
