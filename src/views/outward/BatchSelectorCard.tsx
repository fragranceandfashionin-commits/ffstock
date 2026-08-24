import { Building2, Calendar, MapPin, Package, Search, X, Copy, CheckCheck, Truck } from 'lucide-react';
import { Card, Badge, ItemCategoryBadge, ColorBadge } from '@/components/ui';
import { BatchSearchSelect } from '@/components/BatchSearchSelect';
import type { BatchWithRelations } from '@/lib/supabase';
import { formatNumber, formatDate } from '@/lib/utils';
import { useState, useEffect } from 'react';

export type BatchSelectorCardProps = {
  batches: BatchWithRelations[];
  batchId: string;
  onBatchChange: (id: string) => void;
  selectedBatch: BatchWithRelations | null;
  inFactory: number;
  readyQty: number;
  dispatchedTotal: number;
  unitLabel: string;
  onStartDispatch?: () => void;
};

export function BatchSelectorCard({
  batches,
  batchId,
  onBatchChange,
  selectedBatch,
  inFactory,
  readyQty,
  dispatchedTotal,
  unitLabel,
  onStartDispatch,
}: BatchSelectorCardProps) {
  const [copiedBatchNo, setCopiedBatchNo] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Global Ctrl+B shortcut to open search modal
  useEffect(() => {
    const handleGlobalShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, [isSearchOpen]);

  const handleCopyBatchNo = (e: React.MouseEvent, batchNo: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(batchNo);
    setCopiedBatchNo(batchNo);
    setTimeout(() => setCopiedBatchNo(null), 1800);
  };

  const totalReceived = selectedBatch?.qty_received || 0;
  const inFactoryPercent = totalReceived > 0 ? Math.round((inFactory / totalReceived) * 100) : 0;
  const readyPercent = totalReceived > 0 ? Math.round((readyQty / totalReceived) * 100) : 0;
  const dispatchedPercent = totalReceived > 0 ? Math.round((dispatchedTotal / totalReceived) * 100) : 0;

  // If no batch is selected, show the selection picker card
  if (!selectedBatch) {
    return (
      <Card className="border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white shadow-2xs">
              1
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Pick Batch / Brand / Item
            </span>
            <Badge label="Required" variant="amber" size="sm" />
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {batches.length} {batches.length === 1 ? 'batch' : 'batches'} in factory
          </span>
        </div>

        <BatchSearchSelect
          batches={batches}
          selectedBatchId={batchId}
          onSelectBatch={onBatchChange}
          placeholder="Type to search batch #, item name, supplier, brand, or click to browse..."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* 1-Click Direct Modal Search Panel */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsSearchOpen(false);
          }}
        >
          <div className="w-full max-w-3xl">
            <BatchSearchSelect
              batches={batches}
              selectedBatchId={batchId}
              alwaysOpen={true}
              onClose={() => setIsSearchOpen(false)}
              onSelectBatch={(id) => {
                onBatchChange(id);
                setIsSearchOpen(false);
              }}
              placeholder="Search by batch #, product name, supplier, color..."
            />
          </div>
        </div>
      )}

      {/* Unified High-Density Batch Command HUD */}
      <Card className="border-slate-200/90 bg-white shadow-2xs overflow-hidden p-0">
        {/* Top Tier: Batch Identity & Meta Attributes */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 text-white relative">
          {/* Subtle background glow */}
          <div className="absolute right-0 top-0 h-32 w-64 bg-indigo-500/10 blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
            <div className="space-y-2 flex-1 min-w-0">
              {/* Step indicator + Badges Row */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 text-indigo-200 text-[11px] font-bold border border-white/15">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Active Batch
                </span>

                <ItemCategoryBadge category={selectedBatch.item?.category} />

                <button
                  type="button"
                  onClick={(e) => handleCopyBatchNo(e, selectedBatch.batch_no)}
                  className="font-mono font-black text-indigo-100 bg-indigo-900/90 hover:bg-indigo-800 px-2.5 py-0.5 rounded-lg border border-indigo-700/60 inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs text-xs"
                  title="Click to copy batch number"
                >
                  <span>Batch {selectedBatch.batch_no}</span>
                  {copiedBatchNo === selectedBatch.batch_no ? (
                    <CheckCheck className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3 opacity-60 hover:opacity-100" />
                  )}
                </button>

                {selectedBatch.brand_name && (
                  <span className="font-extrabold text-amber-200 bg-amber-950/80 border border-amber-500/50 px-2.5 py-0.5 rounded-lg text-xs shadow-2xs inline-flex items-center gap-1.5">
                    🏢 {selectedBatch.brand_name}
                  </span>
                )}

                <ColorBadge color={selectedBatch.color} />
              </div>

              {/* Product Title */}
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug truncate">
                {selectedBatch.brand_name ? (
                  <span className="text-amber-300 font-extrabold mr-1.5">[{selectedBatch.brand_name}]</span>
                ) : null}
                {selectedBatch.item?.name ?? 'Stock Item'}
              </h1>


              {/* Meta information tags */}
              <div className="flex items-center gap-x-4 gap-y-1 text-xs text-slate-300 flex-wrap font-medium">
                {selectedBatch.supplier && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span>
                      Supplier: <strong className="text-white font-semibold">{selectedBatch.supplier.name}</strong>
                    </span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span>
                    Received: <strong className="text-white font-bold">{formatNumber(selectedBatch.qty_received)} {unitLabel}</strong>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span>
                    Storage: <strong className="text-white font-semibold">{selectedBatch.location}</strong>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span>{formatDate(selectedBatch.received_on)}</span>
                </span>
              </div>
            </div>

            {/* Quick Actions (Switch / Clear) */}
            <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/10">
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-slate-900 hover:bg-indigo-50 px-3.5 py-2 text-xs font-extrabold shadow-sm hover:shadow transition-all duration-150 active:scale-98 cursor-pointer"
                title="Search and change batch (Shortcut: Ctrl+B)"
              >
                <Search className="h-3.5 w-3.5 text-indigo-600" />
                <span>Switch Batch</span>
                <kbd className="hidden sm:inline-block text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                  Ctrl+B
                </kbd>
              </button>
              <button
                type="button"
                onClick={() => onBatchChange('')}
                className="inline-flex items-center justify-center p-2 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white border border-white/15 hover:border-rose-400 transition cursor-pointer"
                title="Clear selected batch"
                aria-label="Clear batch selection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Integrated KPI Metric Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 bg-slate-50/50">
          {/* Total Received */}
          <div className="p-3.5 sm:p-4 transition hover:bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Total Received
              </span>
              <span className="text-[10px] font-bold text-slate-400">Baseline</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-slate-900">
                {formatNumber(totalReceived)}
              </span>
              <span className="text-xs font-semibold text-slate-500">{unitLabel}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Inward invoice total</p>
          </div>

          {/* In Factory */}
          <div className="p-3.5 sm:p-4 bg-emerald-50/20 transition hover:bg-emerald-50/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                In Factory
              </span>
              <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-200">
                {inFactoryPercent}%
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-emerald-700">
                {formatNumber(inFactory)}
              </span>
              <span className="text-xs font-semibold text-emerald-600">{unitLabel}</span>
            </div>
            <p className="text-[11px] text-emerald-600/90 mt-0.5">Across production stages</p>
          </div>

          {/* Ready for Dispatch */}
          <div className={`p-3.5 sm:p-4 transition ${readyQty > 0 ? 'bg-sky-50/40 hover:bg-sky-50/70' : 'hover:bg-white'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-800 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${readyQty > 0 ? 'bg-sky-500 animate-pulse' : 'bg-slate-300'}`} />
                Ready for Dispatch
              </span>
              {readyQty > 0 ? (
                <span className="text-[10px] font-extrabold text-sky-700 bg-sky-100 px-1.5 py-0.2 rounded border border-sky-200">
                  {readyPercent}%
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-400">0%</span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-sky-700">
                {formatNumber(readyQty)}
              </span>
              <span className="text-xs font-semibold text-sky-600">{unitLabel}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-[11px] text-sky-600/90">Finished goods in stock</span>
              {readyQty > 0 && onStartDispatch && (
                <button
                  type="button"
                  onClick={onStartDispatch}
                  className="text-[10px] font-extrabold text-sky-700 hover:text-sky-900 underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Truck className="h-2.5 w-2.5" /> Ship Now →
                </button>
              )}
            </div>
          </div>

          {/* Dispatched */}
          <div className="p-3.5 sm:p-4 transition hover:bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-violet-800">
                Dispatched
              </span>
              <span className="text-[10px] font-extrabold text-violet-700 bg-violet-100/80 px-1.5 py-0.2 rounded border border-violet-200">
                {dispatchedPercent}%
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-violet-700">
                {formatNumber(dispatchedTotal)}
              </span>
              <span className="text-xs font-semibold text-violet-600">{unitLabel}</span>
            </div>
            <p className="text-[11px] text-violet-600/90 mt-0.5">Shipped to clients</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
