-- Morax - Centre de Commandement : historique de conversation reel pour /command.
-- Jusqu'ici CHAT_MESSAGES etait un mock statique (queries.ts) faute de table.
-- command_messages stocke les tours user/agent par tenant, RLS-scope comme le
-- reste (job_runs, pending_actions, cf. 0001_init.sql).
--
-- tenant_id n'est JAMAIS fourni par le client : il est derive cote Postgres via
-- current_tenant_id() (default sur la colonne), et la policy RLS 'with check'
-- rejette toute tentative d'insert avec un tenant_id different -- meme motif que
-- enqueue_pending_action (0008_agent_task_gate.sql), mais ici l'ecriture n'est pas
-- un raccourci HIGH-risk : un message de chat est une donnee applicative normale
-- du tenant courant (comme document ou reminder), donc pas de gate d'approbation.

create table public.command_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references public.tenants(tenant_id) on delete cascade
                default public.current_tenant_id(),
  role        text not null check (role in ('user','agent')),
  body        text not null,
  created_at  timestamptz not null default now()
);
create index command_messages_tenant_idx on public.command_messages(tenant_id, created_at);

alter table public.command_messages enable row level security;

-- Meme forme que les autres tables tenant-scoped : select/insert limites au
-- tenant courant. Pas d'update/delete cote client (un message envoye reste tel
-- quel -- coherent avec un historique de conversation).
create policy cm_select on public.command_messages
  for select using (tenant_id = public.current_tenant_id());

create policy cm_insert on public.command_messages
  for insert with check (tenant_id = public.current_tenant_id());

grant select, insert on public.command_messages to authenticated;
grant select, insert, update, delete on public.command_messages to service_role;
