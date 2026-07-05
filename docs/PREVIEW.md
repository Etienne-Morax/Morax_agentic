# Preview & validation

Comment voir et valider une modification de l'app Morax. Deux voies : l'URL Vercel
(fiable, recommandée au quotidien) et le preview local (itération rapide).

## Principe

L'app est derrière un mur d'authentification (middleware Supabase). Une page ouverte
sans session connectée renvoie vers `/login`. C'est la raison n°1 pour laquelle un
`next dev` « ne marche jamais » : le build tourne, mais toute page protégée redirige
vers le login tant que tu n'es pas connecté.

Conséquence : on valide en priorité sur une **URL Vercel preview**, où le login prod
est confirmé fonctionnel. Le local reste dispo pour l'itération rapide une fois le
login local débloqué (voir plus bas).

## Voie 1 : URL Vercel preview (recommandée)

Le repo est connecté à Vercel via GitHub. Chaque push déclenche un déploiement.

Boucle de validation :

1. L'agent (ou toi) fait la modif et la commit.
2. Push sur la branche `preview`.
3. Vercel construit un déploiement Preview et publie une URL stable :
   `https://morax-app-git-preview-moraxs-projects-87e060cc.vercel.app`
4. Tu ouvres cette URL, tu te connectes normalement (magic-link), tu valides.
5. Une fois validé, la modif est mergée vers `main` (branche de production).

Production (uniquement après validation) : `https://morax-app.vercel.app`

Règle : les essais et validations passent par l'URL **preview**, jamais directement
par la prod.

## Voie 2 : preview local (itération rapide)

Prérequis une seule fois : autoriser localhost dans Supabase Auth (voir section
suivante), sinon le magic-link te renverra vers la prod et localhost restera
déconnecté.

Lancer en une commande depuis la racine du repo :

```bash
pnpm dev
```

Ce script construit d'abord `@morax/model-core` (sinon la lecture de
`models.registry.yaml` échoue au runtime) puis démarre `next dev` sur
`http://localhost:3000`.

Se connecter : saisir ton email sur `/login`, ouvrir le magic-link **sur le même
appareil / navigateur** que localhost.

## Débloquer le login local (à faire une seule fois)

Le formulaire de login envoie un magic-link avec redirection vers
`window.location.origin/auth/callback`, soit `http://localhost:3000/auth/callback`
en local. Supabase refuse toute redirection non listée.

Dans le dashboard Supabase (Authentication > URL Configuration ; l'emplacement exact
peut varier selon la version) :

- Redirect URLs : ajouter `http://localhost:3000/**`
- (Site URL doit rester l'URL de prod, ne pas la changer.)

Sauvegarder. Le magic-link fonctionnera alors aussi bien en local qu'en prod, avec
les mêmes données (le `.env.local` pointe déjà vers le Supabase hébergé).

## Notes plateforme

- Toute action HIGH externe (email, post, dépense, écriture tierce) reste soumise au
  gate d'approbation Telegram. Un preview ne contourne pas cette règle.
- `preview` est une branche de travail : on peut la reset/force-push sans risque pour
  la prod, puisque la prod est sur `main`.
