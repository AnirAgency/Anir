-- Schedule 2, before any data: the Members, the agreement's date, and each
-- repayment as its own row. Safe to run more than once. Run after 0012 (whose
-- tables must still be empty); then record it (npm run migration:record --
-- 0013) and run the parity check. The Worker that reads these must not
-- deploy before it.

-- ---------------------------------------------------------------- members --
--
-- The Members of the Company — not the editors. Clause 4.9 allows a fifth
-- person on salary with no Shares: they may sign in to the admin and are not
-- a Member, and a Member may have no login at all. So the Member picker reads
-- this table, and a contribution belongs to one of these rows. Changed by the
-- owner in the SQL editor, like `editors`:
--   update public.members set editor_id = '<user_id>' where name = 'Batuka';

create table if not exists public.members (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text        not null unique check (char_length(btrim(name)) between 1 and 60),
  -- Their editor account, if they have one: the admin opens the form on the
  -- signed-in editor's own Member. Optional, and never how membership is told.
  editor_id   uuid        unique references public.editors (user_id) on delete set null,
  -- The order the strip lists them in.
  ord         smallint    not null default 0
);

comment on table public.members is
  'The Members of the Company (Schedule 2), apart from editors (clause 4.9). Read by the Worker with service_role only.';

insert into public.members (name, ord)
values ('Batuka', 1), ('Batenkh', 2), ('Baysaa', 3), ('Deegii', 4)
on conflict (name) do nothing;

-- 0012 held an editor's id here; the table is empty, so from now on it is a
-- Member's, and Postgres holds it to one.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contributions_member_fk') then
    alter table public.contributions
      add constraint contributions_member_fk foreign key (member_id) references public.members (id);
  end if;
end;
$$;

-- -------------------------------------------------------------- agreement --
--
-- When the founder agreement came into force. Null until it is signed — and
-- while it is null, clause 5.1 has no clock: nothing is ever late. Once set,
-- the 30 days apply only to money made on or after it
-- (src/lib/contribution-codes.ts > isLate). One row, one place.
--
-- Set once, by the owner in the SQL editor, when the agreement is signed:
--   update public.agreement set in_force_from = '2026-12-01';
-- and never changed after: the date decides which contributions are loans
-- and which are gifts, so the trigger below refuses a second value. A wrong
-- date is corrected by a deliberate migration, which leaves a record.

create table if not exists public.agreement (
  id             boolean     primary key default true check (id),
  in_force_from  date,
  -- When in_force_from was set (the trigger writes it).
  set_at         timestamptz
);

comment on table public.agreement is
  'The founder agreement''s date in force: null until signed, set once. Read by the Worker with service_role only.';

insert into public.agreement (id) values (true) on conflict (id) do nothing;

create or replace function public.agreement_set_once()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'agreement: the row stays — set in_force_from instead';
  end if;
  if old.in_force_from is not null and new.in_force_from is distinct from old.in_force_from then
    raise exception 'agreement.in_force_from is set once: it decides which contributions are loans, so a wrong date is corrected by a migration';
  end if;
  if old.in_force_from is null and new.in_force_from is not null then
    new.set_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.agreement_set_once() from public, anon, authenticated;

drop trigger if exists agreement_set_once on public.agreement;
create trigger agreement_set_once
  before update or delete on public.agreement
  for each row
  execute function public.agreement_set_once();

-- ------------------------------------------------------------- repayments --
--
-- Each repayment its own row, with its principal and its interest apart.
-- Clause 5.2(e) makes the 50% uplift taxable income of the lending Member,
-- with the Company withholding — so one "repaid" total could not support
-- the withholding the Company owes. The rate is the accountant's; this
-- records the split. Appended, never changed or removed (the trigger
-- refuses): a mistake is corrected by a deliberate migration.

create table if not exists public.contribution_repayments (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  created_by       uuid        not null,
  -- No cascade: a loan with repayments cannot be deleted from under them.
  contribution_id  uuid        not null references public.contributions (id),
  paid_on          date        not null,
  -- Whole tugrik, as everywhere in Schedule 2.
  principal_mnt    bigint      not null check (principal_mnt >= 0),
  interest_mnt     bigint      not null check (interest_mnt >= 0),
  note             text        check (note is null or char_length(note) <= 1000),
  constraint contribution_repayments_pays_something check (principal_mnt > 0 or interest_mnt > 0)
);

comment on table public.contribution_repayments is
  'Schedule 2 repayments, one row each, principal and interest apart (clause 5.2(e)). Appended by the Worker with service_role only.';

create index if not exists contribution_repayments_contribution_idx on public.contribution_repayments (contribution_id, paid_on);

create or replace function public.check_contribution_repayment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lent public.contributions%rowtype;
  repaid bigint;
begin
  if tg_op <> 'INSERT' then
    raise exception 'contribution_repayments are appended, never changed or removed: a mistake is corrected by a migration';
  end if;
  -- Locked, so two repayments at once cannot both pass the check below.
  select * into lent from public.contributions where id = new.contribution_id for update;
  if lent.kind <> 'loan' then
    raise exception 'a gift is never repaid';
  end if;
  if new.paid_on < lent.date_made then
    raise exception 'a repayment cannot be paid before the money was lent';
  end if;
  select coalesce(sum(principal_mnt), 0) into repaid from public.contribution_repayments where contribution_id = new.contribution_id;
  if repaid + new.principal_mnt > lent.amount_mnt then
    raise exception 'repaid principal would pass the amount lent';
  end if;
  return new;
end;
$$;

revoke all on function public.check_contribution_repayment() from public, anon, authenticated;

drop trigger if exists contribution_repayments_check on public.contribution_repayments;
create trigger contribution_repayments_check
  before insert or update or delete on public.contribution_repayments
  for each row
  execute function public.check_contribution_repayment();

-- --------------------------------------- contributions: repaid moves out --
--
-- 0012's single repaid_mnt total is replaced by the rows above. The trigger
-- on contributions forgets it first — its body named the column — and now
-- also refuses to make a repaid loan a gift, or its amount less than what
-- was repaid.

create or replace function public.record_contribution_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  who uuid := coalesce(new.edited_by, new.created_by);
  repaid bigint;
begin
  -- Clause 5.1 is counted from recorded_at: changing it would change whether
  -- money is a loan or a gift. Nobody may, by any path.
  if new.recorded_at is distinct from old.recorded_at then
    raise exception 'contributions.recorded_at never changes: clause 5.1 is counted from it';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'contributions.created_by never changes';
  end if;
  if new.kind is distinct from old.kind or new.amount_mnt is distinct from old.amount_mnt then
    select coalesce(sum(principal_mnt), 0) into repaid from public.contribution_repayments where contribution_id = new.id;
    if new.kind <> 'loan' and exists (select 1 from public.contribution_repayments where contribution_id = new.id) then
      raise exception 'a contribution with repayments stays a loan';
    end if;
    if new.amount_mnt < repaid then
      raise exception 'the amount cannot fall below the principal already repaid';
    end if;
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
  return new;
end;
$$;

alter table public.contributions drop constraint if exists contributions_repaid_within_principal;
alter table public.contributions drop constraint if exists contributions_gift_is_never_repaid;
alter table public.contributions drop column if exists repaid_mnt;

alter table public.contribution_events drop constraint if exists contribution_events_field_check;
alter table public.contribution_events
  add constraint contribution_events_field_check check (field in ('member_id', 'date_made', 'amount_mnt', 'kind'));

-- ---------------------------------------------------------------- lockdown --

alter table public.members enable row level security;
alter table public.agreement enable row level security;
alter table public.contribution_repayments enable row level security;

-- Belt and braces, as for enquiries (0001): RLS already blocks these roles
-- because no policy grants them anything, but revoking the table grants
-- means a policy added later by accident still cannot expose the rows.
revoke all on public.members from anon, authenticated;
revoke all on public.agreement from anon, authenticated;
revoke all on public.contribution_repayments from anon, authenticated;

-- Deliberately NO policies. THE ADVISOR WARNING IS EXPECTED AND PERMANENT.
-- Supabase's security advisor reports these tables as "RLS enabled, no
-- policies". That is the design: RLS on with zero policies, plus the revokes
-- above, is what makes service_role — the Worker — the only reader and
-- writer. Adding any policy to clear the warning makes these rows readable
-- over the public REST API: who the shareholders are, what the Company has
-- paid each of them, and what it withheld. Leave the warning where it is.
