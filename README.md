# Creative Approval Portal

Next.js (App Router) + Supabase (Postgres/Auth/RLS/Realtime/Edge Functions) + Cloudflare R2 (presigned URLs only).

## Setup

1. **Supabase**: create a project, then apply `supabase/migrations/0001…0004` (`supabase db push`, or paste into the SQL editor in order).
   The **first user to sign up becomes `admin`**; everyone else defaults to `creator`. Admin assigns roles at `/admin/users`.
2. **R2**: create private bucket `creative-assets`; add a CORS policy for the app origin:
   ```json
   [{"AllowedOrigins":["http://localhost:3000"],"AllowedMethods":["GET","PUT"],"AllowedHeaders":["*"],"MaxAgeSeconds":3000}]
   ```
   Optional: a lifecycle rule expiring `staging/` after 1 day (failed validations leave staged files).
3. **Secrets + functions**:
   ```bash
   supabase secrets set R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=creative-assets R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   supabase functions deploy presign ingest-excel validate-upload batch-download delete-batch
   ```
4. **Frontend**: `cp .env.example .env.local`, fill in URL + anon key, `npm install && npm run dev`.
   (Google sign-in: enable the provider in Supabase Auth and add `<origin>/auth/callback` as a redirect URL.)

## How it fits together

| Concern | Where |
|---|---|
| Schema, enums, batch-lock trigger, profile bootstrap, realtime | `supabase/migrations/0001_schema.sql` |
| RLS on every table (admin-only delete) | `0002_rls.sql` |
| State changes (`triage_skus`, `review_shot`, `route_shot`, `complete_routing`, `create_batch`) — each role-checked, each writes `transitions` | `0003_functions.sql` |
| Dashboard views derived purely from `transitions` | `0004_dashboard_views.sql` |
| Edge Functions (shared R2/auth helpers in `_shared/common.ts`) | `supabase/functions/*` |
| Role-gated routes (`roleLayout([...])` per segment) | `src/app/(app)/*` |

Creator flow: browser PUTs JPEGs straight to R2 (`staging/{uid}/{id}/…`) via presigned URLs, then sends a mapping
file (`sku_code, shot_type, filename`) to `validate-upload`. It validates all-or-nothing: errors → 422 with line items and
shots stay `in_production`; success → images copied to `{sku}/{shot_type}/v{n}.jpg`, `assets` + `shot_versions` created,
shots go `in_production → submitted → in_review`.

## Notes / decisions
- Only `.jpg/.jpeg` are accepted so object keys match the `…/v{n}.jpg` convention.
- `batch-download` streams from R2 one object per pull (no full-batch buffering on the server); the browser receives it as a blob.
- Triage also assigns the **creator** per SKU (`shots.creator_id`), since the spec's creator RLS depends on it.
- A shot becomes `done` when all of its *existing* routings are done, so route to both destinations in one action if both are wanted.
- Edge Functions were not run against a live Supabase/R2 here; the Next.js app typechecks and builds.
