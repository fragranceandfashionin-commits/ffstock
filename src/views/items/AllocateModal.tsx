import { useState, useEffect, useMemo } from 'react';
import {
  ArrowRightLeft,
  ArrowRight,
  History,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Calendar,
  User,
  FileText,
  Boxes,
  Search,
  Check,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Modal,
  Field,
  Button,
  ErrorBanner,
  ItemCategoryBadge,
  ColorBadge,
} from '@/components/ui';
import {
  allocateStockBetweenBatches,
  fetchBatchAllocations,
  fetchBatchAvailableRawStock,
} from '@/lib/queries';
import type { BatchWithRelations, BatchAllocationWithRelations } from '@/lib/supabase';
import { formatNumber, formatDate, getTodayDateString, getErrorMessage } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export type AllocateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  sourceBatch: BatchWithRelations | null;
  allBatches: BatchWithRelations[];
  onAllocationComplete: () => void;
};

export function AllocateModal({
  isOpen,
  onClose,
  sourceBatch,
  allBatches,
  onAllocationComplete,
}: AllocateModalProps) {
  const [activeTab, setActiveTab] = useState<'allocate' | 'history'>('allocate');
  const [selectedSourceId, setSelectedSourceId] = useState<string>(sourceBatch?.id || allBatches[0]?.id || '');
  const [isChangingSource, setIsChangingSource] = useState(false);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');

  const [destinationBatchId, setDestinationBatchId] = useState('');
  const [allocationQty, setAllocationQty] = useState('');
  const [remarks, setRemarks] = useState('');
  const [allocatedBy, setAllocatedBy] = useState('');
  const [allocatedOn, setAllocatedOn] = useState(getTodayDateString());

  const [sourceAvailableStock, setSourceAvailableStock] = useState<number>(0);
  const [destAvailableStock, setDestAvailableStock] = useState<number>(0);
  const [loadingStock, setLoadingStock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search filter for destination batch selector
  const [destSearchQuery, setDestSearchQuery] = useState('');

  // Allocation History State
  const [historyList, setHistoryList] = useState<BatchAllocationWithRelations[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const toast = useToast();

  // Effective Source Batch object
  const effectiveSourceBatch = useMemo(
    () => allBatches.find((b) => b.id === selectedSourceId) || sourceBatch || allBatches[0] || null,
    [allBatches, selectedSourceId, sourceBatch]
  );

  // Selected Destination Batch object
  const destinationBatch = useMemo(
    () => allBatches.find((b) => b.id === destinationBatchId) || null,
    [allBatches, destinationBatchId]
  );

  // Available candidate batches for source
  const filteredSourceBatches = useMemo(() => {
    const q = sourceSearchQuery.toLowerCase().trim();
    if (!q) return allBatches;
    return allBatches.filter(
      (b) =>
        b.batch_no.toLowerCase().includes(q) ||
        (b.brand_name || '').toLowerCase().includes(q) ||
        (b.item?.name || '').toLowerCase().includes(q) ||
        (b.item?.category || '').toLowerCase().includes(q) ||
        (b.location || '').toLowerCase().includes(q) ||
        (b.supplier?.name || '').toLowerCase().includes(q) ||
        (b.color || '').toLowerCase().includes(q)
    );
  }, [allBatches, sourceSearchQuery]);

  // Available candidate batches for destination (excluding the source batch)
  const candidateBatches = useMemo(() => {
    if (!effectiveSourceBatch) return [];
    return allBatches.filter((b) => b.id !== effectiveSourceBatch.id);
  }, [allBatches, effectiveSourceBatch]);

  // Filtered candidate destination batches based on user search
  const filteredDestinationBatches = useMemo(() => {
    const q = destSearchQuery.toLowerCase().trim();
    if (!q) return candidateBatches;
    return candidateBatches.filter(
      (b) =>
        b.batch_no.toLowerCase().includes(q) ||
        (b.brand_name || '').toLowerCase().includes(q) ||
        (b.item?.name || '').toLowerCase().includes(q) ||
        (b.item?.category || '').toLowerCase().includes(q) ||
        (b.location || '').toLowerCase().includes(q) ||
        (b.supplier?.name || '').toLowerCase().includes(q) ||
        (b.color || '').toLowerCase().includes(q)
    );
  }, [candidateBatches, destSearchQuery]);

  // Fetch actual real-time available Raw Stock for source & destination batches
  useEffect(() => {
    if (!isOpen || !effectiveSourceBatch) return;

    let isMounted = true;
    setLoadingStock(true);
    setError(null);

    async function loadAvailable() {
      try {
        const srcRaw = await fetchBatchAvailableRawStock(effectiveSourceBatch!.id);
        if (isMounted) {
          setSourceAvailableStock(srcRaw);
        }

        if (destinationBatchId) {
          const destRaw = await fetchBatchAvailableRawStock(destinationBatchId);
          if (isMounted) {
            setDestAvailableStock(destRaw);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch real-time batch stock:', err);
      } finally {
        if (isMounted) setLoadingStock(false);
      }
    }

    loadAvailable();

    return () => {
      isMounted = false;
    };
  }, [isOpen, effectiveSourceBatch, destinationBatchId]);

  // Load Allocation History whenever modal opens or tab switches
  useEffect(() => {
    if (!isOpen || !effectiveSourceBatch) return;

    let isMounted = true;
    setLoadingHistory(true);

    fetchBatchAllocations(effectiveSourceBatch.id)
      .then((allocs) => {
        if (isMounted) setHistoryList(allocs);
      })
      .catch((err) => {
        console.warn('Failed to load allocation history:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingHistory(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, effectiveSourceBatch, activeTab]);

  // Reset state when sourceBatch prop changes
  useEffect(() => {
    if (sourceBatch) {
      setSelectedSourceId(sourceBatch.id);
    }
    setDestinationBatchId('');
    setAllocationQty('');
    setRemarks('');
    setError(null);
    setActiveTab('allocate');
    setDestSearchQuery('');
    setIsChangingSource(false);
  }, [sourceBatch]);

  if (!effectiveSourceBatch) return null;

  const parsedQty = parseInt(allocationQty, 10) || 0;
  const isQtyValid = parsedQty > 0 && parsedQty <= sourceAvailableStock;
  const isReadyToAllocate = isQtyValid && Boolean(destinationBatchId) && !submitting;

  // Post-allocation calculations
  const sourceNewQty = Math.max(0, sourceAvailableStock - parsedQty);
  const destNewQty = destAvailableStock + parsedQty;

  const handleQuickQtyPercent = (percent: number) => {
    const qty = Math.floor((sourceAvailableStock * percent) / 100);
    setAllocationQty(qty > 0 ? String(qty) : '');
  };

  const handleQuickQtyAll = () => {
    setAllocationQty(String(sourceAvailableStock));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReadyToAllocate || !destinationBatch || !effectiveSourceBatch) return;

    setSubmitting(true);
    setError(null);

    try {
      await allocateStockBetweenBatches({
        source_batch_id: effectiveSourceBatch.id,
        destination_batch_id: destinationBatch.id,
        qty: parsedQty,
        allocation_type: 'primary',
        item_id: effectiveSourceBatch.item_id,
        remarks: remarks.trim() || `Allocated ${parsedQty} ${effectiveSourceBatch.item?.unit || 'pcs'} from Batch ${effectiveSourceBatch.batch_no} to Batch ${destinationBatch.batch_no}`,
        allocated_by: allocatedBy.trim() || null,
        allocated_on: allocatedOn,
      });

      toast.success(
        `Successfully allocated ${formatNumber(parsedQty)} ${effectiveSourceBatch.item?.unit || 'pcs'} from Batch ${effectiveSourceBatch.batch_no} (${effectiveSourceBatch.item?.name}) to Batch ${destinationBatch.batch_no} (${destinationBatch.item?.name}).`,
        'Stock Allocated'
      );

      onAllocationComplete();
      onClose();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to complete stock allocation');
      setError(msg);
      toast.error(msg, 'Allocation Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Allocate Stock Between Batches"
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('allocate')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'allocate'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span>Allocate Stock</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Allocation History</span>
            {historyList.length > 0 && (
              <span
                className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                  activeTab === 'history' ? 'bg-teal-800 text-teal-100' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {historyList.length}
              </span>
            )}
          </button>
        </div>

        {error && <ErrorBanner message={error} />}

        {/* TAB 1: ALLOCATE FORM */}
        {activeTab === 'allocate' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ─── 1. Source Batch Card ─── */}
            <div className="rounded-2xl border border-teal-200/80 bg-linear-to-r from-teal-50/70 to-emerald-50/50 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                  <Boxes className="h-3.5 w-3.5 text-teal-700" />
                  Source Batch (Deducting From)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsChangingSource(!isChangingSource)}
                    className="text-[11px] font-bold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                  >
                    {isChangingSource ? 'Done' : 'Change Batch'}
                  </button>
                  <span className="bg-teal-100 text-teal-950 font-black text-xs px-2.5 py-0.5 rounded-lg border border-teal-300">
                    {loadingStock ? 'Calculating...' : `${formatNumber(sourceAvailableStock)} ${effectiveSourceBatch.item?.unit || 'pcs'} Available`}
                  </span>
                </div>
              </div>

              {isChangingSource ? (
                <div className="space-y-2 bg-white p-3 rounded-xl border border-teal-200">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={sourceSearchQuery}
                      onChange={(e) => setSourceSearchQuery(e.target.value)}
                      placeholder="Search source batch #, brand, item..."
                      className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-100">
                    {filteredSourceBatches.map((b) => (
                      <button
                        key={`src-opt-${b.id}`}
                        type="button"
                        onClick={() => {
                          setSelectedSourceId(b.id);
                          setIsChangingSource(false);
                          setAllocationQty('');
                        }}
                        className={`w-full text-left p-2 transition flex items-center justify-between text-xs cursor-pointer ${
                          b.id === effectiveSourceBatch.id ? 'bg-teal-50 font-bold text-teal-900' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-black mr-2">{b.batch_no}</span>
                          <span className="truncate">{b.item?.name}</span>
                        </div>
                        <span className="font-mono text-slate-500 shrink-0 ml-2">
                          {formatNumber(b.qty_received)} {b.item?.unit || 'pcs'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 bg-white/90 p-3 rounded-xl border border-teal-100 shadow-2xs">
                  {effectiveSourceBatch.image_url ? (
                    <img
                      src={effectiveSourceBatch.image_url}
                      alt={effectiveSourceBatch.batch_no}
                      className="h-12 w-12 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-[10px] font-bold text-teal-700 shrink-0">
                      SRC
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {effectiveSourceBatch.brand_name && (
                        <span className="font-extrabold text-amber-950 bg-amber-100 border border-amber-300/80 px-2 py-0.2 rounded text-[11px]">
                          🏢 {effectiveSourceBatch.brand_name}
                        </span>
                      )}
                      <span className="font-mono font-black text-slate-900 text-xs bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {effectiveSourceBatch.batch_no}
                      </span>
                      <ItemCategoryBadge category={effectiveSourceBatch.item?.category} />
                      <ColorBadge color={effectiveSourceBatch.color} />
                    </div>
                    <p className="font-bold text-slate-950 text-xs mt-1 truncate">
                      {effectiveSourceBatch.item?.name || 'Stock Item'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Warehouse Bay: <strong>{effectiveSourceBatch.location}</strong> • Supplier: <strong>{effectiveSourceBatch.supplier?.name || '—'}</strong>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ─── 2. Quantity To Allocate Input & Presets ─── */}
            <div className="space-y-1.5">
              <Field
                label={`Quantity to Allocate (${effectiveSourceBatch.item?.unit || 'pcs'})`}
                htmlFor="allocate-qty"
                required
                hint={
                  parsedQty > sourceAvailableStock
                    ? `⚠️ Cannot allocate more than the available ${formatNumber(sourceAvailableStock)} ${effectiveSourceBatch.item?.unit || 'pcs'}.`
                    : `Enter the amount you want to move from Batch ${effectiveSourceBatch.batch_no}.`
                }
              >
                <div className="flex items-center gap-2">
                  <input
                    id="allocate-qty"
                    type="number"
                    min="1"
                    max={sourceAvailableStock}
                    value={allocationQty}
                    onChange={(e) => setAllocationQty(e.target.value)}
                    placeholder={`e.g. 600 (Max: ${sourceAvailableStock})`}
                    className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-base font-black text-slate-900 focus:outline-none focus:ring-2 shadow-2xs ${
                      parsedQty > sourceAvailableStock
                        ? 'border-rose-400 focus:ring-rose-200'
                        : 'border-slate-300 focus:border-teal-600 focus:ring-teal-500/20'
                    }`}
                    autoFocus
                  />
                  {sourceAvailableStock > 0 && (
                    <button
                      type="button"
                      onClick={handleQuickQtyAll}
                      className="px-3 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-extrabold text-xs rounded-xl transition shrink-0 cursor-pointer shadow-2xs"
                      title="Allocate all available stock"
                    >
                      MAX
                    </button>
                  )}
                </div>
              </Field>

              {/* Quick Percentage Buttons */}
              {sourceAvailableStock > 0 && (
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Quick:</span>
                  {[25, 50, 75].map((pct) => (
                    <button
                      key={`pct-${pct}`}
                      type="button"
                      onClick={() => handleQuickQtyPercent(pct)}
                      className="px-2 py-0.5 text-[11px] font-bold bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-700 rounded-md border border-slate-200 transition cursor-pointer"
                    >
                      {pct}% ({formatNumber(Math.floor((sourceAvailableStock * pct) / 100))})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ─── 3. Destination Batch Selector ─── */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Destination Batch (Adding To) <span className="text-rose-500 font-bold">*</span>
              </label>

              {candidateBatches.length === 0 ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
                  No other inward batches exist in the system. Create another inward batch first to allocate stock to it.
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Search filter for destination batch */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={destSearchQuery}
                      onChange={(e) => setDestSearchQuery(e.target.value)}
                      placeholder="Search destination batch #, item name, brand, color..."
                      className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 shadow-2xs"
                    />
                  </div>

                  {/* Destination Batch Options List */}
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white shadow-2xs">
                    {filteredDestinationBatches.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 font-medium">
                        No matching destination batches found.
                      </div>
                    ) : (
                      filteredDestinationBatches.map((b) => {
                        const isSelected = b.id === destinationBatchId;
                        return (
                          <button
                            key={`dest-opt-${b.id}`}
                            type="button"
                            onClick={() => setDestinationBatchId(b.id)}
                            className={`w-full text-left p-2.5 transition flex items-center justify-between gap-3 cursor-pointer ${
                              isSelected
                                ? 'bg-teal-50/90 border-l-4 border-l-teal-600'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="h-8 w-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-mono font-black text-slate-700 shrink-0">
                                {isSelected ? (
                                  <Check className="h-4 w-4 text-teal-600 font-bold" />
                                ) : (
                                  b.batch_no.substring(0, 3)
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {b.brand_name && (
                                    <span className="font-bold text-amber-900 bg-amber-100/90 text-[10px] px-1.5 py-0.2 rounded">
                                      🏢 {b.brand_name}
                                    </span>
                                  )}
                                  <span className="font-mono font-black text-slate-900 text-xs">
                                    {b.batch_no}
                                  </span>
                                  <ItemCategoryBadge category={b.item?.category} />
                                </div>
                                <p className="font-bold text-slate-900 text-xs truncate">
                                  {b.item?.name || 'Stock Item'}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  Bay: <strong>{b.location}</strong> • Received: {formatDate(b.received_on)}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-black text-slate-900 text-xs bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                {formatNumber(b.qty_received)} <span className="text-[9px] text-slate-500 font-normal">{b.item?.unit || 'pcs'}</span>
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ─── 4. Live Before ➔ After Impact Summary Card ─── */}
            {destinationBatch && parsedQty > 0 && (
              <div className="rounded-2xl border border-indigo-200/80 bg-linear-to-r from-indigo-50/60 to-purple-50/60 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                    Live Impact Calculation Preview
                  </span>
                  <span className="text-xs font-black text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded-md">
                    Transfer: {formatNumber(parsedQty)} {effectiveSourceBatch?.item?.unit || 'pcs'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Source Impact */}
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
                    <p className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                      <span>Source ({effectiveSourceBatch?.batch_no})</span>
                      <span className="text-rose-600 font-black inline-flex items-center gap-0.5">
                        <TrendingDown className="h-3 w-3" /> -{formatNumber(parsedQty)}
                      </span>
                    </p>
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {effectiveSourceBatch?.item?.name}
                    </p>
                    <div className="flex items-center justify-between text-xs font-black pt-1 border-t border-slate-100">
                      <span className="text-slate-500 font-medium">{formatNumber(sourceAvailableStock)}</span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      <span className={sourceNewQty < 0 ? 'text-rose-600' : 'text-slate-950'}>
                        {formatNumber(sourceNewQty)} {effectiveSourceBatch?.item?.unit || 'pcs'}
                      </span>
                    </div>
                  </div>

                  {/* Destination Impact */}
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
                    <p className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                      <span>Destination ({destinationBatch.batch_no})</span>
                      <span className="text-emerald-700 font-black inline-flex items-center gap-0.5">
                        <TrendingUp className="h-3 w-3" /> +{formatNumber(parsedQty)}
                      </span>
                    </p>
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {destinationBatch.item?.name}
                    </p>
                    <div className="flex items-center justify-between text-xs font-black pt-1 border-t border-slate-100">
                      <span className="text-slate-500 font-medium">{formatNumber(destAvailableStock)}</span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      <span className="text-emerald-700 font-black">
                        {formatNumber(destNewQty)} {destinationBatch.item?.unit || 'pcs'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── 5. Optional Audit Metadata (Remarks, Operator, Date) ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <Field label="Allocated On Date" htmlFor="allocate-date">
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    id="allocate-date"
                    type="date"
                    value={allocatedOn}
                    onChange={(e) => setAllocatedOn(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 shadow-2xs"
                  />
                </div>
              </Field>

              <Field label="Allocated By (Operator Name)" htmlFor="allocate-by">
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    id="allocate-by"
                    type="text"
                    value={allocatedBy}
                    onChange={(e) => setAllocatedBy(e.target.value)}
                    placeholder="e.g. John / Production Lead"
                    className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 shadow-2xs"
                  />
                </div>
              </Field>
            </div>

            <Field label="Reason / Remarks (Optional)" htmlFor="allocate-remarks">
              <div className="relative">
                <FileText className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  id="allocate-remarks"
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Reallocated for urgent Amber Mirage bottling order"
                  className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 shadow-2xs"
                />
              </div>
            </Field>

            {/* ─── Actions ─── */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="text-xs font-bold"
              >
                Cancel
              </Button>

              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={!isReadyToAllocate}
                className="bg-teal-600 hover:bg-teal-700 text-white font-black text-xs px-4 py-2 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4 text-teal-100" />
                <span>{submitting ? 'Allocating Stock...' : 'Confirm & Allocate Stock'}</span>
              </Button>
            </div>
          </form>
        )}

        {/* TAB 2: ALLOCATION HISTORY AUDIT TRAIL */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-slate-900">
                  Allocation Ledger for Batch {effectiveSourceBatch?.batch_no || 'Selected Batch'}
                </p>
                <p className="text-[11px] text-slate-500">
                  All inward and outward stock reallocations recorded for this batch.
                </p>
              </div>
              <span className="font-mono font-black text-xs bg-white border border-slate-300 px-2 py-0.5 rounded-md">
                {historyList.length} Logged
              </span>
            </div>

            {loadingHistory ? (
              <div className="p-8 text-center text-xs text-slate-500 font-medium">
                Loading allocation ledger...
              </div>
            ) : historyList.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
                <AlertCircle className="h-6 w-6 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700">No Allocation History</p>
                <p className="text-[11px] text-slate-500">
                  No stock allocations have been recorded for Batch {effectiveSourceBatch?.batch_no || 'Selected'} yet.
                </p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {historyList.map((alloc) => {
                  const isOutgoing = alloc.source_batch_id === effectiveSourceBatch?.id;
                  return (
                    <div
                      key={`alloc-hist-${alloc.id}`}
                      className={`p-3 rounded-xl border transition shadow-2xs space-y-1.5 ${
                        isOutgoing
                          ? 'bg-rose-50/50 border-rose-200'
                          : 'bg-emerald-50/50 border-emerald-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.2 rounded-md ${
                            isOutgoing
                              ? 'bg-rose-100 text-rose-900 border border-rose-300'
                              : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                          }`}
                        >
                          {isOutgoing ? '📤 Outgoing Allocation' : '📥 Incoming Allocation'}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          {formatDate(alloc.allocated_on)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-bold text-slate-700">
                            {isOutgoing ? 'Transferred to Batch: ' : 'Received from Batch: '}
                          </span>
                          <strong className="font-mono text-slate-950">
                            {isOutgoing
                              ? alloc.destination_batch?.batch_no || 'Unknown Batch'
                              : alloc.source_batch?.batch_no || 'Unknown Batch'}
                          </strong>
                          <span className="text-slate-500 text-[11px] ml-1">
                            ({isOutgoing ? alloc.destination_batch?.item?.name : alloc.source_batch?.item?.name})
                          </span>
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-sm font-black ${
                              isOutgoing ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            {isOutgoing ? '-' : '+'}
                            {formatNumber(alloc.qty)} {effectiveSourceBatch?.item?.unit || 'pcs'}
                          </span>
                        </div>
                      </div>

                      {(alloc.remarks || alloc.allocated_by) && (
                        <div className="pt-1 border-t border-slate-200/60 text-[11px] text-slate-600 flex items-center justify-between">
                          <span className="italic truncate pr-2">"{alloc.remarks || 'No remarks'}"</span>
                          {alloc.allocated_by && (
                            <span className="font-medium text-slate-500 shrink-0">By: {alloc.allocated_by}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
