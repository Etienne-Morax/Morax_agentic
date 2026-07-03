-- Morax - introduit un role admin explicite sur public.users.
-- Necessaire pour la vue admin "Modeles actifs + Quota de credits" (agregat tous
-- tenants) : elle passe TOUJOURS par service_role cote serveur (jamais par une RLS
-- avec tenant_id fourni par le client, cf. 0002_tighten_function_grants.sql), mais
-- l'acces a cette route serveur doit d'abord verifier que l'appelant est admin.
--
-- 'owner' reste le role tenant par defaut (proprietaire de SON tenant, aucun acces
-- cross-tenant). 'admin' est reserve a l'operateur plateforme (Etienne) et ne
-- donne PAS de droit RLS supplementaire : seule la couche serveur qui verifie
-- explicitement role='admin' avant d'utiliser service_role en tient compte.

alter table public.users
  add constraint users_role_check
    check (role in ('owner','admin','member'));

-- Promotion du seul utilisateur plateforme existant (etienne0moreau@gmail.com,
-- tenant morax-dev) au role admin. Aucun autre tenant n'est affecte.
update public.users
  set role = 'admin'
  where tenant_id = 'morax-dev';
