import { describe, it, expect } from 'vitest';
import {
  groupVendorPendingAllocations,
  getVendorOrderGroupKey,
} from '../vendorPendingGrouping';
import type { MaterialAllocationWithVendorRelations } from '@/lib/supabase';

describe('vendorPendingGrouping', () => {
  const today = '2026-11-19';

  const mockAllocations: MaterialAllocationWithVendorRelations[] = [
    {
      id: 'alloc-1',
      order_id: 'ord-1',
      component_name: 'Outer Box',
      description: 'Gold Embossed',
      source: 'vendor',
      vendor_id: 'v-1',
      stock_item_id: 'item-1',
      qty: 2000,
      timeline: '2026-11-10', // Overdue
      status: 'pending',
      order: {
        id: 'ord-1',
        order_no: 'PO-2026-001',
        product_name: 'Luxury Perfume',
        total_qty: 2000,
        due_date: '2026-11-25',
        status: 'planning',
        client_id: 'c-1',
        created_at: '2026-11-01',
        updated_at: '2026-11-01',
        variants: [],
        notes: null,
      },
      client: {
        id: 'c-1',
        name: 'Client Alpha',
        company_name: 'Alpha Corp',
        contact: null,
        phone: null,
        email: null,
        created_at: '2026-11-01',
      },
      vendor: {
        id: 'v-1',
        name: 'Apex Packaging',
        contact: '9876543210',
        created_at: '2026-11-01',
      },
    },
    {
      id: 'alloc-2',
      order_id: 'ord-1',
      component_name: 'Inner Monocarton',
      description: 'Velvet 350 GSM',
      source: 'vendor',
      vendor_id: 'v-1',
      stock_item_id: 'item-2',
      qty: 2000,
      timeline: '2026-11-22', // Upcoming
      status: 'pending',
      order: {
        id: 'ord-1',
        order_no: 'PO-2026-001',
        product_name: 'Luxury Perfume',
        total_qty: 2000,
        due_date: '2026-11-25',
        status: 'planning',
        client_id: 'c-1',
        created_at: '2026-11-01',
        updated_at: '2026-11-01',
        variants: [],
        notes: null,
      },
      vendor: {
        id: 'v-1',
        name: 'Apex Packaging',
        contact: '9876543210',
        created_at: '2026-11-01',
      },
    },
    {
      id: 'alloc-3',
      order_id: 'ord-2',
      component_name: 'Shipping Master Carton',
      description: null,
      source: 'vendor',
      vendor_id: 'v-1',
      stock_item_id: null,
      qty: 500,
      timeline: '2026-11-30', // Upcoming
      status: 'pending',
      order: {
        id: 'ord-2',
        order_no: 'PO-2026-002',
        product_name: 'Body Spray',
        total_qty: 500,
        due_date: '2026-12-05',
        status: 'in_progress',
        client_id: 'c-2',
        created_at: '2026-11-01',
        updated_at: '2026-11-01',
        variants: [],
        notes: null,
      },
      vendor: {
        id: 'v-1',
        name: 'Apex Packaging',
        contact: '9876543210',
        created_at: '2026-11-01',
      },
    },
    {
      id: 'alloc-4',
      order_id: 'ord-3',
      component_name: 'Glass Bottle 100ml',
      description: 'Amber Glass',
      source: 'vendor',
      vendor_id: 'v-2',
      stock_item_id: 'item-3',
      qty: 1000,
      timeline: '2026-11-15', // Overdue
      status: 'pending',
      order: {
        id: 'ord-3',
        order_no: 'PO-2026-003',
        product_name: 'Perfume EDP',
        total_qty: 1000,
        due_date: '2026-11-20',
        status: 'planning',
        client_id: 'c-1',
        created_at: '2026-11-01',
        updated_at: '2026-11-01',
        variants: [],
        notes: null,
      },
      vendor: {
        id: 'v-2',
        name: 'Glassworks Ltd',
        contact: null,
        created_at: '2026-11-01',
      },
    },
    {
      id: 'alloc-5',
      order_id: null as any,
      component_name: 'Generic Bubble Wrap',
      description: 'Factory Consumable',
      source: 'vendor',
      vendor_id: null as any,
      stock_item_id: null,
      qty: 10,
      timeline: null,
      status: 'pending',
    },
  ];

  it('groups items into primary vendors correctly and sorts vendors by total pending count', () => {
    const groups = groupVendorPendingAllocations(mockAllocations, today);

    // 3 vendor groups: Apex Packaging (3 items), Glassworks Ltd (1 item), Unassigned (1 item)
    expect(groups).toHaveLength(3);
    expect(groups[0].vendor.id).toBe('v-1');
    expect(groups[0].items).toHaveLength(3);
    expect(groups[1].vendor.id).toBe('v-2');
    expect(groups[1].items).toHaveLength(1);
    expect(groups[2].vendor.id).toBe('unassigned');
    expect(groups[2].items).toHaveLength(1);
  });

  it('sub-groups allocations by production order inside each vendor', () => {
    const groups = groupVendorPendingAllocations(mockAllocations, today);
    const apex = groups.find((g) => g.vendor.id === 'v-1')!;

    // Apex has 2 orders: PO-2026-001 (2 items) and PO-2026-002 (1 item)
    expect(apex.orderGroups).toHaveLength(2);
    expect(apex.orderGroups[0].orderId).toBe('ord-1');
    expect(apex.orderGroups[0].items).toHaveLength(2);
    expect(apex.orderGroups[1].orderId).toBe('ord-2');
    expect(apex.orderGroups[1].items).toHaveLength(1);
  });

  it('prioritizes orders with overdue items at the top of orderGroups', () => {
    const groups = groupVendorPendingAllocations(mockAllocations, today);
    const apex = groups.find((g) => g.vendor.id === 'v-1')!;

    expect(apex.orderGroups[0].hasOverdue).toBe(true);
    expect(apex.orderGroups[0].overdueCount).toBe(1);
    expect(apex.orderGroups[0].order?.order_no).toBe('PO-2026-001');

    expect(apex.orderGroups[1].hasOverdue).toBe(false);
    expect(apex.orderGroups[1].overdueCount).toBe(0);
    expect(apex.orderGroups[1].order?.order_no).toBe('PO-2026-002');
  });

  it('handles unassigned suppliers and allocations with no order_id gracefully', () => {
    const groups = groupVendorPendingAllocations(mockAllocations, today);
    const unassigned = groups.find((g) => g.vendor.id === 'unassigned')!;

    expect(unassigned.vendor.name).toBe('Unassigned Vendor');
    expect(unassigned.orderGroups).toHaveLength(1);
    expect(unassigned.orderGroups[0].orderId).toBe('no_order');
    expect(unassigned.orderGroups[0].order).toBeNull();
    expect(unassigned.orderGroups[0].items[0].component_name).toBe('Generic Bubble Wrap');
  });

  it('places named production orders before unassigned general orders when neither is overdue', () => {
    const mixedAllocations: MaterialAllocationWithVendorRelations[] = [
      {
        id: 'alloc-general',
        order_id: null as any,
        component_name: 'Factory Tape',
        description: null,
        source: 'vendor',
        vendor_id: 'v-10',
        stock_item_id: null,
        qty: 100,
        timeline: '2026-12-01', // Future
        status: 'pending',
      },
      {
        id: 'alloc-named',
        order_id: 'ord-named',
        component_name: 'Custom Glass Cap',
        description: null,
        source: 'vendor',
        vendor_id: 'v-10',
        stock_item_id: null,
        qty: 500,
        timeline: '2026-12-01', // Future
        status: 'pending',
        order: {
          id: 'ord-named',
          order_no: 'PO-2026-999',
          product_name: 'Special Edition',
          total_qty: 500,
          due_date: '2026-12-05',
          status: 'planning',
          client_id: 'c-1',
          created_at: '2026-11-01',
          updated_at: '2026-11-01',
          variants: [],
          notes: null,
        },
      },
    ];

    const groups = groupVendorPendingAllocations(mixedAllocations, today);
    expect(groups).toHaveLength(1);
    const v10 = groups[0];
    expect(v10.orderGroups).toHaveLength(2);
    // Named PO must appear first before general
    expect(v10.orderGroups[0].orderId).toBe('ord-named');
    expect(v10.orderGroups[0].order?.order_no).toBe('PO-2026-999');
    expect(v10.orderGroups[1].orderId).toBe('no_order');
  });

  it('generates consistent deterministic accordion keys', () => {
    const key = getVendorOrderGroupKey('v-1', 'ord-1');
    expect(key).toBe('v-1_ord-1');
  });
});
