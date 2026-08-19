import type { BatchWithRelations, MovementWithRelations } from '@/lib/supabase';

export type ActiveAction =
  | { type: 'stage-move'; fromStageId: string; toStageId: string }
  | { type: 'scrap'; fromStageId: string }
  | { type: 'dispatch' }
  | null;

export type VariantRow = {
  id: string;
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
 * Automatically calculates and derives variant rows from previous movements into a stage,
 * batch defaults, and current stock balance so users never need to re-enter anything.
 */
export function deriveStageVariants({
  fromStageId,
  movements,
  selectedBatch,
  availableQty,
}: {
  fromStageId: string;
  movements: MovementWithRelations[];
  selectedBatch?: BatchWithRelations | null;
  availableQty: number;
}): VariantRow[] {
  // 1. Find all movements that entered this stage and all movements that departed this stage
  const inboundMoves = movements.filter((m) => m.to_stage_id === fromStageId);
  const outboundMoves = movements.filter((m) => m.from_stage_id === fromStageId);

  // Group inbound moves by variant signature
  type SpecKey = string;
  const variantMap = new Map<
    SpecKey,
    {
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
    }
  >();

  const makeKey = (m: {
    color?: string | null;
    printing_design?: string | null;
    cap_name?: string | null;
    cap_item_id?: string | null;
    atomizer_name?: string | null;
    atomizer_item_id?: string | null;
    box_name?: string | null;
    box_item_id?: string | null;
  }) => {
    return [
      (m.color || '').trim().toLowerCase(),
      (m.printing_design || '').trim().toLowerCase(),
      (m.cap_name || '').trim().toLowerCase(),
      m.cap_item_id || '',
      (m.atomizer_name || '').trim().toLowerCase(),
      m.atomizer_item_id || '',
      (m.box_name || '').trim().toLowerCase(),
      m.box_item_id || '',
    ].join(':::');
  };

  inboundMoves.forEach((m) => {
    const key = makeKey(m);
    const existing = variantMap.get(key);
    if (existing) {
      existing.inboundQty += m.qty_moved;
    } else {
      variantMap.set(key, {
        color: m.color || '',
        printing_design: m.printing_design || '',
        cap_name: m.cap_name || '',
        cap_item_id: m.cap_item_id || '',
        atomizer_name: m.atomizer_name || '',
        atomizer_item_id: m.atomizer_item_id || '',
        box_name: m.box_name || '',
        box_item_id: m.box_item_id || '',
        inboundQty: m.qty_moved,
        outboundQty: 0,
      });
    }
  });

  outboundMoves.forEach((m) => {
    const key = makeKey(m);
    const existing = variantMap.get(key);
    if (existing) {
      existing.outboundQty += m.qty_moved;
    }
  });

  // Calculate net remaining quantity for each variant
  const activeVariants: VariantRow[] = [];
  let rowCounter = 1;

  variantMap.forEach((data) => {
    const netQty = Math.max(0, data.inboundQty - data.outboundQty);
    if (netQty > 0 || (inboundMoves.length > 0 && variantMap.size === 1)) {
      activeVariants.push({
        id: String(Date.now() + rowCounter++),
        color: data.color || selectedBatch?.color || 'Clear',
        printing_design: data.printing_design || '',
        cap_name: data.cap_name || selectedBatch?.cap_item?.name || '',
        cap_item_id: data.cap_item_id || selectedBatch?.cap_item_id || '',
        atomizer_name: data.atomizer_name || selectedBatch?.atomizer_item?.name || '',
        atomizer_item_id: data.atomizer_item_id || selectedBatch?.atomizer_item_id || '',
        box_name: data.box_name || selectedBatch?.box_item?.name || '',
        box_item_id: data.box_item_id || selectedBatch?.box_item_id || '',
        qty: String(netQty > 0 ? netQty : (availableQty > 0 ? availableQty : 0)),
      });
    }
  });

  // If we found active variants from inbound moves
  if (activeVariants.length > 0) {
    const totalDerived = activeVariants.reduce((s, v) => s + (Number(v.qty) || 0), 0);
    if (availableQty > 0 && totalDerived > 0) {
      let distributed = 0;
      activeVariants.forEach((v, idx) => {
        if (idx === activeVariants.length - 1) {
          v.qty = String(availableQty - distributed);
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
    }
    return activeVariants;
  }

  // Fallback to batch defaults or latest movement
  const latestMove = movements.slice().reverse().find((m) => m.color || m.cap_name || m.atomizer_name || m.box_name || m.printing_design);

  return [
    {
      id: String(Date.now() + 1),
      color: latestMove?.color || selectedBatch?.color || 'Clear',
      printing_design: latestMove?.printing_design || '',
      cap_name: latestMove?.cap_name || selectedBatch?.cap_item?.name || '',
      cap_item_id: latestMove?.cap_item_id || selectedBatch?.cap_item_id || '',
      atomizer_name: latestMove?.atomizer_name || selectedBatch?.atomizer_item?.name || '',
      atomizer_item_id: latestMove?.atomizer_item_id || selectedBatch?.atomizer_item_id || '',
      box_name: latestMove?.box_name || selectedBatch?.box_item?.name || '',
      box_item_id: latestMove?.box_item_id || selectedBatch?.box_item_id || '',
      qty: availableQty > 0 ? String(availableQty) : '0',
    },
  ];
}
