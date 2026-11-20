# 05. UI/UX and Design System Specification

## 1. Visual Hierarchy and Layout Context

The Orders BOM matrix is rendered inside an expandable card per production order in `src/views/OrdersView.tsx`.

### Order Header & Completion Pill:
- **Client Title:** e.g., `brittor fabara (shubashlok)`
- **Order Tag:** `PO-2026-006` `pack of 3 combo` `PLANNING`
- **Units Count:** `1,000 units`
- **Dynamic Header:**
  - Before: `10-COMPONENT BILL OF MATERIALS (BOM)`
  - After: `{allocations.length}-COMPONENT BILL OF MATERIALS (BOM)`
  - Progress Indicator: `{receivedCount}/{totalCount} Received` `{percent}% complete`

---

## 2. Table Column Structure & In-Row "+" Placement

| Col # | Header Label | Width | Content / Interaction |
|---|---|---|---|
| 1 | `#` | `w-10 text-center` | Row index (`idx + 1`) in font-mono slate-400 |
| 2 | `Component` | `w-40` | **Target Column:** Flex layout with Component Name and Contextual `+` Button |
| 3 | `Source` | `w-28` | Toggle button group: `Vendor` vs `Stock` |
| 4 | `Planned Qty` | `w-28 text-center` | Keyed numeric input with unit badge (e.g. `g`, `ml`, `pcs`) |
| 5 | `Specification` | `min-w-[160px]` | Text input for variant specs (e.g. `11ml chinese bottle`, `Oud Wood variant`) |
| 6 | `Warehouse SKU` | `min-w-[200px]` | Select catalog SKU + `+` button to create catalog item |
| 7 | `Assigned Supplier` | `min-w-[180px]` | Dropdown for vendor selection (disabled if source === 'stock') |
| 8 | `Expected Due` | `w-28 text-center` | Date picker (`input[type="date"]`) |
| 9 | `Location` | `w-28` | Storage bay text input (default: `Raw Stock Bay A`) |
| 10 | `Status` | `w-32 text-center` | 1-Click Status Pill: `Pending` (amber) <-> `Received` (emerald) |
| 11 | Actions | `w-10 text-center` | Delete trash icon (visible when row is duplicate or sort_order > 10 and status is pending) |

---

## 3. Contextual "+" Button Specification

### Visual Styling:
- **Button Element:** `<button type="button" ...>`
- **Icon:** `<Plus className="h-3.5 w-3.5" />` from `lucide-react`.
- **Classes:**
  ```css
  shrink-0 p-1 rounded-md text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-colors shadow-2xs cursor-pointer
  ```
- **States:**
  - **Idle:** Subtle text-indigo-600 with clean padding.
  - **Hover:** Light indigo background (`bg-indigo-50`), border outline (`border-indigo-200`), dark indigo icon (`text-indigo-800`).
  - **Active / Pressed:** `scale-95` micro-interaction.
  - **Disabled / Read-only:** Hidden if user lacks `manage_orders` permission or order is completed.
- **Accessibility:**
  - `title="Add another {alloc.component_name} line"`
  - `aria-label="Add another {alloc.component_name} line"`

### UI Component Render Mockup:

```tsx
{/* 2. Component Name with In-Row '+' Duplicate Button */}
<td className="py-2 px-3">
  <div className="flex items-center justify-between gap-1.5">
    <span className="font-semibold text-slate-900">{alloc.component_name}</span>
    {canPerform('manage_orders') && order.status !== 'completed' && (
      <button
        type="button"
        onClick={() => handleDuplicateComponentRow(order.id, alloc)}
        className="shrink-0 p-1 rounded-md text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-colors shadow-2xs cursor-pointer group"
        title={`Add another ${alloc.component_name} line`}
        aria-label={`Add another ${alloc.component_name} line`}
      >
        <Plus className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
      </button>
    )}
  </div>
</td>
```

---

## 4. Line Deletion Button Specification

### Visibility & Guard Conditions:
- Only visible if user has `manage_orders` permission.
- Only visible if the row is a duplicate (`componentCount > 1`) OR is an ad-hoc custom row (`alloc.sort_order > 10`).
- If `alloc.status === 'received'`, the trash button is disabled with opacity 30% and title `"Cannot delete received allocation - revert to pending first"`.
- If `alloc.status === 'pending'`, clicking it displays a quick confirmation or immediate toast with optimistic removal.

---

## 5. Responsive Behavior

- **Desktop (>=1280px):** Full 11-column matrix view with ample spacing.
- **Tablet (768px - 1024px):** Container scrolls horizontally (`overflow-x-auto`) with sticky order headers.
- **Mobile (<768px):** Clean horizontal scroll with touch scrolling support (`-webkit-overflow-scrolling: touch`).
