# worker

Orchestration asynchrone, déployée sur Google Cloud Run (Job déclenché par Cloud Scheduler, scale-to-zero, région UE).

Rôle : draine la file pgmq et exécute le pipeline déterministe (Réceptionniste, Planificateur, Exécuteur, OCR + validation humaine). Routage des modèles via le registre. Garde-fous : Max Loops, max_context, fallback borné. Rôles finance-critiques sur le cerveau.

Voir `../docs/ADR-001-architecture-cible.md`.
