# 07. Implementation Breakdown and Execution Roadmap

## 1. Workstream Breakdown & Task Sequencing

The implementation is partitioned into 5 sequential, independently verifiable phases:

```
[Phase 1: Query & Type Layer] -> [Phase 2: BOM Utilities & Sorting] -> [Phase 3: OrdersView UI Integration] -> [Phase 4: Multi-View Consistency] -> [Phase 5: Verification & Quality Assurance]
```

---

## 2. Detailed Task Specification

### Phase 1: Query & Type Layer Enhancement

#### Task 1.1: Extend `addAllocationRow` Query Function
- **File:** `src/lib/queries/vendor-portal.ts`
- **Scope:** Update payload interface to accept `qty`, `description`, `location`, `stock_item_id`, and `vendor_id`.
- **Implementation:** Include these fields in the `supabase.from('material_allocations').insert(...)` call.
- **Risk:** Low. Fully backward compatible.

---

### Phase 2: BOM Utilities & Sorting Logic

#### Task 2.1: Add Compound Sorting Helper
- **File:** `src/views/orders/orderBomUtils.ts`
- **Scope:** Export `sortAllocations(allocations: MaterialAllocation[])` which sorts primarily by `sort_order ASC` and secondarily by `created_at ASC`.
- **Test:** Add unit test in `src/views/orders/__tests__/orderBomSku.test.ts`.

#### Task 2.2: Add Row Deletability Helper
- **File:** `src/views/orders/orderBomUtils.ts`
- **Scope:** Export `isAllocationDeletable(alloc: MaterialAllocation, allAllocations: MaterialAllocation[]): boolean`.
- **Rule:** Returns true if `alloc.status !== 'received'` AND (`alloc.sort_order > 10` OR there is more than 1 allocation with the same `component_name`).
- **Test:** Add unit test covering all boundary conditions.

---

### Phase 3: OrdersView UI Integration

#### Task 3.1: Implement `handleDuplicateComponentRow`
- **File:** `src/views/OrdersView.tsx`
- **Scope:** Create handler that receives `(orderId: string, sourceAlloc: MaterialAllocation)`.
- **Steps:**
  1. Check `canPerform('manage_orders')`.
  2. Call `addAllocationRow` with:
     - `order_id`: `orderId`
     - `component_name`: `sourceAlloc.component_name`
     - `sort_order`: `sourceAlloc.sort_order`
     - `source`: `sourceAlloc.source`
     - `qty`: `sourceAlloc.qty || order.total_qty || 0`
     - `description`: `null` (clean specification for the new variant)
     - `location`: `sourceAlloc.location || 'Raw Stock Bay A'`
  3. Show success toast: `Added another line for "${sourceAlloc.component_name}"`.
  4. Optimistically update local order state and refresh via `loadData(true)`.

#### Task 3.2: Render In-Row "+" Button in Component Column
- **File:** `src/views/OrdersView.tsx`
- **Scope:** In table body `allocations.map(...)`, update the Component `<td>` to render a flex container with the component name and the contextual `+` duplicate button.

#### Task 3.3: Dynamic Section Header & Create Toast
- **File:** `src/views/OrdersView.tsx`
- **Scope:** Replace hardcoded `10-Component Bill of Materials (BOM)` with dynamic `{allocations.length}-Component Bill of Materials (BOM)`.

#### Task 3.4: Dynamic Row Deletion Permissions
- **File:** `src/views/OrdersView.tsx`
- **Scope:** Replace `alloc.sort_order > 10` with `isAllocationDeletable(alloc, allocations)` so duplicate rows can be deleted when pending.

---

### Phase 4: Multi-View Consistency & Reporting

#### Task 4.1: Printable Job Card Traveler Sheet
- **File:** `src/views/OrdersView.tsx` (Print section)
- **Scope:** Ensure `printOrder.material_allocations` utilizes compound sorting so all duplicated variant lines print in grouped order.

#### Task 4.2: Order History View Sorting
- **File:** `src/views/OrderHistoryView.tsx`
- **Scope:** Ensure completed archived orders also utilize compound sorting for BOM lines.

---

### Phase 5: Verification and Quality Assurance

#### Task 5.1: Run Full Vitest Test Suite
- **Command:** `npm test -- --run`
- **Verification:** Ensure 100% of tests pass with zero regressions.

#### Task 5.2: Run Full Production Build
- **Command:** `npm run build`
- **Verification:** Ensure Vite production bundle compiles cleanly.

---

## 3. Dependency-Aware Execution Sequence

| Step | Task ID | Dependencies | Target Artifact |
|---|---|---|---|
| 1 | Task 1.1 | None | `src/lib/queries/vendor-portal.ts` |
| 2 | Task 2.1 & 2.2 | Task 1.1 | `src/views/orders/orderBomUtils.ts` |
| 3 | Unit Tests | Task 2.1 & 2.2 | `src/views/orders/__tests__/orderBomSku.test.ts` |
| 4 | Task 3.1 - 3.4 | Task 2.1 & 2.2 | `src/views/OrdersView.tsx` |
| 5 | Task 4.1 & 4.2 | Task 3.4 | `src/views/OrderHistoryView.tsx` |
| 6 | QA & Build | All | Vitest & Vite Build |
