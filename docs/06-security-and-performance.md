# 06. Security, Reliability and Performance Plan

## 1. Security & RBAC Enforcement

### Access Control Rules:
All modifications to production order allocations are strictly gated by application permissions and database Row Level Security (RLS).

| Operation | Required RBAC Permission | Database Policy / Trigger |
|---|---|---|
| Add duplicate BOM component row | `manage_orders` | `shared_insert_material_allocations` RLS check |
| Edit component fields (SKU, Qty, Vendor) | `manage_orders` | `shared_update_material_allocations` RLS check |
| Mark component as Received | `manage_orders` | `receive_material_allocation_rpc` SECURITY DEFINER |
| Revert component to Pending | `reverse_allocation` | `revert_material_allocation_rpc` SECURITY DEFINER |
| Delete component line | `manage_orders` | `prevent_received_allocation_delete_trigger` trigger guard |

### Input Validation & Sanitization:
- **Component Names:** Trimmed, checked for non-empty string, length constrained.
- **Quantities:** Constrained to positive integers `qty >= 0` via Postgres check constraint `material_allocations_qty_check`.
- **Foreign Keys:** UUID format strictly enforced by PostgreSQL typing; invalid references rejected with foreign key violations.
- **XSS Prevention:** All user strings (descriptions, component names) are rendered through React’s JSX engine which auto-escapes HTML characters.

---

## 2. Ledger Reliability and Integrity

### The "Never Orphan a Received Item" Rule:
When an allocation is marked received, the system creates or links an `inward_batches` entry and `item_stock_receipts` record.
- **Database Trigger:** `prevent_received_allocation_delete_trigger` ensures that no SQL operation can delete an allocation record that has active stock linkages.
- **Error Handling:** If an operator attempts to delete a received row, the database throws an explicit exception:
  `Cannot delete BOM allocation {id} for {component}: it has already been received into inventory. Revert the allocation to pending first before deleting.`

---

## 3. Performance Optimization Plan

### DOM Rendering & Form Keying:
- To prevent typing lag across multi-row BOM matrices, each input uses `defaultValue` and triggers state updates on `onBlur` (rather than re-rendering on every keystroke).
- Distinct `key` props (`${alloc.id}-${alloc.qty}`) ensure proper reconciliation without losing cursor focus.

### Client-Side Sorting Complexity:
- Sorting allocations uses a fast $O(N \log N)$ compound comparator where $N \le 50$ items per order:
  ```typescript
  allocations.sort((a, b) => (a.sort_order - b.sort_order) || (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
  ```
- Memoization: Filtered orders and sorted allocations are memoized with `useMemo` to eliminate unnecessary DOM recalculations during unrelated view toggles.

### Realtime Subscription Debouncing:
- When a real-time postgres change event fires on `material_allocations`, `loadData(true)` executes in background mode without resetting user inputs or collapsing open order panels.
