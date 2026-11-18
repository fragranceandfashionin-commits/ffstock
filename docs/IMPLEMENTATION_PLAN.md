# Implementation Plan

## Order Vendor Pending & Inward Stock Auto-Synchronization

**Document ID:** `docs/IMPLEMENTATION_PLAN.md`  
**Base Source of Truth:** `order_vendor_inward_sync_plan_v14.md`  
**Status:** Completed & Fully Verified  

---

### Execution Milestones

| Milestone | Scope | Target Files | Verification Gate |
|---|---|---|---|
| **M1: Database Migration** | PostgreSQL Schema Extensions, Triggers, Backfills & RPCs | `supabase/migrations/20261118000000_sync_order_allocations_to_inward_stock.sql` | Migration SQL verified for idempotency, constraints, advisory locks, session context guards. |
| **M2: Type System Layer** | Backward-Compatible Extended Interfaces | `src/lib/types/database.ts` | Strict TypeScript types matching backend schemas without optional mismatches. |
| **M3: Query & Ledger Protection** | Used Batch Protection & RPC Query Mutations | `src/lib/queries/batches.ts`<br/>`src/lib/queries/vendor-portal.ts` | Unit tests assert RPC signatures, options forwarding, and canonical filter chaining. |
| **M4: Automated Test Suite** | Vitest Regression & Contract Tests | `src/lib/__tests__/vendor-portal.test.ts` | 100% test pass rate across Vitest runner (104 tests passed). |
| **M5: Realtime & Navigation** | Realtime Multi-User Sync & Ledger Deep Linking | `src/views/ItemsView.tsx`<br/>`src/views/items/InwardBatchesTab.tsx` | Realtime channel subscribes to `material_allocations`; `searchQuery` and `activeTab` synchronize on props change. |
| **M6: Orders View BOM Matrix** | 11-Column Matrix, Dual Selectors & Printable Job Card | `src/views/OrdersView.tsx` | Clean compilation with zero TS warnings; pre-flight SKU guard and reactive keyed planned quantity input. |
| **M7: Vendor Pending Board** | Turnkey Quick SKU Modal, Bulk Verification & Persistent Audit | `src/views/VendorPendingView.tsx` | Auto-matching against `itemsCatalog`; enriched optimistic UI with instant [UNDO]; persistent historical received allocations. |
| **M8: Production Verification** | Build & Quality Assurance Pipeline | Entire Workspace | `npm run check` (`typecheck`, `lint`, `test`, `build`) passes cleanly. |

---

### Step-by-Step Task Breakdown

1. **Step 1 — Database Migration**
   - Implemented `supabase/migrations/20261118000000_sync_order_allocations_to_inward_stock.sql`.
   - Extended `material_allocations` (`qty`, `qty_received`, `inward_batch_id`, `receipt_id`, `location`).
   - Extended `inward_batches` and `item_stock_receipts` with backlinks (`order_id`, `allocation_id`).
   - Created `prevent_received_allocation_delete_trigger`.
   - Created context-guarded `allow_unconsumed_receipt_delete` and `allow_empty_batch_delete`.
   - Created `receive_material_allocation_rpc` with advisory locks, pristine brand matching, SKU auto-attachments, zero phantom stock, and custom location preservation.
   - Created `revert_material_allocation_rpc` with `app.reverting_allocation` context guard and unlinked inventory batch sanitization.
   - Created batch RPCs: `batch_receive_material_allocations_rpc` and `batch_revert_material_allocations_rpc`.

2. **Step 2 — Type System Extensions**
   - Updated `src/lib/types/database.ts` for `MaterialAllocation`, `MaterialAllocationWithVendorRelations`, `InwardBatch`, and `ItemStockReceipt`.

3. **Step 3 — Ledger Batch Protection**
   - Updated `src/lib/queries/batches.ts` to extend `fetchUsedBatchIds` with `material_allocations.inward_batch_id`.

4. **Step 4 — Query Layer Mutations**
   - Updated `src/lib/queries/vendor-portal.ts` with RPC-backed mutations:
     - `markAllocationReceived`
     - `revertAllocationToPending`
     - `batchMarkAllocationsReceived`
     - `batchRevertAllocationsToPending`
     - `fetchRecentlyReceivedAllocations` (canonical filter-first chaining: `.eq('source', sourceFilter)` prior to `.order()` and `.limit()`).

5. **Step 5 — Unit Test Suite**
   - Implemented `src/lib/__tests__/vendor-portal.test.ts`. Verified all single and batch operations, option forwarding, and filter chaining.

6. **Step 6 — Items & Batches Realtime Synchronization**
   - Updated `src/views/ItemsView.tsx`: added `material_allocations` to the realtime channel, synchronized `searchQuery` with `initialBatchId`, and synchronized `activeTab` with `initialActiveTab`.

7. **Step 7 — Inward Batches Search Expansion**
   - Updated `src/views/items/InwardBatchesTab.tsx` to match both batch UUID (`b.id.toLowerCase() === q`) and `batch_no`.

8. **Step 8 — Orders View BOM Matrix & Job Card**
   - Cleaned unused declarations (`createProductionOrder`, `ProductionOrder`, `role`).
   - Added pre-flight SKU validation guard before receiving physical components.
   - Added reactive keyed planned quantity input (`qty`).
   - Implemented aligned 11-column table matrix with dedicated Warehouse SKU selector and dedicated Supplier selector.
   - Upgraded printable Factory Job Card traveler sheet.

9. **Step 9 — Vendor Pending View Turnkey Implementation**
   - Imported `fetchItems` and populated `itemsCatalog` in `loadData()`.
   - Wired `fetchRecentlyReceivedAllocations('vendor', 50)` on mount and refresh.
   - Implemented Turnkey Quick SKU Modal with auto-matching against `itemsCatalog`.
   - Implemented Pre-Validated Bulk Intake Modal with SKU mappings and enriched optimistic updates with instant [UNDO].
   - Configured deep-linked batch pill with `activeTab: 'batches'`.

10. **Step 10 — Production Quality Gates**
    - Ran `tsc --noEmit` -> 0 errors.
    - Ran `eslint .` -> 0 errors.
    - Ran `vitest run` -> 104 tests passing.
    - Ran `vite build` -> production build succeeded in 8.92s.
