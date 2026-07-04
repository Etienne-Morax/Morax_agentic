# Grille de poids par catégorie d'action — Morax Agentic System
**Version** : 2026-06 | **Devise** : GBP | **Modèle de facturation** : Mixte par catégorie

---

## Principe du modèle mixte

Chaque catégorie d'action a un poids fixe en "crédits d'action". Ce poids reflète le coût LLM réel (modèle utilisé × tokens typiques). Le client voit uniquement un compteur de crédits, jamais de tokens ni de modèles.

**Règle de nommage client** : on parle de "crédits", pas d'actions, pas de tokens. Le dashboard affiche "38 / 60 crédits utilisés ce mois."

---

## Tableau des poids par catégorie

| Catégorie | Poids | Modèle interne | Justification |
|---|---|---|---|
| **Rappel automatique** | 0,5 | micro | Simple lookup + notification, quasi-zéro LLM |
| **Classification / tagging** | 0,5 | micro | Extraction courte, output < 100 tokens |
| **Scan de document** (facture, reçu, PDF) | 1 | workhorse | OCR + extraction champs clés, ~2K in + 500 out |
| **Analyse d'email entrant** | 1 | workhorse | Parse pièces jointes + contexte, même ordre |
| **Export compta** (agrégation + format) | 1 | workhorse | Agrégation de données, peu de génération libre |
| **Résumé de situation financière** | 1,5 | workhorse + micro | Synthèse multi-documents, output moyen |
| **Brouillon de facture** | 2 | cerveau | Génération dans la voix du client, templated |
| **Relance client** | 2 | cerveau | Ton nuancé, voix client, contexte relationnel |
| **Brouillon de devis** | 3 | cerveau | Long, structuré, voix client + contexte projet |
| **Devis complexe** (plusieurs postes, négociation) | 5 | cerveau | Usage étendu du brain model, itérations |
| **Envoi de document** (devis/facture, gate HIGH) | 0,5 | aucun | Pas de LLM (relai Telegram/Postmark), poids symbolique de suivi d'usage |
| **Réponse chat** (Centre de Commandement) | 1,5 | cerveau | Peut référencer montant/échéance (garde-fou financier) ; tour court, pas une rédaction longue |

### Règle financier critique (garde-fou ADHD)
> Toute action qui lit ou produit une **date d'échéance, un montant, ou une pénalité** utilise **obligatoirement le cerveau**, quel que soit le palier du tenant. Ce surcoût est absorbé dans la marge, jamais répercuté en crédits supplémentaires.

---

## Plafonds de crédits par pack (indicatif — à calibrer sur données réelles Langfuse)

### Base "Admin Copilot" — £25/mois

**Quota inclus : 60 crédits/mois**

Scénario type d'un freelance actif :
- 15 scans de documents × 1 = 15
- 30 rappels × 0,5 = 15
- 10 emails entrants × 1 = 10
- 4 brouillons de factures × 2 = 8
- 2 résumés mensuels × 1,5 = 3
- **Total : 51 crédits → confort avec marge 15 %**

Scénario intensif (test de charge) :
- 10 brouillons de devis × 3 = 30
- 20 scans × 1 = 20
- 10 rappels × 0,5 = 5
- **Total : 55 crédits → toujours dans le quota**

### Pack Reçus/Dépenses — +£12/mois

**Crédits additionnels : +40 crédits/mois**

Justification : un freelance avec dépenses fréquentes (taxi, matériel) peut scanner 30+ reçus/mois + classifications.

### Pack Devis/Facture — +£15/mois

**Crédits additionnels : +40 crédits/mois**

Justification : devis et relances consomment 2-3 crédits chacun. Un créatif actif génère 5-8 devis/mois.

### Pack Voix — +£10/mois

**Crédits additionnels : +20 crédits/mois**

Commandes vocales transcrites avant traitement = coût marginal micro model. Quota modeste suffisant.

### Tier Premium — +£20/mois

**Pas de crédits additionnels** — bascule du modèle cerveau vers Opus 4.8 pour les tâches critiques.
Le quota reste celui du pack Base + add-ons actifs. Le surcoût modèle est absorbé dans la marge premium.

---

## Estimation de la marge brute LLM

### Tier économique (Gemini 3.1 Pro / MiniMax M2.5 / Gemini Flash-Lite)

Scénario type 60 crédits :
- 20 scans (workhorse) : 20 × ~$0.002 = $0.04
- 20 rappels (micro) : 20 × ~$0.0002 = $0.004
- 8 brouillons de factures (cerveau, 2 crédits) : 4 docs × ~$0.035 = $0.14
- 2 devis (cerveau, 3 crédits) : 2 × ~$0.060 = $0.12

**Coût LLM total estimé : ~$0.30 (~£0.24) pour 60 crédits**
**Prix plan : £25 → marge brute > 99 % sur le poste LLM**

Vraie contrainte : le temps d'onboarding et support, pas les tokens.

### Tier premium (Opus 4.8 / Sonnet 4.6 / Haiku 4.5)

Même scénario 60 crédits, cerveau = Opus :
- 4 brouillons de factures avec Opus : 4 × ~$0.10 = $0.40
- 2 devis avec Opus : 2 × ~$0.18 = $0.36

**Coût LLM total estimé : ~$1.00 (~£0.80) pour 60 crédits**
**Prix plan premium (Base + Tier Premium) : £45 → marge brute ~98 % sur LLM**

---

## Seuil d'upgrade et garde-fous

- **Alerte à 80 %** du quota : l'interface affiche "Il te reste X crédits ce mois. Passe au niveau suivant pour continuer sans interruption."
- **À 100 %** : les nouvelles demandes sont mises en file d'attente jusqu'au 1er du mois, ou l'utilisateur upgrade.
- **Jamais de dépassement silencieux** : pas de rollover automatique payant non confirmé.
- **Fallback intra-tier** d'abord (autre modèle du même palier), puis montée de palier plafonnée par quota, rejet sinon. Pas de fallback gratuit non borné.

---

## Points à calibrer après 30 jours de données Langfuse

1. Consommation réelle de tokens par catégorie (vs. estimations ci-dessus)
2. Distribution des catégories par profil d'utilisateur (freelance créatif vs. ADHD focus rappels)
3. Pic de consommation mensuel vs. usage moyen (le quota doit couvrir les pics, pas juste la moyenne)
4. Taux d'utilisation réel des crédits (si la majorité des users consomme < 50 % → quota trop généreux ou pricing trop bas)
