-- Enquiries from the contact form on aniragency.mn.
--
-- Written by the Worker at worker/enquiry.ts, which connects
-- with the service_role key. service_role bypasses row level security, so the
-- table needs no policy at all — and having none is the point: with RLS on and
-- zero policies, anon and authenticated can do nothing here.
--
-- Apply with:  supabase db push
-- or paste into the SQL editor of the project.

create table if not exists public.enquiries (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- The three chip groups. Values match site.ts; the function rejects anything
  -- else before it gets here, and these constraints are the second line.
  service     text        not null check (service in ('web', 'app', 'poster', 'photo')),
  budget      text        not null check (budget  in ('under-1m', '1-3m', '3-5m', 'over-5m')),
  timing      text        not null check (timing  in ('this-month', 'this-quarter', 'exploring')),

  name        text        not null check (char_length(name)    between 1 and 100),
  contact     text        not null check (char_length(contact) between 1 and 120),
  message     text                 check (message is null or char_length(message) <= 2000),
  user_agent  text                 check (user_agent is null or char_length(user_agent) <= 400)
);

-- The same warning as the end of this file, where a tidy-up would happen: in
-- the dashboard, beside the advisor's notice (0003 sets it on the live table).
comment on table public.enquiries is
  'Contact-form submissions, written only by the Worker (worker/enquiry.ts) with the service_role key. '
  'RLS on with NO policies is the design: the advisor notice "RLS enabled, no policies" is expected and permanent. '
  'Do not add a policy to clear it: a policy is how client enquiries become readable through the public API. '
  'Read them in the dashboard or the SQL editor, which bypass RLS.';

-- Newest first is the only way anyone will read this table.
create index if not exists enquiries_created_at_idx
  on public.enquiries (created_at desc);

-- ---------------------------------------------------------------- lockdown --

alter table public.enquiries enable row level security;

-- Belt and braces: RLS already blocks these roles because no policy grants
-- them anything, but revoking the table grants means a policy added later by
-- accident still cannot expose the data.
revoke all on public.enquiries from anon, authenticated;

-- Deliberately NO policies. Any policy added here becomes a way to read other
-- people's contact details — if you need dashboard access, read it as an admin
-- in the Supabase UI, which uses service_role, rather than opening this up.
--
-- THE ADVISOR WARNING IS EXPECTED AND PERMANENT. Supabase's security advisor
-- reports this table as "RLS enabled, no policies". That is the design: RLS
-- on with zero policies, plus the revoke above, is what makes service_role
-- the only reader. Adding any policy to clear the warning is how client
-- enquiries become publicly readable — every name, phone number and message.
-- The revoke would then be the last thing standing, and a single grant, of
-- the kind dashboards and guides add as routine, removes it. Leave the
-- warning where it is.
