-- The task list's history, and people by name. Safe to run more than once.
-- Run after 0010; then record it (npm run migration:record -- 0011) and run
-- the parity check. The Worker that reads these must not deploy before it.
--
-- ------------------------------------------------------------ 1. history --
--
-- `tasks` holds where a task is now; its decided_at and reject_reason are
-- the last decision only. So a task sent back twice and then approved looked
-- exactly like one done right the first time, and the Тайлан flattered
-- everyone — the slowest most. Every change of state is now a row here,
-- kept: each submission, each send-back with its reason, each approval,
-- each reopening. The Тайлан reads these (worker/tasks.ts > report).
--
-- Written by a trigger, in the same transaction as the change itself, so no
-- path that moves a task can skip its history or leave half of it.

create table if not exists public.task_events (
  id          bigint      generated always as identity primary key,
  task_id     uuid        not null references public.tasks (id) on delete cascade,
  at          timestamptz not null default now(),
  -- Who moved it: tasks.moved_by, which the Worker sets on every move.
  by          uuid        not null,
  from_state  text        not null check (from_state in ('new', 'doing', 'submitted', 'approved')),
  to_state    text        not null check (to_state in ('new', 'doing', 'submitted', 'approved')),
  -- Why, for a send-back (submitted → doing) or a reopening (approved → doing).
  reason      text        check (reason is null or char_length(btrim(reason)) between 1 and 1000)
);

comment on table public.task_events is
  'Every change of a task''s state, appended by the trigger on tasks (0011). Read by the Worker with service_role only.';

create index if not exists task_events_at_idx on public.task_events (at);
create index if not exists task_events_task_idx on public.task_events (task_id, at);

-- Who moved a task last: what the trigger records as `by`.
alter table public.tasks add column if not exists moved_by uuid;

create or replace function public.record_task_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.task_events (task_id, at, by, from_state, to_state, reason)
  values (
    new.id,
    now(),
    coalesce(new.moved_by, new.decided_by, new.submitted_by, new.created_by),
    old.state,
    new.state,
    case when new.state = 'doing' and old.state in ('submitted', 'approved') then new.reject_reason end
  );
  return new;
end;
$$;

-- A trigger's function, never an endpoint: nobody calls it by name.
revoke all on function public.record_task_event() from public, anon, authenticated;

drop trigger if exists tasks_record_event on public.tasks;
create trigger tasks_record_event
  after update of state on public.tasks
  for each row
  when (old.state is distinct from new.state)
  execute function public.record_task_event();

-- -------------------------------------------------------------- 2. names --
--
-- How a person is shown — in Telegram, the Тайлан, the task rows, the
-- inbox — instead of their email. Four people's personal addresses do not
-- belong in a group chat on every message. Empty: the email, as before.
-- Set by the owner in the SQL editor, like the rest of this table:
--   update public.editors set display_name = 'Анна' where email = '…';

alter table public.editors add column if not exists display_name text
  check (display_name is null or char_length(btrim(display_name)) between 1 and 60);

-- ---------------------------------------------------------------- lockdown --

alter table public.task_events enable row level security;

-- Belt and braces, as for enquiries (0001): RLS already blocks these roles
-- because no policy grants them anything, but revoking the table grants
-- means a policy added later by accident still cannot expose the rows.
revoke all on public.task_events from anon, authenticated;

-- Deliberately NO policies. THE ADVISOR WARNING IS EXPECTED AND PERMANENT.
-- Supabase's security advisor reports this table as "RLS enabled, no
-- policies". That is the design: RLS on with zero policies, plus the revoke
-- above, is what makes service_role — the Worker — the only reader and
-- writer. Adding any policy to clear the warning makes these rows readable
-- over the public REST API: who on the team was sent back, how often, and
-- why. Leave the warning where it is.
