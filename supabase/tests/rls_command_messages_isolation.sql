-- Morax - preuve de cloisonnement RLS pour command_messages (Centre de Commandement,
-- historique de chat /command). Script manuel, a executer via l'editeur SQL Supabase
-- ou `execute_sql` (MCP) sur une base non-production, ou dans une transaction annulee.
--
-- Principe : getChatMessages() (app/src/lib/command-center/queries.ts) interroge
-- command_messages SANS filtre tenant_id explicite -- elle s'appuie entierement sur
-- la policy RLS `cm_select` (supabase/migrations/0010_command_messages.sql) qui lit
-- `current_tenant_id()` depuis le claim JWT. Ce script prouve que deux tenants
-- distincts ne voient jamais l'un les messages de l'autre, meme si la requete
-- elle-meme ne restreint rien. Prouve aussi que l'insert (`cm_insert`) rejette
-- toute tentative d'ecrire un message pour un tenant different du tenant courant.
--
-- Executer dans une transaction et faire ROLLBACK pour ne rien laisser en base (voir fin).

begin;

-- ─── Fixtures : deux tenants isoles ────────────────────────────────────────────
insert into public.tenants (tenant_id, display_name, action_quota_monthly, alert_threshold_pct)
values
  ('rls-test-tenant-a', 'RLS Test Tenant A', 60, 80),
  ('rls-test-tenant-b', 'RLS Test Tenant B', 60, 80);

insert into public.command_messages (tenant_id, role, body)
values
  ('rls-test-tenant-a', 'user', 'Message tenant A'),
  ('rls-test-tenant-b', 'user', 'Message tenant B');

-- ─── Preuve 1 : session tenant A ne voit que ses propres messages ─────────────
set local role authenticated;
set local request.jwt.claims = '{"tenant_id":"rls-test-tenant-a","role":"authenticated"}';

do $$
declare
  v_count int;
  v_other_tenant_visible boolean;
begin
  select count(*) into v_count from public.command_messages;
  select exists(
    select 1 from public.command_messages where tenant_id = 'rls-test-tenant-b'
  ) into v_other_tenant_visible;

  assert v_count = 1, format('tenant A devrait voir 1 message, en voit %s', v_count);
  assert not v_other_tenant_visible, 'tenant A ne doit JAMAIS voir les messages du tenant B';

  raise notice 'PREUVE 1 OK : tenant A voit % message(s), 0 message du tenant B', v_count;
end $$;

reset role;

-- ─── Preuve 2 : session tenant B ne voit que ses propres messages (symetrie) ──
set local role authenticated;
set local request.jwt.claims = '{"tenant_id":"rls-test-tenant-b","role":"authenticated"}';

do $$
declare
  v_count int;
  v_other_tenant_visible boolean;
begin
  select count(*) into v_count from public.command_messages;
  select exists(
    select 1 from public.command_messages where tenant_id = 'rls-test-tenant-a'
  ) into v_other_tenant_visible;

  assert v_count = 1, format('tenant B devrait voir 1 message, en voit %s', v_count);
  assert not v_other_tenant_visible, 'tenant B ne doit JAMAIS voir les messages du tenant A';

  raise notice 'PREUVE 2 OK : tenant B voit % message(s), 0 message du tenant A', v_count;
end $$;

reset role;

-- ─── Preuve 3 : l'insert ignore un tenant_id fourni par le client ─────────────
-- Meme si un appelant malveillant essaie de forcer tenant_id dans le payload
-- d'insert, la policy `cm_insert` (with check tenant_id = current_tenant_id())
-- rejette toute ligne dont le tenant_id ne correspond pas a la session -- donc
-- tenter d'ecrire pour tenant B alors que la session est tenant A doit echouer.
set local role authenticated;
set local request.jwt.claims = '{"tenant_id":"rls-test-tenant-a","role":"authenticated"}';

do $$
begin
  begin
    insert into public.command_messages (tenant_id, role, body)
    values ('rls-test-tenant-b', 'user', 'Tentative usurpation tenant B');

    raise exception 'PREUVE 3 ECHEC : insert cross-tenant aurait du etre rejete par RLS';
  exception when insufficient_privilege or check_violation then
    raise notice 'PREUVE 3 OK : insert cross-tenant rejete par RLS (%)', sqlerrm;
  end;
end $$;

reset role;

-- ─── Nettoyage : jamais de fixture de test en base ─────────────────────────────
rollback;
