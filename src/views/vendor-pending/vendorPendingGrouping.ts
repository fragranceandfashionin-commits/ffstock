import type {
  MaterialAllocationWithVendorRelations,
  Supplier,
  Client,
  ProductionOrder,
} from '@/lib/supabase';

export type VendorOrderGroup = {
  orderId: string;
  order: (ProductionOrder & { client?: Client | null }) | null;
  client: Client | null;
  items: MaterialAllocationWithVendorRelations[];
  overdueCount: number;
  hasOverdue: boolean;
};

export type VendorPendingGroup = {
  vendor: Supplier;
  items: MaterialAllocationWithVendorRelations[];
  orderGroups: VendorOrderGroup[];
};

export function getVendorOrderGroupKey(vendorId: string, orderId: string): string {
  return `${vendorId}_${orderId}`;
}

export function groupVendorPendingAllocations(
  items: MaterialAllocationWithVendorRelations[],
  today: string
): VendorPendingGroup[] {
  const groups: {
    [vendorId: string]: {
      vendor: Supplier;
      items: MaterialAllocationWithVendorRelations[];
      orderGroupsMap: {
        [orderKey: string]: {
          orderId: string;
          order: (ProductionOrder & { client?: Client | null }) | null;
          client: Client | null;
          items: MaterialAllocationWithVendorRelations[];
        };
      };
    };
  } = {};

  items.forEach((item) => {
    const vId = item.vendor_id || 'unassigned';
    if (!groups[vId]) {
      const vendorObj: Supplier = item.vendor || {
        id: vId,
        name: 'Unassigned Vendor',
        contact: null,
        created_at: '',
      };
      groups[vId] = { vendor: vendorObj, items: [], orderGroupsMap: {} };
    }
    groups[vId].items.push(item);

    const orderKey = item.order_id || 'no_order';
    if (!groups[vId].orderGroupsMap[orderKey]) {
      groups[vId].orderGroupsMap[orderKey] = {
        orderId: orderKey,
        order: item.order || null,
        client: item.client || item.order?.client || null,
        items: [],
      };
    }
    groups[vId].orderGroupsMap[orderKey].items.push(item);
  });

  return Object.values(groups)
    .sort((a, b) => b.items.length - a.items.length)
    .map((g) => {
      const orderGroups: VendorOrderGroup[] = Object.values(g.orderGroupsMap).map((og) => {
        const overdueCount = og.items.filter((i) => i.timeline && i.timeline < today).length;
        return {
          ...og,
          overdueCount,
          hasOverdue: overdueCount > 0,
        };
      });

      // Sort order groups: orders with overdue items first (higher count first), then named orders before general, then by order_no
      orderGroups.sort((a, b) => {
        if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
        if (a.hasOverdue && b.hasOverdue && a.overdueCount !== b.overdueCount) {
          return b.overdueCount - a.overdueCount;
        }
        if (a.order && !b.order) return -1;
        if (!a.order && b.order) return 1;
        const aNo = a.order?.order_no || '';
        const bNo = b.order?.order_no || '';
        return aNo.localeCompare(bNo);
      });

      return {
        vendor: g.vendor,
        items: g.items,
        orderGroups,
      };
    });
}
