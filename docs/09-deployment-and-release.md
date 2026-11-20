# 09. Deployment and Release Plan

## 1. Deployment Overview

- **Deployment Model:** Continuous Deployment via Git on Vercel frontend paired with Supabase PostgreSQL cloud backend.
- **Migration Requirements:** **Zero database migrations required.** The `material_allocations` schema and its existing check constraints already natively support multiple records per component category per order.
- **Downtime Expectation:** 0 seconds (Zero-downtime rolling update).

---

## 2. Pre-Deployment Verification Checklist

- [ ] All automated unit tests passing (`npm test -- --run`).
- [ ] TypeScript compilation passing with zero type errors (`npx tsc -b`).
- [ ] Vite production build passing (`npm run build`).
- [ ] Git working tree clean with well-documented commit message.
- [ ] Environment variables verified in production environment:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

---

## 3. Rollout Sequence

1. **Local Validation:**
   - Execute test suite and production build.
2. **Git Commit & Push:**
   - Commit changes to `main` branch.
3. **Vercel Build & Deploy:**
   - Vercel triggers automated build from `main`.
   - Asset hashes ensure zero cache contention.
4. **Smoke Test on Production:**
   - Verify production order card expansion.
   - Verify contextual `+` duplicate button on `Raw Material` and `Bottles`.
   - Verify persistence to Supabase and real-time reflection across open tabs.
   - Verify Job Card traveler sheet print rendering.

---

## 4. Rollback Plan

If unexpected defects are detected post-release:
- **Instant Rollback:** In the Vercel dashboard, click **Promote to Production** on the previous stable deployment (1-click instantaneous CDN pointer switch).
- **Git Revert:** Run `git revert HEAD` and push to `main`.
- **Database Safety:** Because no database schema migrations were applied, existing production orders and allocations will remain 100% intact and undamaged.
