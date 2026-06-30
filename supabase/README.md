# supabase

Base de données, authentification et file d'attente (Supabase, région UE).

Contenu : migrations SQL, politiques RLS multi-tenant, queue pgmq, tables métier (tenants, users, jobs, credits_ledger, documents, échéances, pending_actions pour le gate HIGH). Chiffrement au repos. Source de vérité unique ; le chemin de lecture du produit ne fait aucun appel IA.

Migrations dans `migrations/`.
