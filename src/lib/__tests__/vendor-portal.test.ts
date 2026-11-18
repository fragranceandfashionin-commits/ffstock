/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vendorPortal from '../queries/vendor-portal';
import { supabase } from '../supabase';

vi.mock('../supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('../cache', () => ({
  fetchWithCache: vi.fn((_key, fn) => fn()),
  invalidateCache: vi.fn(),
  CACHE_TTL: { SHORT: 1000, STAGES: 5000 },
}));

describe('vendor-portal query functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMultipleProductionOrders', () => {
    it('creates multiple orders sequentially and invokes onProgress', async () => {
      const mockOrder1 = { id: 'ord-1', order_no: 'PO-2026-001', product_name: 'Product 1' };
      const mockOrder2 = { id: 'ord-2', order_no: 'PO-2026-002', product_name: 'Product 2' };

      (supabase.rpc as any)
        .mockResolvedValueOnce({ data: mockOrder1, error: null })
        .mockResolvedValueOnce({ data: mockOrder2, error: null });

      const payloads = [
        { client_id: 'c1', product_name: 'Product 1', total_qty: 100 },
        { client_id: 'c1', product_name: 'Product 2', total_qty: 200 },
      ];

      const progressSteps: Array<{ index: number; total: number }> = [];

      const result = await vendorPortal.createMultipleProductionOrders(payloads, (idx, tot) => {
        progressSteps.push({ index: idx, total: tot });
      });

      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.succeeded[0]).toEqual(mockOrder1);
      expect(result.succeeded[1]).toEqual(mockOrder2);
      expect(progressSteps).toEqual([
        { index: 0, total: 2 },
        { index: 1, total: 2 },
      ]);
    });

    it('handles partial failures gracefully without throwing', async () => {
      const mockOrder1 = { id: 'ord-1', order_no: 'PO-2026-001', product_name: 'Product 1' };

      (supabase.rpc as any)
        .mockResolvedValueOnce({ data: mockOrder1, error: null })
        .mockResolvedValueOnce({ data: null, error: new Error('PostgreSQL RPC Constraint Error') });

      const payloads = [
        { client_id: 'c1', product_name: 'Product 1', total_qty: 100 },
        { client_id: 'c1', product_name: 'Product 2', total_qty: 200 },
      ];

      const result = await vendorPortal.createMultipleProductionOrders(payloads);

      expect(result.succeeded).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.succeeded[0].id).toBe('ord-1');
      expect(result.failed[0].index).toBe(1);
      expect(result.failed[0].error).toContain('PostgreSQL RPC Constraint Error');
    });
  });

  describe('markAllocationReceived', () => {
    it('invokes receive_material_allocation_rpc with options', async () => {
      const mockResponse = {
        success: true,
        batch_no: 'BAT-2026-001',
        inward_batch_id: 'batch-1',
        order_status: 'planning',
      };
      (supabase.rpc as any).mockResolvedValueOnce({ data: mockResponse, error: null });

      const res = await vendorPortal.markAllocationReceived('alloc-1', {
        stockItemId: 'item-1',
        qtyReceived: 500,
        location: 'Bay B',
      });

      expect(supabase.rpc).toHaveBeenCalledWith('receive_material_allocation_rpc', {
        p_allocation_id: 'alloc-1',
        p_stock_item_id: 'item-1',
        p_qty_received: 500,
        p_vendor_id: null,
        p_location: 'Bay B',
        p_inward_batch_id: null,
      });
      expect(res).toEqual(mockResponse);
    });
  });

  describe('revertAllocationToPending', () => {
    it('invokes revert_material_allocation_rpc', async () => {
      const mockResponse = { success: true, allocation_id: 'alloc-1', status: 'pending', order_status: 'planning' };
      (supabase.rpc as any).mockResolvedValueOnce({ data: mockResponse, error: null });

      const res = await vendorPortal.revertAllocationToPending('alloc-1');

      expect(supabase.rpc).toHaveBeenCalledWith('revert_material_allocation_rpc', {
        p_allocation_id: 'alloc-1',
      });
      expect(res).toEqual(mockResponse);
    });
  });

  describe('batchMarkAllocationsReceived', () => {
    it('returns empty count when no IDs provided', async () => {
      const res = await vendorPortal.batchMarkAllocationsReceived([]);
      expect(res).toEqual({ success: true, received_count: 0, batch_numbers: [], allocations: [] });
    });

    it('invokes batch_receive_material_allocations_rpc with parameters', async () => {
      const mockRpcResponse = {
        success: true,
        received_count: 2,
        batch_numbers: ['BAT-2026-001'],
        allocations: [{ allocation_id: 'alloc-1', batch_no: 'BAT-2026-001' }],
      };
      (supabase.rpc as any).mockResolvedValueOnce({ data: mockRpcResponse, error: null });

      const res = await vendorPortal.batchMarkAllocationsReceived(['alloc-1', 'alloc-2'], 'Raw Stock Bay B');

      expect(supabase.rpc).toHaveBeenCalledWith('batch_receive_material_allocations_rpc', {
        p_allocation_ids: ['alloc-1', 'alloc-2'],
        p_location: 'Raw Stock Bay B',
      });
      expect(res).toEqual(mockRpcResponse);
    });
  });

  describe('batchRevertAllocationsToPending', () => {
    it('returns zero count when no IDs provided', async () => {
      const res = await vendorPortal.batchRevertAllocationsToPending([]);
      expect(res).toEqual({ success: true, reverted_count: 0 });
    });

    it('invokes batch_revert_material_allocations_rpc with parameters', async () => {
      const mockRpcResponse = { success: true, reverted_count: 1 };
      (supabase.rpc as any).mockResolvedValueOnce({ data: mockRpcResponse, error: null });

      const res = await vendorPortal.batchRevertAllocationsToPending(['alloc-1']);

      expect(supabase.rpc).toHaveBeenCalledWith('batch_revert_material_allocations_rpc', {
        p_allocation_ids: ['alloc-1'],
      });
      expect(res).toEqual(mockRpcResponse);
    });
  });

  describe('fetchRecentlyReceivedAllocations', () => {
    it('queries received allocations with disambiguated relation syntax and proper filter chaining', async () => {
      const mockData = [
        {
          id: 'alloc-1',
          component_name: 'Amber 100ml',
          order: { id: 'ord-1', order_no: 'PO-2026-001', client: { name: 'Client A' } },
          inward_batch: { id: 'batch-1', batch_no: 'BAT-2026-001', location: 'Bay A' },
        },
      ];

      const chain: any = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue({ data: mockData, error: null });
      (supabase.from as any).mockReturnValue(chain);

      const res = await vendorPortal.fetchRecentlyReceivedAllocations('vendor', 10);

      expect(supabase.from).toHaveBeenCalledWith('material_allocations');
      expect(chain.select).toHaveBeenCalledWith(expect.stringContaining('inward_batches!inward_batch_id'));
      expect(chain.eq).toHaveBeenCalledWith('status', 'received');
      expect(chain.eq).toHaveBeenCalledWith('source', 'vendor');
      expect(chain.order).toHaveBeenCalledWith('received_at', { ascending: false });
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(res[0].client).toEqual({ name: 'Client A' });
    });
  });
});
