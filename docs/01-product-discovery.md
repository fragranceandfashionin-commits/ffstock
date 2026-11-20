# 01. Product Discovery and Project Audit

## 1. Executive Summary & Product Context

**Product Name:** ffstock Live Ledger (Factory Inventory & Production Portal)  
**Primary Domain:** Fragrance, Cosmetics, and FMCG Contract Manufacturing & Production Operations  
**Core Stack:** React 18 (Vite 6), TypeScript 5.5, Tailwind CSS 3.4, Supabase (PostgreSQL 15+, Row-Level Security, Realtime Subscriptions), Vitest.  
**Operating Environment:** Production-ready web application deployed on Vercel with managed Supabase cloud backend.

The application serves plant general managers, production supervisors, procurement managers, and inventory operators managing production runs, bill of materials (BOM), raw material inwards, stage transitions, and dispatches.

---

## 2. Visual Artifact & User Evidence Audit

Based on the operational snapshot provided from production (`media_1795175811607_cefdafd7.jpg`):

- **Active Order Context:** `PO-2026-006` for client `brittor fabara (shubashlok)`.
- **Product:** `pack of 3 combo` (1,000 units, status: `PLANNING`).
- **Observed Pain Point:** 
  In Row 2 (`Raw Material`), the user entered `1000 X 3 variant` in the single available specification input. 
  Similarly, combo packs often comprise multiple bottle models, distinct fragrance formulations, individual sticker labels per variant, and customized packaging components.
- **Root Cause Identified:** 
  The current BOM table strictly provisions **one row per component category** (10 default rows: Bottles, Raw Material, Sticker, Box, Atomizer, Cap, Coating, Printing, Inner Outer, Cellophane). 
  While a generic input exists at the bottom ("+ Add custom component name"), it appends orphaned rows at `sort_order: 99` at the bottom of the table. There is no contextual `+` action directly on the component line (e.g., adding a 2nd and 3rd Raw Material or Bottle line grouped together).
- **Hardcoded Header Anomaly:** 
  The UI header displays `10-COMPONENT BILL OF MATERIALS (BOM)` even when the progress indicator on top reads `0/11 Received` (indicating 11 components exist for the order).

---

## 3. Technology Stack Inventory

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Runtime / Bundler | Node.js / Vite | 6.4.3 | Frontend tooling and development server |
| Language | TypeScript | ^5.5.3 | Static type safety across client and queries |
| UI Framework | React | ^18.3.1 | Core component architecture |
| Styling | Tailwind CSS | ^3.4.1 | Utility-first responsive design tokens |
| Icons | Lucide React | ^0.344.0 | UI iconography |
| Database & Auth | Supabase JS | ^2.39.8 | PostgreSQL client, RLS, Auth, Realtime |
| Unit Testing | Vitest | ^5.0.1 | Unit and calculation test runner |
| Deployment | Vercel | Configuration in `vercel.json` | Production CDN hosting |

---

## 4. Codebase Architecture & File Mapping

```
c:\stock track\project\
├── src\
│   ├── views\
│   │   ├── OrdersView.tsx              # Primary production orders and BOM matrix management
│   │   ├── OrderHistoryView.tsx        # Completed / archived orders and BOM logs
│   │   ├── VendorPendingView.tsx       # Procurement and pending vendor allocations board
│   │   ├── ItemsView.tsx               # Warehouse inventory catalog & inward batches
│   │   └── orders\
│   │       ├── orderBomUtils.ts        # Category mapping and specification resolution
│   │       └── __tests__\
│   │           └── orderBomSku.test.ts # Smart pre-fill and category unit tests
│   ├── lib\
│   │   ├── queries\
│   │   │   ├── vendor-portal.ts        # Orders, material allocations, and receipt RPCs
│   │   │   └── index.ts                # Query barrel export
│   │   ├── types\
│   │   │   └── database.ts             # Schema definitions: MaterialAllocation, ProductionOrder
│   │   └── supabase.ts                 # Supabase client singleton & auth helpers
├── supabase\
│   ├── migrations\
│   │   ├── 20260920000000_add_vendor_portal_schema.sql
│   │   └── 20261118000000_sync_order_allocations_to_inward_stock.sql
│   └── setup.sql                       # Full database schema and policies
└── docs\                               # Architectural & product documentation
```

---

## 5. Current Data Flow & Component Lifecycles

1. **Order Creation:**
   - Operator creates an order via `handleCreateBatchOrder` in `OrdersView.tsx`.
   - Database RPC `create_production_order_with_allocations` inserts 1 `production_orders` record and creates 10 initial rows in `material_allocations` from `bom_categories` (`sort_order` 1 through 10).
2. **Allocation Management:**
   - Each BOM row allows editing: `source` ('vendor' vs 'stock'), `qty` (planned quantity), `description` (specification), `stock_item_id` (warehouse SKU), `vendor_id` (supplier), `timeline` (due date), and `location`.
   - Updates persist via `handleAllocationFieldChange` -> `updateMaterialAllocation` -> Supabase update.
3. **Receiving Workflow:**
   - Clicking status pill triggers `handleToggleAllocationStatus`.
   - Physical items require a linked `stock_item_id`.
   - Calls `markAllocationReceived` -> atomic RPC `receive_material_allocation_rpc` which updates inventory receipts and links inward batches.
4. **Current Deletion Rules:**
   - `OrdersView.tsx` line 1491 restricts row deletion: `alloc.sort_order > 10 && canPerform('manage_orders')`.
   - Database trigger `prevent_received_allocation_delete_trigger` prevents deletion of any row with `status = 'received'` or attached receipt/batch.

---

## 6. Technical Debt and Defect Register

| ID | Issue Description | Severity | Impact |
|---|---|---|---|
| TD-01 | Lack of contextual "+" button to duplicate/add same component line in BOM matrix | High | Blocks multi-variant orders (e.g. 3-pack combos) from clean tracking |
| TD-02 | Hardcoded `sort_order > 10` deletion restriction in `OrdersView.tsx` | High | Prevents deleting duplicated component rows if assigned `sort_order <= 10` |
| TD-03 | Hardcoded string `10-Component Bill of Materials (BOM)` in UI table header | Low | Visual inconsistency when order contains >10 components (e.g. 11 in screenshot) |
| TD-04 | `addAllocationRow` does not accept `qty`, `description`, or `location` | Medium | Duplicate rows fail to inherit planned quantity or warehouse location |
| TD-05 | Client-side sorting `a.sort_order - b.sort_order` lacks tie-breaker | Medium | Duplicate rows with identical `sort_order` may reorder non-deterministically |

---

## 7. Baseline Verification Status

- **Automated Tests:** 11 test files, 118 tests passed (`vitest run --run`).
- **Production Build:** `npm run build` succeeds cleanly in 7.78s.
- **Git Tree Status:** Working directory is clean on `origin/main`.
- **System Readiness:** Gate 1 Passed. Proceed to Requirements Specification.
