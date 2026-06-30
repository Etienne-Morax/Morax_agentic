# config/ (déplacé)

Les fichiers de configuration modèle ont été déplacés dans le paquet partagé
`@morax/model-core` pour être importables par le worker et l'app :

- `config/models.registry.yaml` -> `packages/model-core/src/models.registry.yaml`
- `config/tenant.schema.yaml` -> `packages/model-core/src/tenant.schema.yaml`
- `config/model-resolver.ts` -> `packages/model-core/src/model-resolver.ts` (réécrit :
  épinglage finance vers Opus, endpoints via OpenRouter, chargement YAML typé)

Le registre reste la source de vérité unique du routage. Aucun identifiant de modèle
n'est codé en dur hors de ce YAML.
