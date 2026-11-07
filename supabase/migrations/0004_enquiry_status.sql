-- The admin's enquiries inbox («Хүсэлтүүд»), and the storage figure beside
-- its uploads. Safe to run more than once.
--
-- The inbox reads and changes enquiries through the Worker only
-- (worker/inbox.ts), which checks the caller is an editor and then uses the
-- service_role key. The browser never touches this table: RLS stays on with
-- NO policies, exactly as 0001 says, and nothing here adds one.
--
-- An enquiry is never deleted from the admin — a client trying to give the
-- studio money should not be lost to a misclick. Closing it sets its status.

-- --------------------------------------------------------------- status --

-- Codes, not words: the words are the admin's (src/content/admin.ts >
-- inbox.statuses) — шинэ, уншсан, хариулсан, хаасан.
alter table public.enquiries
  add column if not exists status text not null default 'new'
    check (status in ('new', 'read', 'replied', 'closed')),
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references auth.users (id) on delete set null;

-- The inbox lists by status, newest first.
create index if not exists enquiries_status_idx on public.enquiries (status, created_at desc);

-- -------------------------------------------------------------- storage --

-- Everything the project's Storage holds, in bytes: the Free plan has 1 GB
-- in all, and the admin shows how much is used beside every upload. Only
-- service_role may call it — the Worker, after checking the caller is an
-- editor (worker/inbox.ts) — so it is not part of the public API.
create or replace function public.storage_used_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint from storage.objects;
$$;

revoke all on function public.storage_used_bytes() from public, anon, authenticated;
grant execute on function public.storage_used_bytes() to service_role;
