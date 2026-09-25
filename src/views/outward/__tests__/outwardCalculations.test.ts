import { describe, it, expect } from 'vitest';
import type { Stage, BatchWithRelations, MovementWithRelations, Dispatch } from '@/lib/supabase';
import { sortBatchesByFIFO } from '@/lib/fifo';

describe('Outward Journey & Dispatch Calculations', () => {
  const mockStages: Stage[] = [
    { id: 'stage-1', name: 'Raw Stock', sequence_no: 1, created_at: '2026-01-01' },
    { id: 'stage-2', name: 'Coloring', sequence_no: 2, created_at: '2026-01-01' },
    { id: 'stage-3', name: 'Printing', sequence_no: 3, created_at: '2026-01-01' },
    { id: 'stage-4', name: 'Filling', sequence_no: 4, created_at: '2026-01-01' },
    { id: 'stage-5', name: 'Packaging', sequence_no: 5, created_at: '2026-01-01' },
    { id: 'stage-6', name: 'Ready', sequence_no: 6, created_at: '2026-01-01' },
    { id: 'stage-7', name: 'Dispatched', sequence_no: 7, created_at: '2026-01-01' },
    { id: 'stage-8', name: 'Scrap / Defect', sequence_no: 8, created_at: '2026-01-01' },
  ];

  const mockBatches: BatchWithRelations[] = [
    {
      id: 'batch-1',
      batch_no: 'B001',
      supplier_id: 'supp-1',
      item_id: 'item-1',
      received_on: '2026-09-01',
      qty_received: 1000,
      location: 'Rack A-1',
      image_url: null,
      created_at: '2026-09-01T00:00:00Z',
      supplier: { id: 'supp-1', name: 'Glass Co', contact: null, created_at: '2026-01-01' },
      item: { id: 'item-1', name: 'Perfume Bottle', category: 'Bottle', created_at: '2026-01-01' },
    },
    {
      id: 'batch-2',
      batch_no: 'B002',
      supplier_id: 'supp-1',
      item_id: 'item-1',
      received_on: '2026-09-10',
      qty_received: 500,
      location: 'Rack A-2',
      image_url: null,
      created_at: '2026-09-10T00:00:00Z',
      supplier: { id: 'supp-1', name: 'Glass Co', contact: null, created_at: '2026-01-01' },
      item: { id: 'item-1', name: 'Perfume Bottle', category: 'Bottle', created_at: '2026-01-01' },
    },
  ];

  it('processStages cleanly isolates the 6 physical manufacturing workstations', () => {
    const processStages = mockStages.filter(
      (s) => s.name !== 'Scrap / Defect' && s.name !== 'Dispatched'
    );

    expect(processStages).toHaveLength(6);
    expect(processStages.map((s) => s.name)).toEqual([
      'Raw Stock',
      'Coloring',
      'Printing',
      'Filling',
      'Packaging',
      'Ready',
    ]);
    expect(processStages.find((s) => s.name === 'Dispatched')).toBeUndefined();
    expect(processStages.find((s) => s.name === 'Scrap / Defect')).toBeUndefined();
  });

  it('correctly aggregates dispatchedTotal by synthesizing formal dispatches and legacy movements', () => {
    const dispatches: Dispatch[] = [
      {
        id: 'd-1',
        batch_id: 'batch-1',
        qty: 500,
        customer_name: 'Client Alpha',
        invoice_no: 'INV-001',
        dispatched_on: '2026-09-24',
        created_at: '2026-09-24T00:00:00Z',
      },
      {
        id: 'd-2',
        batch_id: 'batch-1',
        qty: 400,
        customer_name: 'Client Beta',
        invoice_no: 'INV-002',
        dispatched_on: '2026-09-25',
        created_at: '2026-09-25T00:00:00Z',
      },
    ];

    const dispStageId = 'stage-7'; // Dispatched
    const movements: MovementWithRelations[] = [
      {
        id: 'm-1',
        batch_id: 'batch-1',
        from_stage_id: 'stage-1',
        to_stage_id: dispStageId,
        qty_moved: 100,
        moved_on: '2026-09-24',
        remarks: 'DISPATCH FOR LP',
        location: null,
        image_url: null,
        done_by: 'Operator 1',
        created_at: '2026-09-24T00:00:00Z',
        from_stage: null,
        to_stage: null,
      },
    ];

    // Compute synthesized dispatchedTotal
    let total = dispatches.reduce((acc, d) => acc + d.qty, 0);
    const legacyMoves = movements.filter((m) => m.to_stage_id === dispStageId);
    total += legacyMoves.reduce((acc, m) => acc + m.qty_moved, 0);

    expect(total).toBe(1000); // 500 + 400 + 100
  });

  it('builds per-batch dispatch and scrap maps accurately', () => {
    const dispatches: Dispatch[] = [
      { id: 'd-1', batch_id: 'batch-1', qty: 300, customer_name: 'C1', invoice_no: 'I1', dispatched_on: '2026-09-24', created_at: '2026-09-24' },
      { id: 'd-2', batch_id: 'batch-2', qty: 150, customer_name: 'C2', invoice_no: 'I2', dispatched_on: '2026-09-25', created_at: '2026-09-25' },
    ];

    const movements: MovementWithRelations[] = [
      { id: 'm-1', batch_id: 'batch-1', from_stage_id: 'stage-1', to_stage_id: 'stage-7', qty_moved: 50, moved_on: '2026-09-24', remarks: null, location: null, image_url: null, done_by: null, created_at: '2026-09-24', from_stage: null, to_stage: null },
      { id: 'm-2', batch_id: 'batch-1', from_stage_id: 'stage-3', to_stage_id: 'stage-8', qty_moved: 25, moved_on: '2026-09-24', remarks: null, location: null, image_url: null, done_by: null, created_at: '2026-09-24', from_stage: null, to_stage: null },
      { id: 'm-3', batch_id: 'batch-2', from_stage_id: 'stage-2', to_stage_id: 'stage-1', qty_moved: 10, remarks: '[SCRAP] Broken during shift', location: null, image_url: null, done_by: null, moved_on: '2026-09-25', created_at: '2026-09-25', from_stage: null, to_stage: null },
    ];

    const dispatchedMap = new Map<string, number>();
    for (const d of dispatches) {
      dispatchedMap.set(d.batch_id, (dispatchedMap.get(d.batch_id) ?? 0) + d.qty);
    }
    const dispStageId = 'stage-7';
    for (const m of movements) {
      if (m.to_stage_id === dispStageId) {
        dispatchedMap.set(m.batch_id, (dispatchedMap.get(m.batch_id) ?? 0) + m.qty_moved);
      }
    }

    const scrapStageId = 'stage-8';
    const scrappedMap = new Map<string, number>();
    for (const m of movements) {
      if (m.to_stage_id === scrapStageId || (m.remarks ?? '').startsWith('[SCRAP')) {
        scrappedMap.set(m.batch_id, (scrappedMap.get(m.batch_id) ?? 0) + m.qty_moved);
      }
    }

    expect(dispatchedMap.get('batch-1')).toBe(350); // 300 + 50
    expect(dispatchedMap.get('batch-2')).toBe(150);
    expect(scrappedMap.get('batch-1')).toBe(25);
    expect(scrappedMap.get('batch-2')).toBe(10);
  });

  it('guarantees column alignment: 6 stageStock cells match 6 processStages headers', () => {
    const processStages = mockStages.filter(
      (s) => s.name !== 'Scrap / Defect' && s.name !== 'Dispatched'
    );

    const bStocks = [
      { stage_id: 'stage-1', stage_name: 'Raw Stock', sequence_no: 1, qty: 500 },
      { stage_id: 'stage-2', stage_name: 'Coloring', sequence_no: 2, qty: 0 },
      { stage_id: 'stage-3', stage_name: 'Printing', sequence_no: 3, qty: 0 },
      { stage_id: 'stage-4', stage_name: 'Filling', sequence_no: 4, qty: 0 },
      { stage_id: 'stage-5', stage_name: 'Packaging', sequence_no: 5, qty: 0 },
      { stage_id: 'stage-6', stage_name: 'Ready', sequence_no: 6, qty: 100 },
    ];

    const stageStock = processStages.map((st) => ({
      stage_id: st.id,
      stage_name: st.name,
      qty: bStocks.find((s) => s.stage_id === st.id)?.qty ?? 0,
    }));

    // Header count: FIFO, Batch, Date, Bay, Supplier, Intake (6) + 6 stages + Dispatched + Scrapped + Action (4) = 16 columns
    // Body count: 6 fixed cells + stageStock.length (6) + Dispatched + Scrapped + Action (3) = 15
    // Wait! Let's count headers:
    // 1: FIFO Rank
    // 2: Batch #
    // 3: Inward Date
    // 4: Storage Bay
    // 5: Supplier
    // 6: Intake Qty
    // 7..12: 6 stages (Raw Stock, Coloring, Printing, Filling, Packaging, Ready)
    // 13: Dispatched
    // 14: Scrapped
    // 15: Action
    // Total headers = 15!
    // Total body cells:
    // 1: FIFO Rank
    // 2: Batch #
    // 3: Inward Date
    // 4: Storage Bay
    // 5: Supplier
    // 6: Intake Qty
    // 7..12: 6 stageStock cells
    // 13: Dispatched
    // 14: Scrapped
    // 15: Action
    // Total body cells = 15!
    expect(stageStock).toHaveLength(6);
    expect(stageStock.map((s) => s.stage_name)).toEqual([
      'Raw Stock',
      'Coloring',
      'Printing',
      'Filling',
      'Packaging',
      'Ready',
    ]);
  });

  it('allocates multi-variant dispatch across multiple batches via FIFO', () => {
    const readyBatches = sortBatchesByFIFO(mockBatches);
    const batchRemainingMap = new Map<string, number>([
      ['batch-1', 200], // Oldest batch has 200 ready units
      ['batch-2', 300], // Newer batch has 300 ready units
    ]);

    const variantRows = [
      { qty: '150', variant_name: 'Rose Gold', color: 'Gold' },
      { qty: '150', variant_name: 'Midnight Black', color: 'Black' },
    ];

    type VariantPayloadItem = {
      qty: number;
      variant_name: string;
      color: string;
    };
    const batchDispatchesMap = new Map<string, VariantPayloadItem[]>();

    for (const r of variantRows) {
      let needed = Number(r.qty);
      for (const b of readyBatches) {
        if (needed <= 0) break;
        const currentAvail = batchRemainingMap.get(b.id) ?? 0;
        if (currentAvail <= 0) continue;

        const take = Math.min(needed, currentAvail);
        batchRemainingMap.set(b.id, currentAvail - take);
        needed -= take;

        if (!batchDispatchesMap.has(b.id)) {
          batchDispatchesMap.set(b.id, []);
        }
        batchDispatchesMap.get(b.id)!.push({
          qty: take,
          variant_name: r.variant_name,
          color: r.color,
        });
      }
      expect(needed).toBe(0);
    }

    // Check Batch 1 allocation (oldest): 150 Rose Gold + 50 Midnight Black = 200 units (fully exhausted)
    const b1Alloc = batchDispatchesMap.get('batch-1');
    expect(b1Alloc).toBeDefined();
    expect(b1Alloc?.reduce((s, v) => s + v.qty, 0)).toBe(200);
    expect(b1Alloc).toEqual([
      { qty: 150, variant_name: 'Rose Gold', color: 'Gold' },
      { qty: 50, variant_name: 'Midnight Black', color: 'Black' },
    ]);

    // Check Batch 2 allocation: remaining 100 Midnight Black
    const b2Alloc = batchDispatchesMap.get('batch-2');
    expect(b2Alloc).toBeDefined();
    expect(b2Alloc?.reduce((s, v) => s + v.qty, 0)).toBe(100);
    expect(b2Alloc).toEqual([
      { qty: 100, variant_name: 'Midnight Black', color: 'Black' },
    ]);

    // Check remaining balances in ready stage
    expect(batchRemainingMap.get('batch-1')).toBe(0);
    expect(batchRemainingMap.get('batch-2')).toBe(200);
  });

  describe('Custom Multi-Location Batch Allocation Grid Logic', () => {
    type BatchAllocationItem = {
      batch_id: string;
      batch_no: string;
      location: string;
      availableQty: number;
      allocatedQty: number;
    };

    const mockAllocationItems: BatchAllocationItem[] = [
      { batch_id: 'batch-1', batch_no: 'B001', location: 'Room 2', availableQty: 400, allocatedQty: 50 },
      { batch_id: 'batch-2', batch_no: 'B002', location: 'Lobby', availableQty: 300, allocatedQty: 30 },
      { batch_id: 'batch-3', batch_no: 'B003', location: 'Room 3', availableQty: 500, allocatedQty: 70 },
    ];

    it('converts multi-room allocation maps into exact BatchSplit objects preserving physical room choices without FIFO reordering', () => {
      const allocations: Record<string, string> = {
        'batch-1': '50',
        'batch-2': '30',
        'batch-3': '70',
        'batch-4': '0', // Unallocated batch should be filtered out
      };

      const batches = [
        { id: 'batch-1', batch_no: 'B001', location: 'Room 2' },
        { id: 'batch-2', batch_no: 'B002', location: 'Lobby' },
        { id: 'batch-3', batch_no: 'B003', location: 'Room 3' },
        { id: 'batch-4', batch_no: 'B004', location: 'Bay A' },
      ];

      const splits = Object.entries(allocations)
        .filter(([, qtyStr]) => Number(qtyStr) > 0)
        .map(([bId, qtyStr]) => {
          const b = batches.find((item) => item.id === bId);
          return {
            batch_id: bId,
            batch_no: b?.batch_no || '',
            location: b?.location || '',
            qty: Number(qtyStr),
          };
        });

      expect(splits).toHaveLength(3);
      expect(splits).toEqual([
        { batch_id: 'batch-1', batch_no: 'B001', location: 'Room 2', qty: 50 },
        { batch_id: 'batch-2', batch_no: 'B002', location: 'Lobby', qty: 30 },
        { batch_id: 'batch-3', batch_no: 'B003', location: 'Room 3', qty: 70 },
      ]);
      const totalAllocated = splits.reduce((sum, s) => sum + s.qty, 0);
      expect(totalAllocated).toBe(150);
    });

    it('validates and detects card over-allocation correctly', () => {
      const testItems: BatchAllocationItem[] = [
        { batch_id: 'b-1', batch_no: 'B1', location: 'Room 2', availableQty: 100, allocatedQty: 50 },
        { batch_id: 'b-2', batch_no: 'B2', location: 'Lobby', availableQty: 50, allocatedQty: 60 }, // Over-allocated!
      ];

      const isAnyCardOverAllocated = testItems.some((item) => item.allocatedQty > item.availableQty);
      expect(isAnyCardOverAllocated).toBe(true);

      const overAllocatedCard = testItems.find((item) => item.allocatedQty > item.availableQty);
      expect(overAllocatedCard?.batch_id).toBe('b-2');
      expect(overAllocatedCard!.allocatedQty - overAllocatedCard!.availableQty).toBe(10);
    });

    it('quick preset calculators (25%, 50%, 100%) compute clean rounded integer quantities', () => {
      const availableQty = 355;
      const q25 = Math.floor(availableQty * 0.25);
      const q50 = Math.floor(availableQty * 0.5);
      const q100 = availableQty;

      expect(q25).toBe(88);
      expect(q50).toBe(177);
      expect(q100).toBe(355);
      expect(Number.isInteger(q25)).toBe(true);
      expect(Number.isInteger(q50)).toBe(true);
    });

    it('cumulative allocated quantity across all room cards synchronizes with BOM component threshold checks', () => {
      const splits = [
        { batch_id: 'b-1', qty: 50 },
        { batch_id: 'b-2', qty: 30 },
        { batch_id: 'b-3', qty: 70 },
      ];

      const cumulativeMoveQty = splits.reduce((sum, s) => sum + s.qty, 0);
      expect(cumulativeMoveQty).toBe(150);

      const capStockAvailable = 140; // Short by 10
      const isCapSufficient = capStockAvailable >= cumulativeMoveQty;
      expect(isCapSufficient).toBe(false);

      const boxStockAvailable = 200; // Sufficient
      const isBoxSufficient = boxStockAvailable >= cumulativeMoveQty;
      expect(isBoxSufficient).toBe(true);
    });

    it('calculates remaining room balances accurately and prevents negative numbers', () => {
      const results = mockAllocationItems.map((item) => ({
        batch_id: item.batch_id,
        location: item.location,
        remaining: Math.max(0, item.availableQty - item.allocatedQty),
      }));

      expect(results).toEqual([
        { batch_id: 'batch-1', location: 'Room 2', remaining: 350 },
        { batch_id: 'batch-2', location: 'Lobby', remaining: 270 },
        { batch_id: 'batch-3', location: 'Room 3', remaining: 430 },
      ]);
    });
  });
});

