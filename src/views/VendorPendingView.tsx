import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Phone,
  Printer,
  Building2,
  ArrowRightLeft,
  ExternalLink,
  Package,
  RotateCcw,
  Check,
  MessageSquare,
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  Layers,
} from 'lucide-react';
import {
  Card,
  PageHeader,
  ErrorBanner,
  EmptyState,
  Button,
  SearchInput,
  TableSkeleton,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import {
  fetchVendorPendingList,
  fetchRecentlyReceivedAllocations,
  markAllocationReceived,
  batchMarkAllocationsReceived,
  revertAllocationToPending,
  batchRevertAllocationsToPending,
  updateMaterialAllocation,
  fetchSuppliers,
  fetchClients,
  fetchItems,
} from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type {
  MaterialAllocationWithVendorRelations,
  Supplier,
  Client,
  Item,
  ProductionOrder,
} from '@/lib/supabase';
import type { View } from '@/lib/types';
import type { NavigationContext } from '@/components/AppShell';
import { getErrorMessage, formatDate, getTodayDateString, normalizePhoneForWhatsApp } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import {
  groupVendorPendingAllocations,
  getVendorOrderGroupKey,
  type VendorOrderGroup,
  type VendorPendingGroup,
} from './vendor-pending/vendorPendingGrouping';

export type { VendorOrderGroup, VendorPendingGroup };

export type VendorPendingViewProps = {
  initialClientId?: string;
  initialVendorId?: string;
  initialOrderId?: string;
  onViewChange?: (view: View, context?: NavigationContext) => void;
};

export function VendorPendingView({
  initialClientId,
  initialVendorId,
  initialOrderId,
  onViewChange,
}: VendorPendingViewProps) {
  const { canPerform, canAccessView } = useAuth();
  const [items, setItems] = useState<MaterialAllocationWithVendorRelations[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [itemsCatalog, setItemsCatalog] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string>(initialVendorId || 'all');
  const [selectedClientId, setSelectedClientId] = useState<string>(initialClientId || 'all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'overdue' | 'upcoming' | 'no_timeline'>('all');

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
    }
  }, [initialClientId]);

  useEffect(() => {
    if (initialVendorId) {
      setSelectedVendorId(initialVendorId);
    }
  }, [initialVendorId]);

  // Modals & Active Tabs
  const [quickReceiveAlloc, setQuickReceiveAlloc] = useState<MaterialAllocationWithVendorRelations | null>(null);
  const [selectedQuickSkuId, setSelectedQuickSkuId] = useState<string>('');
  const [quickReceiveQty, setQuickReceiveQty] = useState<number>(1);
  const [quickReceiveLocation, setQuickReceiveLocation] = useState<string>('Raw Stock Bay A');
  const [submittingQuickReceive, setSubmittingQuickReceive] = useState(false);

  const [bulkPreValidationModal, setBulkPreValidationModal] = useState<{
    vendor: Supplier;
    items: MaterialAllocationWithVendorRelations[];
    skuMappings: Record<string, string>;
  } | null>(null);
  const [bulkReceiving, setBulkReceiving] = useState(false);

  const [reassignItem, setReassignItem] = useState<MaterialAllocationWithVendorRelations | null>(null);
  const [newVendorId, setNewVendorId] = useState<string>('');
  const [reassigning, setReassigning] = useState(false);

  // Accordion Expand/Collapse State (keyed by `${vendorId}_${orderId}`)
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
  const [hasInitializedExpansion, setHasInitializedExpansion] = useState(false);

  // Persistent Recently Received Items
  const [recentlyReceived, setRecentlyReceived] = useState<MaterialAllocationWithVendorRelations[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'recent_received'>('pending');

  const toast = useToast();
  const today = getTodayDateString();

  // Load Data with itemsCatalog and persistent recent allocations
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [pendingData, recentData, suppliersData, clientsData, catalogData] = await Promise.all([
        fetchVendorPendingList(),
        fetchRecentlyReceivedAllocations('vendor', 50),
        fetchSuppliers(),
        fetchClients(),
        fetchItems(),
      ]);
      setItems(pendingData);
      setRecentlyReceived(recentData);
      setSuppliers(suppliersData);
      setClients(clientsData);
      setItemsCatalog(catalogData);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load vendor pending list'));
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime multi-table sync
  useEffect(() => {
    const channel = supabase
      .channel('vendor_pending_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'material_allocations' },
        () => {
          loadData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // 1-Click Receive Initiator with Smart Auto-Match
  const handleInitiateReceive = (alloc: MaterialAllocationWithVendorRelations) => {
    if (!canPerform('manage_orders')) {
      toast.error('Permission denied: You do not have permission to mark components received.');
      return;
    }

    const isService = /printing|coating|stamping|metalliz|emboss/i.test(alloc.component_name);
    if (alloc.stock_item_id || isService) {
      handleMarkReceived(alloc);
      return;
    }

    const matchedItem = itemsCatalog.find(
      (i) => i.name.toLowerCase() === (alloc.description || alloc.component_name).toLowerCase()
    );

    setSelectedQuickSkuId(matchedItem ? matchedItem.id : '');
    setQuickReceiveQty(alloc.qty || alloc.order?.total_qty || 1);
    setQuickReceiveLocation(alloc.location || 'Raw Stock Bay A');
    setQuickReceiveAlloc(alloc);
  };

  // Direct Mark Received (When SKU is already bound or service milestone)
  const handleMarkReceived = async (alloc: MaterialAllocationWithVendorRelations) => {
    try {
      const res = await markAllocationReceived(alloc.id, {
        stockItemId: alloc.stock_item_id,
        qtyReceived: alloc.qty || alloc.order?.total_qty || 1,
        location: alloc.location || 'Raw Stock Bay A',
      });

      const receivedItem: MaterialAllocationWithVendorRelations = {
        ...alloc,
        status: 'received',
        received_at: new Date().toISOString(),
        inward_batch_id: res.inward_batch_id || null,
        receipt_id: res.receipt_id || null,
        inward_batch: res.inward_batch_id
          ? {
              id: res.inward_batch_id,
              batch_no: res.batch_no || 'BAT-LOT',
              location: alloc.location || 'Raw Stock Bay A',
              supplier_id: alloc.vendor_id || '',
              item_id: alloc.stock_item_id || '',
              received_on: new Date().toISOString().slice(0, 10),
              qty_received: alloc.qty || alloc.order?.total_qty || 1,
              image_url: null,
              created_at: new Date().toISOString(),
            }
          : null,
      };

      setRecentlyReceived((prev) => [receivedItem, ...prev.filter((p) => p.id !== alloc.id)]);
      setItems((prev) => prev.filter((item) => item.id !== alloc.id));

      toast.success(
        `Received ${alloc.component_name} for order ${alloc.order?.order_no || ''}!`,
        {
          action: {
            label: 'UNDO',
            onClick: async () => {
              try {
                await revertAllocationToPending(alloc.id);
                toast.success(`Reverted ${alloc.component_name} back to pending`);
                setRecentlyReceived((prev) => prev.filter((p) => p.id !== alloc.id));
                setItems((prev) => [alloc, ...prev]);
                await loadData(true);
              } catch (revertErr) {
                toast.error(getErrorMessage(revertErr, 'Failed to revert component'));
              }
            },
          },
        }
      );
      await loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to mark component received'));
      loadData(true);
    }
  };

  // Turnkey Quick SKU Confirm Handler
  const handleConfirmQuickReceive = async () => {
    if (!quickReceiveAlloc) return;
    if (!selectedQuickSkuId) {
      toast.error('Please select an inventory SKU to receive this item into stock.');
      return;
    }
    setSubmittingQuickReceive(true);
    try {
      const res = await markAllocationReceived(quickReceiveAlloc.id, {
        stockItemId: selectedQuickSkuId,
        qtyReceived: quickReceiveQty,
        location: quickReceiveLocation || 'Raw Stock Bay A',
      });

      const receivedItem: MaterialAllocationWithVendorRelations = {
        ...quickReceiveAlloc,
        stock_item_id: selectedQuickSkuId,
        status: 'received',
        received_at: new Date().toISOString(),
        inward_batch_id: res.inward_batch_id || null,
        receipt_id: res.receipt_id || null,
        inward_batch: res.inward_batch_id
          ? {
              id: res.inward_batch_id,
              batch_no: res.batch_no || 'BAT-LOT',
              location: quickReceiveLocation || 'Raw Stock Bay A',
              supplier_id: quickReceiveAlloc.vendor_id || '',
              item_id: selectedQuickSkuId,
              received_on: new Date().toISOString().slice(0, 10),
              qty_received: quickReceiveQty,
              image_url: null,
              created_at: new Date().toISOString(),
            }
          : null,
      };

      setRecentlyReceived((prev) => [receivedItem, ...prev.filter((p) => p.id !== quickReceiveAlloc.id)]);
      setItems((prev) => prev.filter((item) => item.id !== quickReceiveAlloc.id));

      toast.success(
        `Received ${quickReceiveAlloc.component_name} for order ${quickReceiveAlloc.order?.order_no || ''}!`,
        {
          action: {
            label: 'UNDO',
            onClick: async () => {
              try {
                await revertAllocationToPending(quickReceiveAlloc.id);
                toast.success(`Reverted ${quickReceiveAlloc.component_name} back to pending`);
                setRecentlyReceived((prev) => prev.filter((p) => p.id !== quickReceiveAlloc.id));
                setItems((prev) => [quickReceiveAlloc, ...prev]);
                await loadData(true);
              } catch (revertErr) {
                toast.error(getErrorMessage(revertErr, 'Failed to revert component'));
              }
            },
          },
        }
      );

      setQuickReceiveAlloc(null);
      await loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to receive component'));
      loadData(true);
    } finally {
      setSubmittingQuickReceive(false);
    }
  };

  // Open Pre-Validated Bulk Intake Modal
  const handleOpenBulkModal = (vendor: Supplier, vItems: MaterialAllocationWithVendorRelations[]) => {
    const mappings: Record<string, string> = {};
    vItems.forEach((item) => {
      if (item.stock_item_id) {
        mappings[item.id] = item.stock_item_id;
      } else {
        const match = itemsCatalog.find(
          (i) => i.name.toLowerCase() === (item.description || item.component_name).toLowerCase()
        );
        if (match) mappings[item.id] = match.id;
      }
    });

    setBulkPreValidationModal({
      vendor,
      items: vItems,
      skuMappings: mappings,
    });
  };

  // Confirm Bulk Intake with Fully Enriched Optimistic UI
  const handleConfirmBulkPreValidated = async () => {
    if (!bulkPreValidationModal) return;
    const { vendor, items: targetItems, skuMappings } = bulkPreValidationModal;

    const missingSku = targetItems.find((item) => {
      const isService = /printing|coating|stamping|metalliz|emboss/i.test(item.component_name);
      return !isService && !skuMappings[item.id];
    });

    if (missingSku) {
      toast.error(`Please select a warehouse SKU for "${missingSku.component_name}" (${missingSku.order?.order_no})`);
      return;
    }

    setBulkReceiving(true);
    try {
      for (const item of targetItems) {
        const selectedSku = skuMappings[item.id];
        if (selectedSku && selectedSku !== item.stock_item_id) {
          await updateMaterialAllocation(item.id, { stock_item_id: selectedSku });
        }
      }

      const ids = targetItems.map((i) => i.id);
      const result = await batchMarkAllocationsReceived(ids);

      const targetIdSet = new Set(ids);
      setItems((prev) => prev.filter((i) => !targetIdSet.has(i.id)));

      const allocResultMap = new Map((result.allocations || []).map((a) => [a.allocation_id, a]));

      const enrichedReceived: MaterialAllocationWithVendorRelations[] = targetItems.map((ti) => {
        const resItem = allocResultMap.get(ti.id);
        return {
          ...ti,
          stock_item_id: skuMappings[ti.id] || ti.stock_item_id,
          status: 'received' as const,
          received_at: new Date().toISOString(),
          inward_batch_id: resItem?.inward_batch_id || ti.inward_batch_id,
          receipt_id: resItem?.receipt_id || ti.receipt_id,
          inward_batch: resItem?.inward_batch_id
            ? {
                id: resItem.inward_batch_id,
                batch_no: resItem.batch_no || 'BAT-LOT',
                location: ti.location || 'Raw Stock Bay A',
                supplier_id: ti.vendor_id || '',
                item_id: skuMappings[ti.id] || ti.stock_item_id || '',
                received_on: new Date().toISOString().slice(0, 10),
                qty_received: ti.qty || 1,
                image_url: null,
                created_at: new Date().toISOString(),
              }
            : ti.inward_batch,
        };
      });

      setRecentlyReceived((prev) => [...enrichedReceived, ...prev.filter((p) => !targetIdSet.has(p.id))]);

      toast.success(
        `Received all ${result.received_count} components from ${vendor.name}!`,
        {
          action: {
            label: 'UNDO',
            onClick: async () => {
              try {
                await batchRevertAllocationsToPending(ids);
                toast.info(`Reverted ${targetItems.length} components back to pending`);
                setRecentlyReceived((prev) => prev.filter((p) => !targetIdSet.has(p.id)));
                setItems((prev) => [...targetItems, ...prev]);
                await loadData(true);
              } catch (revertErr) {
                toast.error(getErrorMessage(revertErr, 'Failed to undo bulk receiving'));
              }
            },
          },
        }
      );

      setBulkPreValidationModal(null);
      await loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to bulk receive components'));
    } finally {
      setBulkReceiving(false);
    }
  };

  // Revert Received item back to Pending
  const handleRevertToPending = async (alloc: MaterialAllocationWithVendorRelations) => {
    if (!canPerform('reverse_allocation')) {
      toast.error('Permission denied: Only administrators and production managers can revert allocations.');
      return;
    }
    try {
      await revertAllocationToPending(alloc.id);
      toast.info(`Reverted ${alloc.component_name} back to pending`);
      setRecentlyReceived((prev) => prev.filter((p) => p.id !== alloc.id));
      loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to revert component'));
    }
  };

  // Reassign Vendor
  const handleConfirmReassign = async () => {
    if (!canPerform('manage_orders')) {
      toast.error('Permission denied: You do not have permission to reassign components.');
      return;
    }
    if (!reassignItem || !newVendorId) return;
    setReassigning(true);
    try {
      await updateMaterialAllocation(reassignItem.id, { vendor_id: newVendorId });
      const targetVendor = suppliers.find((s) => s.id === newVendorId);
      toast.success(
        `Reassigned ${reassignItem.component_name} to ${targetVendor?.name || 'new vendor'}`
      );
      setReassignItem(null);
      setNewVendorId('');
      loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reassign vendor'));
    } finally {
      setReassigning(false);
    }
  };

  // Upgraded WhatsApp Reminder Generator
  const generateWhatsAppMessage = (
    vendor: Supplier,
    vendorItems: MaterialAllocationWithVendorRelations[]
  ): string => {
    const todayFormatted = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const lines = [
      `*FRAGRANCE & FASHION - PENDING RAW MATERIALS STATUS*`,
      `Vendor: ${vendor.name}`,
      `Date: ${todayFormatted}`,
      ``,
      `Dear ${vendor.name},`,
      `Please find below the list of pending components awaiting delivery at our factory:`,
      ``,
    ];

    vendorItems.forEach((item, idx) => {
      const orderNo = item.order?.order_no || 'PO-XXXX';
      const prodName = item.order?.product_name || 'Product';
      const clientName = item.client?.name || item.order?.client?.name || 'Direct Order';
      const desc = item.description ? ` (${item.description})` : '';
      const qty = item.qty || item.order?.total_qty || 0;
      const due = item.timeline ? ` | Target Due: ${formatDate(item.timeline)}` : '';
      lines.push(`${idx + 1}. *${item.component_name}*${desc}`);
      lines.push(`   Order: ${orderNo} [${prodName} - Client: ${clientName}] | Qty: ${qty > 0 ? qty.toLocaleString() : 'TBD'}${due}`);
    });

    lines.push(``);
    lines.push(`Kindly let us know the delivery vehicle/tracking details as soon as possible. Thank you!`);
    return lines.join('\n');
  };

  const handleCopyWhatsAppMessage = (
    vendor: Supplier,
    vendorItems: MaterialAllocationWithVendorRelations[]
  ) => {
    const message = generateWhatsAppMessage(vendor, vendorItems);
    navigator.clipboard.writeText(message);
    toast.success(`WhatsApp follow-up message copied for ${vendor.name}!`);
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Vendor filter
      if (selectedVendorId !== 'all' && item.vendor_id !== selectedVendorId) {
        return false;
      }
      // Client filter
      if (selectedClientId !== 'all') {
        const itemClientId = item.client?.id || item.order?.client_id;
        if (itemClientId !== selectedClientId) {
          return false;
        }
      }
      // Urgency filter (4-state)
      if (urgencyFilter === 'overdue') {
        if (!item.timeline || item.timeline >= today) return false;
      } else if (urgencyFilter === 'upcoming') {
        if (!item.timeline || item.timeline < today) return false;
      } else if (urgencyFilter === 'no_timeline') {
        if (item.timeline) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchVendor = item.vendor?.name?.toLowerCase().includes(q);
        const matchComp = item.component_name.toLowerCase().includes(q);
        const matchOrder = item.order?.order_no?.toLowerCase().includes(q);
        const matchProd = item.order?.product_name?.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        const matchClientName =
          item.client?.name?.toLowerCase().includes(q) ||
          item.order?.client?.name?.toLowerCase().includes(q);
        const matchClientCompany =
          item.client?.company_name?.toLowerCase().includes(q) ||
          item.order?.client?.company_name?.toLowerCase().includes(q);
        return (
          matchVendor ||
          matchComp ||
          matchOrder ||
          matchProd ||
          matchDesc ||
          matchClientName ||
          matchClientCompany
        );
      }
      return true;
    });
  }, [items, selectedVendorId, selectedClientId, urgencyFilter, searchQuery, today]);

  // Group items by Vendor, and sub-group by Production Order
  const groupedByVendor = useMemo((): VendorPendingGroup[] => {
    return groupVendorPendingAllocations(filteredItems, today);
  }, [filteredItems, today]);

  // Auto-expand first order group or targeted order on initial load (matching OrdersView behavior)
  useEffect(() => {
    if (!hasInitializedExpansion && groupedByVendor.length > 0) {
      const initialKeys = new Set<string>();

      if (initialOrderId) {
        // Find and expand the specific targeted order across vendors
        for (const vg of groupedByVendor) {
          const matchedOg = vg.orderGroups.find((og) => og.orderId === initialOrderId);
          if (matchedOg) {
            initialKeys.add(getVendorOrderGroupKey(vg.vendor.id, matchedOg.orderId));
          }
        }
      }

      // If no targeted order key was matched, expand the first priority order (overdue first, or first active)
      if (initialKeys.size === 0) {
        const firstVendor = groupedByVendor[0];
        if (firstVendor && firstVendor.orderGroups.length > 0) {
          const priorityOrder = firstVendor.orderGroups.find((og) => og.hasOverdue) || firstVendor.orderGroups[0];
          initialKeys.add(getVendorOrderGroupKey(firstVendor.vendor.id, priorityOrder.orderId));
        }
      }

      setExpandedGroupKeys(initialKeys);
      setHasInitializedExpansion(true);
    }
  }, [groupedByVendor, hasInitializedExpansion, initialOrderId]);

  // When searching, auto-expand all matching order groups so results are immediately visible
  useEffect(() => {
    if (searchQuery.trim()) {
      const searchKeys = new Set<string>();
      groupedByVendor.forEach((vg) => {
        vg.orderGroups.forEach((og) => {
          searchKeys.add(getVendorOrderGroupKey(vg.vendor.id, og.orderId));
        });
      });
      setExpandedGroupKeys(searchKeys);
    }
  }, [searchQuery, groupedByVendor]);

  // Accordion Expand/Collapse Handlers
  const toggleGroupExpand = (groupKey: string) => {
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const toggleAllForVendor = (vendorId: string) => {
    const vg = groupedByVendor.find((g) => g.vendor.id === vendorId);
    if (!vg) return;
    const vendorKeys = vg.orderGroups.map((og) => getVendorOrderGroupKey(vendorId, og.orderId));
    const allExpanded = vendorKeys.length > 0 && vendorKeys.every((k) => expandedGroupKeys.has(k));

    setExpandedGroupKeys((prev) => {
      const next = new Set(prev);
      if (allExpanded) {
        vendorKeys.forEach((k) => next.delete(k));
      } else {
        vendorKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = new Set<string>();
    groupedByVendor.forEach((vg) => {
      vg.orderGroups.forEach((og) => {
        allKeys.add(getVendorOrderGroupKey(vg.vendor.id, og.orderId));
      });
    });
    setExpandedGroupKeys(allKeys);
  };

  const collapseAll = () => {
    setExpandedGroupKeys(new Set());
  };

  // KPI Metrics
  const totalPending = items.length;
  const overdueCount = items.filter((i) => i.timeline && i.timeline < today).length;
  const upcomingCount = items.filter((i) => i.timeline && i.timeline >= today).length;
  const noTimelineCount = items.filter((i) => !i.timeline).length;
  const uniqueVendorsCount = new Set(items.map((i) => i.vendor_id).filter(Boolean)).size;
  const uniqueOrdersCount = new Set(items.map((i) => i.order_id).filter(Boolean)).size;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* Quick SKU Modal JSX */}
      {quickReceiveAlloc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Link Warehouse SKU &amp; Receive
                </h3>
                <p className="text-xs text-slate-500">
                  Order <span className="font-mono font-bold text-indigo-600">{quickReceiveAlloc.order?.order_no}</span> &bull; {quickReceiveAlloc.component_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickReceiveAlloc(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {quickReceiveAlloc.description && (
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                  <span className="font-semibold text-slate-500 block mb-0.5">Specification / Note:</span>
                  {quickReceiveAlloc.description}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Warehouse Inventory SKU <span className="text-rose-500">*</span>
                </label>
                <select
                  className="w-full rounded-lg text-xs p-2 border border-slate-200 bg-white text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={selectedQuickSkuId}
                  onChange={(e) => setSelectedQuickSkuId(e.target.value)}
                >
                  <option value="">-- Select Catalog SKU --</option>
                  {itemsCatalog.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} {i.color ? `[${i.color}]` : ''} ({i.category || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Quantity Received
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full rounded-lg text-xs p-2 border border-slate-200 bg-white font-mono focus:border-indigo-500"
                    value={quickReceiveQty}
                    onChange={(e) => setQuickReceiveQty(parseInt(e.target.value, 10) || 1)}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Storage Location
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg text-xs p-2 border border-slate-200 bg-white focus:border-indigo-500"
                    value={quickReceiveLocation}
                    onChange={(e) => setQuickReceiveLocation(e.target.value)}
                    placeholder="Raw Stock Bay A"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-3 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setQuickReceiveAlloc(null)}
                disabled={submittingQuickReceive}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={submittingQuickReceive}
                disabled={!selectedQuickSkuId || submittingQuickReceive}
                onClick={handleConfirmQuickReceive}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                <Check className="h-4 w-4 mr-1" />
                Confirm &amp; Receive
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Validated Bulk Intake Modal JSX */}
      {bulkPreValidationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Bulk Intake Verification: {bulkPreValidationModal.vendor.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Verify warehouse SKU mappings for {bulkPreValidationModal.items.length} incoming components before receiving.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkPreValidationModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {bulkPreValidationModal.items.map((item) => {
                const isService = /printing|coating|stamping|metalliz|emboss/i.test(item.component_name);
                const currentSkuId = bulkPreValidationModal.skuMappings[item.id] || '';
                const hasSku = isService || !!currentSkuId;

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition ${
                      !hasSku
                        ? 'border-amber-300 bg-amber-50/50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                          {item.order?.order_no}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {item.component_name}
                        </span>
                        {item.description && (
                          <span className="text-xs text-slate-500">({item.description})</span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-semibold text-slate-700">
                        {item.qty || item.order?.total_qty || 1} units
                      </span>
                    </div>

                    {isService ? (
                      <div className="text-[11px] text-emerald-700 font-medium">
                        ✓ Service Milestone (No physical warehouse SKU required)
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <select
                          className={`flex-1 rounded-lg text-xs p-1.5 border ${
                            !currentSkuId
                              ? 'border-amber-400 bg-amber-50 text-amber-900 font-semibold'
                              : 'border-slate-200 bg-white text-slate-800'
                          }`}
                          value={currentSkuId}
                          onChange={(e) => {
                            const newSku = e.target.value;
                            setBulkPreValidationModal((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    skuMappings: { ...prev.skuMappings, [item.id]: newSku },
                                  }
                                : null
                            );
                          }}
                        >
                          <option value="">-- Select Catalog SKU * --</option>
                          {itemsCatalog.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} {i.color ? `[${i.color}]` : ''} ({i.category || 'General'})
                            </option>
                          ))}
                        </select>
                        {!currentSkuId && (
                          <span className="text-[11px] font-bold text-amber-700 shrink-0">
                            ⚠️ Required
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
              <span className="text-xs text-slate-600">
                {bulkPreValidationModal.items.length} items to receive into factory inventory
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setBulkPreValidationModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={bulkReceiving}
                  onClick={handleConfirmBulkPreValidated}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  Confirm &amp; Receive All
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable Sheet */}
      <div className="hidden print:block fixed inset-0 bg-white p-8 text-black z-50">
        <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-wider text-slate-950">
              Fragrance &amp; Fashion
            </h1>
            <p className="text-xs uppercase tracking-widest text-slate-700 font-semibold">
              Supplier Expediting &bull; Vendor Pending Follow-Up Sheet
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-mono text-slate-600">Generated: {formatDate(today)}</p>
            <p className="text-xs font-mono font-bold text-slate-900">Total Pending: {filteredItems.length} items</p>
          </div>
        </div>

        {groupedByVendor.map(({ vendor, items: vItems, orderGroups }) => (
          <div key={vendor.id} className="mb-6 break-inside-avoid">
            <div className="bg-slate-900 text-white p-2.5 rounded font-bold text-sm flex justify-between items-center">
              <span>{vendor.name} {vendor.contact ? `(Contact: ${vendor.contact})` : ''}</span>
              <span className="font-mono text-xs">{vItems.length} Pending ({orderGroups.length} Orders)</span>
            </div>

            <div className="space-y-4 mt-3">
              {orderGroups.map((og) => (
                <div key={og.orderId} className="border border-slate-300 rounded p-2.5 break-inside-avoid">
                  <div className="flex justify-between items-center bg-slate-100 p-1.5 rounded mb-2 text-xs font-bold text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-slate-800 text-white px-2 py-0.5 rounded text-[11px]">
                        {og.order?.order_no || 'General / Direct'}
                      </span>
                      <span>{og.order?.product_name || 'Stock Replenishment'}</span>
                      {og.client?.name && (
                        <span className="text-slate-600 font-normal">
                          &bull; Client: {og.client.name} {og.client.company_name ? `(${og.client.company_name})` : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-right font-mono text-[11px]">
                      {og.order?.total_qty ? `${og.order.total_qty.toLocaleString()} batch units | ` : ''}
                      {og.items.length} pending
                    </div>
                  </div>

                  <table className="w-full text-left text-xs border border-slate-300 border-collapse">
                    <thead>
                      <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-300">
                        <th className="p-1.5 border-r border-slate-300 w-10 text-center">#</th>
                        <th className="p-1.5 border-r border-slate-300 w-40">Component</th>
                        <th className="p-1.5 border-r border-slate-300">Description / Specification</th>
                        <th className="p-1.5 border-r border-slate-300 w-24 text-center">Planned Qty</th>
                        <th className="p-1.5 w-28 text-center">Expected Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {og.items.map((item, idx) => (
                        <tr key={item.id} className="border-b border-slate-200">
                          <td className="p-1.5 border-r border-slate-200 text-center font-mono">{idx + 1}</td>
                          <td className="p-1.5 border-r border-slate-200 font-semibold">{item.component_name}</td>
                          <td className="p-1.5 border-r border-slate-200 text-slate-700">{item.description || item.remarks || '-'}</td>
                          <td className="p-1.5 border-r border-slate-200 text-center font-mono font-bold">
                            {(item.qty || og.order?.total_qty || 1).toLocaleString()}
                          </td>
                          <td className="p-1.5 text-center font-mono">{item.timeline ? formatDate(item.timeline) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Screen Header */}
      <PageHeader
        title="Vendor Raw Materials Tracker"
        subtitle="Monitor vendor material commitments, record intake arrivals at factory gates, and coordinate supplier follow-ups."
        action={
          <div className="flex items-center gap-2.5">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-2xs">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'pending'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                onClick={() => setActiveTab('pending')}
              >
                Pending Delivery ({items.length})
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'recent_received'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                onClick={() => setActiveTab('recent_received')}
              >
                Recently Received ({recentlyReceived.length})
              </button>
            </div>
            <Button
              variant="secondary"
              onClick={() => window.print()}
              title="Print vendor follow-up sheet"
            >
              <Printer className="h-4 w-4" />
              Print Sheet
            </Button>
            <Button
              variant="secondary"
              onClick={() => loadData()}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}

      {/* Top Stat KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border border-slate-200/80 shadow-xs rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Pending Components
            </span>
            <div className="p-2 rounded-xl bg-amber-100/80 text-amber-700">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 font-mono">
            {totalPending}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Across all active batches</p>
        </Card>

        <Card className="p-4 bg-white border border-slate-200/80 shadow-xs rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Overdue Follow-ups
            </span>
            <div className={`p-2 rounded-xl ${overdueCount > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className={`mt-2 text-2xl font-extrabold font-mono ${overdueCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {overdueCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Target date has passed</p>
        </Card>

        <Card className="p-4 bg-white border border-slate-200/80 shadow-xs rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Suppliers Involved
            </span>
            <div className="p-2 rounded-xl bg-indigo-100/80 text-indigo-700">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 font-mono">
            {uniqueVendorsCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Active external partners</p>
        </Card>

        <Card className="p-4 bg-white border border-slate-200/80 shadow-xs rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Orders Awaiting
            </span>
            <div className="p-2 rounded-xl bg-emerald-100/80 text-emerald-700">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 font-mono">
            {uniqueOrdersCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Production orders blocked</p>
        </Card>
      </div>

      {activeTab === 'recent_received' ? (
        // RECENTLY RECEIVED TAB (FOR PERSISTENT AUDIT & REVERSALS)
        <Card className="overflow-hidden border border-slate-200 shadow-xs rounded-2xl bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
                  <th className="py-2.5 px-4 w-36">Order #</th>
                  <th className="py-2.5 px-4 min-w-[160px]">Product</th>
                  <th className="py-2.5 px-4 w-36">Component</th>
                  <th className="py-2.5 px-4 min-w-[180px]">Warehouse SKU</th>
                  <th className="py-2.5 px-4 w-28 text-center">Intake Units</th>
                  <th className="py-2.5 px-4 w-44">Batch / Receipt ID</th>
                  <th className="py-2.5 px-4 w-32 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentlyReceived.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No materials have been received yet.
                    </td>
                  </tr>
                ) : (
                  recentlyReceived.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-4 font-mono font-bold text-indigo-700">
                        {item.order?.order_no || 'PO-XXXX'}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {item.order?.product_name || 'N/A'}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800">
                        {item.component_name}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {item.stock_item?.name || item.description || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold">
                        {(item.qty_received || item.qty || 1).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4">
                        {/* Deep-Linked Batch Pill with activeTab: 'batches' */}
                        {item.inward_batch?.batch_no ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (onViewChange) {
                                onViewChange('items', {
                                  batchId: item.inward_batch?.batch_no,
                                  activeTab: 'batches',
                                });
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition cursor-pointer"
                            title="Open Inward Batches ledger and focus batch"
                          >
                            <Package className="h-3 w-3" />
                            Batch {item.inward_batch.batch_no}
                          </button>
                        ) : item.receipt_id ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Receipt Logged
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Milestone Logged</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {canPerform('reverse_allocation') && (
                          <button
                            type="button"
                            onClick={() => handleRevertToPending(item)}
                            className="text-xs font-semibold text-amber-700 hover:text-amber-900 hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Undo
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        // ACTIVE PENDING TAB
        <>
          {/* Search & Filter Bar */}
          <Card className="p-4 bg-white/90 backdrop-blur border border-slate-200/80 shadow-xs rounded-2xl">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="flex-1 max-w-lg">
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search by vendor, component, order #, product, or client..."
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* 4-State Urgency Filter */}
                <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      urgencyFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'hover:text-slate-900'
                    }`}
                    onClick={() => setUrgencyFilter('all')}
                  >
                    All Pending ({items.length})
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      urgencyFilter === 'overdue'
                        ? 'bg-white text-rose-700 shadow-sm'
                        : 'hover:text-slate-900'
                    }`}
                    onClick={() => setUrgencyFilter('overdue')}
                  >
                    Overdue ({overdueCount})
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      urgencyFilter === 'upcoming'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'hover:text-slate-900'
                    }`}
                    onClick={() => setUrgencyFilter('upcoming')}
                  >
                    Upcoming ({upcomingCount})
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      urgencyFilter === 'no_timeline'
                        ? 'bg-white text-amber-700 shadow-sm'
                        : 'hover:text-slate-900'
                    }`}
                    onClick={() => setUrgencyFilter('no_timeline')}
                  >
                    No Due Date ({noTimelineCount})
                  </button>
                </div>

                {/* Vendor Filter */}
                <select
                  className="rounded-xl border border-slate-200 text-xs py-1.5 px-3 bg-white text-slate-800"
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  title="Filter by Supplier"
                >
                  <option value="all">All Suppliers ({suppliers.length})</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                {/* Client Filter */}
                <select
                  className="rounded-xl border border-slate-200 text-xs py-1.5 px-3 bg-white text-slate-800"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  title="Filter by Client"
                >
                  <option value="all">All Clients ({clients.length})</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company_name ? `(${c.company_name})` : ''}
                    </option>
                  ))}
                </select>

                {/* Accordion Controls (matching OrdersView) */}
                <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition cursor-pointer font-medium"
                    onClick={expandAll}
                    title="Expand all order groups"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition cursor-pointer font-medium"
                    onClick={collapseAll}
                    title="Collapse all order groups"
                  >
                    Collapse
                  </button>
                </div>
              </div>
            </div>
          </Card>

          {/* Grouped Vendor Sections */}
          {loading ? (
            <TableSkeleton rows={8} cols={5} />
          ) : groupedByVendor.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No pending vendor components!"
              description={
                searchQuery || selectedVendorId !== 'all' || selectedClientId !== 'all' || urgencyFilter !== 'all'
                  ? 'No components match your filter criteria.'
                  : 'All outsourced materials for active production orders have been received.'
              }
            />
          ) : (
            <div className="space-y-6">
              {groupedByVendor.map(({ vendor, items: vItems, orderGroups }) => {
                const vendorOverdue = vItems.filter((i) => i.timeline && i.timeline < today).length;
                const isUnassigned = vendor.id === 'unassigned';
                const rawPhone = vendor.phone || vendor.contact;
                const cleanPhone = normalizePhoneForWhatsApp(rawPhone);

                return (
                  <Card
                    key={vendor.id}
                    className="overflow-hidden border border-slate-200 shadow-xs rounded-2xl bg-white"
                  >
                    {/* Unassigned Supplier Alert Banner */}
                    {isUnassigned && (
                      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between text-xs text-amber-800">
                        <span className="font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                          {vItems.length} components have no supplier assigned yet. Assign suppliers below to initiate procurement tracking.
                        </span>
                      </div>
                    )}

                    {/* Vendor Card Header */}
                    <div className="p-4 sm:p-5 bg-slate-50/80 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-base font-bold text-slate-900">{vendor.name}</h3>
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            {vItems.length} Pending
                          </span>
                          {vendorOverdue > 0 && (
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                              {vendorOverdue} Overdue
                            </span>
                          )}
                        </div>

                        {/* Contact details & Sub-Group Count */}
                        <div className="flex flex-wrap items-center gap-4 mt-1 text-xs text-slate-500">
                          {rawPhone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-slate-400" />
                              {rawPhone}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 font-medium text-slate-600">
                            <Layers className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              {orderGroups.length} {orderGroups.length === 1 ? 'Order Sub-Group' : 'Order Sub-Groups'}
                            </span>
                            {orderGroups.length > 1 && (
                              <button
                                type="button"
                                onClick={() => toggleAllForVendor(vendor.id)}
                                className="ml-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                              >
                                {orderGroups.every((og) => expandedGroupKeys.has(getVendorOrderGroupKey(vendor.id, og.orderId)))
                                  ? 'Collapse Orders'
                                  : 'Expand Orders'}
                              </button>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Header Actions (WhatsApp, Copy, Bulk Receive) */}
                      {!isUnassigned && (
                        <div className="flex flex-wrap items-center gap-2">
                          {/* 1-Click WhatsApp Button */}
                          {cleanPhone ? (
                            <a
                              href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                                generateWhatsAppMessage(vendor, vItems)
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs transition cursor-pointer"
                              title="Open direct WhatsApp conversation"
                            >
                              <MessageSquare className="h-4 w-4" />
                              WhatsApp Vendor
                            </a>
                          ) : (
                            <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg border border-slate-200">
                              No Phone on File
                            </span>
                          )}

                          {/* Copy WhatsApp Message Button */}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleCopyWhatsAppMessage(vendor, vItems)}
                            title="Copy ready-to-send WhatsApp reminder message"
                          >
                            <Copy className="h-4 w-4" />
                            Copy
                          </Button>

                          {/* Pre-Validated Bulk Receive Button */}
                          {canPerform('manage_orders') && (
                            <Button
                              variant="primary"
                              size="sm"
                              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs"
                              onClick={() => handleOpenBulkModal(vendor, vItems)}
                              title={`Verify and receive all ${vItems.length} components from ${vendor.name}`}
                            >
                              <Check className="h-4 w-4" />
                              Mark All ({vItems.length}) Received
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Sub-Grouped by Production Orders */}
                    <div className="p-4 sm:p-5 space-y-3.5 bg-slate-50/50">
                      {orderGroups.map((og) => {
                        const groupKey = getVendorOrderGroupKey(vendor.id, og.orderId);
                        const isExpanded = expandedGroupKeys.has(groupKey);
                        const orderAllocations = og.items;

                        return (
                          <div
                            key={groupKey}
                            className={`rounded-2xl border bg-white overflow-hidden shadow-2xs transition-all ${
                              isExpanded ? 'border-indigo-200/90 shadow-xs' : 'border-slate-200/90 hover:border-slate-300'
                            }`}
                          >
                            {/* Order Sub-Group Header Banner */}
                            <div
                              className={`p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                                isExpanded
                                  ? 'bg-gradient-to-r from-indigo-50/70 via-white to-indigo-50/30 border-b border-indigo-100/80'
                                  : 'bg-white hover:bg-slate-50/90'
                              }`}
                              onClick={() => toggleGroupExpand(groupKey)}
                              onKeyDown={(e) => {
                                if (e.target !== e.currentTarget) return;
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleGroupExpand(groupKey);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              aria-expanded={isExpanded}
                              aria-label={`Order ${og.order?.order_no || 'Direct'}, ${orderAllocations.length} pending components. Click to ${isExpanded ? 'collapse' : 'expand'}.`}
                            >
                              <div className="flex items-start sm:items-center gap-3">
                                {/* Accordion Arrow Toggle */}
                                <button
                                  type="button"
                                  className="mt-0.5 sm:mt-0 p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGroupExpand(groupKey);
                                  }}
                                  title={isExpanded ? 'Collapse order components' : 'Expand order components'}
                                  aria-label={isExpanded ? `Collapse components for ${og.order?.order_no || 'order'}` : `Expand components for ${og.order?.order_no || 'order'}`}
                                  aria-expanded={isExpanded}
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-5 w-5 text-indigo-700 transition-transform duration-200" />
                                  ) : (
                                    <ChevronDown className="h-5 w-5 text-slate-600 transition-transform duration-200" />
                                  )}
                                </button>

                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {/* Order No Badge */}
                                    <span className="font-mono text-xs font-bold bg-slate-900 text-white px-2.5 py-0.5 rounded-lg tracking-wide shadow-2xs">
                                      {og.order?.order_no || 'Direct / General'}
                                    </span>

                                    {/* Product Title */}
                                    <h4 className="text-sm font-bold text-slate-900">
                                      {og.order?.product_name || 'General Inventory Allocation'}
                                    </h4>

                                    {/* Client Pill */}
                                    {og.client && (
                                      canAccessView('clients') ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (onViewChange && og.client?.id) {
                                              onViewChange('clients', { clientId: og.client.id });
                                            }
                                          }}
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-md hover:bg-indigo-100 hover:border-indigo-300 transition cursor-pointer"
                                          title="View client profile and order history"
                                        >
                                          <Building2 className="h-3 w-3" />
                                          {og.client.name} {og.client.company_name ? `(${og.client.company_name})` : ''}
                                        </button>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-md">
                                          <Building2 className="h-3 w-3" />
                                          {og.client.name} {og.client.company_name ? `(${og.client.company_name})` : ''}
                                        </span>
                                      )
                                    )}

                                    {/* Order Status Badge */}
                                    {og.order?.status && (
                                      <span
                                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                          og.order.status === 'in_progress'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-amber-100 text-amber-800'
                                        }`}
                                      >
                                        {og.order.status === 'in_progress' ? 'In Progress' : 'Planning'}
                                      </span>
                                    )}
                                  </div>

                                  {/* Sub-meta: Units, Timeline, Pending Count */}
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-600">
                                    {og.order?.total_qty ? (
                                      <span className="flex items-center gap-1">
                                        <Package className="h-3.5 w-3.5 text-slate-400" />
                                        <span className="font-semibold text-slate-800 font-mono">
                                          {og.order.total_qty.toLocaleString()}
                                        </span>{' '}
                                        batch units
                                      </span>
                                    ) : null}

                                    {og.order?.due_date && (
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                        Target: <span className="font-medium text-slate-800">{formatDate(og.order.due_date)}</span>
                                      </span>
                                    )}

                                    <span className="font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                                      {orderAllocations.length} pending component{orderAllocations.length > 1 ? 's' : ''}
                                    </span>

                                    {og.overdueCount > 0 && (
                                      <span className="font-medium text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3 text-rose-600" />
                                        {og.overdueCount} overdue
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Right Actions */}
                              <div className="flex items-center gap-2 self-end md:self-center" onClick={(e) => e.stopPropagation()}>
                                {og.order && onViewChange && (
                                  <button
                                    type="button"
                                    onClick={() => onViewChange('orders', { orderId: og.orderId })}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-700 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 transition cursor-pointer shadow-2xs"
                                    title="Open order in Orders view"
                                  >
                                    View Order
                                    <ExternalLink className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Expanded Order Component Table */}
                            {isExpanded && (
                              <div className="overflow-x-auto border-t border-slate-100 bg-white">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-slate-100/50 text-slate-600 font-semibold border-b border-slate-200/80">
                                      <th className="py-2.5 px-3 w-10 text-center text-slate-400">#</th>
                                      <th className="py-2.5 px-4 w-44">Component</th>
                                      <th className="py-2.5 px-4 min-w-[200px]">Specification / Details</th>
                                      <th className="py-2.5 px-4 min-w-[180px]">Warehouse SKU</th>
                                      <th className="py-2.5 px-4 w-24 text-center">Planned Qty</th>
                                      <th className="py-2.5 px-4 w-32 text-center">Expected Due</th>
                                      <th className="py-2.5 px-4 w-44 text-right">Quick Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {orderAllocations.map((item, idx) => {
                                      const isOverdue = item.timeline && item.timeline < today;
                                      const isService = /printing|coating|stamping|metalliz|emboss/i.test(item.component_name);
                                      const matchedSku = item.stock_item || itemsCatalog.find((cat) => cat.id === item.stock_item_id);

                                      return (
                                        <tr key={item.id} className="hover:bg-slate-50/80 transition">
                                          {/* # Index */}
                                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                                            {idx + 1}
                                          </td>

                                          {/* Component */}
                                          <td className="py-2.5 px-4 font-bold text-slate-900">
                                            {item.component_name}
                                          </td>

                                          {/* Specification */}
                                          <td className="py-2.5 px-4 text-slate-600">
                                            {item.description || (
                                              <span className="italic text-slate-400">No details specified</span>
                                            )}
                                            {item.remarks && (
                                              <div className="text-[11px] text-amber-700 italic mt-0.5">
                                                Note: {item.remarks}
                                              </div>
                                            )}
                                          </td>

                                          {/* Warehouse SKU */}
                                          <td className="py-2.5 px-4">
                                            {isService ? (
                                              <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded">
                                                Service / Milestone
                                              </span>
                                            ) : matchedSku ? (
                                              <div className="text-slate-800">
                                                <span className="font-semibold">{matchedSku.name}</span>
                                                {matchedSku.color && (
                                                  <span className="text-[10px] text-slate-500 ml-1">[{matchedSku.color}]</span>
                                                )}
                                              </div>
                                            ) : item.stock_item_id ? (
                                              <span className="font-mono text-[11px] text-slate-600">
                                                SKU #{item.stock_item_id.slice(0, 8)}
                                              </span>
                                            ) : (
                                              <span className="text-[11px] text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                                Not Linked (Prompt on Receive)
                                              </span>
                                            )}
                                          </td>

                                          {/* Planned Qty */}
                                          <td className="py-2.5 px-4 text-center font-mono font-semibold text-slate-700">
                                            {(item.qty || og.order?.total_qty || 1).toLocaleString()}
                                          </td>

                                          {/* Expected Due */}
                                          <td className="py-2.5 px-4 text-center">
                                            {item.timeline ? (
                                              <span
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                                                  isOverdue
                                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                                    : 'bg-slate-100 text-slate-700'
                                                }`}
                                              >
                                                {isOverdue && <AlertTriangle className="h-3 w-3 text-rose-600" />}
                                                {formatDate(item.timeline)}
                                              </span>
                                            ) : (
                                              <span className="text-slate-400">-</span>
                                            )}
                                          </td>

                                          {/* Quick Actions */}
                                          <td className="py-2.5 px-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                              {isUnassigned ? (
                                                canPerform('manage_orders') ? (
                                                  <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="bg-amber-100 text-amber-900 hover:bg-amber-200 border-amber-300"
                                                    onClick={() => {
                                                      setReassignItem(item);
                                                      setNewVendorId('');
                                                    }}
                                                    title="Assign a supplier for this component"
                                                  >
                                                    <ArrowRightLeft className="h-4 w-4" />
                                                    Assign Supplier
                                                  </Button>
                                                ) : (
                                                  <span className="text-slate-400 text-xs italic">Unassigned</span>
                                                )
                                              ) : canPerform('manage_orders') ? (
                                                <>
                                                  {/* Reassign Button */}
                                                  <button
                                                    type="button"
                                                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                                    onClick={() => {
                                                      setReassignItem(item);
                                                      setNewVendorId(item.vendor_id || '');
                                                    }}
                                                    title="Reassign to another vendor"
                                                  >
                                                    <ArrowRightLeft className="h-4 w-4" />
                                                  </button>

                                                  {/* Mark Received Button */}
                                                  <Button
                                                    variant="primary"
                                                    size="sm"
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                                    onClick={() => handleInitiateReceive(item)}
                                                  >
                                                    <Check className="h-4 w-4" />
                                                    Received
                                                  </Button>
                                                </>
                                              ) : (
                                                <span className="text-slate-400 text-xs italic">Pending</span>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* REASSIGN VENDOR MODAL */}
      {reassignItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 p-5 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {reassignItem.vendor_id ? 'Reassign Supplier' : 'Assign Supplier'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {reassignItem.vendor_id ? 'Change supplier for' : 'Select supplier for'}{' '}
              <span className="font-semibold text-slate-800">{reassignItem.component_name}</span> on order{' '}
              <span className="font-mono font-bold text-slate-800">{reassignItem.order?.order_no}</span>
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Select Supplier
                </label>
                <select
                  className="w-full rounded-xl border border-slate-300 text-sm p-2 bg-white text-slate-900"
                  value={newVendorId}
                  onChange={(e) => setNewVendorId(e.target.value)}
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.contact ? `(${s.contact})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setReassignItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={reassigning}
                  disabled={!newVendorId || newVendorId === reassignItem.vendor_id}
                  onClick={handleConfirmReassign}
                >
                  {reassignItem.vendor_id ? 'Confirm Reassign' : 'Assign Supplier'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
