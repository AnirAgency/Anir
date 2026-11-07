-- Two changes, neither adds a policy. Safe to run more than once. Run after 0007.
--
-- ------------------------------------------------ 1. room for any browser --
--
-- user_agent held 400 characters. It is a request header, not a form field,
-- and real browsers cross that: the Facebook and Instagram in-app browsers
-- append a long FBAN/FBAV/FBDV/… block — one documented iOS case ran to 281
-- characters, the Android form lands around 400 — and much of this site's
-- traffic arrives from posts opened in them. On a text column 1000 costs
-- nothing and takes every real browser out of the Worker's cut.

alter table public.enquiries drop constraint if exists enquiries_user_agent_check;
alter table public.enquiries add constraint enquiries_user_agent_check
  check (user_agent is null or char_length(user_agent) <= 1000);

-- ------------------------------------------- 2. notes that route nothing --
--
-- What the Worker noticed about a request that says nothing about whether
-- the enquiry is real — today one code, cut:user_agent:<n>, a User-Agent
-- past even 1000 characters, kept to its first 1000. Our own column's width
-- is not evidence about a visitor, so a note here never sets `unrecognised`,
-- never moves an enquiry to «Шалгах», and never holds back the team's
-- notification. The inbox shows it in the opened enquiry, nothing more.

alter table public.enquiries
  add column if not exists diagnostics text[] not null default '{}';

comment on column public.enquiries.diagnostics is
  'Notes for whoever debugs, never a reason to doubt the enquiry: cut:user_agent:<n> (the User-Agent header came n characters long, past 1000 — the first 1000 kept). Routes nothing; `unrecognised` decides what is checked.';

comment on column public.enquiries.unrecognised is
  'What to check, one code each — what decides «Шалгах» and holds back the immediate notification: a question''s code (service, budget, timing, or one added in the admin) whose value is not one of its chips; name (none given); contact (neither an email nor a phone number); body (not sent as the form sends it — its text is in message); cut:<field>:<n> for name, contact, message or a chip (came n characters long, past a limit the form''s own maxlength keeps a browser inside — the first characters kept). Empty: nothing to check.';
