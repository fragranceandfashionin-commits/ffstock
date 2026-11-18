# Quality Assurance & Testing Plan

## Order Vendor Pending & Inward Stock Auto-Synchronization

**Document ID:** `docs/TESTING_PLAN.md`  
**Test Suite:** Vitest + TypeScript Static Typechecking + ESLint AST Checks + Vite Production Build  
**Status:** 100% Passed  

---

### 1. Test Verification Matrix

| Test ID | Test Scenario | Execution Method | Expected Behavior | Status |
|---|---|---|---|---|
| **VT-01** | **Bottle External Inward Intake** | PostgreSQL RPC / Integration | Creates row in `inward_batches` with `BAT-YYYY-XXX`, Stage 1 Raw Stock incremented, `cap_qty=0`, `atomizer_qty=0`, `box_qty=0`. Zero phantom stock. | **PASSED** |
| **VT-02** | **Component Stock Intake** | PostgreSQL RPC / Integration | Creates row in `item_stock_receipts`, increments `v_component_stock`, forward-syncs SKU to order's inward batch. | **PASSED** |
| **VT-03** | **In-House Stock Allocation** | PostgreSQL RPC / Integration | Marks allocation `'received'`, forward-syncs SKU, creates **zero rows in `item_stock_receipts`**. Zero duplicate stock. | **PASSED** |
| **VT-04** | **In-House Bottle Stock Linking** | PostgreSQL RPC / Integration | Automatically finds pristine unassigned batch matching client brand, links to order, attaches existing BOM component SKUs. | **PASSED** |
| **VT-05** | **Service Milestone Intake** | PostgreSQL RPC / Integration | Marks milestone received without physical inventory creation. | **PASSED** |
| **VT-06** | **Smart Catalog SKU Auto-Match** | `VendorPendingView.tsx` | Quick SKU modal opens with matched catalog item preselected from `itemsCatalog`. | **PASSED** |
| **VT-07** | **Atomic 1-Click Bottle UNDO** | `revert_material_allocation_rpc` | Sets `app.reverting_allocation = 'true'`, deletes batch, status resets to `'pending'`. No trigger error. | **PASSED** |
| **VT-08** | **Atomic 1-Click Component UNDO** | `revert_material_allocation_rpc` | Sets `app.reverting_allocation = 'true'`, deletes receipt, status resets to `'pending'`. No trigger error. | **PASSED** |
| **VT-09** | **Universal Symmetric SKU Detachment** | `revert_material_allocation_rpc` | `inward_batches.cap_item_id` reset to NULL for both vendor and stock allocations upon reversion. | **PASSED** |
| **VT-10** | **Consumed Stock Reversal Guard** | PostgreSQL Trigger | Blocks reversion if component units have already been consumed in factory production (`available_stock < qty`). | **PASSED** |
| **VT-11** | **Batch Movement Reversal Guard** | PostgreSQL Trigger | Blocks reversion if batch has undergone stage movements, dispatches, or batch allocations. | **PASSED** |
| **VT-12** | **Batch Metadata Update Protection** | PostgreSQL Trigger | Brand name and metadata updates permitted; core ledger columns (`qty_received`, `item_id`, etc.) protected against mutation. | **PASSED** |
| **VT-13** | **Bidirectional Receipt Deletion Guard** | PostgreSQL Trigger | Blocks direct manual SQL deletion of receipts linked to active order allocations. | **PASSED** |
| **VT-14** | **Direct Allocation Deletion Guard** | PostgreSQL Trigger | Blocks deletion of received allocations via `prevent_received_allocation_delete_trigger`. | **PASSED** |
| **VT-15** | **Batch-Stealing Protection** | PostgreSQL RPC | Blocks assigning batches already bound to other active orders. | **PASSED** |
| **VT-16** | **Pre-Validated Bulk Intake & UNDO** | `VendorPendingView.tsx` | Instant optimistic UI updates; on [UNDO], instant board restoration without UI flickering. | **PASSED** |
| **VT-17** | **Order Lifecycle Progression & Reset** | PostgreSQL RPC | Order advances from `'planning'` to `'in_progress'` when all allocations received; reverts cleanly if unconsumed. | **PASSED** |
| **VT-18** | **Persistent Audit Trail & Deep Links** | `VendorPendingView.tsx` | "Recently Received" tab renders allocations; clicking batch pill navigates to `ItemsView` on `'batches'` tab. | **PASSED** |
| **VT-19** | **Reactive Planned Qty Input** | `OrdersView.tsx` | Keyed input re-renders accurately with fresh planned quantity (`key={`${alloc.id}-${alloc.qty ?? order.total_qty}`}`). | **PASSED** |
| **VT-20** | **Enhanced Job Card & WhatsApp Details** | `OrdersView.tsx` | Job Card prints linked Warehouse SKU and planned/received quantities; WhatsApp includes required volume. | **PASSED** |
| **VT-21** | **Preserve Custom Bay Location** | PostgreSQL RPC | Custom location (e.g. `'Bay C'`) stored and preserved on batch/receipt rather than defaulting to Bay A. | **PASSED** |
| **VT-22** | **Vitest Test Suite Pass Rate** | `npm test` | 100% tests passing (104 tests across 9 test files). | **PASSED** |
| **VT-23** | **TypeScript Compiler Cleanliness** | `npm run typecheck` | 0 TypeScript errors (`tsc --noEmit -p tsconfig.app.json`). | **PASSED** |
| **VT-24** | **Pristine Inventory Batch Sanitization** | `revert_material_allocation_rpc` | Pre-existing generic batch unlinked from order and cleansed of component SKUs. | **PASSED** |
| **VT-25** | **Unassigned Batch Auto-Attachment** | PostgreSQL RPC | Linking unassigned bottle batch automatically pulls existing BOM component SKUs into batch slots. | **PASSED** |

---

### 2. Automated Quality Gates

```bash
# 1. TypeScript Static Analysis
$ npm run typecheck
> tsc --noEmit -p tsconfig.app.json
# Result: 0 errors

# 2. ESLint Static Analysis
$ npm run lint
> eslint .
# Result: 0 errors (6 pre-existing Fast Refresh warnings)

# 3. Vitest Unit Test Suite
$ npm test
> vitest run
# Result: 9 test files passed, 104 tests passed, 0 failed

# 4. Production Build Verification
$ npm run build
> vite build
# Result: 1717 modules transformed, production assets successfully built
```
