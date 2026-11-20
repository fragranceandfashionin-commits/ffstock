# 03. System Architecture and Technical Design

## 1. Architectural Pattern

The application follows a **Decoupled Client-Driven Optimistic Architecture** backed by Supabase Managed PostgreSQL.

- **Frontend:** Single Page Application (SPA) built with React 18 and TypeScript.
- **State Layer:** React state hooks with localized optimistic updates and Supabase Realtime WebSocket subscriptions (`postgres_changes`).
- **Data Access:** Specialized domain query modules (`src/lib/queries/*.ts`) wrapped with client-side TTL caching (`src/lib/cache.ts`).
- **Database & Business Logic:** PostgreSQL 15+ functions, foreign keys with cascading deletes, row-level security (RLS) policies, and defensive trigger functions for ledger integrity.

---

## 2. Component and Data Flow Architecture

```mermaid
flowchart TD
    subgraph UI_Layer["Orders View (src/views/OrdersView.tsx)"]
        A["BOM Table Row: alloc (e.g. Raw Material)"]
        B["Contextual '+' Button in Component Column"]
        C["handleDuplicateComponent(orderId, alloc)"]
        D["Optimistic Local State Update (setOrders)"]
        E["BOM Table Re-sort: (a.sort_order - b.sort_order) || (created_at tie-breaker)"]
    end

    subgraph Query_Layer["Query Layer (src/lib/queries/vendor-portal.ts)"]
        F["addAllocationRow(payload)"]
    end

    subgraph Supabase_Backend["Supabase PostgreSQL 15+"]
        G[("material_allocations Table")]
        H["Realtime Publication: postgres_changes"]
        I["Ledger Protection Triggers: prevent_received_allocation_delete"]
    end

    A --> B
    B -->|Click| C
    C --> F
    C --> D
    D --> E
    F -->|INSERT INTO material_allocations| G
    G --> I
    G -.->|WebSocket Event| H
    H -.->|loadData(true)| UI_Layer
```

---

## 3. Sort Order and Grouping Strategy (ADR-001)

### Context:
When an operator clicks `+` on "Raw Material" (which has `sort_order = 2`), how should the new row be positioned so that:
1. It immediately appears grouped with the parent component type (e.g., all 3 Raw Material lines together).
2. It does not overwrite or shift existing integer `sort_order` values in the database across other components (Bottles=1, Sticker=3, Box=4, etc.).
3. It handles multiple duplicates (e.g. 1st, 2nd, 3rd variant).

### Considered Options:
- **Option 1: Re-indexing all downstream sort_order values:** Increment all subsequent rows' `sort_order` in the database.
  *Downside:* Incurs `O(N)` database updates, potential race conditions with other operators, and breaks the canonical 1-10 mapping.
- **Option 2: Floating-point sort_order:** Alter database column `sort_order` from `integer` to `numeric` (e.g. 2.1, 2.2).
  *Downside:* Requires database schema migration altering existing check constraints and table schema.
- **Option 3 (Recommended & Selected): Stable Compound Sort Key:**
  Store the parent component's `sort_order` (e.g., 2) on the duplicated row, and apply deterministic client-side compound sorting:
  $$\text{SortComparator}(a, b) = (a.\text{sort\_order} - b.\text{sort\_order}) \parallel (\text{Date}(a.\text{created\_at}) - \text{Date}(b.\text{created\_at}))$$
  *Advantages:*
  - Zero database schema changes required.
  - All items of the same component type naturally group together in chronological creation order.
  - Downstream components remain undisturbed.
  - Fully backward compatible with existing records.

---

## 4. Line Deletion Eligibility Strategy (ADR-002)

### Context:
Currently, line 1491 of `OrdersView.tsx` evaluates `{alloc.sort_order > 10 && canPerform('manage_orders') && ...}` to determine whether a row can be deleted. This blocks any duplicated row with `sort_order <= 10` from being deleted.

### Decision:
Implement a dynamic row deletability predicate:
$$\text{isDeletable}(alloc, \text{allocations}, \text{canManage}) = \text{canManage} \land (alloc.\text{status} \ne \text{'received'}) \land (\text{alloc}.\text{sort\_order} > 10 \lor \text{componentCount}(alloc.\text{component\_name}) > 1)$$

*Guarantees:*
- Duplicated component rows (count > 1) can always be deleted if pending.
- Custom ad-hoc components (sort_order > 10) can always be deleted if pending.
- The solitary base row of a canonical component (count === 1) is shielded from accidental deletion.
- Received allocations are strictly protected from deletion (enforced in UI and by database trigger).

---

## 5. API and Service Boundaries

| Module | Responsibility | Inbound Calls | Outbound Dependencies |
|---|---|---|---|
| `OrdersView.tsx` | UI presentation, user interactions, local state | User clicks, real-time events | `vendor-portal.ts`, `auth.ts`, `Toast.tsx` |
| `orderBomUtils.ts` | BOM helpers, category inference, compound sorting | `OrdersView.tsx`, `AddItemModal.tsx` | `constants.ts` |
| `vendor-portal.ts` | Data queries for orders, allocations, receipts | `OrdersView.tsx`, `VendorPendingView.tsx` | `supabase.ts`, `cache.ts` |
| `supabase.ts` | Supabase SDK client singleton, session storage | Query modules | Supabase HTTP & WebSocket endpoints |
