# 02. Product Requirements and Scope Definition

## 1. Product Vision & Problem Statement

To deliver production-grade flexibility for complex fragrance, cosmetics, and combo-pack manufacturing, production planners must be able to provision multiple component lines of the same BOM category (e.g. 3 raw material fragrance oils, 3 variant stickers, or 2 different bottle SKUs) with a single click directly from the BOM matrix row.

---

## 2. User Personas & Permissions

| Persona | Role Key | Permissions relevant to BOM Modification |
|---|---|---|
| Plant General Manager | `admin` | Full control: create, duplicate, modify, delete, and receive all BOM lines |
| Production Supervisor | `production_manager` | Can modify allocations, add similar component lines, delete pending extra lines, mark received |
| Warehouse Storekeeper | `inventory_operator` | Can view BOM, update locations, mark received; cannot add/delete BOM lines |
| Procurement Lead | `procurement` | Can assign vendors, due dates, and view pending allocations |

---

## 3. Traceable Requirements Matrix

| Req ID | Priority | Description | Acceptance Criteria | Validation Method |
|---|---|---|---|---|
| **REQ-BOM-001** | **P0** | Contextual "+" button in Component column | Each BOM row displays an accessible `+` button next to the component name badge. Clicking it creates a new line for that exact component type. | UI test & user interaction |
| **REQ-BOM-002** | **P0** | Smart field inheritance on duplicate | The newly generated BOM line inherits: `component_name`, `sort_order`, `source` (defaulting to parent source), `qty` (defaulting to parent qty or order `total_qty`), `location` (defaulting to 'Raw Stock Bay A'), and `status` = 'pending'. | Unit & Integration Test |
| **REQ-BOM-003** | **P0** | Immediate contiguous grouping | The new line must immediately render directly below the existing lines of the same component type in chronological creation sequence. | Component sort order test |
| **REQ-BOM-004** | **P0** | Independent line-level operations | Each duplicated line has its own independent: Warehouse SKU selector, "+ Create New SKU" modal trigger, Assigned Supplier dropdown, Planned Qty, Specification input, and Expected Due Date. | Component integration test |
| **REQ-BOM-005** | **P0** | Safe line-level deletion | Duplicated/extra lines can be deleted if `status === 'pending'`. The original base row is protected from accidental deletion if it is the sole remaining instance. No received line can be deleted. | Unit test & regression test |
| **REQ-BOM-006** | **P1** | Dynamic BOM section header | Replaces static `10-Component Bill of Materials (BOM)` with dynamic `{allocations.length}-Component Bill of Materials (BOM)` reflecting real count (e.g. 11, 12, 13). | UI component assertion |
| **REQ-BOM-007** | **P1** | Dynamic creation toast message | Order creation toast dynamically renders the exact component count created. | Automated toast check |
| **REQ-BOM-008** | **P1** | Factory Job Card Traveler compatibility | Printable Job Card traveler sheet prints all duplicated lines with index, component name, individual planned qty, SKU, and vendor. | Print view verification |
| **REQ-BOM-009** | **P1** | Vendor Pending view compatibility | Duplicated lines assigned to external vendors appear cleanly as separate order lines in `VendorPendingView.tsx` with their individual specifications. | Unit test `vendorPendingGrouping` |
| **REQ-BOM-010** | **P1** | Repeat Order RPC compatibility | Cloned orders via `repeat_production_order` faithfully copy all duplicated lines with all specifications and quantities. | SQL RPC verification |

---

## 4. Edge Cases and Business Rules

1. **Service Milestones vs Physical Items:**
   - Components like `Coating`, `Printing`, `Stamping`, `Metallization`, `Embossing` are treated as service milestones (`isService = true`).
   - If duplicated, the new service milestone line inherits `isService` behavior (SKU dropdown replaced with "✓ Service Milestone").
2. **Pre-flight Receiving Guard:**
   - Physical duplicate lines require an assigned Warehouse SKU or matching catalog name before being toggled to `received`.
3. **Optimistic UI Updates:**
   - Adding a duplicate row should optimistically update local state or trigger a focused reload without collapsing the expanded BOM accordion.
4. **Deleted Row Reversal:**
   - If an allocation was marked received and then deleted, database trigger `prevent_received_allocation_delete` raises an exception. The user must first revert the allocation to pending before deleting.

---

## 5. Non-Functional Requirements

- **Performance:** Adding a duplicate line must complete with `<150ms` UI response time.
- **Accessibility:** The `+` button must have an explicit `aria-label="Add another {component_name} line"` and keyboard accessibility (`Enter` / `Space`).
- **Responsive Design:** Maintains clean horizontal table layout on screens from 1024px to 4K displays with horizontal scrolling on smaller viewports.
- **Security:** Requires `manage_orders` permission to invoke duplication or deletion.
