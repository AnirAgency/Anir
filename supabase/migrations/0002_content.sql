-- The site's editable content, for the admin at aniragency.mn/admin/.
--
-- The site stays static. The admin writes here; the build reads it
-- (scripts/content-pull.mjs), with the publishable key, and bakes it into
-- the pages; "Нийтлэх" in the admin starts that build (worker/publish.ts).
-- So nothing here is ever read by a visitor's browser.
--
--   site_content  one row per section of src/content/site.ts — key 'hero',
--                 'services', … — its data the section's JSON. The products
--                 section's row holds its copy; the products are below.
--   products      one row per product, in display order.
--   editors       who may write: a Supabase Auth user listed here.
--   media bucket  the images the admin uploads. The build downloads each,
--                 encodes it at its slot's size and ships it from the site;
--                 the bucket is never linked from a page.
--
-- Reading is public — every word and image here is published on the site
-- anyway. Writing needs a signed-in user who is in editors. Nobody can add
-- themselves: editors has no insert policy, so rows go in through the SQL
-- editor (README > Admin), as the owner.
--
-- Apply with:  supabase db push
-- or paste into the SQL editor of the project.

-- ---------------------------------------------------------------- editors --

create table if not exists public.editors (
  user_id   uuid        primary key references auth.users (id) on delete cascade,
  email     text        not null,
  added_at  timestamptz not null default now()
);

comment on table public.editors is
  'Who may edit the site content. Added by the owner in the SQL editor only.';

alter table public.editors enable row level security;

-- An editor may see their own row: the admin and the publish endpoint check
-- membership with the user's own token. No one may write here through the API.
drop policy if exists "editors see themselves" on public.editors;
create policy "editors see themselves" on public.editors
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.editors from anon, authenticated;
grant select on public.editors to authenticated;

-- Used by every write policy below. security definer so it can read editors
-- whatever the caller's own policies; search_path pinned so it cannot be
-- redirected.
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.editors where user_id = (select auth.uid()));
$$;

-- anon by name as well: Supabase grants public-schema functions to anon
-- directly, and a revoke from public leaves that grant standing (0003).
-- authenticated must keep it — the write policies below call it as the
-- signed-in user, and without EXECUTE every save fails.
revoke all on function public.is_editor() from public, anon;
grant execute on function public.is_editor() to authenticated;

-- ----------------------------------------------------------- site_content --

create table if not exists public.site_content (
  key         text        primary key check (key ~ '^[a-z][a-zA-Z]*$'),
  data        jsonb       not null check (jsonb_typeof(data) = 'object'),
  updated_at  timestamptz not null default now(),
  updated_by  uuid        default auth.uid() references auth.users (id) on delete set null
);

comment on table public.site_content is
  'One section of the site copy per row, keyed as in src/content/site.ts.';

-- ---------------------------------------------------------------- products --

create table if not exists public.products (
  id          text        primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 40),
  position    integer     not null default 0,
  data        jsonb       not null check (jsonb_typeof(data) = 'object'),
  updated_at  timestamptz not null default now(),
  updated_by  uuid        default auth.uid() references auth.users (id) on delete set null
);

comment on table public.products is
  'Anir''s own products, one per row; id is the page''s address, /products/<id>/.';

create index if not exists products_position_idx on public.products (position);

-- ------------------------------------------------------------------ access --

alter table public.site_content enable row level security;
alter table public.products enable row level security;

drop policy if exists "anyone reads" on public.site_content;
create policy "anyone reads" on public.site_content
  for select to anon, authenticated using (true);

drop policy if exists "editors insert" on public.site_content;
create policy "editors insert" on public.site_content
  for insert to authenticated with check ((select public.is_editor()));

drop policy if exists "editors update" on public.site_content;
create policy "editors update" on public.site_content
  for update to authenticated
  using ((select public.is_editor())) with check ((select public.is_editor()));

drop policy if exists "editors delete" on public.site_content;
create policy "editors delete" on public.site_content
  for delete to authenticated using ((select public.is_editor()));

drop policy if exists "anyone reads" on public.products;
create policy "anyone reads" on public.products
  for select to anon, authenticated using (true);

drop policy if exists "editors insert" on public.products;
create policy "editors insert" on public.products
  for insert to authenticated with check ((select public.is_editor()));

drop policy if exists "editors update" on public.products;
create policy "editors update" on public.products
  for update to authenticated
  using ((select public.is_editor())) with check ((select public.is_editor()));

drop policy if exists "editors delete" on public.products;
create policy "editors delete" on public.products
  for delete to authenticated using ((select public.is_editor()));

revoke all on public.site_content, public.products from anon, authenticated;
grant select on public.site_content, public.products to anon, authenticated;
grant insert, update, delete on public.site_content, public.products to authenticated;

-- The updated_at stamp on every write.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch before update on public.site_content
  for each row execute function public.touch_updated_at();

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------- media --

-- Public, so the build can download without a key; 15 MB a file, images only.
-- The admin names every upload with a random UUID, so nothing is guessable
-- before it is published, and nothing is overwritten.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "editors upload media" on storage.objects;
create policy "editors upload media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_editor()));

drop policy if exists "editors update media" on storage.objects;
create policy "editors update media" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (select public.is_editor()))
  with check (bucket_id = 'media' and (select public.is_editor()));

drop policy if exists "editors delete media" on storage.objects;
create policy "editors delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select public.is_editor()));
