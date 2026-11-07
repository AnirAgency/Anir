-- Two changes, neither adds a policy. Safe to run more than once. Run after 0006.
--
-- -------------------------------------------- 1. any kind of Worker alert --
--
-- 0006 let worker_alerts hold one kind, 'limiter-open'. The next kind of
-- trouble the Worker learned to raise would have been refused by the table —
-- logged in the Worker and nowhere a person looks — until someone wrote a
-- migration: a silent failure, in the table whose only job is to make
-- silent failures visible. The Worker keeps the list (worker/alerts.ts >
-- ALERT_KINDS), as it keeps the form's chip values (0005), and the admin
-- shows a kind it has no words for rather than hiding it.

alter table public.worker_alerts drop constraint if exists worker_alerts_kind_check;

-- ------------------------------------------- 2. what `unrecognised` holds --
--
-- Documentation only. Since a value past its column's length would make
-- Postgres refuse the whole row, the Worker cuts it to the limit
-- (src/lib/enquiry-limits.ts), stores the enquiry, and says so here.

comment on column public.enquiries.unrecognised is
  'What to check, one code each: a question''s code (service, budget, timing, or one added in the admin) whose value is not one of its chips; name (none given); contact (neither an email nor a phone number); body (not sent as the form sends it — its text is in message); cut:<field>:<n> (came n characters long, past its limit — the first characters kept, the rest cut). Empty: nothing to check.';
