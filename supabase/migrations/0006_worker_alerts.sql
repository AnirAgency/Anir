-- What the Worker needs a person to know, and the admin shows. Safe to run
-- more than once. Run after 0005, before the merge.
--
-- One row per kind of trouble, its last occurrence. Today one kind:
-- 'limiter-open' — the contact form's rate limiter could not reach KV and
-- let every enquiry through (worker/enquiry.ts). It must fail open — losing
-- a real enquiry is worse than an unbounded table — so the next best thing
-- is that someone hears of it: the Worker logs it, writes it here, and the
-- admin shows it on its status line, as it shows a failed publish.
--
-- Written and read by the Worker with service_role only (the admin reads it
-- through GET /api/alerts, editors only): RLS on, no policies.

create table if not exists public.worker_alerts (
  kind     text        primary key check (kind in ('limiter-open')),
  last_at  timestamptz not null default now(),
  detail   text        check (detail is null or char_length(detail) <= 500)
);

comment on table public.worker_alerts is
  'What the Worker needs a person to know (worker/alerts.ts), one row per kind. Written and read by the Worker with service_role only.';

alter table public.worker_alerts enable row level security;
revoke all on public.worker_alerts from anon, authenticated;
