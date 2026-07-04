-- Morax - active les 6 boutons du Launchpad. Les raccourcis n'ecrivent plus
-- action_type='agent_task' (jamais consomme, chaine morte -- voir 0008). Ils
-- enfilent desormais un JobType concret (chase_unpaid/check_deadlines/
-- daily_summary/sort_inbox, ou naviguent directement pour scan/devis) que le
-- worker execute reellement (voir worker/src/tasks/).
--
-- agent_task reste dans le CHECK de pending_actions.action_type pour
-- compatibilite (lignes historiques eventuelles), mais n'est plus jamais
-- insere par l'app.

-- ─── documents.category : classement inbox (sort-inbox) ───────────────────────
-- Texte libre, pas de CHECK : la taxonomie est definie par le classifieur
-- (worker/src/tasks/sort-inbox.ts), pas figee au niveau schema.
alter table public.documents
  add column category text;

create index documents_uncategorized_idx
  on public.documents (tenant_id, created_at)
  where category is null;

-- ─── pending_actions.action_type : ajout de 'chase_reminder' ──────────────────
-- Relance impaye (email texte, pas de PDF) : gate HIGH distinct de send_email
-- (cf. ChaseReminderActionPayload, packages/model-core/src/contracts.ts).
alter table public.pending_actions
  drop constraint pending_actions_action_type_check;

alter table public.pending_actions
  add constraint pending_actions_action_type_check
    check (action_type in ('send_email','expense','third_party_write','agent_task','chase_reminder'));
