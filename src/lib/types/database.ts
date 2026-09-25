export type Supplier = {
  id: string;
  name: string;
  contact: string | null;
  created_at: string;
};

export type ExtendedSupplier = Supplier & {
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
  categories_supplied?: string[] | null;
  specific_materials?: string | null;
};

export type Client = {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  preferences: string | null;
  status: 'active' | 'inactive';
  created_at: string;
};

export type ProductionOrder = {
  id: string;
  order_no: string;
  client_id: string;
  product_name: string;
  variants: string[] | unknown[];
  total_qty: number;
  due_date: string | null;
  status: 'planning' | 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
  completed_at: string | null;
  created_at: string;
};

export type BomCategory = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type MaterialAllocation = {
  id: string;
  order_id: string;
  component_name: string;
  sort_order: number;
  source: 'vendor' | 'stock';
  description: string | null;
  vendor_id: string | null;
  stock_item_id: string | null;
  timeline: string | null;
  status: 'pending' | 'received';
  received_at: string | null;
  remarks: string | null;
  created_at: string;
};

export type Item = {
  id: string;
  name: string;
  category?: string | null;
  unit?: string | null;
  description?: string | null;
  color?: string | null;
  created_at: string;
};

export type ProductionOrderWithRelations = ProductionOrder & {
  client: Client | null;
  material_allocations?: MaterialAllocation[];
};

export type MaterialAllocationWithVendorRelations = MaterialAllocation & {
  order?: ProductionOrder | null;
  client?: Client | null;
  vendor?: Supplier | null;
  stock_item?: Item | null;
};

export type Stage = {
  id: string;
  name: string;
  sequence_no: number;
  created_at: string;
};

export type InwardBatch = {
  id: string;
  batch_no: string;
  brand_name?: string | null;
  supplier_id: string;
  item_id: string;
  received_on: string;
  qty_received: number;
  location: string;
  image_url: string | null;
  color?: string | null;
  cap_item_id?: string | null;
  atomizer_item_id?: string | null;
  box_item_id?: string | null;
  cap_qty?: number | null;
  atomizer_qty?: number | null;
  box_qty?: number | null;
  created_at: string;
};

export type StageMovement = {
  id: string;
  batch_id: string;
  from_stage_id: string;
  to_stage_id: string;
  qty_moved: number;
  moved_on: string;
  variant_name?: string | null;
  cap_name?: string | null;
  atomizer_name?: string | null;
  box_name?: string | null;
  color?: string | null;
  printing_design?: string | null;
  cap_item_id?: string | null;
  atomizer_item_id?: string | null;
  box_item_id?: string | null;
  cap_qty_used?: number | null;
  atomizer_qty_used?: number | null;
  box_qty_used?: number | null;
  location: string | null;
  image_url: string | null;
  remarks: string | null;
  done_by: string | null;
  created_at: string;
};

export type Dispatch = {
  id: string;
  batch_id: string;
  qty: number;
  customer_name: string;
  invoice_no: string;
  dispatched_on: string;
  variant_name?: string | null;
  color?: string | null;
  printing_design?: string | null;
  cap_name?: string | null;
  atomizer_name?: string | null;
  box_name?: string | null;
  box_item_id?: string | null;
  product_specs?: string | null;
  created_at: string;
};

export type BatchWithRelations = InwardBatch & {
  supplier: Supplier | null;
  item: Item | null;
  cap_item?: Item | null;
  atomizer_item?: Item | null;
  box_item?: Item | null;
};

export type MovementWithRelations = StageMovement & {
  from_stage: Stage | null;
  to_stage: Stage | null;
  cap_item?: Item | null;
  atomizer_item?: Item | null;
  box_item?: Item | null;
};

export type ComponentOrderUsage = {
  dispatchId: string;
  invoiceNo: string;
  customerName: string;
  batchId: string;
  batchNo: string;
  itemName: string;
  dispatchedOn: string;
  qtyUsed: number;
};

export type ComponentBatchUsage = {
  batchId: string;
  batchNo: string;
  itemName: string;
  qtyUsed: number;
  latestStage?: string;
  movedOn?: string;
};

export type ItemStockReceipt = {
  id: string;
  item_id: string;
  supplier_id?: string | null;
  qty: number;
  received_on: string;
  invoice_no?: string | null;
  location?: string | null;
  remarks?: string | null;
  created_at: string;
  item?: Item | null;
  supplier?: Supplier | null;
};

export type BatchAllocation = {
  id: string;
  source_batch_id: string;
  destination_batch_id: string;
  qty: number;
  allocation_type: string;
  item_id?: string | null;
  allocated_on: string;
  remarks: string | null;
  allocated_by: string | null;
  created_at: string;
};

export type BatchAllocationWithRelations = BatchAllocation & {
  source_batch?: BatchWithRelations | null;
  destination_batch?: BatchWithRelations | null;
  item?: Item | null;
};

export type ComponentStockSummary = {
  item: Item;
  category: string;
  totalInwarded: number;
  unallocatedWarehouseStock: number;
  totalUsedInBatches: number;
  totalInFactoryAssembled: number;
  totalDispatchedInOrders: number;
  totalScrapped: number;
  availableStock: number;
  stockDeficit: number;
  inwardBatchCount: number;
  usedInBatchCount: number;
  latestUsedDate: string | null;
  orderUsageList: ComponentOrderUsage[];
  batchUsageList: ComponentBatchUsage[];
};
