# Wonderlust

Personal travel planner: trips, itinerary, flights, stays, expenses, photos, and cached link previews. Built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **Framer Motion**, and **Supabase** (Postgres + Storage). No Supabase Auth — a simple **viewer / editor** gate is enforced in the UI only.

## Requirements

- **Node.js 18.17+** (see `engines` in `package.json`; **20 LTS** recommended for Supabase JS tooling)
- **Supabase CLI** for database migrations: `brew install supabase/tap/supabase` or [CLI install docs](https://supabase.com/docs/guides/cli)
- A **Supabase** project (configure via env; never commit keys)

## 1. Supabase database (migrations + `db push`)

Schema, storage buckets, and optional sample data live under [`supabase/migrations/`](supabase/migrations/):

| File | Contents |
|------|----------|
| `20260216120000_wonderlust_schema.sql` | Tables, triggers, RLS, `v_trip_totals`, `duplicate_trip` |
| `20260216120001_wonderlust_storage.sql` | `trip-covers` + `trip-day-photos` buckets and storage policies |

**Apply to your hosted project (after a wipe or on a new project):**

```bash
cd /path/to/wonderlust
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

That records versions in `supabase_migrations.schema_migrations` and applies any pending files in order.

**Local Supabase:** `supabase start` then `supabase db reset` applies all migrations to the local database.

If Postgres errors on triggers, try replacing `execute procedure` with `execute function` in the migration file (depends on server version).

## 2. Storage paths (app convention)

- Covers: `{trip_id}/{filename}`
- Day photos: `{trip_id}/{trip_day_id}/{filename}` (or `{trip_id}/general/...` for trip-level uploads)

## 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_SITE_PASSWORD` | “Admin” password checked in the browser (visible in the client bundle) |
| `LINK_PREVIEW_CACHE_DAYS` | Optional TTL for refreshing Open Graph cache (default `7`) |

Never commit `.env.local` or real keys.

## 4. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Choose **editor** (password) or **viewer** (read-only).

## Hardening (optional)

The default RLS policies allow the anon key full read/write. Anyone with your deployed anon key can modify data outside the app. Tighter setups: use **service role** only in Route Handlers / server actions for writes, or add real authentication.

## Link previews

`GET /api/link-preview?url=` fetches HTML server-side, parses Open Graph / Twitter meta tags, and upserts into `link_previews`. Many sites block bots or return empty HTML; the UI falls back gracefully.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — production server
- `npm run lint` — ESLint

## New schema changes

```bash
supabase migration new describe_your_change
```

Edit the new SQL file under `supabase/migrations/`, then `supabase db push`.
