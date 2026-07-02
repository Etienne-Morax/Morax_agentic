-- Morax - durcissement E4 : expiration des pending_actions non decidees.
-- Une proposition d'envoi (HIGH) jamais approuvee/rejetee ne doit pas rester
-- 'pending' indefiniment. TTL 72h (laisse un week-end passer). Statut
-- 'expired' deja present dans le check constraint depuis 0001, jamais
-- atteint jusqu'ici.

create or replace function public.expire_pending_actions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.pending_actions
  set status = 'expired',
      decided_at = now(),
      decided_by = 'system:expiration'
  where status = 'pending'
    and requested_at < now() - interval '72 hours';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_pending_actions() from public, anon, authenticated;
grant execute on function public.expire_pending_actions() to service_role;

-- Toutes les heures : granularite suffisante pour un TTL de 72h.
select cron.schedule(
  'morax_expire_pending_actions',
  '0 * * * *',
  $$select public.expire_pending_actions()$$
);
