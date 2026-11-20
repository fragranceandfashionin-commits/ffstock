# 10. Risks and Open Decisions

## 1. Risk Register

| Risk ID | Risk Description | Severity | Likelihood | Mitigation Strategy |
|---|---|---|---|---|
| **RSK-001** | Rapid consecutive clicks on `+` button causing race condition or duplicated requests | Medium | Low | Add local UI debouncing / loading state (`isAddingRow`) on the button click handler to prevent multi-submissions. |
| **RSK-002** | User attempts to delete a duplicated component row that has already been received | High | Low | UI prevents deletion by disabling or hiding trash icon if `status === 'received'`. Defensive PostgreSQL trigger `prevent_received_allocation_delete_trigger` halts unauthorized deletions at the database layer. |
| **RSK-003** | Print overflow on Job Card traveler sheet if order contains >15 BOM lines | Low | Medium | Apply standard print media styles (`page-break-inside: avoid` on table rows, compact print padding) to ensure multi-page print sheets format cleanly. |
| **RSK-004** | Sort order drift if multiple operators duplicate lines concurrently | Low | Low | Compound sorting primarily evaluates `sort_order` and breaks ties with deterministic ISO timestamp `created_at ASC`, ensuring identical rendering across all client machines. |

---

## 2. Architectural Decisions & Alternatives Considered

### Decision 1: Contextual In-Row "+" vs. Top "Add Component" Modal
- **Option A (In-Row Contextual Button - Selected):**
  A discrete `+` button directly inside the Component column for that specific row.
  *Rationale:* Provides zero-friction, one-click duplication. The operator does not need to re-type "Raw Material", pick category, or guess `sort_order`. It preserves context directly where the operator is looking (e.g. at the `1000 X 3 variant` row).
- **Option B (Separate Modal / Dialog):**
  Opening a modal dialog asking for component name and details.
  *Rationale for Rejection:* Adds unnecessary clicks and interaction friction for operators on the factory floor.

### Decision 2: Inheritance of Planned Quantity (`qty`)
- **Selected Approach:** 
  The duplicated row inherits the parent row's `qty` (or `order.total_qty`), but leaves `description` blank (or pre-populates with variant placeholder) so the operator can type the specific variant name (e.g., `Oud Wood variant`) immediately.
  *Rationale:* Minimizes data entry while ensuring valid quantities for procurement and inventory receipts.

---

## 3. Implementation Readiness Sign-off

- [x] Product Discovery and Codebase Audit completed.
- [x] Problem statement verified against real visual evidence (`media_1795175811607_cefdafd7.jpg`).
- [x] Requirements, Architecture, UI/UX, Security, Testing, and Deployment plans documented.
- [x] Gate 1, 2, and 3 criteria fully satisfied.
- **Status:** **Ready for Execution.**
