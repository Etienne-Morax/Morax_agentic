# Plan : outil de contrôle UI / UX / fonctionnel (Morax)

Statut : plan uniquement, aucune implémentation. Date : 2026-07-04.
Objet : choisir et cadrer un (ou plusieurs) outil(s) qui vérifient en continu que
l'app Morax fonctionne, que les bons menus s'affichent, et que l'expérience est de
qualité. Sourcing orienté "Free for Dev" (offres gratuites / open source).

## 1. Objectif et traduction du besoin

Le besoin exprimé se décompose en trois questions testables distinctes. Aucun outil
unique ne couvre les trois correctement, d'où une approche par couches.

| Besoin exprimé | Question testable | Type d'outil |
|---|---|---|
| "Tout fonctionne bien" | Les parcours critiques passent-ils de bout en bout, en continu ? | E2E fonctionnel + monitoring synthétique + suivi d'erreurs |
| "Les bons menus sur chaque page" | La navigation et le rendu sont-ils corrects et stables ? | E2E d'assertion + régression visuelle |
| "Expérience de qualité / confort" | Accessibilité, performance, comportement réel des utilisateurs | Accessibilité + performance + session replay / heatmaps |

## 2. Ce qui existe déjà (pour ne pas dupliquer)

Fait (vérifié dans le repo) :

- CI GitHub Actions (`.github/workflows/ci.yml`) : lint, typecheck, tests unitaires,
  build, plus un job Supabase (migrations + advisors). Aucune couche navigateur / E2E.
- Smoke E2E existant (`docs/QA-SMOKE-REPORT.md`) : niveau API/SQL/worker (RLS,
  idempotence pgmq, TTL, OCR live, envoi HIGH), et un smoke navigateur très léger
  (`GET /login` 200, `GET /` 307). Pas de clic réel dans l'UI rendue.
- Boucle de validation (`docs/PREVIEW.md`) : modif -> branche `preview` -> URL Vercel
  preview -> login magic-link -> validation. Jamais localhost pour valider.

Conclusion : la couche manquante est précisément le test de l'UI rendue (clics,
menus, formulaires, régression visuelle, accessibilité) et sa surveillance en prod.
Ce plan comble ce trou, il ne refait pas le smoke API existant.

## 3. Le verrou à trancher en premier : le mur d'authentification

Fait : l'app est derrière un middleware Supabase. Toute page protégée sans session
redirige vers `/login` (`docs/PREVIEW.md`). Le login se fait par magic-link (email).

Déduction (hypothèse à confirmer) : un test navigateur headless ne peut pas cliquer
un lien reçu par email. Sans stratégie d'auth de test, tout E2E se limitera à
`/login` et aux redirections, donc ne testera aucun menu applicatif réel.

Options à décider avant tout le reste :

1. Session injectée : créer un utilisateur de test et injecter une session Supabase
   valide (`storageState` Playwright construit depuis un JWT signé côté serveur de
   test / service role, jamais côté client). Recommandé : réaliste et réutilisable.
2. Bypass d'auth limité à l'environnement preview (variable d'env dédiée). Plus
   simple, mais élargit la surface d'attaque : à cadrer strictement.
3. Provider de test (magic-link "auto-consommé" via un endpoint de test protégé).

Tant que ce point n'est pas tranché, les couches 1 à 3 ci-dessous restent bloquées
sur la partie authentifiée.

## 4. Modèle en 5 couches et sélection d'outils (Free for Dev)

Statut des offres : "fait" = offre gratuite vérifiée en juillet 2026 ; "stable" =
open source gratuit de longue date ; "à vérifier" = à confirmer, varie selon le plan.

| Couche | Rôle | Outil recommandé | Offre gratuite | Statut |
|---|---|---|---|---|
| 1. E2E fonctionnel | Clics, navigation, menus, formulaires | Playwright | Open source, illimité | stable |
| 2. Régression visuelle | Le rendu ne casse pas, menus présents | Playwright `toHaveScreenshot` (natif), sinon Argos CI | Natif gratuit ; Argos free tier + OSS | fait |
| 3. Accessibilité + perf | Confort, WCAG, vitesse, SEO | Lighthouse CI + axe-core (`@axe-core/playwright`) ou Pa11y | Open source, gratuit | stable |
| 4. Monitoring synthétique (prod) | "Tout fonctionne en continu" | Checkly (Playwright-natif, monitoring as code) | Hobby : ~10 000 checks API + ~1 500 checks navigateur / mois | fait |
| 5. RUM (utilisateurs réels) | Erreurs + confort réel | Sentry (erreurs) + Microsoft Clarity ou PostHog (replay/heatmaps) | Sentry Dev 5k erreurs/1 user ; Clarity illimité gratuit ; PostHog 5 000 replays + 1M events/mois | fait |

Alternatives notables du même écosystème (si besoin ultérieur) :

- Cross-navigateur réel (Safari/WebKit, mobile physique) : BrowserStack / LambdaTest /
  Sauce Labs, free tiers limités (statut à vérifier). Playwright couvre déjà
  Chromium, Firefox et WebKit en local, souvent suffisant.
- Alternatives E2E : Cypress (runner OSS gratuit, cloud gratuit pour l'open source),
  TestCafe (OSS). Playwright reste le meilleur choix stratégique ici (voir §5).
- Uptime simple : UptimeRobot, Better Stack (free tiers, statut à vérifier). Redondant
  si Checkly est en place ; utile comme filet basique si Checkly n'est pas retenu.

## 5. Stack recommandée pour Morax (minimale, budget-aware)

Principe directeur : écrire les parcours une seule fois en Playwright, puis les
réutiliser en CI (couches 1 à 3) et en monitoring prod (couche 4, Checkly est
Playwright-natif). Un seul langage de test, zéro réécriture, pas de lock-in.

Pile de départ (toutes offres gratuites) :

1. Playwright dans le monorepo (dossier `e2e/` ou dans `app/`), lancé en CI contre
   l'URL Vercel preview. Couvre E2E fonctionnel + visuel natif + accessibilité axe.
2. Lighthouse CI en job CI : budgets perf / accessibilité / SEO / best practices.
3. Checkly (free tier) : surveille en prod les parcours critiques (login, dashboard,
   vue `pending_actions`), réutilise les specs Playwright, alerte en cas d'échec.
4. Sentry (free) pour les erreurs runtime + Microsoft Clarity (gratuit illimité) ou
   PostHog EU pour le replay/heatmaps (confort utilisateur réel).

Options d'upgrade différées, seulement si un besoin apparaît :

- Argos CI : revue visuelle dans les PR si la gestion des baselines Playwright devient
  pénible (approbation/rejet des diffs dans l'interface, plus confortable en solo).
- BrowserStack / LambdaTest : si un bug spécifique Safari/mobile réel doit être
  reproduit hors des moteurs Playwright.

## 6. Intégration avec l'architecture Morax

- Emplacement : tests dans le monorepo (`e2e/`), versionnés avec l'app. Cohérent avec
  le "monitoring as code" de Checkly.
- Cible des tests : de préférence l'URL Vercel preview déjà déployée (fidèle au edge
  middleware et au vrai rendu). Alternative plus rapide mais moins fidèle : `next
  start` dans le job CI. À trancher (voir §8, point 2).
- Déclenchement CI : nouveau job `e2e` dans `ci.yml`, sur `pull_request` et sur push
  `preview`. Idéalement après le déploiement preview Vercel (via `deployment_status`)
  pour tester le rendu réel.
- Alertes : Checkly et Sentry peuvent router vers le bot Telegram existant
  (`@SuperMorax_bot`) ou par email. À distinguer du gate d'approbation : une alerte de
  monitoring est une notification, pas une action HIGH.
- Gate et effets de bord : l'outillage de test ne réalise aucune action HIGH Morax.
  En revanche, tout push de configuration (CI, specs, secrets Checkly/Sentry) reste
  une action externe soumise au gate d'approbation, via la branche `preview`.
- Données de test : réutiliser la convention `test-*` déjà en place (tenants
  `test-alpha`/`test-beta`), avec purge en fin de run, comme le smoke actuel.

## 7. Budget et coûts réels

Fait : Playwright, Lighthouse CI, axe-core, Pa11y sont open source et gratuits.
Checkly, Sentry, Clarity, PostHog ont des offres gratuites vérifiées (§4).

Points de coût cachés à surveiller :

- Minutes GitHub Actions sur repo privé (les runs navigateur consomment plus que le
  lint/typecheck actuel). À vérifier contre le quota du plan.
- Volume de checks Checkly : le free tier suffit pour quelques parcours à fréquence
  raisonnable ; une fréquence trop élevée épuise le quota mensuel.
- Cohérent avec la contrainte "budget-aware" et le siège Max partagé : aucun de ces
  outils n'ajoute de coût LLM ni ne touche le quota Codex.

## 8. Points de décision ouverts (à trancher avant implémentation)

1. Stratégie d'auth de test (§3) : session injectée, bypass preview, ou provider de
   test ? C'est le verrou principal.
2. Cible des tests : URL preview déployée (fidèle) vs `next start` en CI (rapide) ?
3. Résidence des données du RUM : PostHog EU vs Microsoft Clarity vs Sentry région EU.
   Contrainte : préférence hébergement UE et charte Morax stricte sur les données.
4. Consentement RGPD et masquage PII pour le session replay (obligatoire si Clarity /
   PostHog est retenu sur des écrans authentifiés).
5. Périmètre des parcours critiques à couvrir en premier (proposition : login ->
   dashboard -> navigation menus -> vue des actions en attente).
6. Cross-navigateur réel nécessaire (Safari/mobile physique) ou moteurs Playwright
   suffisants ?

## 9. Séquencement proposé (sans implémentation)

- Phase A : trancher §8 points 1 et 2 (auth de test + cible).
- Phase B : E2E fonctionnel Playwright sur les parcours critiques.
- Phase C : régression visuelle (natif) + accessibilité (axe) sur les mêmes parcours.
- Phase D : Lighthouse CI (budgets perf/a11y/SEO).
- Phase E : Checkly (réutilise Phase B) + alertes Telegram.
- Phase F : Sentry + Clarity/PostHog pour erreurs et confort réel.

Chaque phase se valide sur l'URL preview, chaque push de config passe par le gate.

## 10. Sources

- Free for Dev (liste des offres gratuites) : https://github.com/ripienaar/free-for-dev
- Checkly (free tier, Playwright-natif) : https://www.checklyhq.com/pricing/
- Argos CI (régression visuelle, OSS, free tier) : https://argos-ci.com/pricing
- Sentry (plan Developer gratuit) : https://sentry.io/pricing/
- Microsoft Clarity (gratuit illimité) : via comparatif PostHog https://posthog.com/blog/best-microsoft-clarity-alternatives
- PostHog (plan gratuit, replay/analytics) : https://posthog.com/blog/posthog-vs-sentry
- Playwright (open source) : https://www.vervali.com/blog/is-playwright-free-what-playwright-actually-costs-in-2026/
