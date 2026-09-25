import { useState, useEffect, useCallback } from 'react';
import {
  fetchStages,
  fetchBatches,
  fetchMovements,
  fetchDispatches,
  fetchLocationStock,
  fetchSuppliers,
  fetchItems,
  fetchComponentStockSummary,
  fetchBatchAllocations,
  fetchProductionOrders,
  fetchVendorPendingList,
  fetchClients,
  fetchItemStockReceipts,
} from '@/lib/queries';
import { invalidateCache } from '@/lib/cache';
import type {
  Stage,
  BatchWithRelations,
  MovementWithRelations,
  Dispatch,
  Supplier,
  Item,
  ComponentStockSummary,
  BatchAllocationWithRelations,
} from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import type { LocationStock } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';

export type VendorPortalMetrics = {
  activeOrdersCount: number;
  pendingVendorAllocationsCount: number;
  clientsCount: number;
};

export function useDashboardData(
  asOfDate: string,
  onToastError?: (message: string, title?: string) => void
) {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [batches, setBatches] = useState<BatchWithRelations[] | null>(null);
  const [movements, setMovements] = useState<MovementWithRelations[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [locations, setLocations] = useState<LocationStock[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [componentStocks, setComponentStocks] = useState<ComponentStockSummary[]>([]);
  const [allocations, setAllocations] = useState<BatchAllocationWithRelations[]>([]);
  const [vendorPortalMetrics, setVendorPortalMetrics] = useState<VendorPortalMetrics>({
    activeOrdersCount: 0,
    pendingVendorAllocationsCount: 0,
    clientsCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [
        stagesData,
        batchesData,
        movementsData,
        dispatchesData,
        locationsData,
        suppliersData,
        itemsData,
        allocationsData,
        ordersData,
        pendingVendorData,
        clientsData,
        receiptsData,
      ] = await Promise.all([
        fetchStages(),
        fetchBatches(),
        fetchMovements(),
        fetchDispatches(),
        fetchLocationStock(),
        fetchSuppliers(),
        fetchItems(),
        fetchBatchAllocations().catch(() => [] as BatchAllocationWithRelations[]),
        fetchProductionOrders().catch(() => []),
        fetchVendorPendingList().catch(() => []),
        fetchClients().catch(() => []),
        fetchItemStockReceipts().catch(() => []),
      ]);

      const componentStocksData = await fetchComponentStockSummary(asOfDate || null, {
        items: itemsData,
        stages: stagesData,
        batches: batchesData,
        movements: movementsData,
        dispatches: dispatchesData,
        allocations: allocationsData,
        receipts: receiptsData,
      }).catch(() => [] as ComponentStockSummary[]);

      setStages(stagesData);
      setBatches(batchesData);
      setMovements(movementsData as MovementWithRelations[]);
      setDispatches(dispatchesData);
      setLocations(locationsData);
      setSuppliers(suppliersData);
      setItems(itemsData);
      setComponentStocks(componentStocksData);
      setAllocations(allocationsData);
      setVendorPortalMetrics({
        activeOrdersCount: (ordersData as { status: string }[]).filter((o) => o.status !== 'completed').length,
        pendingVendorAllocationsCount: (pendingVendorData as unknown[]).length,
        clientsCount: (clientsData as { status: string }[]).filter((c) => c.status === 'active').length,
      });
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to load factory dashboard records');
      setError(msg);
      if (onToastError) onToastError(msg, 'Data sync failed');
    } finally {
      setLoading(false);
    }
  }, [asOfDate, onToastError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime live syncing with targeted cache invalidation
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const debouncedReload = (cachePrefix?: string) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (cachePrefix) {
          invalidateCache(cachePrefix);
        } else {
          invalidateCache();
        }
        loadData();
      }, 300);
    };

    const channel = supabase
      .channel('dashboard-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inward_batches' }, () => debouncedReload('batches'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_allocations' }, () => debouncedReload('allocations'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_movements' }, () => debouncedReload('movements'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, () => debouncedReload('dispatches'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_stock_receipts' }, () => debouncedReload('item_stock_receipts'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => debouncedReload('suppliers'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => debouncedReload('items'))
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  return {
    stages,
    batches,
    movements,
    dispatches,
    locations,
    suppliers,
    items,
    componentStocks,
    setComponentStocks,
    allocations,
    vendorPortalMetrics,
    loading,
    error,
    loadData,
  };
}
