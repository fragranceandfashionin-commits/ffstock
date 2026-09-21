import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL_PATTERN = /^https:\/\/[a-z0-9]+\.supabase\.co$/;

function readEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Returns a human-readable, actionable error message when Supabase is not
 * configured, or null when the configuration looks valid.
 */
export function getSupabaseConfigError(): string | null {
  const url = readEnv('VITE_SUPABASE_URL');
  const anonKey = readEnv('VITE_SUPABASE_ANON_KEY');

  if (!url) {
    return 'VITE_SUPABASE_URL is missing. Copy .env.example to .env and add your Supabase project URL.';
  }
  if (!SUPABASE_URL_PATTERN.test(url)) {
    return `VITE_SUPABASE_URL looks invalid ("${url}"). It must look like https://<project-ref>.supabase.co`;
  }
  if (!anonKey) {
    return 'VITE_SUPABASE_ANON_KEY is missing. Add your project\'s anon (public) key to .env — see README.md.';
  }
  if (
    anonKey.includes('PASTE_YOUR') ||
    anonKey.length < 20 ||
    (!anonKey.startsWith('eyJ') && !anonKey.startsWith('sb_') && !anonKey.startsWith('sbp_'))
  ) {
    return 'VITE_SUPABASE_ANON_KEY appears invalid or is still set to placeholder. Paste your project\'s anon (public) key into .env or Vercel Environment Variables — see README.md.';
  }
  return null;
}

const configError = getSupabaseConfigError();

if (configError) {
  // Fail loudly and early so misconfiguration is impossible to miss. The
  // ErrorBoundary in main.tsx renders this message in a readable screen.
  throw new Error(configError);
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

export type UserRole =
  | 'admin'
  | 'inward_manager'
  | 'coloring_operator'
  | 'printing_operator'
  | 'filling_operator'
  | 'packaging_operator'
  | 'stock_manager'
  | 'dispatch_manager'
  | 'vendor_manager'
  | 'viewer';

export type UserProfile = {
  id: string;
  email: string | null;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
};

export const ROLE_DEFINITIONS: Record<
  UserRole,
  { label: string; name: string; department: string; color: string; description: string }
> = {
  admin: {
    label: 'Plant General Manager',
    name: 'Plant General Manager',
    department: 'Executive Operations',
    color: 'bg-purple-100 text-purple-900 border-purple-300',
    description: 'Full supervisory authority across all factory modules and configurations.',
  },
  inward_manager: {
    label: 'Inward Supervisor',
    name: 'Inward Supervisor',
    department: 'Receiving Warehouse',
    color: 'bg-blue-100 text-blue-900 border-blue-300',
    description: 'Log inward batches, component intake receipts, and supplier deliveries.',
  },
  coloring_operator: {
    label: 'Coloring Specialist',
    name: 'Coloring Specialist',
    department: 'Coating & Coloring Line',
    color: 'bg-amber-100 text-amber-900 border-amber-300',
    description: 'Transition batches from Raw Stock to Coloring and onward to Printing.',
  },
  printing_operator: {
    label: 'Printing Specialist',
    name: 'Printing Specialist',
    department: 'Silk-Screen & Foil Line',
    color: 'bg-violet-100 text-violet-900 border-violet-300',
    description: 'Transition batches from Printing to Filling assembly line.',
  },
  filling_operator: {
    label: 'Filling Specialist',
    name: 'Filling Specialist',
    department: 'Filling & Assembly Line',
    color: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    description: 'Assemble fragrances, attach caps, atomizers, and advance to Packaging.',
  },
  packaging_operator: {
    label: 'Packaging Specialist',
    name: 'Packaging Specialist',
    department: 'Final Packaging Line',
    color: 'bg-pink-100 text-pink-900 border-pink-300',
    description: 'Enclose in secondary cartons/boxes and advance batches to Ready stage.',
  },
  stock_manager: {
    label: 'Inventory Controller',
    name: 'Inventory Controller',
    department: 'Warehouse & Inventory',
    color: 'bg-teal-100 text-teal-900 border-teal-300',
    description: 'Manage items catalogue, execute stock allocations, and audit stock levels.',
  },
  dispatch_manager: {
    label: 'Logistics Officer',
    name: 'Logistics Officer',
    department: 'Dispatch & Logistics',
    color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    description: 'Dispatch finished products from Ready stage to customers and print delivery challans.',
  },
  vendor_manager: {
    label: 'Procurement Officer',
    name: 'Procurement Officer',
    department: 'Procurement & Vendor Ops',
    color: 'bg-orange-100 text-orange-900 border-orange-300',
    description: 'Manage production orders, expedite pending vendor BOM allocations, and manage suppliers.',
  },
  viewer: {
    label: 'Plant Auditor',
    name: 'Plant Auditor',
    department: 'Quality & Audit',
    color: 'bg-slate-100 text-slate-800 border-slate-300',
    description: 'Read-only access to dashboards, production pipelines, order history, and audit trails.',
  },
};


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

export const ITEM_CATEGORIES = [
  'Bottle',
  'Cap',
  'Atomizer',
  'Packaging',
  'Label',
  'Fragrance',
  'Raw Material',
  'Other',
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number] | string;

export type Item = {
  id: string;
  name: string;
  category?: string | null;
  unit?: string | null;
  description?: string | null;
  color?: string | null;
  created_at: string;
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

/** Common bottle colors used in fragrance & fashion manufacturing. */
export const COMMON_COLORS = [
  'Clear',
  'Frosted',
  'Amber',
  'Cobalt Blue',
  'Frosted Blue',
  'Gloss Black',
  'Matte Black',
  'Matte White',
  'Emerald Green',
  'Rose Gold',
  'Electroplated Gold',
  'Electroplated Silver',
  'Smoke Grey',
  'Ruby Red',
] as const;

/** Common printing, artwork & screen print finishes used in bottle decorating. */
export const COMMON_PRINTING_DESIGNS = [
  'Gold Foil Stamping',
  'Silver Foil Stamping',
  'Silk Screen White Logo',
  'Silk Screen Black Logo',
  'Silk Screen Metallic Gold',
  'UV Spot Varnish Artwork',
  'Embossed Brand Text',
  'Gradient Mask Print',
  'Full Wrap Floral Screen Print',
  'Custom Customer Artwork',
] as const;

/** Common production scrap & defect loss reasons */
export const SCRAP_REASONS = [
  'Glass Breakage / Cracking',
  'Screen Print / Foil Misalignment',
  'Color Coating Unevenness / Blemish',
  'Filling Leakage / Volume Defect',
  'Crimping / Atomizer Pump Failure',
  'Cap Fitting / Thread Defect',
  'Box / Packaging Scratch or Tear',
  'Quality Control (QC) Laboratory Rejection',
  'Machine Jam / Setup Waste',
  'Other / Unspecified Loss',
] as const;

export type ScrapReason = (typeof SCRAP_REASONS)[number];


