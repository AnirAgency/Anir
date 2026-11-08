-- Schedule 2: a wrong repayment is reversed in the ledger, not by a
-- migration; a Member is told when their entry's kind changes. Safe to run
-- more than once. Run after 0013; then record it (npm run migration:record
-- -- 0014) and run the parity check. The Worker that reads these must not
-- deploy before it.

-- ------------------------------------------------------------ reversals --
--
-- Repayments stay append-only. A fat-fingered amount is now undone by a row
-- of its own: it names the repayment it reverses, says why, and carries the
-- same amounts negated, on the same day — so every sum nets it out, the
-- original stays where it was, and the history says what happened and who
-- said so. One reversal per repayment; a reversal is never itself reversed
-- (enter the right repayment again instead).

alter table public.contribution_repayments
  add column if not exists reverses uuid references public.contribution_repayments (id);
alter table public.contribution_repayments
  add column if not exists reason text;

create unique index if not exists contribution_repayments_reversed_once
  on public.contribution_repayments (reverses) where reverses is not null;

-- A payment is whole tugrik, never below zero, and pays something; a
-- reversal is its negation, with a reason. Nothing else.
alter table public.contribution_repayments drop constraint if exists contribution_repayments_principal_mnt_check;
alter table public.contribution_repayments drop constraint if exists contribution_repayments_interest_mnt_check;
alter table public.contribution_repayments drop constraint if exists contribution_repayments_pays_something;
alter table public.contribution_repayments drop constraint if exists contribution_repayments_payment_or_reversal;
alter table public.contribution_repayments
  add constraint contribution_repayments_payment_or_reversal check (
    (reverses is null and reason is null and principal_mnt >= 0 and interest_mnt >= 0 and (principal_mnt > 0 or interest_mnt > 0))
    or (reverses is not null and principal_mnt <= 0 and interest_mnt <= 0 and char_length(btrim(reason)) between 1 and 1000)
  );

create or replace function public.check_contribution_repayment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lent public.contributions%rowtype;
  original public.contribution_repayments%rowtype;
  repaid bigint;
begin
  if tg_op <> 'INSERT' then
    raise exception 'contribution_repayments are appended, never changed or removed: a mistake is reversed by a row of its own';
  end if;
  -- Locked, so two rows at once cannot both pass the checks below.
  select * into lent from public.contributions where id = new.contribution_id for update;
  if new.reverses is not null then
    select * into original from public.contribution_repayments where id = new.reverses;
    if original.id is null or original.contribution_id <> new.contribution_id then
      raise exception 'a reversal reverses a repayment of the same contribution';
    end if;
    if original.reverses is not null then
      raise exception 'a reversal is never itself reversed: enter the right repayment again';
    end if;
    if new.principal_mnt <> -original.principal_mnt or new.interest_mnt <> -original.interest_mnt or new.paid_on <> original.paid_on then
      raise exception 'a reversal undoes the whole repayment: its amounts negated, on its day';
    end if;
    return new;
  end if;
  if lent.kind <> 'loan' then
    raise exception 'a gift is never repaid';
  end if;
  if new.paid_on < lent.date_made then
    raise exception 'a repayment cannot be paid before the money was lent';
  end if;
  -- Net of reversals.
  select coalesce(sum(principal_mnt), 0) into repaid from public.contribution_repayments where contribution_id = new.contribution_id;
  if repaid + new.principal_mnt > lent.amount_mnt then
    raise exception 'repaid principal would pass the amount lent';
  end if;
  return new;
end;
$$;

-- What stands after reversals decides whether a loan may become a gift, or
-- fall in amount: a repayment reversed in full no longer holds it a loan.
create or replace function public.record_contribution_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  who uuid := coalesce(new.edited_by, new.created_by);
  repaid bigint;
  uplift bigint;
begin
  -- Clause 5.1 is counted from recorded_at: changing it would change whether
  -- money is late. Nobody may, by any path.
  if new.recorded_at is distinct from old.recorded_at then
    raise exception 'contributions.recorded_at never changes: clause 5.1 is counted from it';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'contributions.created_by never changes';
  end if;
  if new.kind is distinct from old.kind or new.amount_mnt is distinct from old.amount_mnt then
    select coalesce(sum(principal_mnt), 0), coalesce(sum(interest_mnt), 0) into repaid, uplift
      from public.contribution_repayments where contribution_id = new.id;
    if new.kind <> 'loan' and (repaid <> 0 or uplift <> 0) then
      raise exception 'a contribution with repayments standing stays a loan';
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

-- ---------------------------------------------------------------- notices --
--
-- Loan → gift takes someone's money away; clause 5.1 — "unless the Member
-- writes 'gift'" — makes it theirs to decide. So a change of kind is told
-- to the Member whose entry it is, by Telegram: privately, when they have
-- started the bot and their chat is here; otherwise in the tasks group. It
-- is never done silently.
--
-- The Member's private chat with the bot — their Telegram user id, read from
-- the bot's updates after they send it /start. Set by the owner:
--   update public.members set telegram_chat_id = '123456789' where name = 'Baysaa';
alter table public.members
  add column if not exists telegram_chat_id text check (telegram_chat_id is null or telegram_chat_id ~ '^-?[0-9]{1,20}$');

-- When the notice of this change arrived — set by the Worker on delivery, for
-- a change of kind. Null: not delivered, and the admin says so beside it.
alter table public.contribution_events
  add column if not exists notified_at timestamptz;

-- Lockdown unchanged: RLS on, no policies, grants revoked (0012, 0013). The
-- new columns are behind it like the rest.
