-- Morax - E2 : brouillons devis/facture (outbound), distincts de `documents`
-- (inbound-only : documents recus/extraits). tenant_id a un defaut base sur
-- current_tenant_id() pour permettre l'insert cote app (role authenticated)
-- sans connaitre le tenant a la main -- la policy with check le verifie quand meme.

create table public.document_drafts (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      text not null default public.current_tenant_id()
                   references public.tenants(tenant_id) on delete cascade,
  kind           text not null check (kind in ('quote','invoice')),
  status         text not null default 'draft'
                   check (status in ('draft','finalized')),
  doc_number     text,
  client_name    text,
  client_address text,
  currency       text not null default 'GBP',
  vat_rate       numeric(5,2) not null default 20,      -- TVA UK standard
  line_items     jsonb not null default '[]'::jsonb,    -- [{description, quantity, unit_price}]
  notes          text,
  issue_date     date,
  due_date       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index document_drafts_tenant_idx on public.document_drafts(tenant_id, created_at desc);

alter table public.document_drafts enable row level security;
create policy drft_tenant on public.document_drafts for all
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
