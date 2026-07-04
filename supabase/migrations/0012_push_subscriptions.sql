-- Morax - Chantier C : abonnements push web (PWA). Insert cote app (role
-- authenticated) sans connaitre le tenant a la main -- meme pattern que
-- document_drafts (0003) : tenant_id a un defaut base sur current_tenant_id(),
-- la policy with check le verifie quand meme. Lecture/suppression cote worker
-- via service_role (envoi des notifications, purge des abonnements expires).

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default public.current_tenant_id()
                references public.tenants(tenant_id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  unique (endpoint)
);
create index push_subscriptions_tenant_idx on public.push_subscriptions(tenant_id);

alter table public.push_subscriptions enable row level security;
create policy push_sub_tenant on public.push_subscriptions for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
