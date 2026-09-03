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
      // No login screen — this is a shared factory workspace. Sessions are
      // never persisted so every page load uses the project's anon role.
      persistSession: false,
    },
  },
);

export type Supplier = {
  id: string;
  name: string;
  contact: string | null;
  created_at: string;
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


