# Product Requirements Document (PRD)

## Order Vendor BOM & Inward Stock Auto-Synchronization

**Product:** Stock Track Manufacturing & Inventory Platform  
**System Version:** 2.0  
**Module:** Order Procurement & Inward Stock Synchronization Engine  
**Status:** Production Ready  

---

### 1. Executive Summary & Problem Definition

In fragrance and fashion manufacturing operations, production orders rely on a multi-component Bill of Materials (BOM) including glass bottles, caps, atomizers, outer cartons/boxes, labels, and specialized service treatments (e.g. screen printing, UV coating, metallizing).

Prior to this implementation:
1. **Isolated Procurement Tracker**: When a component arrived from a vendor and was marked received in the Vendor Pending board or Orders view, only `material_allocations.status` was updated to `'received'`.
2. **Missing Warehouse Inward Intake**: No entries were created in `inward_batches` (Stage 1 Raw Stock) or `item_stock_receipts` (component warehouse inventory).
3. **Inventory Disconnect & Phantom Stock**: Factory floor workers could not draw upon incoming deliveries, and attempting manual receipts led to duplicate entries or phantom stock inflation.
4. **Reversal Deadlocks**: When operators attempted to undo an accidental receipt, PostgreSQL foreign key and ledger protection triggers threw exceptions.

This feature establishes an automated, bidirectional, ACID-compliant synchronization pipeline between Production Order BOM allocations, Stage 1 Raw Stock Inward Batches, and Component Receipts.

---

### 2. User Personas & Roles

| Persona | Role | Key Needs & Permissions |
|---|---|---|
| **Procurement Specialist** | Vendor Management | Tracks external supplier delivery timelines, triggers WhatsApp follow-ups, and marks arriving vendor shipments. (`manage_orders`) |
| **Warehouse Manager** | Inventory Operations | Validates inbound physical shipments, specifies storage bay locations, and verifies component intake counts. (`manage_inventory`, `manage_orders`) |
| **Production Lead** | Manufacturing Execution | Configures BOM allocations (sourcing mode, warehouse SKU, supplier), prints Job Cards traveler sheets, and monitors order readiness. (`manage_orders`) |
| **Operations Director / Admin** | Governance & Compliance | Reverts accidental receipts, manages production order lifecycle, and audits completed batches. (`reverse_allocation`, `manage_orders`) |

---

### 3. Feature Prioritization

#### P0: Essential Functionality (Production Gate)
- **Atomic External Inward Intake (`receive_material_allocation_rpc`)**:
  - Automatically routes external deliveries based on component category:
    - **Bottles / Glass**: Creates an Inward Batch (`inward_batches`) in Stage 1 Raw Stock with guaranteed unique `BAT-YYYY-XXX` sequence. Automatically attaches configured BOM component item IDs (`cap_item_id`, `atomizer_item_id`, `box_item_id`) with zero phantom stock (`cap_qty=0`, `atomizer_qty=0`, `box_qty=0`).
    - **Components (Caps, Atomizers, Boxes, Labels)**: Inserts an intake record into `item_stock_receipts` and forward-syncs the SKU to the order's bottle inward batch.
    - **Service Milestones (Screen Printing, UV Coating)**: Marks milestone received without physical inventory creation.
- **In-House Stock Allocation**:
  - When `source = 'stock'`, allocates from existing warehouse inventory without generating phantom receipt rows.
  - Automatically matches and links pristine unassigned raw batches matching client brand and SKU, auto-attaching order component SKUs.
- **Atomic Reversal Engine (`revert_material_allocation_rpc`)**:
  - Sets transaction-scoped session context `app.reverting_allocation = 'true'` to eliminate trigger deadlocks.
  - Verifies downstream usage (blocks reversal if batch has moved, been dispatched, or components have been consumed).
  - Cleanses unlinked pristine inventory batches of order-specific SKUs upon reversal.
- **Reactive BOM 11-Column Matrix in `OrdersView`**:
  - Dedicated Warehouse SKU selector and dedicated Supplier selector.
  - Reactive keyed planned quantity input (`qty`) and location input.
  - Pre-flight SKU validation guard before receiving.

#### P1: Important Functionality
- **Turnkey Quick SKU Modal in `VendorPendingView`**:
  - Auto-matches component name or specification against `itemsCatalog` for 1-click confirmation.
- **Pre-Validated Bulk Intake Modal**:
  - Verifies SKU mappings for all vendor items, bulk receives atomically, and provides instant 1-click [UNDO] banner.
- **Persistent Received Allocations Audit Ledger**:
  - Retains history across page refreshes (`fetchRecentlyReceivedAllocations('vendor', 50)`).
  - Deep-linked clickable batch pill navigating to Inward Batches ledger with `{ batchId, activeTab: 'batches' }`.
- **Upgraded Job Card Traveler Sheet**:
  - 9-column printable table showing planned vs received quantities, warehouse SKU details, storage bays, and floor signature lines.
- **WhatsApp Follow-up Generator**:
  - Formats vendor reminder messages with order numbers, client names, product descriptions, and required unit volumes.

#### P2: Optional Enhancements
- Exportable procurement ledger summaries.
- Advanced supplier SLA and delivery lead-time analytics.

---

### 4. Non-Functional Requirements

1. **ACID Transactional Integrity**: All ledger additions and allocations are wrapped in PostgreSQL `SECURITY DEFINER` transactions. Partial failures roll back cleanly.
2. **Real-time Live Sync**: Realtime multi-client updates across `material_allocations`, `inward_batches`, and `item_stock_receipts` with 250ms debouncing and automated cache invalidation.
3. **Zero Phantom Stock**: Component quantities on incoming bottle batches are initialized strictly to 0 to prevent double-counting.
4. **Auditability & Traceability**: Bidirectional foreign keys (`inward_batches.order_id`, `inward_batches.allocation_id`, `item_stock_receipts.order_id`, `item_stock_receipts.allocation_id`) ensure complete forward and reverse provenance.
