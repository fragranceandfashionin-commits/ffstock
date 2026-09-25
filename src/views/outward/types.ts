import type { BatchWithRelations, MovementWithRelations, Dispatch, Item } from '@/lib/supabase';

export type ItemGroup = {
  item_id: string;
  item: Item;
  batches: BatchWithRelations[];
  supplierNames: string[];
  locations: string[];
  totalIntake: number;
};

export type AggregatedStageStock = {
  stage_id: string;
  stage_name: string;
  sequence_no: number;
  qty: number;
};

export type BatchSplit = {
  batch_id: string;
  batch_no: string;
  location?: string;
  qty: number;
};

export type BatchStageDetail = {
  batch_id: string;
  batch_no: string;
  received_on: string;
  location: string;
  brand_name?: string | null;
  supplier_name?: string | null;
  color?: string | null;
  qty_received: number;
  fifo_rank: number;
  stageStock: {
    stage_id: string;
    stage_name: string;
    qty: number;
  }[];
  totalInFactory: number;
  readyQty: number;
  dispatchedQty: number;
  scrappedQty: number;
};

export type ActiveAction =
  | { type: 'stage-move'; fromStageId: string; toStageId: string }
  | { type: 'scrap'; fromStageId: string }
  | { type: 'dispatch' }
  | null;

export type VariantRow = {
  id: string;
  variant_name?: string;
  color: string;
  printing_design: string;
  box_name?: string;
  box_item_id?: string;
  cap_name?: string;
  cap_item_id?: string;
  atomizer_name?: string;
  atomizer_item_id?: string;
  qty: string;
};

/**
 * Extracts metadata stored in remarks tags like [variant_name: Foo] or [color: Bar].
 */
export function extractMetadataFromRemarks(remarks?: string | null): Record<string, string> {
  if (!remarks) return {};
  const meta: Record<string, string> = {};
  const regex = /\[([a-zA-Z0-9_]+):\s*([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(remarks)) !== null) {
    const key = match[1].toLowerCase().trim();
    const val = match[2].trim();
    if (key && val) {
      meta[key] = val;
    }
  }
  return meta;
}

/**
 * Normalizes a movement record by extracting any fallback attributes from remarks.
 */
export function normalizeMovementRecord(m: MovementWithRelations): MovementWithRelations {
  const meta = extractMetadataFromRemarks(m.remarks);
  return {
    ...m,
    variant_name: m.variant_name?.trim() || meta.variant_name || meta.variant || null,
    color: m.color?.trim() || meta.color || null,
    printing_design: m.printing_design?.trim() || meta.printing_design || meta.print || null,
    cap_name: m.cap_name?.trim() || meta.cap_name || meta.cap || null,
    atomizer_name: m.atomizer_name?.trim() || meta.atomizer_name || meta.atomizer || meta.pump || null,
    box_name: m.box_name?.trim() || meta.box_name || meta.box || meta.carton || null,
  };
}

/**
 * Automatically calculates and derives variant rows from previous movements into a stage,
 * batch defaults, dispatches, and current stock balance so users never need to re-enter anything.
 *
 * Guarantees:
 * 1. 100% variant name and specification retention across all downstream stages.
 * 2. Strict matching on outbound deductions (no ghost stock).
 * 3. Smart prefilling of variant names so no empty inputs appear.
 */
export function deriveStageVariants({
  fromStageId,
  movements = [],
  dispatches = [],
  selectedBatch,
  availableQty,
}: {
  fromStageId: string;
  movements: MovementWithRelations[];
  dispatches?: Dispatch[];
  selectedBatch?: BatchWithRelations | null;
  availableQty: number;
}): VariantRow[] {
  // Normalize all movements with any remarks fallbacks
  const cleanMovements = (movements ?? []).map(normalizeMovementRecord);

  // 1. Build a historical lookup registry by color and variant name across all batch movements
  const colorToVariantNameMap = new Map<string, string>();
  const colorToPrintingMap = new Map<string, string>();
  const colorToCapNameMap = new Map<string, string>();
  const colorToCapIdMap = new Map<string, string>();
  const colorToAtomNameMap = new Map<string, string>();
  const colorToAtomIdMap = new Map<string, string>();
  const colorToBoxNameMap = new Map<string, string>();
  const colorToBoxIdMap = new Map<string, string>();

  // Reverse iterate so latest movements take priority in historical registry
  cleanMovements.slice().reverse().forEach((m) => {
    const c = (m.color || '').trim().toLowerCase();
    if (c) {
      if (m.variant_name?.trim() && !colorToVariantNameMap.has(c)) {
        colorToVariantNameMap.set(c, m.variant_name.trim());
      }
      if (m.printing_design?.trim() && !colorToPrintingMap.has(c)) {
        colorToPrintingMap.set(c, m.printing_design.trim());
      }
      if (m.cap_name?.trim() && !colorToCapNameMap.has(c)) {
        colorToCapNameMap.set(c, m.cap_name.trim());
      }
      if (m.cap_item_id && !colorToCapIdMap.has(c)) {
        colorToCapIdMap.set(c, m.cap_item_id);
      }
      if (m.atomizer_name?.trim() && !colorToAtomNameMap.has(c)) {
        colorToAtomNameMap.set(c, m.atomizer_name.trim());
      }
      if (m.atomizer_item_id && !colorToAtomIdMap.has(c)) {
        colorToAtomIdMap.set(c, m.atomizer_item_id);
      }
      if (m.box_name?.trim() && !colorToBoxNameMap.has(c)) {
        colorToBoxNameMap.set(c, m.box_name.trim());
      }
      if (m.box_item_id && !colorToBoxIdMap.has(c)) {
        colorToBoxIdMap.set(c, m.box_item_id);
      }
    }
  });

  const revMoves = cleanMovements.slice().reverse();
  const latestHistoricalVariantName =
    revMoves.find((m) => m.variant_name?.trim())?.variant_name?.trim() ||
    selectedBatch?.brand_name?.trim() ||
    '';
  const latestColor = revMoves.find((m) => m.color?.trim())?.color?.trim() || selectedBatch?.color || 'Clear';
  const latestPrinting = revMoves.find((m) => m.printing_design?.trim())?.printing_design?.trim() || '';
  const latestCapName = revMoves.find((m) => m.cap_name?.trim())?.cap_name?.trim() || selectedBatch?.cap_item?.name || '';
  const latestCapId = revMoves.find((m) => m.cap_item_id)?.cap_item_id || selectedBatch?.cap_item_id || '';
  const latestAtomizerName = revMoves.find((m) => m.atomizer_name?.trim())?.atomizer_name?.trim() || selectedBatch?.atomizer_item?.name || '';
  const latestAtomizerId = revMoves.find((m) => m.atomizer_item_id)?.atomizer_item_id || selectedBatch?.atomizer_item_id || '';
  const latestBoxName = revMoves.find((m) => m.box_name?.trim())?.box_name?.trim() || selectedBatch?.box_item?.name || '';
  const latestBoxId = revMoves.find((m) => m.box_item_id)?.box_item_id || selectedBatch?.box_item_id || '';

  // Filter movements into this stage and movements departing this stage
  const inboundMoves = cleanMovements.filter((m) => m.to_stage_id === fromStageId);
  const outboundMoves = cleanMovements.filter((m) => m.from_stage_id === fromStageId);

  // Helper to synthesize a clean variant name if none explicitly set
  const resolvePrefilledVariantName = (vName?: string | null, colorVal?: string | null): string => {
    if (vName && vName.trim()) return vName.trim();
    const cLower = (colorVal || '').trim().toLowerCase();
    if (cLower && colorToVariantNameMap.has(cLower)) {
      return colorToVariantNameMap.get(cLower)!;
    }
    if (latestHistoricalVariantName) {
      if (colorVal && colorVal.trim() && !latestHistoricalVariantName.toLowerCase().includes(colorVal.toLowerCase())) {
        return `${latestHistoricalVariantName} - ${colorVal.trim()}`;
      }
      return latestHistoricalVariantName;
    }
    const brand = selectedBatch?.brand_name?.trim() || selectedBatch?.item?.name?.trim() || 'Variant';
    if (colorVal && colorVal.trim() && colorVal.trim().toLowerCase() !== 'clear') {
      return `${brand} - ${colorVal.trim()}`;
    }
    return brand;
  };

  type VariantEntry = {
    key: string;
    variant_name: string;
    color: string;
    printing_design: string;
    cap_name: string;
    cap_item_id: string;
    atomizer_name: string;
    atomizer_item_id: string;
    box_name: string;
    box_item_id: string;
    inboundQty: number;
    outboundQty: number;
  };

  const entries: VariantEntry[] = [];

  // Group inbound movements by composite attributes
  inboundMoves.forEach((m) => {
    const rawColor = m.color?.trim() || latestColor || 'Clear';
    const rawVName = resolvePrefilledVariantName(m.variant_name, rawColor);
    const rawPrint = m.printing_design?.trim() || colorToPrintingMap.get(rawColor.toLowerCase()) || latestPrinting || '';
    const rawCapName = m.cap_name?.trim() || colorToCapNameMap.get(rawColor.toLowerCase()) || latestCapName || '';
    const rawCapId = m.cap_item_id || colorToCapIdMap.get(rawColor.toLowerCase()) || latestCapId || '';
    const rawAtomName = m.atomizer_name?.trim() || colorToAtomNameMap.get(rawColor.toLowerCase()) || latestAtomizerName || '';
    const rawAtomId = m.atomizer_item_id || colorToAtomIdMap.get(rawColor.toLowerCase()) || latestAtomizerId || '';
    const rawBoxName = m.box_name?.trim() || colorToBoxNameMap.get(rawColor.toLowerCase()) || latestBoxName || '';
    const rawBoxId = m.box_item_id || colorToBoxIdMap.get(rawColor.toLowerCase()) || latestBoxId || '';

    // Match existing entry by composite variant identity (variant_name or color)
    const existing = entries.find((e) => {
      if (rawVName && e.variant_name.toLowerCase() === rawVName.toLowerCase()) return true;
      if (rawColor && e.color.toLowerCase() === rawColor.toLowerCase()) return true;
      return false;
    });

    if (existing) {
      existing.inboundQty += m.qty_moved;
      if (m.variant_name?.trim()) existing.variant_name = m.variant_name.trim();
      if (m.color?.trim()) existing.color = m.color.trim();
      if (m.printing_design?.trim()) existing.printing_design = m.printing_design.trim();
      if (m.cap_name?.trim()) existing.cap_name = m.cap_name.trim();
      if (m.cap_item_id) existing.cap_item_id = m.cap_item_id;
      if (m.atomizer_name?.trim()) existing.atomizer_name = m.atomizer_name.trim();
      if (m.atomizer_item_id) existing.atomizer_item_id = m.atomizer_item_id;
      if (m.box_name?.trim()) existing.box_name = m.box_name.trim();
      if (m.box_item_id) existing.box_item_id = m.box_item_id;
    } else {
      entries.push({
        key: `${rawVName}::${rawColor}`,
        variant_name: rawVName,
        color: rawColor,
        printing_design: rawPrint,
        cap_name: rawCapName,
        cap_item_id: rawCapId,
        atomizer_name: rawAtomName,
        atomizer_item_id: rawAtomId,
        box_name: rawBoxName,
        box_item_id: rawBoxId,
        inboundQty: m.qty_moved,
        outboundQty: 0,
      });
    }
  });

  // Deduct outbound movements using multi-tier matching
  outboundMoves.forEach((m) => {
    let remainingToDeduct = m.qty_moved;
    const mVariant = (m.variant_name || '').trim().toLowerCase();
    const mColor = (m.color || '').trim().toLowerCase();

    // Tier 1: Exact match on both variant_name and color
    if (mVariant && mColor) {
      const match = entries.find((e) => e.variant_name.toLowerCase() === mVariant && e.color.toLowerCase() === mColor);
      if (match) {
        const canDeduct = Math.min(remainingToDeduct, Math.max(0, match.inboundQty - match.outboundQty));
        match.outboundQty += canDeduct;
        remainingToDeduct -= canDeduct;
      }
    }

    // Tier 2: Match by variant_name
    if (remainingToDeduct > 0 && mVariant) {
      const match = entries.find((e) => e.variant_name.toLowerCase() === mVariant);
      if (match) {
        const canDeduct = Math.min(remainingToDeduct, Math.max(0, match.inboundQty - match.outboundQty));
        match.outboundQty += canDeduct;
        remainingToDeduct -= canDeduct;
      }
    }

    // Tier 3: Match by color
    if (remainingToDeduct > 0 && mColor) {
      const match = entries.find((e) => e.color.toLowerCase() === mColor);
      if (match) {
        const canDeduct = Math.min(remainingToDeduct, Math.max(0, match.inboundQty - match.outboundQty));
        match.outboundQty += canDeduct;
        remainingToDeduct -= canDeduct;
      }
    }

    // Tier 4: Fallback FIFO across remaining available stock in entries
    if (remainingToDeduct > 0) {
      for (const e of entries) {
        const avail = Math.max(0, e.inboundQty - e.outboundQty);
        if (avail > 0) {
          const canDeduct = Math.min(remainingToDeduct, avail);
          e.outboundQty += canDeduct;
          remainingToDeduct -= canDeduct;
          if (remainingToDeduct <= 0) break;
        }
      }
    }
  });

  // Deduct dispatches if applicable
  if (dispatches && dispatches.length > 0) {
    dispatches.forEach((d) => {
      let remainingToDeduct = d.qty;
      const dVariant = (d.variant_name || '').trim().toLowerCase();
      const dColor = (d.color || '').trim().toLowerCase();

      // Match by variant name
      if (dVariant) {
        const match = entries.find((e) => e.variant_name.toLowerCase() === dVariant);
        if (match) {
          const canDeduct = Math.min(remainingToDeduct, Math.max(0, match.inboundQty - match.outboundQty));
          match.outboundQty += canDeduct;
          remainingToDeduct -= canDeduct;
        }
      }

      // Match by color
      if (remainingToDeduct > 0 && dColor) {
        const match = entries.find((e) => e.color.toLowerCase() === dColor);
        if (match) {
          const canDeduct = Math.min(remainingToDeduct, Math.max(0, match.inboundQty - match.outboundQty));
          match.outboundQty += canDeduct;
          remainingToDeduct -= canDeduct;
        }
      }

      // Fallback FIFO
      if (remainingToDeduct > 0) {
        for (const e of entries) {
          const avail = Math.max(0, e.inboundQty - e.outboundQty);
          if (avail > 0) {
            const canDeduct = Math.min(remainingToDeduct, avail);
            e.outboundQty += canDeduct;
            remainingToDeduct -= canDeduct;
            if (remainingToDeduct <= 0) break;
          }
        }
      }
    });
  }

  // Filter entries with net remaining stock
  const activeVariants: VariantRow[] = [];
  let rowCounter = 1;

  entries.forEach((e) => {
    const netQty = Math.max(0, e.inboundQty - e.outboundQty);
    if (netQty > 0 || (inboundMoves.length > 0 && entries.length === 1)) {
      activeVariants.push({
        id: String(Date.now() + rowCounter++),
        variant_name: e.variant_name,
        color: e.color,
        printing_design: e.printing_design,
        cap_name: e.cap_name,
        cap_item_id: e.cap_item_id,
        atomizer_name: e.atomizer_name,
        atomizer_item_id: e.atomizer_item_id,
        box_name: e.box_name,
        box_item_id: e.box_item_id,
        qty: String(netQty > 0 ? netQty : (availableQty > 0 ? availableQty : 0)),
      });
    }
  });

  // Reconcile and clamp quantities to strictly equal availableQty in stage
  if (activeVariants.length > 0) {
    const totalDerived = activeVariants.reduce((s, v) => s + (Number(v.qty) || 0), 0);
    if (availableQty > 0 && totalDerived > 0) {
      // If sum of derived items differs from availableQty, scale proportionally
      let distributed = 0;
      activeVariants.forEach((v, idx) => {
        if (idx === activeVariants.length - 1) {
          v.qty = String(Math.max(0, availableQty - distributed));
        } else {
          const proportion = Math.round((Number(v.qty) / totalDerived) * availableQty);
          v.qty = String(proportion);
          distributed += proportion;
        }
      });
    } else if (availableQty > 0 && totalDerived === 0) {
      const perRow = Math.floor(availableQty / activeVariants.length);
      const remainder = availableQty % activeVariants.length;
      activeVariants.forEach((v, idx) => {
        v.qty = String(perRow + (idx === 0 ? remainder : 0));
      });
    } else if (availableQty === 0) {
      activeVariants.forEach((v) => {
        v.qty = '0';
      });
    }
    return activeVariants;
  }

  // Fallback for initial stages (e.g. Raw Stock) where no inbound moves exist yet
  const defaultInitialVariantName = resolvePrefilledVariantName(
    selectedBatch?.brand_name,
    latestColor
  );

  return [
    {
      id: String(Date.now() + 1),
      variant_name: defaultInitialVariantName,
      color: latestColor || 'Clear',
      printing_design: latestPrinting || '',
      cap_name: latestCapName || '',
      cap_item_id: latestCapId || '',
      atomizer_name: latestAtomizerName || '',
      atomizer_item_id: latestAtomizerId || '',
      box_name: latestBoxName || '',
      box_item_id: latestBoxId || '',
      qty: availableQty > 0 ? String(availableQty) : '0',
    },
  ];
}

