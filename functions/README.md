# Pages Functions

Cloudflare Pages compiles this directory into the site's only server-side code.
Everything else on aniragency.mn is a static file.

- `api/enquiry.ts` — the contact form endpoint. Arrives in Phase 06.

`public/_routes.json` restricts Function invocation to `/api/*`, so static
requests are served straight from the edge cache and never spin up a worker.

Secrets (the Supabase service key) are set in the Cloudflare dashboard under
Settings > Environment variables. They are never committed.
