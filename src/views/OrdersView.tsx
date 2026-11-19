import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ClipboardList,
  Plus,
  Printer,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Trash2,
  Package,
  Calendar,
  Layers,
  Building2,
  UserPlus,
  RefreshCw,
  X,
  Copy,
} from 'lucide-react';
import {
  Card,
  PageHeader,
  ErrorBanner,
  EmptyState,
  Field,
  inputClass,
  Button,
  SearchInput,
  ConfirmModal,
  TableSkeleton,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import {
  fetchProductionOrders,
  createMultipleProductionOrders,
  completeProductionOrder,
  deleteProductionOrder,
  updateMaterialAllocation,
  markAllocationReceived,
  revertAllocationToPending,
  deleteAllocation,
  addAllocationRow,
  fetchClients,
  createClient,
  fetchSuppliers,
  fetchItems,
} from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type {
  ProductionOrderWithRelations,
  MaterialAllocation,
  Client,
  Supplier,
  Item,
} from '@/lib/supabase';
import type { View } from '@/lib/types';
import type { NavigationContext } from '@/components/AppShell';
import { getErrorMessage, formatDate } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

import { AddItemModal } from './items/AddItemModal';
import { getCategoryForComponent, getSpecificationText } from './orders/orderBomUtils';

export type OrderBatchItem = {
  tempId: string;
  product_name: string;
  total_qty: number | '';
  variants: string[];
  variantInput: string;
  due_date: string;
  notes: string;
  status: 'idle' | 'creating' | 'success' | 'error';
  error?: string;
};

const PRESET_SIZES = ['30ml', '50ml', '100ml', '200ml'];

export type OrdersViewProps = {
  initialOrderId?: string;
  initialClientId?: string;
  onViewChange?: (view: View, context?: NavigationContext) => void;
};

export function OrdersView({ initialOrderId, initialClientId, onViewChange }: OrdersViewProps) {
  const { canPerform, canAccessView } = useAuth();
  const [orders, setOrders] = useState<ProductionOrderWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'planning' | 'in_progress'>('all');
  const [selectedClientId, setSelectedClientId] = useState<string>(initialClientId || 'all');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

  // Keep client filter and batch client in sync if initialClientId changes
  useEffect(() => {
    if (initialClientId && initialClientId !== 'all') {
      setSelectedClientId(initialClientId);
      setBatchClientId(initialClientId);
    }
  }, [initialClientId]);

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQuickClientModal, setShowQuickClientModal] = useState(false);
  const [deleteModalOrder, setDeleteModalOrder] = useState<ProductionOrderWithRelations | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [completeModalOrder, setCompleteModalOrder] = useState<ProductionOrderWithRelations | null>(null);
  const [completing, setCompleting] = useState(false);
  const [printOrder, setPrintOrder] = useState<ProductionOrderWithRelations | null>(null);

  // New SKU Creation Modal Target (from Orders BOM table)
  const [skuTargetAllocation, setSkuTargetAllocation] = useState<{
    id: string;
    component_name: string;
    initialCategory: string;
    initialName: string;
  } | null>(null);

  // Multi-Order Batch Entry State
  const [batchClientId, setBatchClientId] = useState<string>(
    initialClientId && initialClientId !== 'all' ? initialClientId : ''
  );
  const [batchItems, setBatchItems] = useState<OrderBatchItem[]>([
    {
      tempId: crypto.randomUUID(),
      product_name: '',
      total_qty: '',
      variants: [],
      variantInput: '',
      due_date: '',
      notes: '',
      status: 'idle',
    },
  ]);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  // Quick Client Form State
  const [quickClientName, setQuickClientName] = useState('');
  const [quickClientCompany, setQuickClientCompany] = useState('');
  const [quickClientPhone, setQuickClientPhone] = useState('');
  const [quickClientEmail, setQuickClientEmail] = useState('');
  const [quickClientPref, setQuickClientPref] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  // New Allocation Row Inline State (orderId -> componentName)
  const [newRowComponent, setNewRowComponent] = useState<{ [orderId: string]: string }>({});

  const toast = useToast();

  // Load All Data
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [ordersData, clientsData, suppliersData, itemsData] = await Promise.all([
        fetchProductionOrders(),
        fetchClients(),
        fetchSuppliers(),
        fetchItems(),
      ]);

      // Filter out completed ones (completed are shown in OrderHistoryView)
      const activeOrders = ordersData.filter((o) => o.status !== 'completed');
      setOrders(activeOrders);
      setClients(clientsData);
      setSuppliers(suppliersData);
      setItems(itemsData);

      // Auto-expand initial order or first order
      if (initialOrderId) {
        setExpandedOrderIds(new Set([initialOrderId]));
      } else if (activeOrders.length > 0 && !isSilent) {
        setExpandedOrderIds(new Set([activeOrders[0].id]));
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load production orders'));
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [initialOrderId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time synchronization for multi-terminal factory floor
  useEffect(() => {
    const ordersChannel = supabase
      .channel('orders_realtime_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_orders' },
        () => {
          loadData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'material_allocations' },
        () => {
          loadData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, [loadData]);

  // Handle Escape key for quick client modal
  useEffect(() => {
    if (!showQuickClientModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowQuickClientModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showQuickClientModal]);

  // Toggle Order Accordion
  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // Expand All / Collapse All
  const expandAll = () => {
    setExpandedOrderIds(new Set(filteredOrders.map((o) => o.id)));
  };
  const collapseAll = () => {
    setExpandedOrderIds(new Set());
  };

  // Batch Modal Opener with preselected client
  const handleOpenCreateModal = () => {
    if (!batchClientId) {
      if (selectedClientId && selectedClientId !== 'all') {
        setBatchClientId(selectedClientId);
      } else if (initialClientId && initialClientId !== 'all') {
        setBatchClientId(initialClientId);
      }
    }
    if (batchItems.length === 0) {
      setBatchItems([
        {
          tempId: crypto.randomUUID(),
          product_name: '',
          total_qty: '',
          variants: [],
          variantInput: '',
          due_date: '',
          notes: '',
          status: 'idle',
        },
      ]);
    }
    setShowCreateModal(true);
  };

  // Batch Item Modifiers
  const handleAddBatchItem = () => {
    setBatchItems((prev) => [
      ...prev,
      {
        tempId: crypto.randomUUID(),
        product_name: '',
        total_qty: '',
        variants: [],
        variantInput: '',
        due_date: '',
        notes: '',
        status: 'idle',
      },
    ]);
  };

  const handleDuplicateBatchItem = (idx: number) => {
    const source = batchItems[idx];
    const duplicated: OrderBatchItem = {
      tempId: crypto.randomUUID(),
      product_name: source.product_name,
      total_qty: source.total_qty,
      variants: [...source.variants],
      variantInput: '',
      due_date: source.due_date,
      notes: source.notes,
      status: 'idle',
    };
    const next = [...batchItems];
    next.splice(idx + 1, 0, duplicated);
    setBatchItems(next);
  };

  const handleRemoveBatchItem = (idx: number) => {
    if (batchItems.length <= 1) return;
    setBatchItems(batchItems.filter((_, i) => i !== idx));
  };

  const handleBatchItemChange = (
    idx: number,
    field: keyof Omit<OrderBatchItem, 'tempId' | 'variants' | 'status' | 'error'>,
    value: string | number
  ) => {
    setBatchItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        return { ...item, [field]: value };
      })
    );
  };

  const handleBatchAddPresetVariant = (idx: number, size: string) => {
    setBatchItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        if (item.variants.includes(size)) return item;
        return { ...item, variants: [...item.variants, size] };
      })
    );
  };

  const handleBatchAddCustomVariant = (idx: number) => {
    setBatchItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const val = item.variantInput.trim().replace(/^,+|,+$/g, '');
        if (!val) return item;
        const tokens = val.split(',').map((t) => t.trim()).filter(Boolean);
        const unique = tokens.filter((t) => !item.variants.includes(t));
        return {
          ...item,
          variants: [...item.variants, ...unique],
          variantInput: '',
        };
      })
    );
  };

  const handleBatchRemoveVariant = (idx: number, variantToRemove: string) => {
    setBatchItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        return { ...item, variants: item.variants.filter((v) => v !== variantToRemove) };
      })
    );
  };

  // Quick Client Creation
  const handleCreateQuickClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickClientName.trim()) {
      toast.error('Client name is required');
      return;
    }
    setCreatingClient(true);
    try {
      const newClient = await createClient({
        name: quickClientName.trim(),
        company_name: quickClientCompany.trim() || null,
        phone: quickClientPhone.trim() || null,
        email: quickClientEmail.trim() || null,
        preferences: quickClientPref.trim() || null,
      });

      setClients((prev) => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)));
      setBatchClientId(newClient.id);
      setShowQuickClientModal(false);
      setQuickClientName('');
      setQuickClientCompany('');
      setQuickClientPhone('');
      setQuickClientEmail('');
      setQuickClientPref('');
      toast.success(`Client "${newClient.name}" created and selected!`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create client'));
    } finally {
      setCreatingClient(false);
    }
  };

  // Create Production Orders Batch
  const handleCreateBatchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchClientId) {
      toast.error('Please select a client for this batch');
      return;
    }

    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      if (!item.product_name.trim()) {
        toast.error(`Order Line #${i + 1}: Product name is required`);
        return;
      }
    }

    setCreatingBatch(true);
    setBatchProgress({ current: 0, total: batchItems.length });

    const payloads = batchItems.map((item) => ({
      client_id: batchClientId,
      product_name: item.product_name.trim(),
      variants: item.variants,
      total_qty: typeof item.total_qty === 'number' ? item.total_qty : 0,
      due_date: item.due_date || null,
      notes: item.notes.trim() || null,
    }));

    try {
      const { succeeded, failed } = await createMultipleProductionOrders(
        payloads,
        (current, total) => {
          setBatchProgress({ current: current + 1, total });
        }
      );

      if (succeeded.length > 0) {
        await loadData();
        if (succeeded.length === 1) {
          setExpandedOrderIds(new Set([succeeded[0].id]));
        } else {
          setExpandedOrderIds((prev) => new Set([...prev, ...succeeded.map((s) => s.id)]));
        }
      }

      if (failed.length === 0) {
        toast.success(
          succeeded.length === 1
            ? `Production Order ${succeeded[0].order_no} created with 10 BOM components!`
            : `Created ${succeeded.length} production orders with 10 BOM components each!`
        );
        setShowCreateModal(false);
        setBatchItems([
          {
            tempId: crypto.randomUUID(),
            product_name: '',
            total_qty: '',
            variants: [],
            variantInput: '',
            due_date: '',
            notes: '',
            status: 'idle',
          },
        ]);
      } else {
        const failedIndices = new Set(failed.map((f) => f.index));
        const remainingItems = batchItems
          .filter((_, idx) => failedIndices.has(idx))
          .map((item) => {
            const failure = failed.find((f) => f.payload.product_name === item.product_name.trim());
            return {
              ...item,
              status: 'error' as const,
              error: failure?.error || 'Failed to create order',
            };
          });

        setBatchItems(remainingItems);

        if (succeeded.length > 0) {
          toast.error(
            `Created ${succeeded.length} order(s). ${failed.length} order(s) failed: ${failed[0].error}. Please review and retry.`
          );
        } else {
          toast.error(`Failed to create orders: ${failed[0].error}`);
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create production batch'));
    } finally {
      setCreatingBatch(false);
      setBatchProgress(null);
    }
  };

  // Complete Order
  const handleConfirmComplete = async () => {
    if (!completeModalOrder) return;
    setCompleting(true);
    try {
      await completeProductionOrder(completeModalOrder.id);
      toast.success(`Order ${completeModalOrder.order_no} marked completed! Moved to Order History.`);
      setCompleteModalOrder(null);
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to complete order'));
    } finally {
      setCompleting(false);
    }
  };

  // Delete Order
  const handleConfirmDelete = async () => {
    if (!deleteModalOrder) return;
    if (!canPerform('manage_orders')) {
      toast.error('Permission denied: You do not have permission to delete production orders.');
      setDeleteModalOrder(null);
      return;
    }
    setDeleting(true);
    try {
      await deleteProductionOrder(deleteModalOrder.id);
      toast.success(`Order ${deleteModalOrder.order_no} deleted`);
      setDeleteModalOrder(null);
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete order'));
    } finally {
      setDeleting(false);
    }
  };

  // Allocation Updates (Autosave field changes)
  const handleAllocationFieldChange = async (
    allocationId: string,
    field: keyof MaterialAllocation,
    value: string | number | null
  ) => {
    if (!canPerform('manage_orders')) {
      toast.error('Permission denied: You do not have permission to modify order allocations.');
      return;
    }
    try {
      await updateMaterialAllocation(allocationId, { [field]: value });
      // Optimistic update
      setOrders((prev) =>
        prev.map((ord) => ({
          ...ord,
          material_allocations: ord.material_allocations?.map((alloc) =>
            alloc.id === allocationId ? { ...alloc, [field]: value } : alloc
          ),
        }))
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update allocation'));
      loadData(true);
    }
  };

  // Open AddItemModal with prefilled category & specification
  const handleOpenNewSkuModal = (alloc: MaterialAllocation) => {
    if (!canPerform('manage_orders') || alloc.status === 'received') {
      return;
    }
    const specText = getSpecificationText(alloc);
    const cat = getCategoryForComponent(alloc.component_name);

    // If user typed in specification box but hasn't blurred yet, persist it
    if (specText && specText !== (alloc.description || '')) {
      handleAllocationFieldChange(alloc.id, 'description', specText);
    }

    setSkuTargetAllocation({
      id: alloc.id,
      component_name: alloc.component_name,
      initialCategory: cat,
      initialName: specText,
    });
  };

  // Callback when new SKU is saved from AddItemModal
  const handleSkuCreated = (newItem?: Item, allCreated?: Item[]) => {
    if (!newItem || !skuTargetAllocation) {
      setSkuTargetAllocation(null);
      return;
    }

    const targetAlloc = skuTargetAllocation;
    const itemsToAdd = allCreated && allCreated.length > 0 ? allCreated : [newItem];

    // 1. Add newly created item(s) into the local items state
    setItems((prev) => {
      const newItems = itemsToAdd.filter((item) => !prev.some((i) => i.id === item.id));
      return [...newItems, ...prev];
    });

    // 2. Automatically set this new item's id as stock_item_id for the BOM component row
    handleAllocationFieldChange(targetAlloc.id, 'stock_item_id', newItem.id);

    // 3. Close the modal
    setSkuTargetAllocation(null);

    // 4. Show success toast
    toast.success(`New SKU created and linked to ${targetAlloc.component_name}`);
  };

  // Toggle Allocation Status (Pending <-> Received)
  const handleToggleAllocationStatus = async (allocation: MaterialAllocation) => {
    const isPending = allocation.status === 'pending';
    if (!isPending && !canPerform('reverse_allocation')) {
      toast.error('Permission denied: Only administrators and production managers can revert received allocations.');
      return;
    }
    if (isPending && !canPerform('manage_orders')) {
      toast.error('Permission denied: You do not have permission to mark components received.');
      return;
    }

    // Pre-flight SKU guard for physical items
    const isService = /printing|coating|stamping|metalliz|emboss/i.test(allocation.component_name);
    if (isPending && !allocation.stock_item_id && !isService) {
      const hasMatch = items.some(
        (i) => i.name.toLowerCase() === (allocation.description || allocation.component_name).toLowerCase()
      );
      if (!hasMatch) {
        toast.error(`Please select a Warehouse SKU for "${allocation.component_name}" before marking received.`);
        return;
      }
    }

    try {
      let resultOrderStatus: string | undefined;
      if (isPending) {
        const res = await markAllocationReceived(allocation.id);
        resultOrderStatus = res.order_status;
        toast.success(`Component "${allocation.component_name}" received!`);
        if (res.stock_warning) {
          toast.warning(res.stock_warning);
        }
      } else {
        const res = await revertAllocationToPending(allocation.id);
        resultOrderStatus = res.order_status;
        toast.info(`Component "${allocation.component_name}" reverted to pending`);
      }

      const newStatus = isPending ? 'received' : 'pending';
      const newReceivedAt = isPending ? new Date().toISOString() : null;
      setOrders((prev) =>
        prev.map((ord) => {
          if (ord.id !== allocation.order_id) return ord;
          const updatedAllocations = ord.material_allocations?.map((alloc) =>
            alloc.id === allocation.id
              ? { ...alloc, status: newStatus as 'pending' | 'received', received_at: newReceivedAt }
              : alloc
          );
          return {
            ...ord,
            status: (resultOrderStatus as ProductionOrderWithRelations['status']) || ord.status,
            material_allocations: updatedAllocations,
          };
        })
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update component status'));
      loadData(true);
    }
  };

  // Add extra component row to order
  const handleAddCustomRow = async (orderId: string) => {
    if (!canPerform('manage_orders')) {
      toast.error('Permission denied: You do not have permission to add component rows.');
      return;
    }
    const compName = newRowComponent[orderId]?.trim();
    if (!compName) return;

    try {
      await addAllocationRow({
        order_id: orderId,
        component_name: compName,
      });
      toast.success(`Added component "${compName}"`);
      setNewRowComponent((prev) => ({ ...prev, [orderId]: '' }));
      loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add component'));
    }
  };

  // Delete Allocation Row
  const handleDeleteAllocationRow = async (allocationId: string, compName: string) => {
    if (!canPerform('manage_orders')) {
      toast.error('Permission denied: You do not have permission to delete component rows.');
      return;
    }
    try {
      await deleteAllocation(allocationId);
      toast.info(`Removed component "${compName}"`);
      setOrders((prev) =>
        prev.map((ord) => ({
          ...ord,
          material_allocations: ord.material_allocations?.filter((a) => a.id !== allocationId),
        }))
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove component'));
    }
  };

  // Filtered Orders List
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Status filter
      if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false;
      }
      // Client filter
      if (selectedClientId !== 'all' && order.client_id !== selectedClientId) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNo = order.order_no.toLowerCase().includes(q);
        const matchProd = order.product_name.toLowerCase().includes(q);
        const matchClient = order.client?.name.toLowerCase().includes(q);
        const matchCompany = order.client?.company_name?.toLowerCase().includes(q);
        return matchNo || matchProd || matchClient || matchCompany;
      }
      return true;
    });
  }, [orders, statusFilter, selectedClientId, searchQuery]);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* Printable Factory Job Card (Hidden on Screen, Rendered on Print) */}
      {printOrder && (
        <div className="hidden print:block fixed inset-0 bg-white p-8 text-black z-50">
          <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-wider text-slate-950">
                Fragrance &amp; Fashion
              </h1>
              <p className="text-xs uppercase tracking-widest text-slate-700 font-semibold">
                Factory Production Job Card &bull; Traveler Sheet
              </p>
            </div>
            <div className="text-right">
              <div className="inline-block px-3 py-1 bg-slate-950 text-white font-mono text-lg font-bold rounded">
                {printOrder.order_no}
              </div>
              <p className="text-xs text-slate-600 mt-1 font-mono">
                Date: {formatDate(printOrder.created_at)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border border-slate-300 rounded p-4 mb-6 bg-slate-50 text-sm">
            <div>
              <p className="text-xs font-bold uppercase text-slate-700">Client / Brand</p>
              <p className="font-bold text-base text-slate-900">{printOrder.client?.name || 'N/A'}</p>
              {printOrder.client?.company_name && (
                <p className="text-xs text-slate-600">{printOrder.client.company_name}</p>
              )}
              {printOrder.client?.phone && (
                <p className="text-xs text-slate-600">Ph: {printOrder.client.phone}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-700">Product Details</p>
              <p className="font-bold text-base text-slate-900">{printOrder.product_name}</p>
              <p className="text-xs font-semibold text-slate-800">
                Total Units: <span className="font-mono text-sm">{printOrder.total_qty.toLocaleString()}</span>
              </p>
              {printOrder.due_date && (
                <p className="text-xs font-semibold text-slate-800">
                  Target Due Date: <span className="font-mono">{formatDate(printOrder.due_date)}</span>
                </p>
              )}
            </div>
            {Array.isArray(printOrder.variants) && printOrder.variants.length > 0 && (
              <div className="col-span-2 border-t border-slate-200 pt-2">
                <span className="text-xs font-bold uppercase text-slate-700 mr-2">Variants / Sizes:</span>
                <span className="text-xs font-mono">
                  {printOrder.variants.map((v) => String(v)).join(', ')}
                </span>
              </div>
            )}
            {printOrder.notes && (
              <div className="col-span-2 border-t border-slate-200 pt-2">
                <span className="text-xs font-bold uppercase text-slate-700 mr-2">Notes:</span>
                <span className="text-xs italic text-slate-800">{printOrder.notes}</span>
              </div>
            )}
          </div>

          <h2 className="text-sm font-black uppercase tracking-wider mb-2 text-slate-950">
            Bill of Materials (BOM) &bull; Component Allocation Matrix
          </h2>
          <table className="w-full text-left text-xs border border-slate-300 mb-8 border-collapse">
            <thead>
              <tr className="bg-slate-200 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-800">
                <th className="p-2 border-r border-slate-300 w-10 text-center">#</th>
                <th className="p-2 border-r border-slate-300 w-32">Component</th>
                <th className="p-2 border-r border-slate-300 w-20">Source</th>
                <th className="p-2 border-r border-slate-300 w-24 text-center">Planned Qty</th>
                <th className="p-2 border-r border-slate-300 w-24 text-center">Received Qty</th>
                <th className="p-2 border-r border-slate-300">Warehouse SKU &amp; Specs</th>
                <th className="p-2 border-r border-slate-300 w-28">Assigned Party</th>
                <th className="p-2 border-r border-slate-300 w-24">Location</th>
                <th className="p-2 w-24 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {printOrder.material_allocations
                ?.sort((a, b) => a.sort_order - b.sort_order)
                .map((alloc, idx) => {
                  const assignedVendor = suppliers.find((s) => s.id === alloc.vendor_id);
                  const assignedItem = items.find((i) => i.id === alloc.stock_item_id);
                  return (
                    <tr key={alloc.id} className="border-b border-slate-200">
                      <td className="p-2 border-r border-slate-200 text-center font-mono">{idx + 1}</td>
                      <td className="p-2 border-r border-slate-200 font-semibold">{alloc.component_name}</td>
                      <td className="p-2 border-r border-slate-200 uppercase text-[10px] font-bold">{alloc.source}</td>
                      <td className="p-2 border-r border-slate-200 text-center font-mono">
                        {(alloc.qty || printOrder.total_qty || 0).toLocaleString()}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center font-mono font-bold">
                        {alloc.qty_received ? alloc.qty_received.toLocaleString() : '-'}
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        {assignedItem ? (
                          <span className="font-semibold block">
                            {assignedItem.name} {assignedItem.color ? `[${assignedItem.color}]` : ''}
                          </span>
                        ) : null}
                        {alloc.description && <span className="text-slate-600 text-[11px] block">{alloc.description}</span>}
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        {alloc.source === 'vendor' ? assignedVendor?.name || 'External Vendor' : 'In-House Warehouse'}
                      </td>
                      <td className="p-2 border-r border-slate-200 font-mono text-[11px]">
                        {alloc.location || 'Raw Stock Bay A'}
                      </td>
                      <td className="p-2 text-center uppercase font-bold text-[10px]">
                        {alloc.status === 'received' ? '✓ Received' : 'Pending'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>

          {/* Floor Signatures */}
          <div className="grid grid-cols-3 gap-8 pt-8 border-t-2 border-slate-300 text-center text-xs">
            <div className="border-t border-slate-400 pt-2">
              <p className="font-bold uppercase text-slate-800">Production Lead</p>
              <p className="text-[10px] text-slate-500">Sign &amp; Date</p>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <p className="font-bold uppercase text-slate-800">Quality Assurance</p>
              <p className="text-[10px] text-slate-500">Verified &amp; Inspected</p>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <p className="font-bold uppercase text-slate-800">Factory Dispatch Manager</p>
              <p className="text-[10px] text-slate-500">Final Sign-off</p>
            </div>
          </div>
        </div>
      )}

      {/* Screen Header */}
      <PageHeader
        title="Production Orders"
        subtitle="Manage client batch orders, variant specifications, and 10-component BOM tracking"
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              onClick={() => loadData()}
              title="Refresh order records"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            {canPerform('manage_orders') && (
              <Button
                variant="primary"
                onClick={handleOpenCreateModal}
              >
                <Plus className="h-4 w-4" />
                New Order
              </Button>
            )}
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}

      {/* Search & Filter Bar */}
      <Card className="p-4 bg-white/90 backdrop-blur border border-slate-200/80 shadow-sm rounded-2xl">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex-1 max-w-lg">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by Order #, product, or client..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Tabs */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'hover:text-slate-900'
                }`}
                onClick={() => setStatusFilter('all')}
              >
                All Active ({orders.length})
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  statusFilter === 'in_progress'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'hover:text-slate-900'
                }`}
                onClick={() => setStatusFilter('in_progress')}
              >
                In Progress ({orders.filter((o) => o.status === 'in_progress').length})
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  statusFilter === 'planning'
                    ? 'bg-white text-amber-700 shadow-sm'
                    : 'hover:text-slate-900'
                }`}
                onClick={() => setStatusFilter('planning')}
              >
                Planning ({orders.filter((o) => o.status === 'planning').length})
              </button>
            </div>

            {/* Client Filter Dropdown */}
            <select
              className={`${inputClass} text-xs py-1.5 px-3 w-40 sm:w-48`}
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
            >
              <option value="all">All Clients ({clients.length})</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.company_name ? `(${c.company_name})` : ''}
                </option>
              ))}
            </select>

            {/* Accordion Controls */}
            <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100"
                onClick={expandAll}
                title="Expand all BOM tables"
              >
                Expand All
              </button>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100"
                onClick={collapseAll}
                title="Collapse all BOM tables"
              >
                Collapse
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Orders List / Loading / Empty */}
      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No production orders found"
          description={
            searchQuery || statusFilter !== 'all' || selectedClientId !== 'all'
              ? 'No orders match your filter criteria. Try clearing filters.'
              : 'Create your first production order to begin tracking factory components.'
          }
          action={
            <Button
              variant="primary"
              onClick={handleOpenCreateModal}
            >
              <Plus className="h-4 w-4" />
              Create Production Order
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const isExpanded = expandedOrderIds.has(order.id);
            const allocations = order.material_allocations ?? [];
            const totalComponents = allocations.length;
            const receivedComponents = allocations.filter((a) => a.status === 'received').length;
            const pendingComponents = totalComponents - receivedComponents;
            const percentReceived = totalComponents > 0 ? Math.round((receivedComponents / totalComponents) * 100) : 0;
            const allReceived = totalComponents > 0 && receivedComponents === totalComponents;

            return (
              <Card
                key={order.id}
                className="overflow-hidden border border-slate-200/90 shadow-sm rounded-2xl bg-white transition-all hover:border-slate-300"
              >
                {/* Top Brand Header Banner */}
                <div className="bg-gradient-to-r from-indigo-50/90 via-indigo-50/40 to-slate-50 border-b border-indigo-100/80 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-xs">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canAccessView('clients') ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onViewChange && order.client_id) {
                              onViewChange('clients', { clientId: order.client_id });
                            }
                          }}
                          className="text-base sm:text-lg font-black tracking-tight text-indigo-950 hover:text-indigo-700 hover:underline cursor-pointer transition-colors text-left"
                          title="View client profile and order history"
                        >
                          {order.client?.name || 'Direct / Internal Order'}
                        </button>
                      ) : (
                        <span className="text-base sm:text-lg font-black tracking-tight text-indigo-950 cursor-default">
                          {order.client?.name || 'Direct / Internal Order'}
                        </span>
                      )}
                      {order.client?.company_name && (
                        <span className="text-xs font-semibold text-indigo-700 bg-indigo-100/80 border border-indigo-200/80 px-2 py-0.5 rounded-md">
                          {order.client.company_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* BOM Completion Progress Pill */}
                  <div className="flex items-center gap-2.5 bg-white/80 px-3 py-1.5 rounded-xl border border-indigo-100 shadow-2xs">
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-800">
                        {receivedComponents}/{totalComponents} Received
                      </div>
                      <div className="text-[10px] text-slate-500">{percentReceived}% complete</div>
                    </div>
                    <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          allReceived ? 'bg-emerald-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${percentReceived}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Order Summary Header */}
                <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50/70 via-white to-slate-50/40 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3.5">
                    <button
                      type="button"
                      className="mt-0.5 sm:mt-0 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
                      onClick={() => toggleOrderExpand(order.id)}
                      title={isExpanded ? 'Collapse BOM Matrix' : 'Expand BOM Matrix'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-slate-700" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-slate-700" />
                      )}
                    </button>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold bg-slate-900 text-white px-2.5 py-0.5 rounded-lg tracking-wide shadow-xs">
                          {order.order_no}
                        </span>

                        <h3 className="text-base font-bold text-slate-900">{order.product_name}</h3>

                        <span
                          className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            order.status === 'in_progress'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {order.status === 'in_progress' ? 'In Progress' : 'Planning'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-600">
                        <span className="flex items-center gap-1">
                          <Package className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-800 font-mono">
                            {order.total_qty.toLocaleString()}
                          </span>{' '}
                          units
                        </span>

                        {order.due_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            Target: <span className="font-medium text-slate-800">{formatDate(order.due_date)}</span>
                          </span>
                        )}

                        <span className="text-slate-400">
                          Created {formatDate(order.created_at)}
                        </span>
                      </div>

                      {/* Variant Badges */}
                      {Array.isArray(order.variants) && order.variants.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[11px] text-slate-500 font-medium">Variants:</span>
                          {order.variants.map((variant, idx) => (
                            <span
                              key={idx}
                              className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200/80"
                            >
                              {String(variant)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                    {/* Print Job Card Button */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setPrintOrder(order);
                        setTimeout(() => {
                          window.print();
                        }, 250);
                      }}
                      title="Print Job Card traveler sheet"
                    >
                      <Printer className="h-4 w-4" />
                      Job Card
                    </Button>

                    {/* Complete Order Button */}
                    <Button
                      variant="primary"
                      size="sm"
                      className={allReceived ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                      onClick={() => setCompleteModalOrder(order)}
                      title="Complete order and move to history"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Complete Order
                    </Button>

                    {/* Delete Button */}
                    {canPerform('manage_orders') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="!border-rose-200 !text-rose-600 hover:!bg-rose-50 hover:!border-rose-300 transition-colors"
                        onClick={() => setDeleteModalOrder(order)}
                        title="Delete production order and associated BOM allocations"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Order
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expanded BOM Matrix Table */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-indigo-600" />
                          10-Component Bill of Materials (BOM)
                        </h4>
                        <p className="text-xs text-slate-500">
                          Configure vendor assignments or stock allocation. Click status pill to toggle received.
                        </p>
                      </div>

                      {pendingComponents > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                          <Clock className="h-3.5 w-3.5" />
                          {pendingComponents} pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          All {allocations.length} Received
                        </span>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200">
                            <th className="py-2.5 px-3 w-10 text-center text-slate-400">#</th>
                            <th className="py-2.5 px-3 w-36">Component</th>
                            <th className="py-2.5 px-3 w-28">Source</th>
                            <th className="py-2.5 px-3 w-28 text-center">Planned Qty</th>
                            <th className="py-2.5 px-3 min-w-[160px]">Specification</th>
                            <th className="py-2.5 px-3 min-w-[200px]">Warehouse SKU</th>
                            <th className="py-2.5 px-3 min-w-[180px]">Assigned Supplier</th>
                            <th className="py-2.5 px-3 w-28 text-center">Expected Due</th>
                            <th className="py-2.5 px-3 w-28">Location</th>
                            <th className="py-2.5 px-3 w-32 text-center">Status</th>
                            <th className="py-2.5 px-2 w-10 text-center"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {allocations
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((alloc, idx) => {
                              const isReceived = alloc.status === 'received';
                              const isService = /printing|coating|stamping|metalliz|emboss/i.test(alloc.component_name);
                              const assignedItem = items.find((i) => i.id === alloc.stock_item_id);

                              return (
                                <tr
                                  key={alloc.id}
                                  className={`transition-colors ${
                                    isReceived ? 'bg-emerald-50/30' : 'hover:bg-slate-50/80'
                                  }`}
                                >
                                  {/* 1. # */}
                                  <td className="py-2 px-3 text-center text-slate-400 font-mono">
                                    {idx + 1}
                                  </td>

                                  {/* 2. Component Name */}
                                  <td className="py-2 px-3 font-semibold text-slate-900">
                                    {alloc.component_name}
                                  </td>

                                  {/* 3. Source Toggle (Vendor vs Stock) */}
                                  <td className="py-2 px-3">
                                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-[11px] font-semibold">
                                      <button
                                        type="button"
                                        disabled={isReceived || !canPerform('manage_orders')}
                                        className={`px-2 py-0.5 rounded-md transition ${
                                          alloc.source === 'vendor'
                                            ? 'bg-indigo-600 text-white shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                        } ${isReceived ? 'cursor-not-allowed opacity-75' : ''}`}
                                        onClick={() =>
                                          handleAllocationFieldChange(alloc.id, 'source', 'vendor')
                                        }
                                      >
                                        Vendor
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isReceived || !canPerform('manage_orders')}
                                        className={`px-2 py-0.5 rounded-md transition ${
                                          alloc.source === 'stock'
                                            ? 'bg-emerald-600 text-white shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                        } ${isReceived ? 'cursor-not-allowed opacity-75' : ''}`}
                                        onClick={() =>
                                          handleAllocationFieldChange(alloc.id, 'source', 'stock')
                                        }
                                      >
                                        Stock
                                      </button>
                                    </div>
                                  </td>

                                  {/* 4. Reactive Keyed Planned Quantity */}
                                  <td className="py-2 px-3 text-center">
                                    <div className="inline-flex items-center justify-center gap-1">
                                      <input
                                        key={`${alloc.id}-${alloc.qty ?? order.total_qty}`}
                                        type="number"
                                        min="1"
                                        disabled={isReceived || !canPerform('manage_orders')}
                                        defaultValue={alloc.qty || order.total_qty || 1}
                                        className={`w-20 text-xs px-2 py-1 rounded border border-slate-200 bg-white font-mono text-center focus:border-indigo-500 ${
                                          isReceived ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''
                                        }`}
                                        onBlur={(e) => {
                                          const val = parseInt(e.target.value, 10);
                                          if (val > 0 && val !== alloc.qty) {
                                            handleAllocationFieldChange(alloc.id, 'qty', val);
                                          }
                                        }}
                                      />
                                      {assignedItem?.unit && (
                                        <span className="text-[10px] text-slate-400 font-mono" title={`Unit: ${assignedItem.unit}`}>
                                          {assignedItem.unit}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* 5. Specification / Details */}
                                  <td className="py-2 px-3">
                                    <input
                                      id={`alloc-spec-${alloc.id}`}
                                      type="text"
                                      defaultValue={alloc.description || ''}
                                      placeholder="e.g. Amber 100ml bottle"
                                      disabled={!canPerform('manage_orders')}
                                      className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                      onBlur={(e) => {
                                        if (e.target.value !== (alloc.description || '')) {
                                          handleAllocationFieldChange(alloc.id, 'description', e.target.value.trim() || null);
                                        }
                                      }}
                                    />
                                  </td>

                                  {/* 6. Dedicated Warehouse SKU Selector */}
                                  <td className="py-2 px-3">
                                    {isService ? (
                                      <span className="text-[11px] text-emerald-700 font-medium">
                                        ✓ Service Milestone
                                      </span>
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <select
                                          className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800"
                                          value={alloc.stock_item_id || ''}
                                          disabled={isReceived || !canPerform('manage_orders')}
                                          onChange={(e) => {
                                            if (e.target.value === '__CREATE_NEW_SKU__') {
                                              handleOpenNewSkuModal(alloc);
                                            } else {
                                              handleAllocationFieldChange(alloc.id, 'stock_item_id', e.target.value || null);
                                            }
                                          }}
                                        >
                                          <option value="">-- Select Catalog SKU --</option>
                                          {canPerform('manage_orders') && !isReceived && (
                                            <option value="__CREATE_NEW_SKU__" className="text-indigo-600 font-semibold bg-indigo-50/50">
                                              + Create New SKU...
                                            </option>
                                          )}
                                          {items.map((i) => (
                                            <option key={i.id} value={i.id}>
                                              {i.name} {i.color ? `[${i.color}]` : ''} ({i.category || 'General'})
                                            </option>
                                          ))}
                                        </select>
                                        {canPerform('manage_orders') && !isReceived && (
                                          <button
                                            type="button"
                                            onClick={() => handleOpenNewSkuModal(alloc)}
                                            className="shrink-0 p-1.5 rounded border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition-colors shadow-2xs cursor-pointer"
                                            title={`Create and link new SKU for ${alloc.component_name}`}
                                            aria-label={`Create new SKU for ${alloc.component_name}`}
                                          >
                                            <Plus className="h-3.5 w-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>

                                  {/* 7. Dedicated Supplier Selector */}
                                  <td className="py-2 px-3">
                                    <select
                                      className={`w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800 ${
                                        alloc.source === 'stock' ? 'opacity-60 bg-slate-50 cursor-not-allowed' : ''
                                      }`}
                                      value={alloc.vendor_id || ''}
                                      disabled={alloc.source === 'stock' || isReceived || !canPerform('manage_orders')}
                                      onChange={(e) =>
                                        handleAllocationFieldChange(alloc.id, 'vendor_id', e.target.value || null)
                                      }
                                    >
                                      <option value="">-- Select Supplier --</option>
                                      {suppliers.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.name} {s.contact ? `(${s.contact})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </td>

                                  {/* 8. Expected Due Date */}
                                  <td className="py-2 px-3 text-center">
                                    <input
                                      type="date"
                                      defaultValue={alloc.timeline || ''}
                                      disabled={!canPerform('manage_orders')}
                                      className="text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:border-indigo-500 font-mono text-slate-800"
                                      onBlur={(e) => {
                                        if (e.target.value !== (alloc.timeline || '')) {
                                          handleAllocationFieldChange(alloc.id, 'timeline', e.target.value || null);
                                        }
                                      }}
                                    />
                                  </td>

                                  {/* 9. Location */}
                                  <td className="py-2 px-3">
                                    <input
                                      type="text"
                                      defaultValue={alloc.location || 'Raw Stock Bay A'}
                                      disabled={isReceived || !canPerform('manage_orders')}
                                      placeholder="Raw Stock Bay A"
                                      className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:border-indigo-500"
                                      onBlur={(e) => {
                                        if (e.target.value !== (alloc.location || '')) {
                                          handleAllocationFieldChange(alloc.id, 'location', e.target.value.trim() || null);
                                        }
                                      }}
                                    />
                                  </td>

                                  {/* 10. Status 1-Click Toggle */}
                                  <td className="py-2 px-3 text-center">
                                    {(!isReceived && !canPerform('manage_orders')) || (isReceived && !canPerform('reverse_allocation')) ? (
                                      <span
                                        className={`w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold opacity-75 cursor-not-allowed ${
                                          isReceived
                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                                        }`}
                                        title="Permission restricted"
                                      >
                                        {isReceived ? (
                                          <>
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                            Received
                                          </>
                                        ) : (
                                          <>
                                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                                            Pending
                                          </>
                                        )}
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        className={`w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                                          isReceived
                                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300'
                                        }`}
                                        onClick={() => handleToggleAllocationStatus(alloc)}
                                        title={isReceived ? 'Click to revert to pending' : 'Click to mark as received'}
                                      >
                                        {isReceived ? (
                                          <>
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                            Received
                                          </>
                                        ) : (
                                          <>
                                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                                            Pending
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </td>

                                  {/* 11. Delete Custom Row */}
                                  <td className="py-2 px-2 text-center">
                                    {alloc.sort_order > 10 && canPerform('manage_orders') && (
                                      <button
                                        type="button"
                                        disabled={isReceived}
                                        onClick={() => handleDeleteAllocationRow(alloc.id, alloc.component_name)}
                                        className={`p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition ${
                                          isReceived ? 'opacity-30 cursor-not-allowed' : ''
                                        }`}
                                        title={isReceived ? 'Cannot delete received allocation' : 'Delete component row'}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>

                    {/* Add Custom Component Row */}
                    {canPerform('manage_orders') && (
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="+ Add custom component name (e.g. Pump, Ribbon)..."
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white w-64 focus:border-indigo-500"
                          value={newRowComponent[order.id] || ''}
                          onChange={(e) =>
                            setNewRowComponent((prev) => ({
                              ...prev,
                              [order.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomRow(order.id);
                            }
                          }}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleAddCustomRow(order.id)}
                        >
                          <Plus className="h-4 w-4" />
                          Add Row
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* CREATE MULTI-ORDER BATCH MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Create Production Orders (Multi-Order Batch Builder)
                </h3>
                <p className="text-xs text-slate-500">
                  Configure multiple product orders under one client in a single batch. Each order automatically seeds 10 BOM allocations.
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
                onClick={() => setShowCreateModal(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBatchOrder} className="flex flex-col flex-1 overflow-hidden">
              {/* Client Selector (Sticky Top) */}
              <div className="p-5 border-b border-slate-100 bg-white">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Select Client <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline cursor-pointer"
                    onClick={() => {
                      setQuickClientName('');
                      setQuickClientCompany('');
                      setQuickClientPhone('');
                      setQuickClientEmail('');
                      setQuickClientPref('');
                      setShowQuickClientModal(true);
                    }}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    + Quick Add Client
                  </button>
                </div>
                <select
                  className={inputClass}
                  value={batchClientId}
                  onChange={(e) => setBatchClientId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Client --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company_name ? `(${c.company_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scrollable Order Batch Lines */}
              <div className="p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50/40">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Order Batch Lines ({batchItems.length})
                  </h4>
                  <span className="text-xs text-slate-500">
                    Sequential advisory lock ensures contiguous order numbering
                  </span>
                </div>

                {batchItems.map((item, idx) => (
                  <div
                    key={item.tempId}
                    className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3 transition-all hover:border-slate-300"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                          Line #{idx + 1}
                        </span>
                        {item.error && (
                          <span className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                            ⚠️ {item.error}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-slate-600 hover:text-slate-900"
                          onClick={() => handleDuplicateBatchItem(idx)}
                          title="Duplicate this order line"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Duplicate
                        </Button>
                        {batchItems.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            onClick={() => handleRemoveBatchItem(idx)}
                            title="Remove this order line"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <Field label="Product Name" required>
                          <input
                            type="text"
                            className={inputClass}
                            placeholder="e.g. Royal Oud Extrait de Parfum"
                            value={item.product_name}
                            onChange={(e) => handleBatchItemChange(idx, 'product_name', e.target.value)}
                            required
                          />
                        </Field>
                      </div>

                      <div>
                        <Field label="Total Units" required>
                          <input
                            type="number"
                            min="1"
                            className={inputClass}
                            placeholder="e.g. 5000"
                            value={item.total_qty}
                            onChange={(e) =>
                              handleBatchItemChange(
                                idx,
                                'total_qty',
                                e.target.value ? parseInt(e.target.value, 10) : ''
                              )
                            }
                            required
                          />
                        </Field>
                      </div>
                    </div>

                    {/* Bottle Sizes / Variants */}
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Bottle Sizes / Variants
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-slate-400">Quick Add:</span>
                          {PRESET_SIZES.map((sz) => (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => handleBatchAddPresetVariant(idx, sz)}
                              className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-200 transition cursor-pointer"
                            >
                              + {sz}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          className={inputClass}
                          placeholder="Type variant and press Enter or comma (e.g. 30ml, 50ml)"
                          value={item.variantInput}
                          onChange={(e) => handleBatchItemChange(idx, 'variantInput', e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',') {
                              e.preventDefault();
                              handleBatchAddCustomVariant(idx);
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleBatchAddCustomVariant(idx)}
                        >
                          Add
                        </Button>
                      </div>

                      {item.variants.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.variants.map((v) => (
                            <span
                              key={v}
                              className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-200"
                            >
                              {v}
                              <button
                                type="button"
                                onClick={() => handleBatchRemoveVariant(idx, v)}
                                className="hover:text-rose-600 cursor-pointer"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Target Due Date">
                        <input
                          type="date"
                          className={inputClass}
                          value={item.due_date}
                          onChange={(e) => handleBatchItemChange(idx, 'due_date', e.target.value)}
                        />
                      </Field>

                      <Field label="Production Notes">
                        <input
                          type="text"
                          className={inputClass}
                          placeholder="Packaging guidelines, special bottling..."
                          value={item.notes}
                          onChange={(e) => handleBatchItemChange(idx, 'notes', e.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                ))}

                {/* Add Another Line Button */}
                <button
                  type="button"
                  onClick={handleAddBatchItem}
                  className="w-full py-3 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-white hover:bg-indigo-50/50 text-indigo-700 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  + Add Another Order Line
                </button>
              </div>

              {/* Modal Footer (Sticky Bottom) */}
              <div className="p-4 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  <span className="font-bold text-slate-800">
                    {batchItems.length} Order{batchItems.length > 1 ? 's' : ''}
                  </span>{' '}
                  to Create • Total Volume:{' '}
                  <span className="font-mono font-bold text-slate-900">
                    {batchItems
                      .reduce(
                        (acc, itm) => acc + (typeof itm.total_qty === 'number' ? itm.total_qty : 0),
                        0
                      )
                      .toLocaleString()}
                  </span>{' '}
                  Units • {batchItems.length * 10} BOM Material Allocations
                </div>

                <div className="flex items-center gap-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowCreateModal(false)}
                    disabled={creatingBatch}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={creatingBatch}
                  >
                    {creatingBatch && batchProgress
                      ? `Creating Order ${batchProgress.current} of ${batchProgress.total}...`
                      : `Create ${batchItems.length} Production Order${batchItems.length > 1 ? 's' : ''}`}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK ADD CLIENT MODAL */}
      {showQuickClientModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowQuickClientModal(false);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Quick Add Client</h3>
                <p className="text-xs text-slate-500">Add client without leaving the order creation flow</p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700 p-1"
                onClick={() => setShowQuickClientModal(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuickClient} className="p-5 space-y-3.5">
              <Field label="Client Name" required>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. John Doe"
                  value={quickClientName}
                  onChange={(e) => setQuickClientName(e.target.value)}
                  required
                  autoFocus
                />
              </Field>

              <Field label="Company / Brand Name">
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Maison de Luxe"
                  value={quickClientCompany}
                  onChange={(e) => setQuickClientCompany(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input
                    type="tel"
                    className={inputClass}
                    placeholder="+91 98765 43210"
                    value={quickClientPhone}
                    onChange={(e) => setQuickClientPhone(e.target.value)}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    className={inputClass}
                    placeholder="contact@brand.com"
                    value={quickClientEmail}
                    onChange={(e) => setQuickClientEmail(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Packaging Preferences">
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Gold caps, velvet box lining"
                  value={quickClientPref}
                  onChange={(e) => setQuickClientPref(e.target.value)}
                />
              </Field>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowQuickClientModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={creatingClient}
                >
                  Save &amp; Select
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETE ORDER CONFIRMATION MODAL */}
      {completeModalOrder && (
        <ConfirmModal
          isOpen={!!completeModalOrder}
          title={`Complete Order ${completeModalOrder.order_no}?`}
          message={
            (completeModalOrder.material_allocations?.filter((a) => a.status === 'pending').length || 0) > 0
              ? `Warning: There are still ${
                  completeModalOrder.material_allocations?.filter((a) => a.status === 'pending').length
                } component(s) marked pending. Are you sure you want to finalize this order and archive it to Order History?`
              : `All components are received! Completing this order will record completion time and move it to Order History.`
          }
          confirmText={completing ? 'Completing...' : 'Yes, Complete Order'}
          variant="primary"
          onConfirm={handleConfirmComplete}
          onClose={() => setCompleteModalOrder(null)}
        />
      )}

      {/* DELETE ORDER CONFIRMATION MODAL */}
      {deleteModalOrder && (
        <ConfirmModal
          isOpen={!!deleteModalOrder}
          title={`Delete Production Order ${deleteModalOrder.order_no}?`}
          message={`Are you sure you want to permanently delete order "${deleteModalOrder.product_name}" for client "${deleteModalOrder.client?.name || 'Client'}" (${deleteModalOrder.total_qty.toLocaleString()} units)?

${(deleteModalOrder.material_allocations?.filter((a) => a.status === 'received').length ?? 0) > 0 ? `⚠️ ATTENTION: ${deleteModalOrder.material_allocations?.filter((a) => a.status === 'received').length} BOM components have already been marked as RECEIVED for this order.\n\n` : ''}⚠️ Warning: All associated Bill of Materials (BOM) allocation rows and procurement tracking records will be permanently deleted via database cascade. This action cannot be undone.`}
          confirmText={deleting ? 'Deleting...' : 'Delete Order'}
          loading={deleting}
          variant="danger"
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteModalOrder(null)}
        />
      )}

      {/* ADD NEW SKU DIRECTLY FROM BOM TABLE MODAL */}
      {skuTargetAllocation && (
        <AddItemModal
          isOpen={!!skuTargetAllocation}
          onClose={() => setSkuTargetAllocation(null)}
          onItemCreated={handleSkuCreated}
          existingItems={items}
          initialCategory={skuTargetAllocation.initialCategory}
          initialName={skuTargetAllocation.initialName}
          disableSuccessToast={true}
          title={`Create & Link SKU for ${skuTargetAllocation.component_name}`}
          submitButtonText="Save & Link SKU"
          hideAddAnother={true}
        />
      )}
    </div>
  );
}
