-- Two follow-ups to 0001 and 0002. Safe to run more than once.
--
-- 1. is_editor() is no longer callable by anon.
--
-- 0002 revoked it from public, but Supabase grants functions in the public
-- schema to anon and authenticated directly, by default privileges, and a
-- revoke from public does not touch a direct grant. So anon could still
-- call it, as /rest/v1/rpc/is_editor; the security advisor flagged it.
-- Nothing that runs as anon needs it: every policy that calls it is
-- "to authenticated", and the build reads content as anon through the
-- "anyone reads" policies, which do not call it.
--
-- authenticated keeps it, deliberately. The write policies in 0002 call
-- is_editor() as the signed-in user, and Postgres checks EXECUTE for the
-- user evaluating a policy, security definer or not. Without it every save
-- and upload fails with "permission denied for function is_editor" —
-- measured on the live project, in a transaction rolled back. So the
-- advisor's "signed-in users can execute" notice stays. What it exposes is
-- one boolean: whether the caller is an editor. Sign-ups are off, so the
-- only signed-in users are accounts the owner made. Moving the function to
-- a schema the API does not expose would clear that notice too.
--
-- Its search path is already pinned, to '' (0002), stricter than
-- "public, pg_temp": the body names every object by schema.
--
-- 2. The enquiries table explains itself where a tidy-up would happen: in
-- the dashboard, beside the advisor's notice. See 0001.

revoke execute on function public.is_editor() from anon;

comment on table public.enquiries is
  'Contact-form submissions, written only by the Worker (worker/enquiry.ts) with the service_role key. '
  'RLS on with NO policies is the design: the advisor notice "RLS enabled, no policies" is expected and permanent. '
  'Do not add a policy to clear it: a policy is how client enquiries become readable through the public API. '
  'Read them in the dashboard or the SQL editor, which bypass RLS.';
