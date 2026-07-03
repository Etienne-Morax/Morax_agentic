-- Morax - preuve de cloisonnement RLS pour credits_ledger (feature "Modeles actifs +
-- Quota de credits", vue client). Script manuel, a executer via l'editeur SQL Supabase
-- ou `execute_sql` (MCP) sur une base non-production, ou dans une transaction annulee.
--
-- Principe : la vue client (loadClientModelsQuota) interroge credits_ledger SANS filtre
-- tenant_id explicite -- elle s'appuie entierement sur la policy RLS `cl_tenant`
-- (supabase/migrations/0001_init.sql) qui lit `current_tenant_id()` depuis le claim JWT.
-- Ce script prouve que deux tenants distincts ne voient jamais l'un les lignes de l'autre,
-- meme si la requete elle-meme ne restreint rien.
--
-- Executer dans une transaction et faire ROLLBACK pour ne rien laisser en base (voir fin).

begin;

-- ─── Fixtures : deux tenants isoles ────────────────────────────────────────────
insert into public.tenants (tenant_id, display_name, action_quota_monthly, alert_threshold_pct)
values
  ('rls-test-tenant-a', 'RLS Test Tenant A', 60, 80),
  ('rls-test-tenant-b', 'RLS Test Tenant B', 60, 80);

insert into public.credits_ledger (tenant_id, action_category, weight)
values
  ('rls-test-tenant-a', 'scan_document', 11),
  ('rls-test-tenant-b', 'scan_document', 99);

-- ─── Preuve 1 : session tenant A ne voit que ses propres lignes ───────────────
set local role authenticated;
set local request.jwt.claims = '{"tenant_id":"rls-test-tenant-a","role":"authenticated"}';

do $$
declare
  v_count int;
  v_other_tenant_visible boolean;
begin
  select count(*) into v_count from public.credits_ledger;
  select exists(
    select 1 from public.credits_ledger where tenant_id = 'rls-test-tenant-b'
  ) into v_other_tenant_visible;

  assert v_count = 1, format('tenant A devrait voir 1 ligne, en voit %s', v_count);
  assert not v_other_tenant_visible, 'tenant A ne doit JAMAIS voir les lignes du tenant B';

  raise notice 'PREUVE 1 OK : tenant A voit % ligne(s), 0 ligne du tenant B', v_count;
end $$;

reset role;

-- ─── Preuve 2 : session tenant B ne voit que ses propres lignes (symetrie) ────
set local role authenticated;
set local request.jwt.claims = '{"tenant_id":"rls-test-tenant-b","role":"authenticated"}';

do $$
declare
  v_count int;
  v_other_tenant_visible boolean;
begin
  select count(*) into v_count from public.credits_ledger;
  select exists(
    select 1 from public.credits_ledger where tenant_id = 'rls-test-tenant-a'
  ) into v_other_tenant_visible;

  assert v_count = 1, format('tenant B devrait voir 1 ligne, en voit %s', v_count);
  assert not v_other_tenant_visible, 'tenant B ne doit JAMAIS voir les lignes du tenant A';

  raise notice 'PREUVE 2 OK : tenant B voit % ligne(s), 0 ligne du tenant A', v_count;
end $$;

reset role;

-- ─── Nettoyage : jamais de fixture de test en base ─────────────────────────────
rollback;
