import { describe, it, expect } from 'vitest';
import {
  sortBatchesByFIFO,
  calculateFIFOSplits,
  calculateFIFOSplitsFromRemaining,
  type FIFOStockSource,
  type StageStockItem,
} from '../fifo';

describe('FIFO Engine & Multi-Batch Calculations', () => {
  const stageRaw = 'stage-raw-111';
  const stageColoring = 'stage-col-222';

  const mockBatches: FIFOStockSource[] = [
    {
      id: 'batch-c',
      batch_no: 'CU-2026-03',
      location: 'Floor Bay 4',
      received_on: '2026-09-18',
      created_at: '2026-09-18T10:00:00Z',
    },
    {
      id: 'batch-a',
      batch_no: 'CU-2026-01',
      location: 'Bay 2-A',
      received_on: '2026-09-10',
      created_at: '2026-09-10T08:00:00Z',
    },
    {
      id: 'batch-b',
      batch_no: 'CU-2026-02',
      location: 'Rack B-1',
      received_on: '2026-09-15',
      created_at: '2026-09-15T09:00:00Z',
    },
  ];

  it('1. sorts batches by FIFO (received_on ASC then created_at ASC)', () => {
    const sorted = sortBatchesByFIFO(mockBatches);
    expect(sorted.map((b) => b.id)).toEqual(['batch-a', 'batch-b', 'batch-c']);
  });

  it('2. sorts by created_at when received_on is identical', () => {
    const sameDateBatches: FIFOStockSource[] = [
      { id: 'b2', batch_no: 'B2', received_on: '2026-09-10', created_at: '2026-09-10T12:00:00Z' },
      { id: 'b1', batch_no: 'B1', received_on: '2026-09-10', created_at: '2026-09-10T06:00:00Z' },
    ];
    const sorted = sortBatchesByFIFO(sameDateBatches);
    expect(sorted[0].id).toBe('b1');
    expect(sorted[1].id).toBe('b2');
  });

  it('3. single batch exact match returns 1 split', () => {
    const perBatchStock = new Map<string, StageStockItem[]>([
      ['batch-a', [{ stage_id: stageRaw, qty: 200 }]],
      ['batch-b', [{ stage_id: stageRaw, qty: 300 }]],
    ]);

    const splits = calculateFIFOSplits({
      requestedQty: 200,
      stageId: stageRaw,
      batches: mockBatches,
      perBatchStock,
    });

    expect(splits).toEqual([
      {
        batch_id: 'batch-a',
        batch_no: 'CU-2026-01',
        location: 'Bay 2-A',
        qty: 200,
      },
    ]);
  });

  it('4. partial depletion of first batch returns 1 split', () => {
    const perBatchStock = new Map<string, StageStockItem[]>([
      ['batch-a', [{ stage_id: stageRaw, qty: 400 }]],
    ]);

    const splits = calculateFIFOSplits({
      requestedQty: 150,
      stageId: stageRaw,
      batches: mockBatches,
      perBatchStock,
    });

    expect(splits).toHaveLength(1);
    expect(splits[0].qty).toBe(150);
    expect(splits[0].batch_id).toBe('batch-a');
  });

  it('5. multi-batch sequential depletion across 3 batches', () => {
    const perBatchStock = new Map<string, StageStockItem[]>([
      ['batch-a', [{ stage_id: stageRaw, qty: 200 }]],
      ['batch-b', [{ stage_id: stageRaw, qty: 300 }]],
      ['batch-c', [{ stage_id: stageRaw, qty: 500 }]],
    ]);

    // Request 750: exhausts batch-a (200), exhausts batch-b (300), takes 250 from batch-c
    const splits = calculateFIFOSplits({
      requestedQty: 750,
      stageId: stageRaw,
      batches: mockBatches,
      perBatchStock,
    });

    expect(splits).toEqual([
      { batch_id: 'batch-a', batch_no: 'CU-2026-01', location: 'Bay 2-A', qty: 200 },
      { batch_id: 'batch-b', batch_no: 'CU-2026-02', location: 'Rack B-1', qty: 300 },
      { batch_id: 'batch-c', batch_no: 'CU-2026-03', location: 'Floor Bay 4', qty: 250 },
    ]);
    const totalAllocated = splits.reduce((acc, s) => acc + s.qty, 0);
    expect(totalAllocated).toBe(750);
  });

  it('6. returns empty array when total stock is insufficient', () => {
    const perBatchStock = new Map<string, StageStockItem[]>([
      ['batch-a', [{ stage_id: stageRaw, qty: 100 }]],
      ['batch-b', [{ stage_id: stageRaw, qty: 50 }]],
    ]);

    const splits = calculateFIFOSplits({
      requestedQty: 200,
      stageId: stageRaw,
      batches: mockBatches,
      perBatchStock,
    });

    expect(splits).toEqual([]);
  });

  it('7. returns empty array when stage has no stock or requestedQty is <= 0', () => {
    const perBatchStock = new Map<string, StageStockItem[]>([
      ['batch-a', [{ stage_id: stageColoring, qty: 0 }]],
    ]);

    expect(
      calculateFIFOSplits({
        requestedQty: 0,
        stageId: stageColoring,
        batches: mockBatches,
        perBatchStock,
      })
    ).toEqual([]);

    expect(
      calculateFIFOSplits({
        requestedQty: 50,
        stageId: stageColoring,
        batches: mockBatches,
        perBatchStock,
      })
    ).toEqual([]);
  });

  it('8. calculates residual scrap splits preventing trigger over-deduction (Zero Ghost Stock)', () => {
    // Scenario: Batch A has 200, Batch B has 300 (total 500).
    // User moves 150 forward with 350 scrapped.
    // Forward movement takes 150 from Batch A.
    // Residuals: Batch A has 50 left, Batch B has 300 left.
    // Scrap splits should take 50 from Batch A, and 300 from Batch B!
    const perBatchStock = new Map<string, StageStockItem[]>([
      ['batch-a', [{ stage_id: stageRaw, qty: 200 }]],
      ['batch-b', [{ stage_id: stageRaw, qty: 300 }]],
    ]);

    const forwardSplits = calculateFIFOSplits({
      requestedQty: 150,
      stageId: stageRaw,
      batches: mockBatches,
      perBatchStock,
    });
    expect(forwardSplits).toEqual([
      { batch_id: 'batch-a', batch_no: 'CU-2026-01', location: 'Bay 2-A', qty: 150 },
    ]);

    const scrapSplits = calculateFIFOSplitsFromRemaining({
      scrapQty: 350,
      stageId: stageRaw,
      batches: mockBatches,
      perBatchStock,
      usedSplits: forwardSplits,
    });

    expect(scrapSplits).toEqual([
      { batch_id: 'batch-a', batch_no: 'CU-2026-01', location: 'Bay 2-A', qty: 50 },
      { batch_id: 'batch-b', batch_no: 'CU-2026-02', location: 'Rack B-1', qty: 300 },
    ]);

    // Invariant check: for each batch, forward + scrap <= initial available
    for (const b of mockBatches) {
      const fQty = forwardSplits.find((s) => s.batch_id === b.id)?.qty || 0;
      const sQty = scrapSplits.find((s) => s.batch_id === b.id)?.qty || 0;
      const totalAvail = perBatchStock.get(b.id)?.find((s) => s.stage_id === stageRaw)?.qty || 0;
      expect(fQty + sQty).toBeLessThanOrEqual(totalAvail);
    }
  });

  it('9. residual scrap returns empty if scrapQty exceeds remaining residual', () => {
    const perBatchStock = new Map<string, StageStockItem[]>([
      ['batch-a', [{ stage_id: stageRaw, qty: 200 }]],
    ]);
    const forwardSplits = [{ batch_id: 'batch-a', batch_no: 'CU-2026-01', qty: 150 }];

    const scrapSplits = calculateFIFOSplitsFromRemaining({
      scrapQty: 100, // only 50 left!
      stageId: stageRaw,
      batches: mockBatches,
      perBatchStock,
      usedSplits: forwardSplits,
    });

    expect(scrapSplits).toEqual([]);
  });
});
