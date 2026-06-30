# app

Front Next.js + webhook Edge, déployé sur Vercel (région UE).

Rôle : interface de restitution (Web View read-only, compteur de crédits) et webhook d'ingestion qui valide, accuse réception en moins d'une seconde et empile dans la file. Jamais d'appel IA synchrone ici.

Voir `../docs/ADR-001-architecture-cible.md`.
