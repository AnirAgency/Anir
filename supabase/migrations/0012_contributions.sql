-- Schedule 2 of the founder agreement: the money Members put into the
-- Company. Safe to run more than once. Run after 0011; then record it
-- (npm run migration:record -- 0012) and run the parity check. The Worker
-- that reads these must not deploy before it.
--
-- Clause 5.2 makes each contribution a loan, repaid at 150% of principal.
-- Clause 5.1 makes one not recorded within 30 days of being made a gift,
-- never repaid — which is why this is a table and not a spreadsheet: the
-- gap between date_made and recorded_at is the point. Read and written only
-- by the Worker (worker/contributions.ts), after it has checked the caller
-- is an editor, with the service_role key — the inbox's model.
--
-- MONEY IS WHOLE TUGRIK: bigint, never numeric, real or double. No float
-- anywhere in this feature.

create table if not exists public.contributions (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  -- What every write sends back and lands only if it still matches: two
  -- people editing one entry never overwrite each other.
  updated_at    timestamptz not null default now(),
  -- The Member whose money it was: an editor's auth id. No foreign key, as
  -- for tasks — an editor removed from `editors` leaves their money on
  -- record; the Worker checks the id is an editor on every write.
  member_id     uuid        not null,
  -- When the money actually left their pocket.
  date_made     date        not null,
  -- When it was entered here: set by the Worker, never by a browser, and
  -- never changed afterwards (the trigger below refuses it). Clause 5.1 is
  -- counted from date_made to this.
  recorded_at   timestamptz not null default now(),
  amount_mnt    bigint      not null check (amount_mnt > 0),
  what_for      text        not null check (char_length(btrim(what_for)) between 1 and 500),
  receipt_held  boolean     not null default false,
  -- loan, per clause 5.2; gift when a Member says so, or when it was
  -- recorded late (5.1). A check here: only editors write, and a third kind
  -- would need code anyway.
  kind          text        not null default 'loan' check (kind in ('loan', 'gift')),
  -- Principal repaid on this row — not the 150% paid out. Oldest loan first
  -- (5.2(c)), partly allowed (5.2(d)), entered against a row by hand.
  repaid_mnt    bigint      not null default 0 check (repaid_mnt >= 0),
  note          text        check (note is null or char_length(note) <= 2000),
  -- Who entered it, and who changed it last — what the trigger records.
  created_by    uuid        not null,
  edited_by     uuid,
  -- When Telegram confirmed the notice clause 5.1 owes every Member within
  -- 7 days. Null: not delivered — the admin says so on the row.
  notified_at   timestamptz,
  constraint contributions_repaid_within_principal check (repaid_mnt <= amount_mnt),
  constraint contributions_gift_is_never_repaid check (kind = 'loan' or repaid_mnt = 0)
);

comment on table public.contributions is
  'Schedule 2: Members'' contributions (worker/contributions.ts), behind the admin. Written and read by the Worker with service_role only.';

create index if not exists contributions_member_idx on public.contributions (member_id, date_made);
create index if not exists contributions_date_idx on public.contributions (date_made);

-- --------------------------------------------------------------- history --
--
-- Money that can be silently edited, in a company of four shareholders, is
-- what arguments are made of. Every change to whose money it is, when it
-- was made, how much, what kind and how much was repaid is a row here,
-- kept — written by a trigger, in the same transaction as the change, so no
-- path that edits an entry can skip its history.

create table if not exists public.contribution_events (
  id               bigint      generated always as identity primary key,
  -- No cascade: an entry with a history cannot be deleted from under it.
  contribution_id  uuid        not null references public.contributions (id),
  at               timestamptz not null default now(),
  -- Who changed it: contributions.edited_by, which the Worker sets on every edit.
  by               uuid        not null,
  field            text        not null check (field in ('member_id', 'date_made', 'amount_mnt', 'kind', 'repaid_mnt')),
  -- As text, one column for every field: a uuid, a date, whole tugrik, a kind.
  from_value       text        not null,
  to_value         text        not null
);

comment on table public.contribution_events is
  'Every change to a contribution''s member, date, amount, kind or repayment, appended by the trigger on contributions (0012). Read by the Worker with service_role only.';

create index if not exists contribution_events_contribution_idx on public.contribution_events (contribution_id, at);

create or replace function public.record_contribution_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  who uuid := coalesce(new.edited_by, new.created_by);
begin
  -- Clause 5.1 is counted from recorded_at: changing it would change whether
  -- money is a loan or a gift. Nobody may, by any path.
  if new.recorded_at is distinct from old.recorded_at then
    raise exception 'contributions.recorded_at never changes: clause 5.1 is counted from it';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'contributions.created_by never changes';
  end if;
  if new.member_id is distinct from old.member_id then
    insert into public.contribution_events (contribution_id, by, field, from_value, to_value)
    values (new.id, who, 'member_id', old.member_id::text, new.member_id::text);
  end if;
  if new.date_made is distinct from old.date_made then
    insert into public.contribution_events (contribution_id, by, field, from_value, to_value)
    values (new.id, who, 'date_made', old.date_made::text, new.date_made::text);
  end if;
  if new.amount_mnt is distinct from old.amount_mnt then
    insert into public.contribution_events (contribution_id, by, field, from_value, to_value)
    values (new.id, who, 'amount_mnt', old.amount_mnt::text, new.amount_mnt::text);
  end if;
  if new.kind is distinct from old.kind then
    insert into public.contribution_events (contribution_id, by, field, from_value, to_value)
    values (new.id, who, 'kind', old.kind, new.kind);
  end if;
  if new.repaid_mnt is distinct from old.repaid_mnt then
    insert into public.contribution_events (contribution_id, by, field, from_value, to_value)
    values (new.id, who, 'repaid_mnt', old.repaid_mnt::text, new.repaid_mnt::text);
  end if;
  return new;
end;
$$;

-- A trigger's function, never an endpoint: nobody calls it by name.
revoke all on function public.record_contribution_event() from public, anon, authenticated;

drop trigger if exists contributions_record_event on public.contributions;
create trigger contributions_record_event
  before update on public.contributions
  for each row
  execute function public.record_contribution_event();

-- ---------------------------------------------------------------- lockdown --

alter table public.contributions enable row level security;
alter table public.contribution_events enable row level security;

-- Belt and braces, as for enquiries (0001): RLS already blocks these roles
-- because no policy grants them anything, but revoking the table grants
-- means a policy added later by accident still cannot expose the rows.
revoke all on public.contributions from anon, authenticated;
revoke all on public.contribution_events from anon, authenticated;

-- Deliberately NO policies. THE ADVISOR WARNING IS EXPECTED AND PERMANENT.
-- Supabase's security advisor reports both tables as "RLS enabled, no
-- policies". That is the design: RLS on with zero policies, plus the revokes
-- above, is what makes service_role — the Worker — the only reader and
-- writer. Adding any policy to clear the warning makes these rows readable
-- over the public REST API: how much each shareholder put in, and what the
-- Company owes them. Leave the warning where it is.
