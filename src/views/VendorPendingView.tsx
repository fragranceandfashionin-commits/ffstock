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
  markAllocationReceived,
  revertAllocationToPending,
  updateMaterialAllocation,
  fetchSuppliers,
} from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type {
  MaterialAllocationWithVendorRelations,
  Supplier,
} from '@/lib/supabase';
import type { View } from '@/lib/types';
import type { NavigationContext } from '@/components/AppShell';
import { getErrorMessage, formatDate, getTodayDateString } from '@/lib/utils';

export type VendorPendingViewProps = {
  onViewChange?: (view: View, context?: NavigationContext) => void;
};

export function VendorPendingView({ onViewChange }: VendorPendingViewProps) {
  const [items, setItems] = useState<MaterialAllocationWithVendorRelations[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'overdue' | 'upcoming'>('all');

  // Reassign Modal State
  const [reassignItem, setReassignItem] = useState<MaterialAllocationWithVendorRelations | null>(null);
  const [newVendorId, setNewVendorId] = useState<string>('');
  const [reassigning, setReassigning] = useState(false);

  // Recently received items tracking (for 1-click reversal)
  const [recentlyReceived, setRecentlyReceived] = useState<MaterialAllocationWithVendorRelations[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'recent_received'>('pending');

  const toast = useToast();
  const today = getTodayDateString();

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [pendingData, suppliersData] = await Promise.all([
        fetchVendorPendingList(),
        fetchSuppliers(),
      ]);
      setItems(pendingData);
      setSuppliers(suppliersData);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load vendor pending list'));
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

  // Mark as Received (1-click action with undo capability)
  const handleMarkReceived = async (alloc: MaterialAllocationWithVendorRelations) => {
    try {
      await markAllocationReceived(alloc.id);
      toast.success(`Received ${alloc.component_name} for order ${alloc.order?.order_no || ''}!`);

      // Add to recently received cache
      setRecentlyReceived((prev) => [
        { ...alloc, status: 'received', received_at: new Date().toISOString() },
        ...prev.filter((p) => p.id !== alloc.id),
      ]);

      // Optimistically remove from pending list
      setItems((prev) => prev.filter((item) => item.id !== alloc.id));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to mark component received'));
      loadData(true);
    }
  };

  // Revert Received item back to Pending (Reversibility!)
  const handleRevertToPending = async (alloc: MaterialAllocationWithVendorRelations) => {
    try {
      await revertAllocationToPending(alloc.id);
      toast.info(`Reverted ${alloc.component_name} back to pending`);

      // Remove from recently received
      setRecentlyReceived((prev) => prev.filter((p) => p.id !== alloc.id));

      // Reload fresh list
      loadData(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to revert component'));
    }
  };

  // Reassign Vendor
  const handleConfirmReassign = async () => {
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

  // Copy formatted WhatsApp reminder message for a vendor
  const handleCopyWhatsAppMessage = (vendor: Supplier, vendorItems: MaterialAllocationWithVendorRelations[]) => {
    const lines = [
      `*FRAGRANCE & FASHION - PENDING RAW MATERIALS STATUS*`,
      `Vendor: ${vendor.name}`,
      `Date: ${new Date().toLocaleDateString('en-GB')}`,
      ``,
      `Dear ${vendor.name},`,
      `Please provide an urgent dispatch update on the following pending components for our production orders:`,
      ``,
    ];

    vendorItems.forEach((item, idx) => {
      const orderNo = item.order?.order_no || 'PO-XXXX';
      const prodName = item.order?.product_name || 'Product';
      const desc = item.description ? ` (${item.description})` : '';
      const due = item.timeline ? ` | Target Due: ${formatDate(item.timeline)}` : '';
      lines.push(`${idx + 1}. *${item.component_name}*${desc}`);
      lines.push(`   Order: ${orderNo} [${prodName}]${due}`);
    });

    lines.push(``);
    lines.push(`Kindly let us know the delivery vehicle/tracking details as soon as possible. Thank you!`);

    const message = lines.join('\n');
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
      // Urgency filter
      if (urgencyFilter === 'overdue') {
        if (!item.timeline || item.timeline >= today) return false;
      } else if (urgencyFilter === 'upcoming') {
        if (!item.timeline || item.timeline < today) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchVendor = item.vendor?.name?.toLowerCase().includes(q);
        const matchComp = item.component_name.toLowerCase().includes(q);
        const matchOrder = item.order?.order_no?.toLowerCase().includes(q);
        const matchProd = item.order?.product_name?.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        return matchVendor || matchComp || matchOrder || matchProd || matchDesc;
      }
      return true;
    });
  }, [items, selectedVendorId, urgencyFilter, searchQuery, today]);

  // Group items by Vendor
  const groupedByVendor = useMemo(() => {
    const groups: { [vendorId: string]: { vendor: Supplier; items: MaterialAllocationWithVendorRelations[] } } = {};

    filteredItems.forEach((item) => {
      const vId = item.vendor_id || 'unassigned';
      if (!groups[vId]) {
        const vendorObj: Supplier = item.vendor || {
          id: vId,
          name: 'Unassigned Vendor',
          contact: null,
          created_at: '',
        };
        groups[vId] = { vendor: vendorObj, items: [] };
      }
      groups[vId].items.push(item);
    });

    return Object.values(groups).sort((a, b) => b.items.length - a.items.length);
  }, [filteredItems]);

  // KPI Metrics
  const totalPending = items.length;
  const overdueCount = items.filter((i) => i.timeline && i.timeline < today).length;
  const uniqueVendorsCount = new Set(items.map((i) => i.vendor_id).filter(Boolean)).size;
  const uniqueOrdersCount = new Set(items.map((i) => i.order_id).filter(Boolean)).size;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
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

        {groupedByVendor.map(({ vendor, items: vItems }) => (
          <div key={vendor.id} className="mb-6 break-inside-avoid">
            <div className="bg-slate-100 p-2 rounded font-bold text-sm text-slate-900 border-l-4 border-slate-900 flex justify-between">
              <span>{vendor.name} {vendor.contact ? `(Contact: ${vendor.contact})` : ''}</span>
              <span className="font-mono text-xs">{vItems.length} Pending</span>
            </div>
            <table className="w-full text-left text-xs border border-slate-300 mt-2 border-collapse">
              <thead>
                <tr className="bg-slate-200 text-slate-900 font-bold border-b border-slate-300">
                  <th className="p-1.5 border-r border-slate-300 w-28">Order #</th>
                  <th className="p-1.5 border-r border-slate-300 w-44">Product</th>
                  <th className="p-1.5 border-r border-slate-300 w-32">Component</th>
                  <th className="p-1.5 border-r border-slate-300">Description / Spec</th>
                  <th className="p-1.5 w-24 text-center">Expected Due</th>
                </tr>
              </thead>
              <tbody>
                {vItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-200">
                    <td className="p-1.5 border-r border-slate-200 font-mono font-bold">{item.order?.order_no}</td>
                    <td className="p-1.5 border-r border-slate-200">{item.order?.product_name}</td>
                    <td className="p-1.5 border-r border-slate-200 font-semibold">{item.component_name}</td>
                    <td className="p-1.5 border-r border-slate-200">{item.description || '-'}</td>
                    <td className="p-1.5 text-center font-mono">{item.timeline ? formatDate(item.timeline) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Screen Header */}
      <PageHeader
        title="Vendor Pending Board"
        subtitle="Expedite and track all outsourced components awaiting supplier delivery"
        action={
          <div className="flex items-center gap-2.5">
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

      {/* Tabs: Active Pending vs Recently Received (Reversibility) */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'pending'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('pending')}
          >
            Pending Delivery ({items.length})
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'recent_received'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('recent_received')}
          >
            Recently Received ({recentlyReceived.length})
          </button>
        </div>
      </div>

      {activeTab === 'recent_received' ? (
        // RECENTLY RECEIVED TAB (FOR AUDIT & REVERSALS)
        recentlyReceived.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No recently received items in this session"
            description="Items you mark received will appear here and can be reverted back to pending if clicked by mistake."
          />
        ) : (
          <Card className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Recently Received Allocations</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-3">Order #</th>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3">Component</th>
                    <th className="py-2.5 px-3">Vendor</th>
                    <th className="py-2.5 px-3">Received Time</th>
                    <th className="py-2.5 px-3 text-right">Reversibility Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentlyReceived.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {item.order?.order_no}
                      </td>
                      <td className="py-2.5 px-3">{item.order?.product_name}</td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-700">
                        {item.component_name}
                      </td>
                      <td className="py-2.5 px-3">{item.vendor?.name}</td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">
                        {item.received_at ? formatDate(item.received_at) : 'Just now'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRevertToPending(item)}
                          title="Revert back to pending"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Revert to Pending
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
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
                  placeholder="Search by vendor, component, order #, or product..."
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Urgency Filter */}
                <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      urgencyFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'hover:text-slate-900'
                    }`}
                    onClick={() => setUrgencyFilter('all')}
                  >
                    All Pending
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg transition-all ${
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
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      urgencyFilter === 'upcoming'
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'hover:text-slate-900'
                    }`}
                    onClick={() => setUrgencyFilter('upcoming')}
                  >
                    Upcoming
                  </button>
                </div>

                {/* Vendor Filter */}
                <select
                  className="rounded-xl border border-slate-200 text-xs py-1.5 px-3 bg-white text-slate-800"
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                >
                  <option value="all">All Suppliers ({suppliers.length})</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
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
                searchQuery || selectedVendorId !== 'all' || urgencyFilter !== 'all'
                  ? 'No components match your filter criteria.'
                  : 'All outsourced materials for active production orders have been received.'
              }
            />
          ) : (
            <div className="space-y-6">
              {groupedByVendor.map(({ vendor, items: vItems }) => {
                const vendorOverdue = vItems.filter((i) => i.timeline && i.timeline < today).length;

                return (
                  <Card
                    key={vendor.id}
                    className="overflow-hidden border border-slate-200 shadow-xs rounded-2xl bg-white"
                  >
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

                        {/* Contact details */}
                        <div className="flex flex-wrap items-center gap-4 mt-1 text-xs text-slate-500">
                          {vendor.contact && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-slate-400" />
                              {vendor.contact}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Copy WhatsApp Follow-up Button */}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopyWhatsAppMessage(vendor, vItems)}
                          title="Copy ready-to-send WhatsApp reminder message"
                        >
                          <Copy className="h-4 w-4" />
                          Copy WhatsApp Message
                        </Button>
                      </div>
                    </div>

                    {/* Table of pending items for this vendor */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-100/50 text-slate-600 font-semibold border-b border-slate-200/80">
                            <th className="py-2.5 px-4 w-32">Order #</th>
                            <th className="py-2.5 px-4 min-w-[160px]">Product</th>
                            <th className="py-2.5 px-4 w-36">Component</th>
                            <th className="py-2.5 px-4 min-w-[200px]">Specification / Details</th>
                            <th className="py-2.5 px-4 w-32 text-center">Expected Due</th>
                            <th className="py-2.5 px-4 w-44 text-right">Quick Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {vItems.map((item) => {
                            const isOverdue = item.timeline && item.timeline < today;

                            return (
                              <tr key={item.id} className="hover:bg-slate-50/80 transition">
                                {/* Order No with drilldown */}
                                <td className="py-2.5 px-4">
                                  <button
                                    type="button"
                                    className="font-mono text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
                                    onClick={() => {
                                      if (onViewChange && item.order_id) {
                                        onViewChange('orders', { orderId: item.order_id });
                                      }
                                    }}
                                    title="View order details in Orders view"
                                  >
                                    {item.order?.order_no || 'PO-XXXX'}
                                    <ExternalLink className="h-3 w-3" />
                                  </button>
                                </td>

                                {/* Product */}
                                <td className="py-2.5 px-4 font-medium text-slate-800">
                                  {item.order?.product_name || 'N/A'}
                                </td>

                                {/* Component */}
                                <td className="py-2.5 px-4 font-bold text-slate-900">
                                  {item.component_name}
                                </td>

                                {/* Specification */}
                                <td className="py-2.5 px-4 text-slate-600">
                                  {item.description || <span className="italic text-slate-400">No details specified</span>}
                                  {item.remarks && (
                                    <div className="text-[11px] text-amber-700 italic mt-0.5">
                                      Note: {item.remarks}
                                    </div>
                                  )}
                                </td>

                                {/* Timeline */}
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

                                {/* Actions */}
                                <td className="py-2.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {/* Reassign Button */}
                                    <button
                                      type="button"
                                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
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
                                      onClick={() => handleMarkReceived(item)}
                                    >
                                      <Check className="h-4 w-4" />
                                      Received
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
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
            <h3 className="text-base font-bold text-slate-900 mb-1">Reassign Supplier</h3>
            <p className="text-xs text-slate-500 mb-4">
              Change supplier for <span className="font-semibold text-slate-800">{reassignItem.component_name}</span> on order{' '}
              <span className="font-mono font-bold text-slate-800">{reassignItem.order?.order_no}</span>
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Select New Supplier
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
                  Confirm Reassign
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
