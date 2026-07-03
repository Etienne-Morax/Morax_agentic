-- Morax - Centre de Commandement : raccourcis Launchpad passent par le gate HIGH.
-- Ajoute action_type='agent_task' (les raccourcis n'entrent pas dans send_email/
-- expense/third_party_write) + RPC d'enqueue cote authenticated + idempotence
-- (un meme raccourci ne peut avoir qu'une seule proposition 'pending' a la fois).

-- ─── CHECK action_type : ajout de 'agent_task' ────────────────────────────────
alter table public.pending_actions
  drop constraint pending_actions_action_type_check;

alter table public.pending_actions
  add constraint pending_actions_action_type_check
    check (action_type in ('send_email','expense','third_party_write','agent_task'));

-- ─── Idempotence : un raccourci ne peut avoir qu'une proposition pending ──────
-- (payload->>'shortcut_id') identifie le raccourci Launchpad declenche.
create unique index pending_actions_agent_task_uniq
  on public.pending_actions (tenant_id, (payload ->> 'shortcut_id'))
  where action_type = 'agent_task' and status = 'pending';

-- ─── RPC d'enqueue cote authenticated (jamais d'execution directe) ────────────
-- Le tenant est derive du claim JWT (current_tenant_id()), jamais du client :
-- un appelant authentifie ne peut donc creer une pending_action que pour son
-- propre tenant. Si une proposition identique est deja 'pending', on renvoie
-- son id plutot que d'en creer une seconde (idempotence, cf. index ci-dessus).
--
-- action_type EST FIGE A 'agent_task', pas parametrable : ce RPC est expose via
-- PostgREST a TOUT utilisateur authentifie de TOUT tenant. send_email/expense/
-- third_party_write restent inseres uniquement par du code serveur qui valide
-- l'etat metier avant (cf. finalizeDraftAction dans manage-draft.ts) -- jamais
-- via une jsonb arbitraire fournie par le client. Ne pas ajouter de parametre
-- action_type ici sans un allow-list explicite cote fonction.
create or replace function public.enqueue_pending_action(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id text;
  v_id uuid;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'enqueue_pending_action: aucun tenant authentifie';
  end if;

  if coalesce(p_payload ->> 'shortcut_id', '') = '' then
    raise exception 'enqueue_pending_action: shortcut_id manquant';
  end if;

  begin
    insert into public.pending_actions (tenant_id, action_type, risk, payload, status)
    values (v_tenant_id, 'agent_task', 'HIGH', p_payload, 'pending')
    returning id into v_id;
  exception when unique_violation then
    select id into v_id
    from public.pending_actions
    where tenant_id = v_tenant_id
      and action_type = 'agent_task'
      and status = 'pending'
      and payload ->> 'shortcut_id' = p_payload ->> 'shortcut_id';

    if v_id is null then
      raise exception 'enqueue_pending_action: conflit idempotence non resolu';
    end if;
  end;

  return v_id;
end;
$$;

revoke all on function public.enqueue_pending_action(jsonb) from public, anon;
grant execute on function public.enqueue_pending_action(jsonb) to authenticated;
