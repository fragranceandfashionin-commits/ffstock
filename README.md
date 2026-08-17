# ffstock — Batch Ledger Inventory System

Batch-wise inventory ledger for bottle production. Tracks **inward batches** from suppliers, **movements** between production stages (Raw Stock → Coloring → Printing → Filling → Packaging → Ready), and **dispatches** to customers with invoice numbers.

Current stock is **never stored** — it is computed from the ledger (inward − movements − dispatches), and quantity rules are enforced **at the database level** with triggers, so the UI cannot record impossible numbers.

## Stack

- [Vite](https://vitejs.dev/) + [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (strict mode)
- [Tailwind CSS](https://tailwindcss.com/) v3
- [Supabase](https://supabase.com/) (PostgreSQL + Row Level Security)

## One-time setup

### 1. Create a Supabase project

Create a project at [supabase.com](https://supabase.com). Note your **project ref** (the part of the URL before `.supabase.co`).

### 2. Run the database migrations

In the Supabase Dashboard → **SQL Editor**, run these files **in order** (or paste the combined `supabase/setup.sql` once):

1. `supabase/migrations/20260813101116_create_batch_ledger_schema.sql`
2. `supabase/migrations/20260813120000_harden_rls_and_ledger_integrity.sql`
3. `supabase/migrations/20260813130000_add_batch_image_storage.sql`
4. `supabase/migrations/20260813140000_fix_quantity_validation_and_stock_views.sql`
5. `supabase/migrations/20260813150000_fix_batch_stock_ready_null_and_safe_delete.sql`
6. `supabase/migrations/20260817000000_add_storage_delete_and_scrap_support.sql`

The first creates the schema, seeds the seven production stages, and enables RLS. The second applies least-privilege policies and makes the ledger append-only (see [Security model](#security-model)). The third creates the public `batch-images` storage bucket for batch photos (only needed for the photo-upload feature). The fourth fixes quantity validation (a stage's available stock is no longer inflated by the full received quantity) and adds server-side stock views. The fifth fixes a bug where `v_batch_stock` returned `NULL` for Ready stock until a batch had its first dispatch (making Ready always show 0 and blocking the first dispatch), and allows deleting an inward batch **while it still has no movements/dispatches**. The sixth adds storage object deletion permissions for safe photo rollback on failed batch inserts or batch deletions.

> The migrations are idempotent: they can be re-run safely, and running the single combined `supabase/setup.sql` executes all 6 migrations in one go.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Then open `.env` and fill in:

| Variable | Where to find it |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Dashboard → **Project Settings → API → Project URL** |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → **Project Settings → API → Project API keys → `anon public`** |

Use the **anon** key, never `service_role` — the anon key is designed to be safe in the browser, `service_role` bypasses RLS and would be a critical leak.

### 4. Install and run

```bash
npm ci        # install dependencies (reproducible)
npm run dev   # start the dev server at http://localhost:5173
```

If `.env` is missing or misconfigured, the app shows a readable error screen explaining exactly what to fix — it never fails silently.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript strict type checking (no emit) |
| `npm run lint` | ESLint over the whole project |
| `npm run check` | Everything: typecheck + lint + build (run before deploy) |

## Security model

- **Row Level Security is on for every table.** The browser only ever talks to Supabase with the public anon key, so RLS policies are the real security boundary.
- **Least privilege.** Policies grant the anon role exactly what the UI does and nothing more:

  | table | anon / authenticated |
  | --- | --- |
  | `stages` | SELECT |
  | `suppliers`, `items` | SELECT, INSERT, DELETE |
  | `inward_batches` | SELECT, INSERT, DELETE (only while the batch has no movements/dispatches — enforced by trigger) |
  | `stage_movements`, `dispatches` | SELECT, INSERT |

- **Append-only ledger.** `inward_batches`, `stage_movements`, and `dispatches` reject `UPDATE` at the database level — recorded history cannot be silently altered, which is what makes the computed stock trustworthy. A batch can be `DELETE`d only while it has no movements or dispatches (a typo caught before any stock moves); once it has history it is locked, and corrections are made by inserting a **reversal movement** (SQL pattern is in the migration file).
- **Quantity integrity.** Positive-integer checks on every quantity column, and `BEFORE INSERT` triggers reject movements/dispatches that exceed available stock for the batch.
- **No secrets in the repo.** `.env` is gitignored; `.env.example` documents the variables with placeholders only. `service_role` is never used.
- **Strict tooling.** `strict` TypeScript with `noUnusedLocals`/`noUnusedParameters`, ESLint, and an error boundary that surfaces configuration failures instead of a blank page.

## Deployment

Any static host works — the app is a pure client-side bundle.

- **Vercel:** import the repo; build command `npm run build`, output `dist/`.
- **Netlify:** build command `npm run build`, publish directory `dist`.
- Add the two `VITE_*` variables as build-time environment variables on the host.
- In Supabase Dashboard → **Project Settings → API → Authentication → URL Configuration**, add your production domain to the allowed **Site URL / Redirect URLs** (or enable a permissive CORS setting for the anon key if needed).

## Project structure

```
src/
  components/       UI shell, shared primitives, error boundary
  lib/
    supabase.ts     Supabase client + config validation + shared row types
    queries.ts      Data access (stages, batches, stock calculations)
    types.ts        App-level types
    utils.ts        Formatting helpers
  views/            One view per screen (dashboard, inward, movement, ...)
supabase/migrations/  Database schema + security hardening (apply in order)
```

## FAQ

**Why is stock computed instead of stored?**
Storing running totals invites drift and desync. Computing from the append-only ledger means any two queries always agree, and every unit is traceable to an inward batch.

**I made a typo in a movement — how do I fix it?**
You don't edit it — you record the reversal. See the SQL pattern at the bottom of `supabase/migrations/20260813120000_harden_rls_and_ledger_integrity.sql`.

**Can I add login/roles later?**
Yes — the migrations already reference an `authenticated` role. Add Supabase Auth, a sign-in screen, and tighten the policies per role without changing the schema.
