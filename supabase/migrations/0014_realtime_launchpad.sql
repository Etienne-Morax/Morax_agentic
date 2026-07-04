-- Morax - active Supabase Realtime sur job_runs/command_messages/documents.
-- Sans ca, le Launchpad web n'apprend jamais qu'un job a fini (router.refresh()
-- manuel uniquement) et le chat n'affiche jamais la reponse de l'agent : le
-- resultat partait a Telegram, jamais au client web (cf. diagnostic Launchpad).
--
-- RLS existante (jr_tenant, cm_select, doc_tenant -- toutes `tenant_id =
-- current_tenant_id()`) s'applique aussi aux evenements postgres_changes :
-- un client authenticated ne recoit que les lignes de son propre tenant.
-- On ajoute quand meme un filtre `tenant_id=eq.<id>` cote client (queries.ts)
-- par defense en profondeur et pour limiter le trafic evalue.
--
-- `alter publication ... add table` echoue si la table y est deja -- on garde
-- donc l'ajout idempotent via un DO block qui verifie pg_publication_tables.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_runs'
  ) then
    alter publication supabase_realtime add table public.job_runs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'command_messages'
  ) then
    alter publication supabase_realtime add table public.command_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;
end $$;
