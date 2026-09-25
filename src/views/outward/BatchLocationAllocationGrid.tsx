import React, { useState, useId } from 'react';
import { MapPin, Building2, Calendar, AlertCircle, Copy, CheckCheck, Zap, Layers } from 'lucide-react';
import { formatNumber, formatDate } from '@/lib/utils';

export type BatchAllocationItem = {
  batch_id: string;
  batch_no: string;
  location: string;
  supplier_name?: string | null;
  received_on?: string | null;
  availableQty: number;
  allocatedQty: number;
};

export type BatchLocationAllocationGridProps = {
  items: BatchAllocationItem[];
  onAllocationChange: (batchId: string, val: string) => void;
  unitLabel: string;
  stageName: string;
  theme?: 'indigo' | 'emerald' | 'rose';
  disabled?: boolean;
};

export function BatchLocationAllocationGrid({
  items,
  onAllocationChange,
  unitLabel,
  stageName,
  theme = 'indigo',
  disabled = false,
}: BatchLocationAllocationGridProps) {
  const componentId = useId();
  const [copiedBatchId, setCopiedBatchId] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, text: string, batchId: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedBatchId(batchId);
    setTimeout(() => setCopiedBatchId(null), 1800);
  };

  // Color & styling tokens per theme
  const themeStyles = {
    indigo: {
      badge: 'bg-indigo-600 text-white',
      accentText: 'text-indigo-700',
      activeBorder: 'border-indigo-400 ring-2 ring-indigo-500/20 bg-indigo-50/20',
      focusRing: 'focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100',
      allBtn: 'bg-indigo-900 hover:bg-indigo-800 text-white shadow-2xs',
      summaryBorder: 'border-indigo-200 bg-white/95',
      summaryBadge: 'bg-indigo-100 text-indigo-900 border-indigo-200',
      summaryText: 'text-indigo-950',
    },
    emerald: {
      badge: 'bg-emerald-600 text-white',
      accentText: 'text-emerald-700',
      activeBorder: 'border-emerald-400 ring-2 ring-emerald-500/20 bg-emerald-50/20',
      focusRing: 'focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100',
      allBtn: 'bg-emerald-900 hover:bg-emerald-800 text-white shadow-2xs',
      summaryBorder: 'border-emerald-200 bg-white/95',
      summaryBadge: 'bg-emerald-100 text-emerald-900 border-emerald-200',
      summaryText: 'text-emerald-950',
    },
    rose: {
      badge: 'bg-rose-600 text-white',
      accentText: 'text-rose-700',
      activeBorder: 'border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/20',
      focusRing: 'focus:border-rose-600 focus:ring-4 focus:ring-rose-100',
      allBtn: 'bg-rose-900 hover:bg-rose-800 text-white shadow-2xs',
      summaryBorder: 'border-rose-200 bg-white/95',
      summaryBadge: 'bg-rose-100 text-rose-900 border-rose-200',
      summaryText: 'text-rose-950',
    },
  }[theme];

  const totalAllocated = items.reduce((sum, item) => sum + (item.allocatedQty || 0), 0);
  const totalAvailable = items.reduce((sum, item) => sum + (item.availableQty || 0), 0);
  const remainingInStage = Math.max(0, totalAvailable - totalAllocated);
  const allocatedItems = items.filter((item) => item.allocatedQty > 0);
  const hasOverAllocation = items.some((item) => item.allocatedQty > item.availableQty);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-6 text-center space-y-2">
        <Layers className="h-8 w-8 text-slate-400 mx-auto" />
        <p className="text-sm font-bold text-slate-700">No Batches in {stageName}</p>
        <p className="text-xs text-slate-500">
          There are currently no inward batches with positive inventory sitting in {stageName}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <span>📦 Custom Multi-Room / Batch Allocation</span>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
              {items.length} {items.length === 1 ? 'batch available' : 'batches available'}
            </span>
          </label>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Specify the exact quantity to take from each storage room and batch.
          </p>
        </div>
        {allocatedItems.length > 0 && (
          <button
            type="button"
            onClick={() => items.forEach((it) => onAllocationChange(it.batch_id, ''))}
            disabled={disabled}
            className="text-[11px] font-bold text-slate-500 hover:text-rose-600 transition cursor-pointer"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Grid of Rectangle Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {items.map((item, idx) => {
          const isAllocated = item.allocatedQty > 0;
          const isOver = item.allocatedQty > item.availableQty;
          const remainingForBatch = item.availableQty - item.allocatedQty;
          const isEntireStock = item.allocatedQty === item.availableQty && item.availableQty > 0;
          const quarterQty = Math.floor(item.availableQty * 0.25);
          const halfQty = Math.floor(item.availableQty * 0.5);

          return (
            <div
              key={item.batch_id}
              className={`group relative rounded-2xl border-2 transition-all duration-200 p-4 ${
                isOver
                  ? 'border-rose-400 ring-2 ring-rose-200 bg-rose-50/40'
                  : isAllocated
                  ? themeStyles.activeBorder
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              {/* Header: Physical Room Pill + Batch Number + Receipt Date */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-black shadow-2xs ${themeStyles.badge}`}
                  >
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span>{item.location || 'Bay Unassigned'}</span>
                  </span>

                  <span className="inline-flex items-center gap-1 font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    <span>#{item.batch_no}</span>
                    <button
                      type="button"
                      onClick={(e) => handleCopy(e, item.batch_no, item.batch_id)}
                      className="text-slate-400 hover:text-slate-700 transition"
                      title="Copy batch #"
                    >
                      {copiedBatchId === item.batch_id ? (
                        <CheckCheck className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  <span>{formatDate(item.received_on)}</span>
                </div>
              </div>

              {/* Subheader: Supplier if available */}
              {item.supplier_name && (
                <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-2 truncate">
                  <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className="truncate">Supplier: {item.supplier_name}</span>
                </div>
              )}

              {/* Available Stock in Stage */}
              <div className="flex items-center justify-between text-xs py-2 border-y border-slate-100 mb-3">
                <span className="text-slate-600 font-semibold">Available in {stageName}:</span>
                <span className="font-mono font-black text-slate-900 text-sm">
                  {formatNumber(item.availableQty)} {unitLabel}
                </span>
              </div>

              {/* Allocation Input */}
              <div className="space-y-2">
                <div className="relative">
                  <input
                    id={`${componentId}-batch-${idx}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={item.availableQty}
                    value={item.allocatedQty > 0 ? String(item.allocatedQty) : ''}
                    onChange={(e) => onAllocationChange(item.batch_id, e.target.value)}
                    placeholder="0"
                    disabled={disabled}
                    className={`w-full rounded-xl border bg-white p-2.5 text-center font-mono text-base font-black text-slate-900 outline-none transition pr-12 ${
                      isOver
                        ? 'border-rose-400 ring-2 ring-rose-200 bg-rose-50/50'
                        : isAllocated
                        ? 'border-slate-400 ring-1 ring-slate-300'
                        : 'border-slate-300'
                    } ${themeStyles.focusRing}`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                    {unitLabel}
                  </span>
                </div>

                {/* Quick Presets Buttons */}
                <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    disabled={disabled || item.availableQty < 4}
                    onClick={() => onAllocationChange(item.batch_id, String(quarterQty))}
                    className="rounded-lg bg-slate-100 hover:bg-slate-200 py-1 text-[11px] font-bold text-slate-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={`Allocate 25% (${quarterQty} ${unitLabel})`}
                  >
                    25% ({quarterQty})
                  </button>
                  <button
                    type="button"
                    disabled={disabled || item.availableQty < 2}
                    onClick={() => onAllocationChange(item.batch_id, String(halfQty))}
                    className="rounded-lg bg-slate-100 hover:bg-slate-200 py-1 text-[11px] font-bold text-slate-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={`Allocate 50% (${halfQty} ${unitLabel})`}
                  >
                    50% ({halfQty})
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onAllocationChange(item.batch_id, String(item.availableQty))}
                    className={`rounded-lg py-1 text-[11px] font-bold transition cursor-pointer flex items-center justify-center gap-1 ${themeStyles.allBtn}`}
                    title={`Allocate 100% (${item.availableQty} ${unitLabel})`}
                  >
                    <Zap className="h-3 w-3 text-amber-400 shrink-0" />
                    <span>All ({formatNumber(item.availableQty)})</span>
                  </button>
                  <button
                    type="button"
                    disabled={disabled || item.allocatedQty === 0}
                    onClick={() => onAllocationChange(item.batch_id, '')}
                    className="rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 py-1 text-[11px] font-bold text-rose-700 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Clear
                  </button>
                </div>

                {/* Micro-Feedback */}
                <div className="min-h-5 pt-0.5 flex items-center justify-end text-[11px]">
                  {isOver ? (
                    <span className="font-bold text-rose-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span>Exceeds room stock by {formatNumber(item.allocatedQty - item.availableQty)} {unitLabel}</span>
                    </span>
                  ) : isEntireStock ? (
                    <span className="font-black text-emerald-700">
                      ✓ Clears entire room stock
                    </span>
                  ) : isAllocated ? (
                    <span className="font-bold text-emerald-700">
                      ✓ {formatNumber(remainingForBatch)} {unitLabel} will remain in {item.location || 'bay'}
                    </span>
                  ) : (
                    <span className="text-slate-400">0 allocated</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky Live Summary Bar */}
      <div
        className={`sticky bottom-0 z-10 rounded-xl border p-3.5 shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${themeStyles.summaryBorder}`}
      >
        <div className="space-y-1">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Total Allocated Across Rooms
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono text-lg font-black ${themeStyles.accentText}`}>
              {formatNumber(totalAllocated)} {unitLabel}
            </span>
            {allocatedItems.length > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {allocatedItems.map((item) => (
                    <span
                      key={item.batch_id}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${themeStyles.summaryBadge}`}
                    >
                      <span>{item.location || `#${item.batch_no}`}:</span>
                      <strong className="font-mono">{formatNumber(item.allocatedQty)}</strong>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
          <span className="text-xs font-bold text-slate-500">Remaining in {stageName}:</span>
          <span className="font-mono font-black text-slate-800 ml-1.5 text-sm">
            {formatNumber(remainingInStage)} {unitLabel}
          </span>
        </div>
      </div>

      {hasOverAllocation && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>One or more rooms have an allocated quantity exceeding available stock. Please reduce the quantity to proceed.</span>
        </div>
      )}
    </div>
  );
}
