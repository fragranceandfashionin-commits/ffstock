import { useState, useMemo, useEffect } from 'react';
import {
  AlertCircle, ChevronDown, ChevronRight, ChevronLeft, Maximize2, MapPin, Clock, Zap, Truck, History, ArrowRight,
  ArrowRightLeft, Layers
} from 'lucide-react';
import { Card, Button, Badge, ItemCategoryBadge, ColorBadge } from '@/components/ui';
import type { Stage, BatchWithRelations } from '@/lib/supabase';
import type { BatchMatrixRow, InspectedBatchItem } from './types';
import { formatNumber, formatDate } from '@/lib/utils';

export type BatchMatrixTabProps = {
  filteredBatchMatrix: BatchMatrixRow[];
  processStages: Stage[];
  selectedStageId: string | 'ALL';
  expandedBatchIds: Set<string>;
  onToggleRowAccordion: (batchId: string) => void;
  onExpandAllRows: () => void;
  totalBatchesCount: number;
  activeFilterCount: number;
  onResetAllFilters: () => void;
  onSetZoomImageUrl: (data: { url: string; title: string; batchNo: string } | null) => void;
  onSetInspectedBatchItem: (item: InspectedBatchItem) => void;
  onOpenQuickModal: (batchId?: string, defaultTab?: 'move' | 'scrap' | 'dispatch') => void;
  onOpenAllocateModal?: (batch: BatchWithRelations) => void;
};

export function BatchMatrixTab({
  filteredBatchMatrix,
  processStages,
  selectedStageId,
  expandedBatchIds,
  onToggleRowAccordion,
  onExpandAllRows,
  totalBatchesCount,
  activeFilterCount,
  onResetAllFilters,
  onSetZoomImageUrl,
  onSetInspectedBatchItem,
  onOpenQuickModal,
  onOpenAllocateModal,
}: BatchMatrixTabProps) {
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredBatchMatrix.length, selectedStageId]);

  const totalBatches = filteredBatchMatrix.length;
  const effectivePageSize = pageSize === -1 ? totalBatches : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalBatches / (effectivePageSize || 1)));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = (safePage - 1) * effectivePageSize;
  const paginatedBatchMatrix = useMemo(() => {
    if (pageSize === -1) return filteredBatchMatrix;
    return filteredBatchMatrix.slice(startIndex, startIndex + effectivePageSize);
  }, [filteredBatchMatrix, startIndex, effectivePageSize, pageSize]);

  const renderPagination = (isTop: boolean = false) => {
    if (totalBatches === 0) return null;

    return (
      <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-slate-50 ${isTop ? 'border-b' : 'border-t'} border-slate-200 text-xs font-semibold text-slate-700`}>
        <div className="flex items-center gap-2">
          <span>Show:</span>
          {[25, 50, 100, -1].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                pageSize === size
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {size === -1 ? 'All' : size}
            </button>
          ))}
          <span className="text-slate-400 ml-1">
            ({totalBatches === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + effectivePageSize, totalBatches)} of {totalBatches})
          </span>
        </div>

        {pageSize !== -1 && totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2 text-xs font-bold"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
              Prev
            </Button>
            <span className="px-2 font-bold text-slate-800">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-2 text-xs font-bold"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="p-0 overflow-hidden border-slate-200 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-5 py-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-slate-900">
              Batch 360° Comprehensive Journey Matrix
            </h2>
            <Badge label={`${filteredBatchMatrix.length} batches shown`} variant="default" size="sm" />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Exact balance of every batch across every manufacturing stage, customer dispatches, batch aging days, and on-floor status. Click any row to expand chronological audit ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExpandAllRows}
            className="text-xs font-bold text-slate-700 cursor-pointer"
          >
            {expandedBatchIds.size === totalBatchesCount ? 'Collapse All Rows' : 'Expand All Timelines'}
          </Button>
        </div>
      </div>

      {renderPagination(true)}

      {filteredBatchMatrix.length === 0 ? (
        <div className="p-12 text-center text-sm text-slate-500">
          <AlertCircle className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <p className="font-bold text-slate-700">No batches match the active filters.</p>
          <p className="text-xs text-slate-400 mt-1">Try clearing filters or changing search query.</p>
          {activeFilterCount > 0 && (
            <Button variant="outline" size="sm" onClick={onResetAllFilters} className="mt-3 text-xs cursor-pointer">
              Reset All Filters
            </Button>
          )}
        </div>
      ) : (
        <div>
          {/* ─── Mobile View: Card-Based Batch Matrix (< sm) ─── */}
          <div className="p-3.5 space-y-3 sm:hidden">
            {paginatedBatchMatrix.map((item) => {
              const isExpanded = expandedBatchIds.has(item.batch.id);
              const activeStagesList = processStages
                .map((s) => ({ stage: s, qty: item.stageQuantities[s.id] ?? 0 }))
                .filter((sq) => sq.qty > 0);

              return (
                <div
                  key={`mobile-batch-${item.batch.id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3 transition-all"
                >
                  {/* Top Bar: Thumbnail, Batch No, Category & Age */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {item.batch.image_url ? (
                        <button
                          type="button"
                          onClick={() =>
                            onSetZoomImageUrl({
                              url: item.batch.image_url!,
                              title: item.batch.item?.name ?? 'Shipment Photo',
                              batchNo: item.batch.batch_no,
                            })
                          }
                          className="relative group/img shrink-0 cursor-pointer"
                          title="Click to enlarge photo"
                        >
                          <img
                            src={item.batch.image_url}
                            alt={item.batch.batch_no}
                            className="h-12 w-12 rounded-xl object-cover border border-slate-200 shadow-2xs"
                          />
                          <div className="absolute inset-0 bg-black/30 rounded-xl flex items-center justify-center">
                            <Maximize2 className="h-3.5 w-3.5 text-white" />
                          </div>
                        </button>
                      ) : (
                        <div className="h-12 w-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                          IMG
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.batch.brand_name && (
                            <span className="font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md text-xs">
                              🏢 {item.batch.brand_name}
                            </span>
                          )}
                          <span className="font-black text-slate-900 font-mono text-sm tracking-tight">
                            {item.batch.batch_no}
                          </span>
                          <ItemCategoryBadge category={item.batch.item?.category} />
                          <ColorBadge color={item.batch.color} />
                          {item.allocatedOutQty > 0 && (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded text-[10px]">
                              <ArrowRightLeft className="h-2.5 w-2.5 text-amber-600" />
                              -{formatNumber(item.allocatedOutQty)} Alloc
                            </span>
                          )}
                          {item.allocatedInQty > 0 && (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 rounded text-[10px]">
                              <ArrowRightLeft className="h-2.5 w-2.5 text-emerald-600" />
                              +{formatNumber(item.allocatedInQty)} Recv
                            </span>
                          )}
                          {item.isComponentBatch && (
                            <span className="inline-flex items-center gap-1 font-bold text-violet-900 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded text-[10px]">
                              🔩 {item.componentTypeLabel || 'Component'}
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-slate-800 text-xs mt-0.5 leading-snug">
                          {item.batch.item?.name ?? '—'}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          🏢 {item.batch.supplier?.name ?? '—'}
                        </p>
                      </div>
                    </div>

                    {/* Age & Location Tag */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          item.isStalled
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : item.ageInDays <= 2
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {item.ageInDays === 0 ? 'Today' : `${item.ageInDays}d`}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                        <MapPin className="h-2.5 w-2.5 text-slate-400" />
                        {item.batch.location}
                      </span>
                    </div>
                  </div>

                  {/* Quantity Matrix Summary (3 Cols) */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500">Inwarded</p>
                      <p className="font-black text-slate-900 text-sm mt-0.5">
                        {formatNumber(item.batch.qty_received)}
                      </p>
                      {(item.allocatedOutQty > 0 || item.allocatedInQty > 0) && (
                        <p className="text-[10px] font-bold text-amber-700 mt-0.5">
                          Net: {formatNumber(item.netReceivedQty)}
                        </p>
                      )}
                    </div>
                    <div className="border-x border-slate-200">
                      <p className="text-[10px] uppercase font-black text-emerald-800">On-Floor</p>
                      <p className="font-black text-emerald-700 text-sm mt-0.5">
                        {formatNumber(item.inFactoryQty)}
                      </p>
                      <p className="text-[9px] text-slate-500 font-medium">Raw: {formatNumber(item.rawStockQty)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-black text-violet-800">Shipped</p>
                      <p className="font-black text-violet-700 text-sm mt-0.5">
                        {item.dispatchedQty > 0 ? formatNumber(item.dispatchedQty) : '0'}
                      </p>
                      {item.isComponentBatch && (
                        <p className="text-[9px] text-violet-600 font-medium">BOM Fitted</p>
                      )}
                    </div>
                  </div>

                  {/* Active Stages Breakdown Chips */}
                  {activeStagesList.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">
                        Stock in Production Stages:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {activeStagesList.map(({ stage, qty }) => (
                          <span
                            key={`mobile-stage-${stage.id}`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold border ${
                              selectedStageId === stage.id
                                ? 'bg-amber-100 text-amber-950 border-amber-300 ring-1 ring-amber-300'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                            }`}
                          >
                            <span>{stage.name}:</span>
                            <strong className="font-black">{formatNumber(qty)}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Customer Orders Links if any */}
                  {item.customerNames.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[10px] font-bold text-slate-400">Shipped to:</span>
                      {item.customerNames.map((c) => (
                        <span
                          key={c}
                          className="rounded bg-violet-50 border border-violet-200 text-violet-800 text-[10px] font-bold px-1.5 py-0.5"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => onToggleRowAccordion(item.batch.id)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 py-1.5 px-2 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronDown className="h-3.5 w-3.5 text-slate-900 font-bold" />
                          <span>Hide Timeline</span>
                        </>
                      ) : (
                        <>
                          <ChevronRight className="h-3.5 w-3.5" />
                          <span>Timeline ({item.movements.length + item.dispatches.length + item.allocationsOut.length + item.allocationsIn.length})</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-1.5">
                      {onOpenAllocateModal && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenAllocateModal(item.batch)}
                          className="text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border-teal-200 min-h-[36px] px-2"
                          title="Allocate stock"
                        >
                          <ArrowRightLeft className="h-3 w-3 text-teal-600" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSetInspectedBatchItem(item)}
                        className="text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border-slate-300 min-h-[36px]"
                      >
                        <Maximize2 className="h-3 w-3 text-slate-600 mr-1" />
                        Inspect
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenQuickModal(item.batch.id)}
                        className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200 min-h-[36px]"
                      >
                        <Zap className="h-3 w-3 text-indigo-600 mr-1" />
                        Move / Ship
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Timeline inside Card on Mobile */}
                  {isExpanded && (
                    <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-3 animate-in fade-in duration-150 mt-2">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-black text-amber-400 font-mono">
                          {item.batch.batch_no} History
                        </span>
                        <div className="flex gap-1.5">
                          {onOpenAllocateModal && (
                            <button
                              type="button"
                              onClick={() => onOpenAllocateModal(item.batch)}
                              className="px-2 py-1 text-[11px] font-bold bg-teal-700 text-white rounded-md cursor-pointer"
                            >
                              ⇄ Alloc
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenQuickModal(item.batch.id, 'move')}
                            className="px-2 py-1 text-[11px] font-bold bg-indigo-600 text-white rounded-md cursor-pointer"
                          >
                            + Move
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenQuickModal(item.batch.id, 'dispatch')}
                            className="px-2 py-1 text-[11px] font-bold bg-violet-600 text-white rounded-md cursor-pointer"
                          >
                            + Ship
                          </button>
                        </div>
                      </div>

                      {/* Reconciliation Equation Bar */}
                      <div className="p-2.5 rounded-lg bg-slate-800/90 border border-slate-700 text-[11px] font-mono space-y-1">
                        <div className="text-amber-400 font-bold uppercase text-[10px] flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          Stock Reconciliation:
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-slate-300 font-semibold">
                          <span>Intake: {formatNumber(item.batch.qty_received)}</span>
                          {item.allocatedOutQty > 0 && <span className="text-amber-400">-{formatNumber(item.allocatedOutQty)} alloc</span>}
                          {item.allocatedInQty > 0 && <span className="text-emerald-400">+{formatNumber(item.allocatedInQty)} recv</span>}
                          <span>= Net: <strong className="text-indigo-300">{formatNumber(item.netReceivedQty)}</strong></span>
                        </div>
                        <div className="text-[10px] text-slate-400 pt-0.5 border-t border-slate-700 flex flex-wrap gap-2">
                          <span>Raw: <strong className="text-emerald-300">{formatNumber(item.rawStockQty)}</strong></span>
                          <span>WIP: <strong className="text-amber-300">{formatNumber(item.wipQty)}</strong></span>
                          <span>Ready: <strong className="text-sky-300">{formatNumber(item.readyQty)}</strong></span>
                          <span>Dispatched: <strong className="text-violet-300">{formatNumber(item.dispatchedQty)}</strong></span>
                        </div>
                      </div>

                      {/* Stock Allocations History if any */}
                      {(item.allocationsOut.length > 0 || item.allocationsIn.length > 0) && (
                        <div className="space-y-1.5 border-t border-slate-800 pt-2">
                          <p className="text-[10px] font-bold uppercase text-teal-400 flex items-center gap-1">
                            <ArrowRightLeft className="h-3 w-3 text-teal-400" />
                            Stock Allocations ({item.allocationsOut.length + item.allocationsIn.length})
                          </p>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {item.allocationsOut.map((a) => (
                              <div
                                key={a.id}
                                className="p-2 rounded-lg bg-slate-800 border border-amber-900/60 text-xs flex justify-between items-center"
                              >
                                <div>
                                  <div className="flex items-center gap-1 font-bold text-amber-300">
                                    <span>Allocated Out ➔ {a.destination_batch?.batch_no || 'Dest'}</span>
                                  </div>
                                  <p className="text-[10px] text-slate-400">{formatDate(a.allocated_on)} {a.allocated_by ? `• by ${a.allocated_by}` : ''} {a.remarks ? `• "${a.remarks}"` : ''}</p>
                                </div>
                                <span className="font-extrabold text-amber-400 text-xs">
                                  -{formatNumber(a.qty)} pcs
                                </span>
                              </div>
                            ))}
                            {item.allocationsIn.map((a) => (
                              <div
                                key={a.id}
                                className="p-2 rounded-lg bg-slate-800 border border-emerald-900/60 text-xs flex justify-between items-center"
                              >
                                <div>
                                  <div className="flex items-center gap-1 font-bold text-emerald-300">
                                    <span>Received In ➔ from {a.source_batch?.batch_no || 'Source'}</span>
                                  </div>
                                  <p className="text-[10px] text-slate-400">{formatDate(a.allocated_on)} {a.allocated_by ? `• by ${a.allocated_by}` : ''} {a.remarks ? `• "${a.remarks}"` : ''}</p>
                                </div>
                                <span className="font-extrabold text-emerald-400 text-xs">
                                  +{formatNumber(a.qty)} pcs
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Movement History */}
                      <div className="space-y-1.5 border-t border-slate-800 pt-2">
                        <p className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                          <History className="h-3 w-3 text-indigo-400" />
                          Stage Movements ({item.movements.length})
                        </p>
                        {item.movements.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">No transitions yet. In Raw Stock.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {item.movements.map((m) => (
                              <div
                                key={m.id}
                                className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-xs flex justify-between items-center"
                              >
                                <div>
                                  <div className="flex items-center gap-1.5 font-bold text-slate-200">
                                    <span>{m.from_stage?.name ?? '—'}</span>
                                    <ArrowRight className="h-2.5 w-2.5 text-indigo-400" />
                                    <span className="text-amber-400">{m.to_stage?.name ?? '—'}</span>
                                  </div>
                                  <p className="text-[10px] text-slate-400">{formatDate(m.moved_on)}</p>
                                </div>
                                <span className="font-extrabold text-emerald-400 text-xs">
                                  {formatNumber(m.qty_moved)} pcs
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Dispatches */}
                      {item.dispatches.length > 0 && (
                        <div className="space-y-1.5 border-t border-slate-800 pt-2">
                          <p className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                            <Truck className="h-3 w-3 text-violet-400" />
                            Shipments ({item.dispatches.length})
                          </p>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {item.dispatches.map((d) => (
                              <div
                                key={d.id}
                                className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-xs flex justify-between items-center"
                              >
                                <div>
                                  <p className="font-bold text-white">{d.customer_name}</p>
                                  <p className="text-[10px] text-slate-400">Inv #{d.invoice_no}</p>
                                </div>
                                <span className="font-extrabold text-violet-400 text-xs">
                                  {formatNumber(d.qty)} pcs
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ─── Desktop View: Full 13+ Column Matrix (>= sm) ─── */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-100 text-left text-xs font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 select-none">
                <tr>
                  <th className="px-3 py-3 w-10 text-center">#</th>
                  <th className="px-4 py-3 sticky left-0 z-20 bg-slate-100 sticky-col-shadow min-w-[180px]">
                    Brand / Batch
                  </th>
                  <th className="px-4 py-3 min-w-[150px]">Stock Item & Category</th>
                  <th className="px-3 py-3 min-w-[120px]">Supplier</th>
                  <th className="px-3 py-3 min-w-[80px]">Rack</th>
                  <th className="px-3 py-3 text-center min-w-[90px]">Floor Aging</th>
                  <th className="px-3 py-3 text-right font-black text-slate-900 min-w-[100px]" title="Gross intake units received into warehouse">
                    Inward Total
                  </th>
                  {processStages.map((s) => (
                    <th
                      key={s.id}
                      className={`px-3 py-3 text-right min-w-[105px] ${
                        selectedStageId === s.id ? 'bg-amber-100 text-amber-950 font-black' : ''
                      }`}
                      title={s.name === 'Raw Stock' ? 'Virgin unconverted units remaining in storage rack (Intake - Allocations Out + In - Moved)' : undefined}
                    >
                      {s.name}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-black text-violet-900 min-w-[95px]" title="Finished units shipped to customers with invoices">
                    Dispatched
                  </th>
                  <th className="px-4 py-3 text-right font-black text-emerald-900 bg-emerald-50/50 min-w-[110px]" title="Live physical stock inside factory = Raw + In Production (WIP) + Ready">
                    On-Floor Balance
                  </th>
                  <th className="px-4 py-3 min-w-[140px]">Customer Link</th>
                  <th className="px-4 py-3 text-right min-w-[240px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedBatchMatrix.map((item) => {
                  const isExpanded = expandedBatchIds.has(item.batch.id);

                  return (
                    <tr key={item.batch.id} className="group hover:bg-slate-50/90 transition-colors">
                      {/* Expand Button */}
                      <td className="px-3 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => onToggleRowAccordion(item.batch.id)}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-200 transition cursor-pointer mx-auto"
                          title={isExpanded ? 'Collapse timeline' : 'Expand full timeline'}
                          aria-label={isExpanded ? 'Collapse timeline' : 'Expand full timeline'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-slate-900 font-bold" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>

                      {/* Sticky Column: Batch No & Thumbnail */}
                      <td className="px-4 py-3.5 font-bold text-slate-900 sticky left-0 z-10 bg-white group-hover:bg-slate-50 sticky-col-shadow">
                        <div className="flex items-center gap-2.5">
                          {item.batch.image_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                onSetZoomImageUrl({
                                  url: item.batch.image_url!,
                                  title: item.batch.item?.name ?? 'Shipment Photo',
                                  batchNo: item.batch.batch_no,
                                })
                              }
                              className="relative group/img shrink-0 cursor-pointer"
                              title="Click to enlarge"
                            >
                              <img
                                src={item.batch.image_url}
                                alt={item.batch.batch_no}
                                className="h-8 w-8 rounded-lg object-cover border border-slate-200 shadow-2xs group-hover/img:scale-105 transition"
                              />
                              <div className="absolute inset-0 bg-black/30 rounded-lg opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition">
                                <Maximize2 className="h-3 w-3 text-white" />
                              </div>
                            </button>
                          ) : (
                            <div className="h-8 w-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                              IMG
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.batch.brand_name && (
                                <span className="font-black text-indigo-900 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded text-[11px] leading-tight">
                                  🏢 {item.batch.brand_name}
                                </span>
                              )}
                              <span className="font-mono font-black">{item.batch.batch_no}</span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <ColorBadge color={item.batch.color} />
                              {item.allocatedOutQty > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] leading-tight"
                                  title={`Allocated ${formatNumber(item.allocatedOutQty)} pcs to other batches`}
                                >
                                  <ArrowRightLeft className="h-2.5 w-2.5 text-amber-600" />
                                  -{formatNumber(item.allocatedOutQty)} Alloc
                                </span>
                              )}
                              {item.allocatedInQty > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 rounded text-[10px] leading-tight"
                                  title={`Received ${formatNumber(item.allocatedInQty)} pcs from other batches`}
                                >
                                  <ArrowRightLeft className="h-2.5 w-2.5 text-emerald-600" />
                                  +{formatNumber(item.allocatedInQty)} Recv
                                </span>
                              )}
                              {item.isComponentBatch && (
                                <span
                                  className="inline-flex items-center gap-1 font-bold text-violet-900 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded text-[10px] leading-tight"
                                  title={`${item.componentTypeLabel || 'Component'}: fitted on dispatches`}
                                >
                                  🔩 {item.componentTypeLabel || 'Component'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Stock Item & Category */}
                      <td className="px-4 py-3.5 font-bold text-slate-900">
                        <div className="flex flex-col">
                          <span>{item.batch.item?.name ?? '—'}</span>
                          <div className="mt-0.5">
                            <ItemCategoryBadge category={item.batch.item?.category} />
                          </div>
                        </div>
                      </td>

                      {/* Supplier */}
                      <td className="px-3 py-3.5 text-slate-700">
                        {item.batch.supplier?.name ?? '—'}
                      </td>

                      {/* Rack Location */}
                      <td className="px-3 py-3.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          {item.batch.location}
                        </span>
                      </td>

                      {/* Floor Aging Badge */}
                      <td className="px-3 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            item.isStalled
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : item.ageInDays <= 2
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          {item.ageInDays === 0 ? 'Today' : `${item.ageInDays}d`}
                        </span>
                      </td>

                      {/* Inward Total */}
                      <td className="px-3 py-3.5 text-right font-black text-slate-900">
                        <div>{formatNumber(item.batch.qty_received)}</div>
                        {(item.allocatedOutQty > 0 || item.allocatedInQty > 0) && (
                          <div className="text-[10px] font-bold mt-0.5">
                            {item.allocatedOutQty > 0 && (
                              <span className="text-amber-800 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded inline-block mr-0.5" title="Allocated Out">
                                -{formatNumber(item.allocatedOutQty)}
                              </span>
                            )}
                            {item.allocatedInQty > 0 && (
                              <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded inline-block mr-0.5" title="Allocated In">
                                +{formatNumber(item.allocatedInQty)}
                              </span>
                            )}
                            <span className="text-slate-500 font-semibold block text-[9px]">
                              net: {formatNumber(item.netReceivedQty)}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Stage Columns */}
                      {processStages.map((s) => {
                        const qty = item.stageQuantities[s.id] ?? 0;

                        return (
                          <td
                            key={s.id}
                            className={`px-3 py-3.5 text-right font-bold transition-colors ${
                              qty > 0
                                ? 'text-slate-900 bg-emerald-50/40'
                                : 'text-slate-300'
                            } ${selectedStageId === s.id ? 'bg-amber-100/70 text-amber-950 font-black' : ''}`}
                          >
                            {qty > 0 ? (
                              <span className="font-black text-slate-900">{formatNumber(qty)}</span>
                            ) : item.isComponentBatch && s.name !== 'Raw Stock' ? (
                              <span className="text-slate-300 text-xs" title="Component fitted on assembly/dispatch directly">—</span>
                            ) : (
                              '—'
                            )}
                          </td>
                        );
                      })}

                      {/* Dispatched */}
                      <td className="px-3 py-3.5 text-right font-black text-violet-800">
                        {item.dispatchedQty > 0 ? (
                          <div>
                            <span>{formatNumber(item.dispatchedQty)}</span>
                            {item.isComponentBatch && (
                              <span className="block text-[9px] font-medium text-violet-600">BOM Fitted</span>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Factory Balance */}
                      <td className="px-4 py-3.5 text-right font-black text-emerald-800 bg-emerald-50/50 text-base">
                        {formatNumber(item.inFactoryQty)}
                      </td>

                      {/* Customer Link */}
                      <td className="px-4 py-3.5">
                        {item.customerNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.customerNames.map((c) => (
                              <span
                                key={c}
                                className="rounded bg-violet-100 border border-violet-200 text-violet-800 text-[10px] font-bold px-1.5 py-0.5"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No shipments yet</span>
                        )}
                      </td>

                      {/* Actions: Allocate, Inspect 360° & Move/Ship */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onOpenAllocateModal && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onOpenAllocateModal(item.batch)}
                              className="text-xs font-bold text-teal-800 bg-teal-50/70 hover:bg-teal-100 border-teal-300 shadow-2xs cursor-pointer inline-flex items-center"
                              title="Allocate stock from this batch to another batch"
                            >
                              <ArrowRightLeft className="h-3 w-3 text-teal-600 mr-1" />
                              Allocate
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onSetInspectedBatchItem(item)}
                            className="text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border-slate-300 shadow-2xs cursor-pointer"
                            title="Inspect full 360° Batch Journey, BOM specs, stages and shipments"
                          >
                            <Maximize2 className="h-3 w-3 text-slate-600 mr-1" />
                            Inspect 360°
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenQuickModal(item.batch.id)}
                            className="text-xs font-bold text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 border-indigo-200 cursor-pointer"
                          >
                            <Zap className="h-3 w-3 text-indigo-600" />
                            Move / Ship
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Expandable Accordion Rows (Desktop) */}
            {filteredBatchMatrix
              .filter((item) => expandedBatchIds.has(item.batch.id))
              .map((item) => (
                <div
                  key={`accordion-${item.batch.id}`}
                  className="p-5 bg-slate-900 text-white border-y border-slate-700 animate-in fade-in duration-150"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
                      <div>
                        <h4 className="text-base font-black flex items-center gap-2">
                          Batch Audit Ledger: <span className="text-amber-400">{item.batch.batch_no}</span>
                          <span className="text-xs font-normal text-slate-400">
                            ({item.batch.item?.name ?? '—'} from {item.batch.supplier?.name ?? '—'})
                          </span>
                        </h4>
                        <p className="text-xs text-slate-400">
                          Received {formatNumber(item.batch.qty_received)} units on {formatDate(item.batch.received_on)} ({item.ageInDays} days on floor) • Storage Rack: {item.batch.location}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {onOpenAllocateModal && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onOpenAllocateModal(item.batch)}
                          className="text-xs font-bold bg-teal-700 hover:bg-teal-600 text-white border-none cursor-pointer"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          Allocate Stock
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onOpenQuickModal(item.batch.id, 'move')}
                        className="text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white border-none cursor-pointer"
                      >
                        <Zap className="h-3.5 w-3.5 text-amber-300" />
                        Record Stage Movement
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onOpenQuickModal(item.batch.id, 'dispatch')}
                        className="text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white border-none cursor-pointer"
                      >
                        <Truck className="h-3.5 w-3.5" />
                        Record Dispatch
                      </Button>
                    </div>
                  </div>

                  {/* 5-Pillar Reconciliation Equation Bar */}
                  <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 text-xs text-slate-200 mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 pb-2 mb-2">
                      <span className="font-black text-amber-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-amber-400" />
                        Batch Lifecycle Reconciliation Equation
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Mathematical Proof: Intake - Allocations Out + In = Net Available = Raw + WIP + Ready + Dispatched
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold">
                      <span className="px-2 py-1 bg-slate-900 rounded border border-slate-700 text-white">
                        Intake: {formatNumber(item.batch.qty_received)}
                      </span>
                      {item.allocatedOutQty > 0 && (
                        <span className="px-2 py-1 bg-amber-950/80 text-amber-300 rounded border border-amber-800">
                          - Alloc Out: {formatNumber(item.allocatedOutQty)}
                        </span>
                      )}
                      {item.allocatedInQty > 0 && (
                        <span className="px-2 py-1 bg-emerald-950/80 text-emerald-300 rounded border border-emerald-800">
                          + Alloc In: {formatNumber(item.allocatedInQty)}
                        </span>
                      )}
                      <span className="text-slate-400">=</span>
                      <span className="px-2 py-1 bg-indigo-950/80 text-indigo-300 rounded border border-indigo-700 font-black">
                        Net Available: {formatNumber(item.netReceivedQty)}
                      </span>
                      <span className="text-slate-400">➔</span>
                      <span className="px-2 py-1 bg-slate-900 text-emerald-300 rounded border border-emerald-800">
                        Raw Stock: {formatNumber(item.rawStockQty)}
                      </span>
                      <span className="px-2 py-1 bg-slate-900 text-amber-300 rounded border border-amber-800">
                        WIP: {formatNumber(item.wipQty)}
                      </span>
                      <span className="px-2 py-1 bg-slate-900 text-sky-300 rounded border border-sky-800">
                        Ready: {formatNumber(item.readyQty)}
                      </span>
                      <span className="px-2 py-1 bg-slate-900 text-violet-300 rounded border border-violet-800">
                        Dispatched: {formatNumber(item.dispatchedQty)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-4">
                    {/* Column 1: Movement History */}
                    <div className="space-y-2">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <History className="h-4 w-4 text-indigo-400" />
                        Stage Transition Timeline ({item.movements.length})
                      </h5>
                      {item.movements.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-2">
                          No stage transitions recorded yet. Entire batch is currently in Raw Stock.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {item.movements.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs"
                            >
                              <div>
                                <div className="flex items-center gap-2 font-bold text-slate-200">
                                  <span>{m.from_stage?.name ?? '—'}</span>
                                  <ArrowRight className="h-3 w-3 text-indigo-400" />
                                  <span className="text-amber-400">{m.to_stage?.name ?? '—'}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {formatDate(m.moved_on)} {m.done_by ? `• by ${m.done_by}` : ''} {m.remarks ? `• "${m.remarks}"` : ''}
                                </p>
                                {(m.cap_name || m.atomizer_name) && (
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    {m.cap_name && (
                                      <span className="inline-flex items-center gap-1 rounded bg-violet-900/60 px-1.5 py-0.5 text-[9px] font-bold text-violet-300 border border-violet-700">
                                        🧴 Cap: {m.cap_name}
                                      </span>
                                    )}
                                    {m.atomizer_name && (
                                      <span className="inline-flex items-center gap-1 rounded bg-sky-900/60 px-1.5 py-0.5 text-[9px] font-bold text-sky-300 border border-sky-700">
                                        💨 Atomizer: {m.atomizer_name}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <span className="font-extrabold text-emerald-400 text-sm">
                                  {formatNumber(m.qty_moved)}
                                </span>
                                <p className="text-[10px] text-slate-400">units moved</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Column 2: Stock Allocations History */}
                    <div className="space-y-2">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                        <ArrowRightLeft className="h-4 w-4 text-teal-400" />
                        Stock Allocations ({item.allocationsOut.length + item.allocationsIn.length})
                      </h5>
                      {item.allocationsOut.length === 0 && item.allocationsIn.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-2">
                          No stock transfers or allocations recorded for this batch.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {item.allocationsOut.map((a) => (
                            <div
                              key={a.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-amber-900/60 text-xs"
                            >
                              <div>
                                <div className="flex items-center gap-1 font-bold text-amber-300">
                                  <span>Allocated Out ➔ Batch {a.destination_batch?.batch_no || 'Destination'}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {formatDate(a.allocated_on)} {a.allocated_by ? `• by ${a.allocated_by}` : ''} {a.remarks ? `• "${a.remarks}"` : ''}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="font-extrabold text-amber-400 text-sm">
                                  -{formatNumber(a.qty)}
                                </span>
                                <p className="text-[10px] text-slate-400">pcs allocated</p>
                              </div>
                            </div>
                          ))}
                          {item.allocationsIn.map((a) => (
                            <div
                              key={a.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-emerald-900/60 text-xs"
                            >
                              <div>
                                <div className="flex items-center gap-1 font-bold text-emerald-300">
                                  <span>Received In ➔ from Batch {a.source_batch?.batch_no || 'Source'}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {formatDate(a.allocated_on)} {a.allocated_by ? `• by ${a.allocated_by}` : ''} {a.remarks ? `• "${a.remarks}"` : ''}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="font-extrabold text-emerald-400 text-sm">
                                  +{formatNumber(a.qty)}
                                </span>
                                <p className="text-[10px] text-slate-400">pcs received</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Column 3: Dispatch History */}
                    <div className="space-y-2">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Truck className="h-4 w-4 text-violet-400" />
                        Customer Shipments & Invoices ({item.dispatches.length})
                      </h5>
                      {item.dispatches.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-2">
                          No finished goods dispatched to clients yet from this batch.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {item.dispatches.map((d) => (
                            <div
                              key={d.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs"
                            >
                              <div>
                                <p className="font-extrabold text-white">{d.customer_name}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  Invoice: <span className="font-semibold text-slate-300">{d.invoice_no}</span> • {formatDate(d.dispatched_on)}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="font-extrabold text-violet-400 text-sm">
                                  {formatNumber(d.qty)}
                                </span>
                                <p className="text-[10px] text-slate-400">units shipped</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
      {renderPagination(false)}
    </Card>
  );
}
