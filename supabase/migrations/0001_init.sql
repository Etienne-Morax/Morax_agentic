-- Morax - migration initiale.
-- Multi-tenant par RLS des le depart. Source de verite Postgres.
-- Le worker (service_role) bypasse la RLS mais filtre TOUJOURS par tenant_id.

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pgmq;        -- file de jobs

-- ─── Fonction d'isolation tenant ──────────────────────────────────────────────
-- Lit le tenant de l'utilisateur Auth courant. Null hors session Auth -> RLS deny.
create or replace function public.current_tenant_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.users where id = auth.uid()
$$;

-- ─── Tables ───────────────────────────────────────────────────────────────────

create table public.tenants (
  tenant_id              text primary key,
  display_name           text,
  email                  text,
  locale                 text not null default 'en-GB',
  currency               text not null default 'GBP',
  offre                  text not null default 'base'
                           check (offre in ('base','intermediaire','premium')),
  model_policy           text not null default 'latest'
                           check (model_policy in ('latest','pinned')),
  fallback_quota         boolean not null default true,
  action_quota_monthly   integer not null default 60,
  alert_threshold_pct    integer not null default 80,
  quota_exceeded_behavior text not null default 'queue'
                           check (quota_exceeded_behavior in ('queue','reject')),
  packs_actifs           jsonb not null default '["base"]'::jsonb,
  brand_name             text,
  brand_tagline          text,
  data_region            text not null default 'eu-west',
  gdpr_dpa_signed        boolean not null default false,
  personal_data_consent  boolean not null default false,
  created_at             timestamptz not null default now()
);

create table public.users (
  id          uuid primary key,                 -- = auth.uid()
  tenant_id   text not null references public.tenants(tenant_id) on delete cascade,
  email       text,
  role        text not null default 'owner',
  created_at  timestamptz not null default now()
);
create index users_tenant_idx on public.users(tenant_id);

create table public.channel_identities (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references public.tenants(tenant_id) on delete cascade,
  channel     text not null check (channel in ('telegram','email')),
  external_id text not null,                     -- chat_id Telegram ou alias email
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (channel, external_id)
);
create index channel_identities_tenant_idx on public.channel_identities(tenant_id);

create table public.documents (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               text not null references public.tenants(tenant_id) on delete cascade,
  source                  text not null check (source in ('telegram','email','upload')),
  media_key               text,                  -- cle R2
  mime                    text,
  status                  text not null default 'received'
                            check (status in ('received','processing','extracted','incomplete','validated','archived')),
  extracted               jsonb,
  needs_human_validation  boolean not null default false,
  created_at              timestamptz not null default now()
);
create index documents_tenant_idx on public.documents(tenant_id, created_at desc);

create table public.job_runs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text not null references public.tenants(tenant_id) on delete cascade,
  type             text not null,
  status           text not null default 'running'
                     check (status in ('running','done','error')),
  attempts         integer not null default 1,
  idempotency_key  text not null,
  error            text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  unique (tenant_id, idempotency_key)            -- idempotence
);
create index job_runs_tenant_idx on public.job_runs(tenant_id, started_at desc);

create table public.reminders (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null references public.tenants(tenant_id) on delete cascade,
  document_id  uuid references public.documents(id) on delete set null,
  due_date     date not null,                    -- ecrit seulement apres validation humaine
  amount       numeric(12,2),
  currency     text not null default 'GBP',
  status       text not null default 'pending'
                 check (status in ('pending','paid','dismissed')),
  notify_j7    boolean not null default true,
  notify_j3    boolean not null default true,
  notify_j1    boolean not null default true,
  channel      text not null default 'telegram',
  created_at   timestamptz not null default now()
);
create index reminders_tenant_due_idx on public.reminders(tenant_id, due_date);

create table public.pending_actions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null references public.tenants(tenant_id) on delete cascade,
  action_type  text not null check (action_type in ('send_email','expense','third_party_write')),
  risk         text not null default 'HIGH' check (risk in ('HIGH')),
  payload      jsonb not null,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected','executed','expired')),
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   text
);
create index pending_actions_tenant_idx on public.pending_actions(tenant_id, status);

create table public.credits_ledger (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null references public.tenants(tenant_id) on delete cascade,
  action_category   text not null,
  weight            numeric(6,2) not null,
  job_run_id        uuid references public.job_runs(id) on delete set null,
  langfuse_trace_id text,
  created_at        timestamptz not null default now()
);
create index credits_ledger_period_idx on public.credits_ledger(tenant_id, created_at);

create table public.cost_traces (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null references public.tenants(tenant_id) on delete cascade,
  job_run_id        uuid references public.job_runs(id) on delete set null,
  role              text not null,
  model             text not null,
  provider          text not null,
  tokens_in         integer not null default 0,
  tokens_out        integer not null default 0,
  usd_cost          numeric(12,6) not null default 0,
  langfuse_trace_id text,
  created_at        timestamptz not null default now()
);
create index cost_traces_tenant_idx on public.cost_traces(tenant_id, created_at);

create table public.voice_examples (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references public.tenants(tenant_id) on delete cascade,
  content     text not null,
  kind        text not null check (kind in ('quote','invoice')),
  created_at  timestamptz not null default now()
);
create index voice_examples_tenant_idx on public.voice_examples(tenant_id);

-- ─── RLS : politiques par tenant ──────────────────────────────────────────────
alter table public.tenants            enable row level security;
alter table public.users              enable row level security;
alter table public.channel_identities enable row level security;
alter table public.documents          enable row level security;
alter table public.job_runs           enable row level security;
alter table public.reminders          enable row level security;
alter table public.pending_actions    enable row level security;
alter table public.credits_ledger     enable row level security;
alter table public.cost_traces        enable row level security;
alter table public.voice_examples     enable row level security;

-- tenants : l'utilisateur voit son propre tenant.
create policy tenants_self on public.tenants
  for select using (tenant_id = public.current_tenant_id());

-- users : l'utilisateur voit sa propre ligne.
create policy users_self on public.users
  for select using (id = auth.uid());

-- Tables tenant-scoped : full CRUD limite au tenant courant.
create policy ci_tenant   on public.channel_identities for all
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy doc_tenant  on public.documents for all
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy jr_tenant   on public.job_runs for all
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy rem_tenant  on public.reminders for all
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy pa_tenant   on public.pending_actions for all
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy cl_tenant   on public.credits_ledger for all
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy ct_tenant   on public.cost_traces for all
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy ve_tenant   on public.voice_examples for all
  using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- ─── File pgmq + wrappers ─────────────────────────────────────────────────────
select pgmq.create('morax_jobs');

create or replace function public.morax_queue_send(p_queue text, p_message jsonb)
returns bigint
language sql
security definer
set search_path = public, pgmq
as $$
  select pgmq.send(p_queue, p_message)
$$;

create or replace function public.morax_queue_read(p_queue text, p_vt int, p_qty int)
returns table(msg_id bigint, read_ct int, enqueued_at timestamptz, message jsonb)
language sql
security definer
set search_path = public, pgmq
as $$
  select msg_id, read_ct, enqueued_at, message from pgmq.read(p_queue, p_vt, p_qty)
$$;

create or replace function public.morax_queue_delete(p_queue text, p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = public, pgmq
as $$
  select pgmq.delete(p_queue, p_msg_id)
$$;

create or replace function public.morax_queue_archive(p_queue text, p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = public, pgmq
as $$
  select pgmq.archive(p_queue, p_msg_id)
$$;

-- ─── Credits consommes sur la periode courante ────────────────────────────────
create or replace function public.morax_credits_consumed(p_tenant_id text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(weight), 0)
  from public.credits_ledger
  where tenant_id = p_tenant_id
    and created_at >= date_trunc('month', now())
$$;

-- Acces aux wrappers : reserve au backend (service_role). Le client passe par la RLS.
revoke all on function public.morax_queue_send(text, jsonb)        from public, anon, authenticated;
revoke all on function public.morax_queue_read(text, int, int)     from public, anon, authenticated;
revoke all on function public.morax_queue_delete(text, bigint)     from public, anon, authenticated;
revoke all on function public.morax_queue_archive(text, bigint)    from public, anon, authenticated;
grant execute on function public.morax_queue_send(text, jsonb)     to service_role;
grant execute on function public.morax_queue_read(text, int, int)  to service_role;
grant execute on function public.morax_queue_delete(text, bigint)  to service_role;
grant execute on function public.morax_queue_archive(text, bigint) to service_role;
grant execute on function public.morax_credits_consumed(text)      to service_role, authenticated;
