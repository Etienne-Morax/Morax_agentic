-- Morax - durcissement des grants sur fonctions SECURITY DEFINER exposees via PostgREST.
-- Suite aux advisors de securite Supabase (lints 0028/0029) post-0001.

-- current_tenant_id() : anon n'a jamais de claim tenant -> retirer son acces REST.
-- authenticated conserve EXECUTE : les policies RLS appellent cette fonction et
-- echoueraient sans le privilege. Le seul "leak" residuel (un user lit son propre
-- claim via /rpc) est sans risque (il ne revele que sa propre identite tenant).
revoke execute on function public.current_tenant_id() from anon;

-- morax_credits_consumed(text) : SECURITY DEFINER + parametre tenant_id arbitraire.
-- N'importe quel appelant (anon ou authentifie) pourrait lire le total credits de
-- N'IMPORTE quel tenant (bypass RLS). Reserver au backend (service_role). Le front
-- lit credits_ledger directement, protege par RLS (somme cote client ou vue INVOKER).
-- Note : Supabase auto-grant anon + authenticated a toute fonction du schema public,
-- d'ou la double revocation explicite.
revoke execute on function public.morax_credits_consumed(text) from anon, authenticated;
