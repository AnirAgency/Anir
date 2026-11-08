-- Two changes. Safe to run more than once. Run 0004 first.
--
-- ------------------------------------------------- 1. keep every enquiry --
--
-- No visitor input may cause an enquiry not to be stored. The table used to
-- check the chip values against the form's options, and a name and contact
-- at least one character long — so a chip added in the admin, or a contact
-- the Worker could not read, made the insert fail, and a failed insert is a
-- dropped enquiry, which is the one thing this table exists to prevent.
--
-- The Worker now checks those things (worker/enquiry.ts) against the
-- published form and stores the enquiry anyway when something does not
-- match: the raw value kept in its column, the field named in
-- `unrecognised`. The table keeps only the limits the Worker already cuts
-- to, so a well-behaved Worker can never be refused here.

alter table public.enquiries drop constraint if exists enquiries_service_check;
alter table public.enquiries drop constraint if exists enquiries_budget_check;
alter table public.enquiries drop constraint if exists enquiries_timing_check;
alter table public.enquiries drop constraint if exists enquiries_name_check;
alter table public.enquiries drop constraint if exists enquiries_contact_check;

-- Upper bounds only: the Worker cuts to the same lengths.
alter table public.enquiries add constraint enquiries_name_check check (char_length(name) <= 100);
alter table public.enquiries add constraint enquiries_contact_check check (char_length(contact) <= 120);

alter table public.enquiries
  -- Which fields did not look as the form would send them: 'budget' for a
  -- value that is not one of its chips, 'name' for none, 'contact' for one
  -- that is neither an email nor a phone number. Empty: nothing to check.
  add column if not exists unrecognised text[] not null default '{}',
  -- The answers to questions added in the admin beyond the three columns
  -- above, by the question's code (site.ts > contact.form.groups[].name).
  add column if not exists answers jsonb not null default '{}'::jsonb;

-- ----------------------------------------------------- 2. build status --
--
-- How the last production build went, as the build reports it on itself
-- (scripts/build-report.mjs → POST /api/builds, worker/builds.ts). One row
-- only: `id` can only be true. The build's secret reaches nothing but this
-- row — the Worker checks it, then writes with the service_role key — and the
-- admin reads it through the Worker (GET /api/publish?build=…), so nothing
-- here is part of the public API: RLS on, no policies — see the lockdown
-- below.

create table if not exists public.build_status (
  id           boolean     primary key default true check (id),
  build        text        not null,
  state        text        not null check (state in ('building', 'done', 'failed')),
  branch       text        not null,
  sha          text,
  code         integer,
  reason       text,
  detail       text        check (detail is null or char_length(detail) <= 4000),
  reported_at  timestamptz not null default now()
);

comment on table public.build_status is
  'The last production build, as it reported itself (worker/builds.ts). One row. Written and read by the Worker with service_role only.';

-- ---------------------------------------------------------------- lockdown --

alter table public.build_status enable row level security;

-- Belt and braces, as for enquiries (0001): RLS already blocks these roles
-- because no policy grants them anything, but revoking the table grants
-- means a policy added later by accident still cannot expose the row.
revoke all on public.build_status from anon, authenticated;

-- Deliberately NO policies. THE ADVISOR WARNING IS EXPECTED AND PERMANENT.
-- Supabase's security advisor reports this table as "RLS enabled, no
-- policies". That is the design: RLS on with zero policies, plus the revoke
-- above, is what makes service_role — the Worker — the only reader and
-- writer. Adding any policy to clear the warning makes this row readable
-- over the public REST API: the production branch, its commit SHAs and the
-- lines a failing build printed. Leave the warning where it is.
