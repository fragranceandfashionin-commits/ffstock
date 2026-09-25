import { describe, it, expect } from 'vitest';
import { calculateDashboardMetrics } from '../dashboardCalculations';
import type { Stage, BatchWithRelations, MovementWithRelations, Dispatch } from '@/lib/supabase';

describe('dashboardCalculations.ts', () => {
  const mockStages: Stage[] = [
    { id: 'stage-1', name: 'Raw Stock', sequence_no: 1, created_at: '2026-01-01' },
    { id: 'stage-2', name: 'Coloring', sequence_no: 2, created_at: '2026-01-01' },
    { id: 'stage-3', name: 'Printing', sequence_no: 3, created_at: '2026-01-01' },
    { id: 'stage-4', name: 'Filling', sequence_no: 4, created_at: '2026-01-01' },
    { id: 'stage-5', name: 'Packaging', sequence_no: 5, created_at: '2026-01-01' },
    { id: 'stage-6', name: 'Ready', sequence_no: 6, created_at: '2026-01-01' },
    { id: 'stage-8', name: 'Scrap / Defect', sequence_no: 8, created_at: '2026-01-01' },
  ];

  const mockBatch: BatchWithRelations = {
    id: 'batch-1',
    batch_no: 'B001',
    supplier_id: 'supp-1',
    item_id: 'item-1',
    received_on: '2026-09-01',
    qty_received: 1000,
    location: 'Warehouse Rack A',
    image_url: null,
    created_at: '2026-09-01T00:00:00Z',
    supplier: { id: 'supp-1', name: 'Supplier Glass Corp', contact: null, created_at: '2026-01-01' },
    item: { id: 'item-1', name: '50ml Crystal Bottle', category: 'Bottle', created_at: '2026-01-01' },
  };

  it('returns null when stages or batches are null', () => {
    expect(
      calculateDashboardMetrics({
        stages: null,
        batches: null,
        movements: [],
        dispatches: [],
        componentStocks: [],
      })
    ).toBeNull();
  });

  it('correctly calculates single inward batch with no movements', () => {
    const result = calculateDashboardMetrics({
      stages: mockStages,
      batches: [mockBatch],
      movements: [],
      dispatches: [],
      componentStocks: [],
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.totalReceived).toBe(1000);
    expect(result.totalInsideFactory).toBe(1000);
    expect(result.totalDispatched).toBe(0);
    expect(result.scrapTotal).toBe(0);

    const row = result.batchMatrix[0];
    expect(row.batch.batch_no).toBe('B001');
    expect(row.stageQuantities['stage-1']).toBe(1000);
    expect(row.stageQuantities['stage-2']).toBe(0);
  });

  it('calculates forward movement from Raw Stock to Coloring correctly', () => {
    const movement: MovementWithRelations = {
      id: 'move-1',
      batch_id: 'batch-1',
      from_stage_id: 'stage-1',
      to_stage_id: 'stage-2',
      qty_moved: 400,
      moved_on: '2026-09-02',
      location: null,
      image_url: null,
      remarks: null,
      done_by: 'Operator 1',
      created_at: '2026-09-02T10:00:00Z',
      from_stage: mockStages[0],
      to_stage: mockStages[1],
    };

    const result = calculateDashboardMetrics({
      stages: mockStages,
      batches: [mockBatch],
      movements: [movement],
      dispatches: [],
      componentStocks: [],
    });

    expect(result).not.toBeNull();
    if (!result) return;

    const row = result.batchMatrix[0];
    expect(row.stageQuantities['stage-1']).toBe(600);
    expect(row.stageQuantities['stage-2']).toBe(400);
    expect(result.totalInsideFactory).toBe(1000);
  });

  it('calculates scrap movement and reduces in-factory count', () => {
    const scrapMovement: MovementWithRelations = {
      id: 'move-scrap',
      batch_id: 'batch-1',
      from_stage_id: 'stage-1',
      to_stage_id: 'stage-8',
      qty_moved: 50,
      moved_on: '2026-09-02',
      location: null,
      image_url: null,
      remarks: '[SCRAP: Breakage]',
      done_by: 'Inspector 1',
      created_at: '2026-09-02T11:00:00Z',
      from_stage: mockStages[0],
      to_stage: mockStages[6],
    };

    const result = calculateDashboardMetrics({
      stages: mockStages,
      batches: [mockBatch],
      movements: [scrapMovement],
      dispatches: [],
      componentStocks: [],
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.scrapTotal).toBe(50);
    expect(result.totalInsideFactory).toBe(950);
  });

  it('calculates dispatch from Ready stage', () => {
    // 1. Move 200 from Raw to Ready
    const toReadyMovement: MovementWithRelations = {
      id: 'move-ready',
      batch_id: 'batch-1',
      from_stage_id: 'stage-1',
      to_stage_id: 'stage-6',
      qty_moved: 200,
      moved_on: '2026-09-03',
      location: null,
      image_url: null,
      remarks: null,
      done_by: 'Operator 1',
      created_at: '2026-09-03T10:00:00Z',
      from_stage: mockStages[0],
      to_stage: mockStages[5],
    };

    // 2. Dispatch 150
    const dispatch: Dispatch = {
      id: 'disp-1',
      batch_id: 'batch-1',
      customer_name: 'Glamour Fragrances',
      invoice_no: 'INV-1001',
      qty: 150,
      dispatched_on: '2026-09-04',
      created_at: '2026-09-04T12:00:00Z',
    };

    const result = calculateDashboardMetrics({
      stages: mockStages,
      batches: [mockBatch],
      movements: [toReadyMovement],
      dispatches: [dispatch],
      componentStocks: [],
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.totalDispatched).toBe(150);
    expect(result.totalInsideFactory).toBe(850); // 800 in raw + 50 remaining in Ready

    const row = result.batchMatrix[0];
    expect(row.stageQuantities['stage-6']).toBe(50);
    expect(row.stageQuantities['stage-1']).toBe(800);
  });
});
