-- Morax - E3 : activation pg_cron pour les rappels d'echeance.
-- Chaine : pg_cron -> pgmq(morax_jobs) -> worker (poll ~1 min) -> Telegram.
-- pg_net ecarte (ADR 2026-06-30, cf worker/src/config.ts) : le cron enfile un job
-- dans la file existante, il n'appelle jamais de HTTP depuis Postgres.

create extension if not exists pg_cron;

-- ─── Enfilage des rappels dus ─────────────────────────────────────────────────
-- Un rappel est du a J-7/J-3/J-1 si le drapeau notify_jN correspondant est actif.
-- Cadence quotidienne -> chaque (rappel, jalon) tombe sur exactement un jour
-- calendaire -> enfile une seule fois. job_runs (idempotency_key) reste la
-- ceinture-et-bretelles si le worker relit le message (Max Loops).
create or replace function public.enqueue_due_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  r record;
  v_milestone text;
  v_count integer := 0;
begin
  for r in
    select id, tenant_id, due_date, amount, currency,
           (due_date - current_date) as days_out
    from public.reminders
    where status = 'pending'
      and channel = 'telegram'
      and (
        (due_date - current_date = 7 and notify_j7)
        or (due_date - current_date = 3 and notify_j3)
        or (due_date - current_date = 1 and notify_j1)
      )
  loop
    v_milestone := 'j' || r.days_out::text;

    perform pgmq.send('morax_jobs', jsonb_build_object(
      'schema_version', 1,
      'type', 'reminder_notify',
      'tenant_id', r.tenant_id,
      'source', 'cron',
      'idempotency_key', 'remind:' || r.id::text || ':' || v_milestone,
      'enqueued_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'reminder', jsonb_build_object(
        'id', r.id,
        'milestone', v_milestone,
        'due_date', r.due_date,
        'amount', r.amount,
        'currency', r.currency
      )
    ));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Acces reserve au backend (cron tourne en owner de la DB, mais on suit le meme
-- idiome de durcissement explicite que les wrappers morax_queue_* de 0001, car
-- Supabase auto-grant anon + authenticated a toute fonction du schema public).
revoke all on function public.enqueue_due_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_due_reminders() to service_role;

-- ─── Planification ────────────────────────────────────────────────────────────
-- 07:00 UTC (~08:00 Europe/London en ete, 07:00 en hiver). cron.schedule(job_name, ...)
-- fait un upsert par nom (pg_cron >= 1.4) : migration re-appliquable sans doublon.
select cron.schedule(
  'morax_due_reminders',
  '0 7 * * *',
  $$select public.enqueue_due_reminders()$$
);
