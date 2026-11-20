# 08. Testing and Quality Assurance Strategy

## 1. Testing Framework and Strategy

The application leverages **Vitest** for high-speed, in-memory unit and integration testing.

- **Baseline Test Suite:** 11 test suites, 118 unit and calculation tests currently passing.
- **Coverage Target:** Zero regressions across existing tests, and 100% test coverage for new BOM duplication, sorting, and deletion utilities.

---

## 2. Test Cases to Implement

### Test Suite: `src/views/orders/__tests__/orderBomSku.test.ts`

```typescript
describe('BOM Component Duplication and Compound Sorting', () => {
  describe('sortAllocations', () => {
    it('sorts canonical components by sort_order ascending', () => {
      // Bottles (1) should come before Raw Material (2) and Box (4)
    });

    it('groups duplicated components contiguously in chronological order', () => {
      // 3 Raw Material allocations (sort_order: 2) created at t1, t2, t3
      // Must appear immediately after Bottles (1) and before Sticker (3)
      // in exact order t1, t2, t3
    });

    it('places ad-hoc custom components at the end', () => {
      // Component with sort_order: 99 appears after all standard components
    });
  });

  describe('isAllocationDeletable', () => {
    it('prevents deletion of canonical base component when count is 1', () => {
      // Single 'Bottles' allocation with sort_order: 1 -> false
    });

    it('allows deletion of duplicate component lines when count > 1 and pending', () => {
      // Second 'Bottles' allocation with sort_order: 1 and status: 'pending' -> true
    });

    it('strictly forbids deletion of received duplicate lines', () => {
      // Second 'Bottles' allocation with status: 'received' -> false
    });

    it('allows deletion of custom component lines with sort_order > 10 when pending', () => {
      // Custom allocation with sort_order: 99 and status: 'pending' -> true
    });
  });
});
```

---

## 3. Manual QA & End-to-End Validation Runbook

| Step | Action | Expected Result | Pass / Fail |
|---|---|---|---|
| 1 | Navigate to Orders view (`OrdersView.tsx`) | Orders list loads with collapsed/expanded cards | [ ] |
| 2 | Expand order `PO-2026-006` | BOM table displays with `#`, `Component`, `Source`, `Planned Qty`, etc. | [ ] |
| 3 | Locate Row 2 (`Raw Material`) and click the contextual `+` button | Toast notification: `Added another line for "Raw Material"`. New line appears immediately below Row 2. | [ ] |
| 4 | Check table section header | Header dynamically updates to `11-Component Bill of Materials (BOM)`. Card completion badge shows `0/11 Received`. | [ ] |
| 5 | Configure the new line: enter spec `Rose variant`, select a Catalog SKU, select a Supplier, set Due Date | Values persist cleanly on blur. | [ ] |
| 6 | Click `+` button on `Raw Material` again | A 3rd `Raw Material` line appears immediately below the 2nd line. Total count is now 12. | [ ] |
| 7 | Click the trash icon on the 3rd `Raw Material` line | 3rd line is removed cleanly. Count returns to 11. Base row remains undeletable. | [ ] |
| 8 | Mark the 2nd `Raw Material` line as `Received` | Status toggles to `Received` (emerald badge). Delete icon is disabled or hidden. Inward stock links correctly. | [ ] |
| 9 | Click `Job Card` button on the order header | Print traveler sheet renders all 11 component lines with individual SKUs and suppliers. | [ ] |
| 10 | Navigate to `Vendor Pending` view | Duplicated vendor lines appear as separate line items under their assigned vendors. | [ ] |

---

## 4. Defect Severity Matrix

- **S0 (Critical Block):** Data corruption or ledger discrepancy upon duplicate row creation. Release blocker.
- **S1 (Major Defect):** Duplicated lines fail to save or trigger Supabase error. Release blocker.
- **S2 (Moderate Defect):** Duplicated row sort order incorrect or out of sequence. Must fix before sign-off.
- **S3 (Minor Inconsistency):** Minor styling or hover inconsistency. Accepted for fast follow-up.
