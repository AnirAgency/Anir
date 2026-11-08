-- The team's task list («Ажил»), by the owner's direction. Safe to run more
-- than once. Run after 0009; then record it (npm run migration:record -- 0010)
-- and run the parity check (npm run test:enquiry, the key in .dev.vars).
--
-- Four people assign work, submit it and approve it, inside the admin. Read
-- and written only by the Worker (worker/tasks.ts), after it has checked the
-- caller is an editor, with the service_role key — the inbox's model.

create table if not exists public.tasks (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  -- What every write sends back and lands only if it still matches: two
  -- people editing one task never overwrite each other (worker/tasks.ts).
  updated_at     timestamptz not null default now(),
  title          text        not null check (char_length(btrim(title)) between 1 and 200),
  -- What "done" means, concretely — the whole design: approval is checked
  -- against it, so it is required, and never the title said again.
  done_means     text        not null check (char_length(btrim(done_means)) between 1 and 1000),
  -- site | ezmath | ethos | olymo | other. Checked in the Worker, not here:
  -- a new product is added in the admin, and its project should not wait on
  -- a migration.
  project        text        not null check (char_length(project) between 1 and 40),
  -- Editors' auth ids. No foreign keys: an editor removed from `editors`
  -- leaves their tasks readable; the Worker checks each id is an editor on
  -- every write.
  owner_id       uuid        not null,
  approver_id    uuid        not null,
  created_by     uuid        not null,
  due_date       date,
  -- new → doing → submitted → approved; submitted → doing when sent back.
  -- A check here, unlike enquiries and worker_alerts: only editors write,
  -- through the admin, and a new state needs code anyway — so it catches a
  -- bug, never refuses a visitor's data.
  state          text        not null default 'new' check (state in ('new', 'doing', 'submitted', 'approved')),
  -- Who said it was done, and when. Anyone may submit — someone finishing a
  -- colleague's task is normal — so the owner is not always the submitter,
  -- and "sent back" is told to whoever submitted.
  submitted_at   timestamptz,
  submitted_by   uuid,
  -- The approver's last decision: approved, or sent back with its reason.
  decided_at     timestamptz,
  decided_by     uuid,
  reject_reason  text        check (reject_reason is null or char_length(btrim(reject_reason)) between 1 and 1000),
  constraint tasks_done_means_is_not_the_title check (lower(btrim(done_means)) <> lower(btrim(title)))
);

comment on table public.tasks is
  'The team''s task list (worker/tasks.ts), behind the admin. Written and read by the Worker with service_role only.';

-- «Mine» and the badge: what is assigned to me, what waits on my approval.
create index if not exists tasks_owner_state_idx on public.tasks (owner_id, state);
create index if not exists tasks_approver_state_idx on public.tasks (approver_id, state);
-- The Тайлан, by week: what was submitted, what was decided.
create index if not exists tasks_submitted_idx on public.tasks (submitted_by, submitted_at);
create index if not exists tasks_decided_idx on public.tasks (decided_at);
create index if not exists tasks_due_idx on public.tasks (due_date) where state <> 'approved';

-- ---------------------------------------------------------------- lockdown --

alter table public.tasks enable row level security;

-- Belt and braces, as for enquiries (0001): RLS already blocks these roles
-- because no policy grants them anything, but revoking the table grants
-- means a policy added later by accident still cannot expose the rows.
revoke all on public.tasks from anon, authenticated;

-- Deliberately NO policies. THE ADVISOR WARNING IS EXPECTED AND PERMANENT.
-- Supabase's security advisor reports this table as "RLS enabled, no
-- policies". That is the design: RLS on with zero policies, plus the revoke
-- above, is what makes service_role — the Worker — the only reader and
-- writer. Adding any policy to clear the warning makes these rows readable
-- over the public REST API: who on the team is doing what, for whom, by
-- when. Leave the warning where it is.
