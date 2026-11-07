-- What Supabase's own history says was applied, for the parity check. Safe
-- to run more than once. Run after 0008; then record it
-- (npm run migration:record -- 0009) like any migration pasted in.
--
-- A migration pasted into the SQL editor runs but leaves no row in
-- supabase_migrations.schema_migrations, so anyone rebuilding from history
-- gets a schema without it. scripts/test-enquiry.ts asks this function, with
-- the service_role key from .dev.vars, and fails naming every file in
-- supabase/migrations/ that has no row — and the command that writes it.
--
-- supabase_migrations is not exposed through the REST API, and should not
-- be; this reads it on the caller's behalf. Only service_role may call it —
-- the same treatment as storage_used_bytes (0004): migration names say what
-- the schema holds, which is nobody else's business.

create or replace function public.applied_migrations()
returns table (version text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.version, m.name from supabase_migrations.schema_migrations as m order by m.version;
$$;

-- anon and authenticated by name: Supabase grants public-schema functions to
-- them directly, and a revoke from public alone leaves that standing (0003).
revoke all on function public.applied_migrations() from public, anon, authenticated;
grant execute on function public.applied_migrations() to service_role;
