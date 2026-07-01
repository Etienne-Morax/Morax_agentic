-- Morax - envoi HIGH devis/facture : finalisation + email client (E4)
-- client_email/pdf_key portes par le draft finalise ; le PDF est fige au
-- moment de la proposition d'envoi (ce qui est approuve = ce qui part).
-- Statut 'sent' ajoute au check existant (drop/recreate, pas de nom explicite
-- dans 0003 -> Postgres l'a nomme document_drafts_status_check).

alter table public.document_drafts
  add column client_email text,
  add column pdf_key text,
  add column finalized_at timestamptz;

alter table public.document_drafts
  drop constraint document_drafts_status_check;

alter table public.document_drafts
  add constraint document_drafts_status_check
  check (status in ('draft', 'finalized', 'sent'));
