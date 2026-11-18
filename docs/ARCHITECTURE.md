# System Architecture Document

## Order Vendor BOM & Inward Stock Auto-Synchronization Pipeline

**System:** Stock Track Manufacturing & Inventory Platform  
**Architecture Version:** 2.0  
**Target Migration:** `20261118000000_sync_order_allocations_to_inward_stock.sql`  

---

### 1. High-Level Architecture Overview

```mermaid
flowchart TD
    subgraph Trigger["1. Inward Delivery & Allocation Triggers"]
        VP["Vendor Pending Board<br/>• 1-Click Receive with Smart SKU Guard<br/>• Turnkey Quick SKU Modal (Auto-Matching with itemsCatalog)<br/>• Pre-Validated Bulk Intake Modal (Fully Enriched Optimistic UI)<br/>• Persistent Deep-Linked Audit History (activeTab: 'batches')"]
        OV["Orders View BOM Table<br/>• Aligned 11-Column Matrix<br/>• Dual Independent Dropdowns (Supplier + Warehouse SKU)<br/>• Pre-Flight SKU Guard & Reactive Keyed Planned Qty<br/>• Upgraded Printable Job Card Traveler Sheet"]
    end

    subgraph Router["2. Sourcing & Category Router"]
        CheckSource{"What is allocation.source?"}
        VP --> CheckSource
        OV --> CheckSource

        CheckSource -->|"vendor (External Delivery)"| VendorFlow["External Vendor Inward Flow"]
        CheckSource -->|"stock (Internal Warehouse)"| StockFlow["In-House Warehouse Allocation"]
    end

    subgraph VendorPipeline["3. External Vendor Inward Intake (Atomic RPC)"]
        VendorFlow --> CheckService{"Is Service Milestone?<br/>(printing, coating, stamping)"}
        CheckService -->|"Yes & No Physical SKU"| ServiceMilestone["Process Milestone Only<br/>• Update allocation status = 'received'<br/>• No physical inventory rows inserted"] --> UpdateAllocVendor
        CheckService -->|"No OR Physical SKU Bound"| ResolveSKU{"Resolve Stock SKU"}

        ResolveSKU --> CheckCat{"Category Classification"}
        CheckCat -->|"Bottles / Containers"| InwardBatchFlow["Create Inward Batch in Stage 1 Raw Stock<br/>• batch_no: BAT-YYYY-XXX (Advisory Locked)<br/>• cap_qty=0, atomizer_qty=0, box_qty=0 (Zero Phantom Stock)<br/>• Auto-attach configured BOM item IDs"]
        CheckCat -->|"Caps, Atomizers, Boxes, Labels,<br/>Fragrance Oils, Raw Materials"| InwardReceiptFlow["Insert item_stock_receipts<br/>• item_id, supplier_id, qty, invoice_no<br/>• Forward Auto-sync SKU to Order's Inward Batch!"]

        InwardBatchFlow --> UpdateAllocVendor["Update material_allocations<br/>• status = 'received'<br/>• qty_received = effective_qty<br/>• inward_batch_id linked"]
        InwardReceiptFlow --> UpdateAllocVendor
    end

    subgraph StockPipeline["4. In-House Stock Allocation (Zero Phantom Intake)"]
        StockFlow --> CheckBottleStock{"Is component a Bottle?"}
        CheckBottleStock -->|"Yes"| HandleBottleStock{"Check Pristine Raw Batch in Stock<br/>(Brand Matched & Zero Movements)"}
        HandleBottleStock -->|"Found with Raw Stock"| LinkExistingBatch["Link Existing Raw Batch to Order<br/>• inward_batches.order_id = order.id<br/>• Auto-attach configured BOM item IDs!"] --> ForwardSyncStock
        HandleBottleStock -->|"None Available"| CreateInHouseBatch["Create In-House Inward Batch<br/>• supplier = 'In-House / Internal Stock'<br/>• batch_no: BAT-YYYY-XXX<br/>• Stage 1 Raw Stock populated!"] --> ForwardSyncStock

        CheckBottleStock -->|"No (Components)"| VerifyCompStock{"Check Available Stock<br/>in v_component_stock"}
        VerifyCompStock -->|"Available / Warning"| ForwardSyncStock["Forward Auto-Sync SKU to Order's Inward Batch!<br/>(cap_item_id, atomizer_item_id, box_item_id)"] --> UpdateAllocStock["Update material_allocations<br/>• status = 'received'<br/>• qty_received = effective_qty<br/>• ZERO duplicate intake rows!"]
    end

    subgraph ReversalGuard["5. Bulletproof Reversal Guard Engine"]
        RevertReq["revert_material_allocation_rpc Triggered"] --> SetContext["PERFORM set_config('app.reverting_allocation', 'true', true)"]
        SetContext --> CheckDownstream{"Check Downstream Usage:<br/>• Batch Movements / Dispatches / Allocations<br/>• Component Stock Consumption"}
        CheckDownstream -->|"Stock Consumed or Moved"| AbortReversal["ABORT: Informative Exception Raised"]
        CheckDownstream -->|"Unconsumed & No Movements"| SafeDelete["Execute Ledger Deletion & Reset Status to 'pending'<br/>Triggers verify app.reverting_allocation = 'true'<br/>Unlinked pristine batches have component SKUs wiped clean"]
    end

    subgraph LifecycleAndRealtime["6. Lifecycle & Multi-Terminal Realtime Sync"]
        UpdateAllocVendor --> CheckAllBOM{"All BOM Allocations<br/>Now Received?"}
        UpdateAllocStock --> CheckAllBOM

        CheckAllBOM -->|"Yes & Status = 'planning'"| AdvanceOrder["Advance production_orders<br/>status = 'in_progress'"]
        CheckAllBOM -->|"No"| RetainOrder["Retain Current Status"]

        AdvanceOrder --> BroadcastRealtime["Supabase Realtime Broadcast<br/>(material_allocations, inward_batches, item_stock_receipts, production_orders)"]
        RetainOrder --> BroadcastRealtime

        BroadcastRealtime --> InvalidateCaches["Invalidate In-Memory Caches:<br/>'clients', 'batches', 'bom_categories'"]
        InvalidateCaches --> MultiTerminalUI["Multi-Terminal Live UI Updates:<br/>• ItemsView (Raw Stock & Component Stock)<br/>• InwardBatchesTab (Deep Linked via activeTab: 'batches')<br/>• OutwardJourneyPipeline<br/>• VendorPendingView & OrdersView"]
    end
```

---

### 2. Database Schema Extensions

#### `material_allocations`
- `qty`: `integer NOT NULL DEFAULT 0` (planned allocation requirement)
- `qty_received`: `integer DEFAULT NULL` (actual intake volume received at factory gate)
- `inward_batch_id`: `uuid REFERENCES inward_batches(id) ON DELETE SET NULL`
- `receipt_id`: `uuid REFERENCES item_stock_receipts(id) ON DELETE SET NULL`
- `location`: `text DEFAULT 'Raw Stock Bay A'`

#### `inward_batches`
- `order_id`: `uuid REFERENCES production_orders(id) ON DELETE SET NULL`
- `allocation_id`: `uuid REFERENCES material_allocations(id) ON DELETE SET NULL`

#### `item_stock_receipts`
- `order_id`: `uuid REFERENCES production_orders(id) ON DELETE SET NULL`
- `allocation_id`: `uuid REFERENCES material_allocations(id) ON DELETE SET NULL`

---

### 3. PostgreSQL Triggers & Constraints

1. **`prevent_received_allocation_delete_trigger`**: Blocks manual SQL or client deletion of allocations in `'received'` status.
2. **`allow_unconsumed_receipt_delete_trigger`**:
   - Checks `current_setting('app.reverting_allocation', true) = 'true'`.
   - If not in an authorized RPC reversal, prevents deleting receipts linked to active order allocations.
   - If reverting, verifies that available component stock in `v_component_stock` has not been consumed.
3. **`allow_empty_batch_delete_inward_batches`**:
   - Checks `current_setting('app.reverting_allocation', true) = 'true'`.
   - Protects immutable ledger columns (`qty_received`, `item_id`, `supplier_id`, `received_on`).
   - Blocks batch deletion if any stage movements, dispatches, or inter-batch allocations exist.

---

### 4. Client State Architecture & Realtime Synchronization

- **Dual Reactive Cache Model**:
  - Multi-table PostgreSQL changes broadcast via Supabase Realtime channels.
  - Channels register listeners for `items`, `inward_batches`, `material_allocations`, `item_stock_receipts`, `stage_movements`, `dispatches`, and `suppliers`.
  - Incoming database events trigger a 250ms debounced cache invalidation (`invalidateCache()`) and silent UI re-fetching.
- **Deep Linking Navigation**:
  - `onViewChange('items', { batchId: batch_no, activeTab: 'batches' })` routes to the Inward Batches ledger and activates batch filtering.
