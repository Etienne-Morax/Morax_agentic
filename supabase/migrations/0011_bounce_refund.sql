-- Morax - gestion des bounces Postmark (hard bounce / spam complaint) sur les
-- envois HIGH (devis/facture). Le webhook inbound recoit aussi les payloads de
-- bounce Postmark (RecordType='Bounce', forme differente d'un email inbound) ;
-- jusqu'ici ils etaient silencieusement ignores/mal geres (traites comme un
-- email inbound sans piece jointe -> document fantome).
--
-- Correlation bounce -> tenant/pending_action : Postmark ne renvoie que le
-- MessageID de l'envoi original dans le payload de bounce. On persiste donc le
-- MessageID retourne par l'API Postmark au moment de l'envoi (action_execute)
-- pour pouvoir retrouver la pending_action correspondante.

alter table public.pending_actions
  add column postmark_message_id text,
  add column bounced_at timestamptz,
  add column bounce_kind text check (bounce_kind in ('hard','soft','spam_complaint'));

create unique index pending_actions_postmark_message_id_uniq
  on public.pending_actions (postmark_message_id)
  where postmark_message_id is not null;

-- ─── Job type action_bounce ────────────────────────────────────────────────────
-- Le webhook Postmark n'ecrit jamais directement au ledger de credits (RLS,
-- coherence avec le pattern existant : seul le worker via ports.credits.record()
-- ecrit dans credits_ledger). Un hard bounce/spam complaint empile donc un job
-- action_bounce que le worker traite comme action_propose/action_execute
-- (pas un job IA, pas de LLM).
--
-- bounced_at sert de garde d'idempotence cote worker : un deuxieme webhook de
-- bounce pour le meme MessageID (retry Postmark) ne doit pas rembourser deux
-- fois. Le worker verifie bounced_at is null avant de rembourser + marque
-- bounced_at en meme temps que le remboursement (meme requete que markExecuted).
