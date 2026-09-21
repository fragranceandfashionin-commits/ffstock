import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  History,
  Repeat,
  RotateCcw,
  Printer,
  ChevronDown,
  ChevronUp,
  Package,
  Building2,
  FileCheck,
} from 'lucide-react';
import {
  Card,
  PageHeader,
  ErrorBanner,
  EmptyState,
  Button,
  SearchInput,
  ConfirmModal,
  TableSkeleton,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import {
  fetchCompletedOrders,
  repeatOrder,
  reopenProductionOrder,
  fetchClients,
} from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type {
  ProductionOrderWithRelations,
  Client,
} from '@/lib/supabase';
import type { View } from '@/lib/types';
import type { NavigationContext } from '@/components/AppShell';
import { getErrorMessage, formatDate } from '@/lib/utils';

export type OrderHistoryViewProps = {
  onViewChange?: (view: View, context?: NavigationContext) => void;
};

export function OrderHistoryView({ onViewChange }: OrderHistoryViewProps) {
  const [orders, setOrders] = useState<ProductionOrderWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

  // Modal Action States
  const [repeatModalOrder, setRepeatModalOrder] = useState<ProductionOrderWithRelations | null>(null);
  const [repeating, setRepeating] = useState(false);
  const [reopenModalOrder, setReopenModalOrder] = useState<ProductionOrderWithRelations | null>(null);
  const [reopening, setReopening] = useState(false);
  const [printOrder, setPrintOrder] = useState<ProductionOrderWithRelations | null>(null);

  const toast = useToast();

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [completedData, clientsData] = await Promise.all([
        fetchCompletedOrders(),
        fetchClients(),
      ]);
      setOrders(completedData);
      setClients(clientsData);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load completed order history'));
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time synchronization
  useEffect(() => {
    const channel = supabase
      .channel('order_history_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_orders' },
        () => {
          loadData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Toggle order accordion
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

  // Repeat Order (Atomic clone)
  const handleConfirmRepeat = async () => {
    if (!repeatModalOrder) return;
    setRepeating(true);
    try {
      const newOrder = await repeatOrder(repeatModalOrder.id);
      toast.success(
        `Order cloned successfully as ${newOrder.order_no}! All 10 BOM rows initialized to pending.`
      );
      setRepeatModalOrder(null);

      // Navigate to active orders view with new order highlighted
      if (onViewChange) {
        onViewChange('orders', { orderId: newOrder.id });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to repeat order'));
    } finally {
      setRepeating(false);
    }
  };

  // Reopen Order (Restore to active status - Operational reversibility)
  const handleConfirmReopen = async () => {
    if (!reopenModalOrder) return;
    setReopening(true);
    try {
      const reopened = await reopenProductionOrder(reopenModalOrder.id);
      toast.success(`Order ${reopened.order_no} reopened and restored to Active Orders!`);
      setReopenModalOrder(null);

      // Navigate to active orders view
      if (onViewChange) {
        onViewChange('orders', { orderId: reopened.id });
      } else {
        await loadData();
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reopen order'));
    } finally {
      setReopening(false);
    }
  };

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (selectedClientId !== 'all' && order.client_id !== selectedClientId) {
        return false;
      }
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
  }, [orders, selectedClientId, searchQuery]);

  // Aggregate stats
  const totalCompletedUnits = orders.reduce((sum, o) => sum + (o.total_qty || 0), 0);
  const totalUniqueClients = new Set(orders.map((o) => o.client_id).filter(Boolean)).size;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* Printable Sheet */}
      {printOrder && (
        <div className="hidden print:block fixed inset-0 bg-white p-8 text-black z-50">
          <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-wider text-slate-950">
                Fragrance &amp; Fashion
              </h1>
              <p className="text-xs uppercase tracking-widest text-slate-700 font-semibold">
                Completed Production Batch Archive Record
              </p>
            </div>
            <div className="text-right">
              <div className="inline-block px-3 py-1 bg-slate-950 text-white font-mono text-lg font-bold rounded">
                {printOrder.order_no}
              </div>
              <p className="text-xs text-slate-600 mt-1 font-mono">
                Completed: {printOrder.completed_at ? formatDate(printOrder.completed_at) : 'N/A'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border border-slate-300 rounded p-4 mb-6 bg-slate-50 text-sm">
            <div>
              <p className="text-xs font-bold uppercase text-slate-700">Client</p>
              <p className="font-bold text-base text-slate-900">{printOrder.client?.name}</p>
              {printOrder.client?.company_name && (
                <p className="text-xs text-slate-600">{printOrder.client.company_name}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-700">Product</p>
              <p className="font-bold text-base text-slate-900">{printOrder.product_name}</p>
              <p className="text-xs font-semibold text-slate-800">
                Units Produced: <span className="font-mono">{printOrder.total_qty.toLocaleString()}</span>
              </p>
            </div>
          </div>

          <h2 className="text-sm font-black uppercase tracking-wider mb-2 text-slate-950">
            Bill of Materials (BOM) Record
          </h2>
          <table className="w-full text-left text-xs border border-slate-300 mb-8 border-collapse">
            <thead>
              <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-300">
                <th className="p-2 border-r border-slate-300 w-12 text-center">#</th>
                <th className="p-2 border-r border-slate-300 w-36">Component</th>
                <th className="p-2 border-r border-slate-300 w-24">Source</th>
                <th className="p-2 border-r border-slate-300">Specification</th>
                <th className="p-2 w-32">Status</th>
              </tr>
            </thead>
            <tbody>
              {printOrder.material_allocations?.map((alloc, idx) => (
                <tr key={alloc.id} className="border-b border-slate-200">
                  <td className="p-2 border-r border-slate-200 text-center font-mono">{idx + 1}</td>
                  <td className="p-2 border-r border-slate-200 font-semibold">{alloc.component_name}</td>
                  <td className="p-2 border-r border-slate-200 uppercase text-[10px] font-bold">
                    {alloc.source}
                  </td>
                  <td className="p-2 border-r border-slate-200">{alloc.description || '-'}</td>
                  <td className="p-2 uppercase font-bold text-[10px] text-emerald-800">
                    {alloc.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Order History"
        subtitle="Archived completed production batches and 1-click repeat batch cloning"
        action={
          <Button
            variant="secondary"
            onClick={() => loadData()}
          >
            Refresh
          </Button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-white border border-slate-200/80 shadow-xs rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Completed Orders
            </span>
            <div className="p-2 rounded-xl bg-emerald-100/80 text-emerald-700">
              <FileCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 font-mono">
            {orders.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Archived production batches</p>
        </Card>

        <Card className="p-4 bg-white border border-slate-200/80 shadow-xs rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Units Bottled
            </span>
            <div className="p-2 rounded-xl bg-indigo-100/80 text-indigo-700">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 font-mono">
            {totalCompletedUnits.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Finished perfume bottles</p>
        </Card>

        <Card className="p-4 bg-white border border-slate-200/80 shadow-xs rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Clients Served
            </span>
            <div className="p-2 rounded-xl bg-amber-100/80 text-amber-700">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 font-mono">
            {totalUniqueClients}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Brands with fulfilled orders</p>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <Card className="p-4 bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search completed orders by order #, product, or client..."
            />
          </div>

          <select
            className="rounded-xl border border-slate-200 text-xs py-2 px-3 bg-white text-slate-800"
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
        </div>
      </Card>

      {/* Orders List */}
      {loading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={History}
          title="No completed orders found"
          description={
            searchQuery || selectedClientId !== 'all'
              ? 'No completed orders match your filter criteria.'
              : 'Completed production orders will be archived here for historical tracking and repeat ordering.'
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const isExpanded = expandedOrderIds.has(order.id);
            const allocations = order.material_allocations ?? [];

            return (
              <Card
                key={order.id}
                className="overflow-hidden border border-slate-200 shadow-xs rounded-2xl bg-white"
              >
                {/* Header */}
                <div className="p-4 sm:p-5 bg-slate-50/70 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3.5">
                    <button
                      type="button"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
                      onClick={() => toggleOrderExpand(order.id)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-slate-700" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-slate-700" />
                      )}
                    </button>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold bg-slate-900 text-white px-2.5 py-0.5 rounded-lg">
                          {order.order_no}
                        </span>
                        <h3 className="text-base font-bold text-slate-900">{order.product_name}</h3>
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          Completed
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          {order.client?.name}
                          {order.client?.company_name && (
                            <span className="text-slate-400">({order.client.company_name})</span>
                          )}
                        </span>

                        <span className="flex items-center gap-1 font-mono font-bold text-slate-800">
                          <Package className="h-3.5 w-3.5 text-slate-400" />
                          {order.total_qty.toLocaleString()} units
                        </span>

                        {order.completed_at && (
                          <span className="text-slate-500">
                            Completed on {formatDate(order.completed_at)}
                          </span>
                        )}
                      </div>

                      {/* Variant Badges */}
                      {Array.isArray(order.variants) && order.variants.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[11px] text-slate-400">Sizes:</span>
                          {order.variants.map((variant, idx) => (
                            <span
                              key={idx}
                              className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200"
                            >
                              {String(variant)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {/* Print Archive Button */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setPrintOrder(order);
                        setTimeout(() => {
                          window.print();
                        }, 250);
                      }}
                      title="Print archive traveler sheet"
                    >
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>

                    {/* Reopen Order Button */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setReopenModalOrder(order)}
                      title="Reopen order and move back to active orders"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reopen
                    </Button>

                    {/* Repeat Order Button */}
                    <Button
                      variant="primary"
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      onClick={() => setRepeatModalOrder(order)}
                      title="Clone this order and generate new order sequence"
                    >
                      <Repeat className="h-4 w-4" />
                      Repeat Order
                    </Button>
                  </div>
                </div>

                {/* Expanded BOM Details */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 bg-slate-50/50 border-t border-slate-100">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                      Completed BOM Allocations
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                            <th className="py-2 px-3 w-10 text-center">#</th>
                            <th className="py-2 px-3 w-36">Component</th>
                            <th className="py-2 px-3 w-28">Source</th>
                            <th className="py-2 px-3">Specification / Details</th>
                            <th className="py-2 px-3 w-28 text-center">Status</th>
                            <th className="py-2 px-3">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {allocations.map((alloc, idx) => (
                            <tr key={alloc.id}>
                              <td className="py-2 px-3 text-center text-slate-400 font-mono">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-800">
                                {alloc.component_name}
                              </td>
                              <td className="py-2 px-3 uppercase text-[10px] font-bold text-slate-600">
                                {alloc.source}
                              </td>
                              <td className="py-2 px-3 text-slate-700">{alloc.description || '-'}</td>
                              <td className="py-2 px-3 text-center uppercase font-bold text-[10px] text-emerald-700">
                                {alloc.status}
                              </td>
                              <td className="py-2 px-3 text-slate-500 italic">{alloc.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* REPEAT ORDER CONFIRMATION MODAL */}
      {repeatModalOrder && (
        <ConfirmModal
          isOpen={!!repeatModalOrder}
          title={`Repeat Order ${repeatModalOrder.order_no}?`}
          message={`This will clone "${repeatModalOrder.product_name}" for client "${repeatModalOrder.client?.name}" into a brand new production order with a new sequence number (PO-YYYY-XXX). All 10 BOM component rows will be cloned and reset to pending status.`}
          confirmText={repeating ? 'Cloning Order...' : 'Yes, Repeat Order'}
          variant="primary"
          onConfirm={handleConfirmRepeat}
          onClose={() => setRepeatModalOrder(null)}
        />
      )}

      {/* REOPEN ORDER CONFIRMATION MODAL */}
      {reopenModalOrder && (
        <ConfirmModal
          isOpen={!!reopenModalOrder}
          title={`Reopen Order ${reopenModalOrder.order_no}?`}
          message={`This will restore order "${reopenModalOrder.order_no}" (${reopenModalOrder.product_name}) back to active status (in_progress) and move it back to the Production Orders view.`}
          confirmText={reopening ? 'Reopening...' : 'Yes, Reopen Order'}
          variant="warning"
          onConfirm={handleConfirmReopen}
          onClose={() => setReopenModalOrder(null)}
        />
      )}
    </div>
  );
}
