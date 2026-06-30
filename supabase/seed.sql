-- Morax - donnees SYNTHETIQUES (dev/staging uniquement).
-- Regle dure : aucune donnee client reelle hors production, jamais sur le NAS.
-- Ne jamais charger ce seed en production.

insert into public.tenants (tenant_id, display_name, email, offre, packs_actifs, gdpr_dpa_signed, personal_data_consent)
values
  ('morax-demo-freelance-01', 'Sarah Chen Photography (synthetique)', 'sarah@example.test',
   'base', '["base","devis_facture"]'::jsonb, true, true)
on conflict (tenant_id) do nothing;

-- Utilisateur Auth synthetique (UUID fixe pour les tests locaux).
insert into public.users (id, tenant_id, email, role)
values ('00000000-0000-0000-0000-000000000001', 'morax-demo-freelance-01', 'sarah@example.test', 'owner')
on conflict (id) do nothing;

insert into public.channel_identities (tenant_id, channel, external_id, verified)
values
  ('morax-demo-freelance-01', 'telegram', '111111111', true),
  ('morax-demo-freelance-01', 'email', 'morax-sc4219@morax.app', true)
on conflict (channel, external_id) do nothing;

insert into public.documents (tenant_id, source, mime, status, extracted, needs_human_validation)
values
  ('morax-demo-freelance-01', 'telegram', 'image/jpeg', 'extracted',
   '{"montant": 340.00, "devise": "GBP", "date_echeance": "2026-07-15", "emetteur": "Adobe UK"}'::jsonb,
   true);
