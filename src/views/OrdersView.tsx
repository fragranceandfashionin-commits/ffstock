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
  createProductionOrder,
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
  ProductionOrder,
  ProductionOrderWithRelations,
  MaterialAllocation,
  Client,
  Supplier,
  Item,
} from '@/lib/supabase';
import type { View } from '@/lib/types';
import type { NavigationContext } from '@/components/AppShell';
import { getErrorMessage, formatDate } from '@/lib/utils';

export type OrdersViewProps = {
  initialOrderId?: string;
  initialClientId?: string;
  onViewChange?: (view: View, context?: NavigationContext) => void;
};

export function OrdersView({ initialOrderId, initialClientId, onViewChange }: OrdersViewProps) {
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

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQuickClientModal, setShowQuickClientModal] = useState(false);
  const [deleteModalOrder, setDeleteModalOrder] = useState<ProductionOrder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [completeModalOrder, setCompleteModalOrder] = useState<ProductionOrderWithRelations | null>(null);
  const [completing, setCompleting] = useState(false);
  const [printOrder, setPrintOrder] = useState<ProductionOrderWithRelations | null>(null);

  // New Order Form State
  const [newClientId, setNewClientId] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newTotalQty, setNewTotalQty] = useState<number | ''>('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [variantInput, setVariantInput] = useState('');
  const [variantsList, setVariantsList] = useState<string[]>([]);
  const [creatingOrder, setCreatingOrder] = useState(false);

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

  // Add Variant Tag
  const handleAddVariant = () => {
    const val = variantInput.trim();
    if (val && !variantsList.includes(val)) {
      setVariantsList([...variantsList, val]);
      setVariantInput('');
    }
  };

  const handleRemoveVariant = (variant: string) => {
    setVariantsList(variantsList.filter((v) => v !== variant));
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
      setNewClientId(newClient.id);
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

  // Create Production Order
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientId) {
      toast.error('Please select a client');
      return;
    }
    if (!newProductName.trim()) {
      toast.error('Product name is required');
      return;
    }

    setCreatingOrder(true);
    try {
      const created = await createProductionOrder({
        client_id: newClientId,
        product_name: newProductName.trim(),
        variants: variantsList,
        total_qty: typeof newTotalQty === 'number' ? newTotalQty : 0,
        due_date: newDueDate || null,
        notes: newNotes.trim() || null,
      });

      toast.success(`Production Order ${created.order_no} created with 10 BOM components!`);
      setShowCreateModal(false);
      // Reset form
      setNewClientId('');
      setNewProductName('');
      setNewTotalQty('');
      setNewDueDate('');
      setNewNotes('');
      setVariantsList([]);
      setVariantInput('');

      await loadData();
      setExpandedOrderIds(new Set([created.id]));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create production order'));
    } finally {
      setCreatingOrder(false);
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
    value: string | null
  ) => {
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

  // Toggle Allocation Status (Pending <-> Received)
  const handleToggleAllocationStatus = async (allocation: MaterialAllocation) => {
    const isPending = allocation.status === 'pending';
    try {
      if (isPending) {
        await markAllocationReceived(allocation.id);
        toast.success(`Component "${allocation.component_name}" received!`);
      } else {
        await revertAllocationToPending(allocation.id);
        toast.info(`Component "${allocation.component_name}" reverted to pending`);
      }
      // Optimistic update
      const newStatus = isPending ? 'received' : 'pending';
      const newReceivedAt = isPending ? new Date().toISOString() : null;
      setOrders((prev) =>
        prev.map((ord) => ({
          ...ord,
          material_allocations: ord.material_allocations?.map((alloc) =>
            alloc.id === allocation.id
              ? { ...alloc, status: newStatus, received_at: newReceivedAt }
              : alloc
          ),
        }))
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update component status'));
      loadData(true);
    }
  };

  // Add extra component row to order
  const handleAddCustomRow = async (orderId: string) => {
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
              <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-300">
                <th className="p-2 border-r border-slate-300 w-12 text-center">#</th>
                <th className="p-2 border-r border-slate-300 w-36">Component</th>
                <th className="p-2 border-r border-slate-300 w-24">Source</th>
                <th className="p-2 border-r border-slate-300">Specification / Assigned</th>
                <th className="p-2 border-r border-slate-300 w-28 text-center">Expected</th>
                <th className="p-2 border-r border-slate-300 w-24 text-center">Status</th>
                <th className="p-2 w-32">Remarks</th>
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
                      <td className="p-2 border-r border-slate-200 uppercase text-[10px] font-bold">
                        {alloc.source}
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        {alloc.description && <span className="block">{alloc.description}</span>}
                        {alloc.source === 'vendor' && assignedVendor && (
                          <span className="text-[11px] text-slate-600 block">
                            Vendor: {assignedVendor.name}
                          </span>
                        )}
                        {alloc.source === 'stock' && assignedItem && (
                          <span className="text-[11px] text-slate-600 block">
                            Stock: {assignedItem.name}
                          </span>
                        )}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center font-mono text-[11px]">
                        {alloc.timeline ? formatDate(alloc.timeline) : '-'}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center uppercase font-bold text-[10px]">
                        {alloc.status === 'received' ? '✓ Received' : 'Pending'}
                      </td>
                      <td className="p-2 text-[11px] italic text-slate-600">{alloc.remarks || '-'}</td>
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
            <Button
              variant="primary"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="h-4 w-4" />
              New Order
            </Button>
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
              onClick={() => setShowCreateModal(true)}
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
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onViewChange && order.client_id) {
                              onViewChange('clients', { clientId: order.client_id });
                            }
                          }}
                          className="flex items-center gap-1 font-medium text-slate-800 hover:text-indigo-600 hover:underline transition cursor-pointer text-left"
                          title="View client profile and details"
                        >
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          {order.client?.name || 'Unknown Client'}
                          {order.client?.company_name && (
                            <span className="text-slate-400">({order.client.company_name})</span>
                          )}
                        </button>

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

                  {/* Progress & Actions */}
                  <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                    {/* BOM Completion Progress Pill */}
                    <div className="flex items-center gap-2.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-800">
                          {receivedComponents}/{totalComponents} Received
                        </div>
                        <div className="text-[10px] text-slate-500">{percentReceived}% complete</div>
                      </div>
                      <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            allReceived ? 'bg-emerald-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${percentReceived}%` }}
                        />
                      </div>
                    </div>

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
                    <button
                      type="button"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      onClick={() => setDeleteModalOrder(order)}
                      title="Delete order"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
                          All 10 Received
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
                            <th className="py-2.5 px-3 min-w-[160px]">Specification / Details</th>
                            <th className="py-2.5 px-3 min-w-[200px]">Assigned Vendor / Stock Item</th>
                            <th className="py-2.5 px-3 w-32 text-center">Expected Date</th>
                            <th className="py-2.5 px-3 w-32 text-center">Status</th>
                            <th className="py-2.5 px-3 min-w-[140px]">Remarks</th>
                            <th className="py-2.5 px-2 w-10 text-center"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {allocations
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((alloc, idx) => {
                              const isReceived = alloc.status === 'received';
                              return (
                                <tr
                                  key={alloc.id}
                                  className={`transition-colors ${
                                    isReceived ? 'bg-emerald-50/30' : 'hover:bg-slate-50/80'
                                  }`}
                                >
                                  {/* # */}
                                  <td className="py-2 px-3 text-center text-slate-400 font-mono">
                                    {idx + 1}
                                  </td>

                                  {/* Component Name */}
                                  <td className="py-2 px-3 font-semibold text-slate-900">
                                    {alloc.component_name}
                                  </td>

                                  {/* Source Toggle (Vendor vs Stock) */}
                                  <td className="py-2 px-3">
                                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-[11px] font-semibold">
                                      <button
                                        type="button"
                                        className={`px-2 py-0.5 rounded-md transition ${
                                          alloc.source === 'vendor'
                                            ? 'bg-indigo-600 text-white shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                        onClick={() =>
                                          handleAllocationFieldChange(alloc.id, 'source', 'vendor')
                                        }
                                      >
                                        Vendor
                                      </button>
                                      <button
                                        type="button"
                                        className={`px-2 py-0.5 rounded-md transition ${
                                          alloc.source === 'stock'
                                            ? 'bg-emerald-600 text-white shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                        onClick={() =>
                                          handleAllocationFieldChange(alloc.id, 'source', 'stock')
                                        }
                                      >
                                        Stock
                                      </button>
                                    </div>
                                  </td>

                                  {/* Description / Specification */}
                                  <td className="py-2 px-3">
                                    <input
                                      type="text"
                                      defaultValue={alloc.description || ''}
                                      placeholder="e.g. Amber 100ml bottle"
                                      className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                      onBlur={(e) => {
                                        if (e.target.value !== (alloc.description || '')) {
                                          handleAllocationFieldChange(alloc.id, 'description', e.target.value.trim() || null);
                                        }
                                      }}
                                    />
                                  </td>

                                  {/* Assigned Vendor or Stock Item */}
                                  <td className="py-2 px-3">
                                    {alloc.source === 'vendor' ? (
                                      <select
                                        className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800"
                                        value={alloc.vendor_id || ''}
                                        onChange={(e) =>
                                          handleAllocationFieldChange(alloc.id, 'vendor_id', e.target.value || null)
                                        }
                                      >
                                        <option value="">-- Select Vendor --</option>
                                        {suppliers.map((s) => (
                                          <option key={s.id} value={s.id}>
                                            {s.name} {s.contact ? `(${s.contact})` : ''}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <select
                                        className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-800"
                                        value={alloc.stock_item_id || ''}
                                        onChange={(e) =>
                                          handleAllocationFieldChange(alloc.id, 'stock_item_id', e.target.value || null)
                                        }
                                      >
                                        <option value="">-- Select Stock Item --</option>
                                        {items.map((i) => (
                                          <option key={i.id} value={i.id}>
                                            {i.name} {i.color ? `[${i.color}]` : ''}
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </td>

                                  {/* Timeline / Expected Date */}
                                  <td className="py-2 px-3 text-center">
                                    <input
                                      type="date"
                                      defaultValue={alloc.timeline || ''}
                                      className="text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:border-indigo-500 font-mono text-slate-800"
                                      onBlur={(e) => {
                                        if (e.target.value !== (alloc.timeline || '')) {
                                          handleAllocationFieldChange(alloc.id, 'timeline', e.target.value || null);
                                        }
                                      }}
                                    />
                                  </td>

                                  {/* Status 1-Click Toggle */}
                                  <td className="py-2 px-3 text-center">
                                    <button
                                      type="button"
                                      className={`w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs ${
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
                                  </td>

                                  {/* Remarks */}
                                  <td className="py-2 px-3">
                                    <input
                                      type="text"
                                      defaultValue={alloc.remarks || ''}
                                      placeholder="Operator remarks"
                                      className="w-full text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:border-indigo-500"
                                      onBlur={(e) => {
                                        if (e.target.value !== (alloc.remarks || '')) {
                                          handleAllocationFieldChange(alloc.id, 'remarks', e.target.value.trim() || null);
                                        }
                                      }}
                                    />
                                  </td>

                                  {/* Delete Custom Row */}
                                  <td className="py-2 px-2 text-center">
                                    {alloc.sort_order > 10 && (
                                      <button
                                        type="button"
                                        className="text-slate-400 hover:text-rose-600 p-1 rounded"
                                        onClick={() => handleDeleteAllocationRow(alloc.id, alloc.component_name)}
                                        title="Remove custom component row"
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
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* CREATE ORDER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Create Production Order</h3>
                <p className="text-xs text-slate-500">
                  Initializes order and automatically seeds the 10 standard BOM component matrix
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

            <form onSubmit={handleCreateOrder} className="p-5 space-y-4">
              {/* Client Selector + Quick Add Client */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Client <span className="text-rose-500">*</span>
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
                  value={newClientId}
                  onChange={(e) => setNewClientId(e.target.value)}
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

              {/* Product Name */}
              <Field label="Product Name" required>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Royal Oud Extrait de Parfum"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  required
                />
              </Field>

              {/* Variants Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Bottle Sizes / Variants
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="e.g. 50ml, 100ml"
                    value={variantInput}
                    onChange={(e) => setVariantInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddVariant();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddVariant}
                  >
                    Add Size
                  </Button>
                </div>

                {variantsList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {variantsList.map((v) => (
                      <span
                        key={v}
                        className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-200"
                      >
                        {v}
                        <button
                          type="button"
                          onClick={() => handleRemoveVariant(v)}
                          className="hover:text-rose-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Qty & Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Total Order Quantity" required>
                  <input
                    type="number"
                    min="1"
                    className={inputClass}
                    placeholder="e.g. 1000"
                    value={newTotalQty}
                    onChange={(e) =>
                      setNewTotalQty(e.target.value ? parseInt(e.target.value, 10) : '')
                    }
                    required
                  />
                </Field>

                <Field label="Target Due Date">
                  <input
                    type="date"
                    className={inputClass}
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                  />
                </Field>
              </div>

              {/* Notes */}
              <Field label="Production Notes">
                <textarea
                  className={inputClass}
                  rows={2}
                  placeholder="Special bottling instructions, labeling requirements, packaging guidelines..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </Field>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={creatingOrder}
                >
                  Create Order &amp; Seed 10 BOM
                </Button>
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
          title={`Delete Order ${deleteModalOrder.order_no}?`}
          message={`Are you sure you want to delete order "${deleteModalOrder.product_name}"? All associated BOM allocations will also be permanently deleted. This cannot be undone.`}
          confirmText={deleting ? 'Deleting...' : 'Delete Order'}
          variant="danger"
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteModalOrder(null)}
        />
      )}
    </div>
  );
}
