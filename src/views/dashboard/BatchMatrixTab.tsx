import {
  AlertCircle, ChevronDown, ChevronRight, Maximize2, MapPin, Clock, Zap, Truck, History, ArrowRight
} from 'lucide-react';
import { Card, Button, Badge, ItemCategoryBadge, ColorBadge } from '@/components/ui';
import type { Stage } from '@/lib/supabase';
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
}: BatchMatrixTabProps) {
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
        <div className="overflow-x-auto">
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
                <th className="px-3 py-3 text-right font-black text-slate-900 min-w-[90px]">
                  Inward Total
                </th>
                {processStages.map((s) => (
                  <th
                    key={s.id}
                    className={`px-3 py-3 text-right min-w-[105px] ${
                      selectedStageId === s.id ? 'bg-amber-100 text-amber-950 font-black' : ''
                    }`}
                  >
                    {s.name}
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-black text-violet-900 min-w-[95px]">
                  Dispatched
                </th>
                <th className="px-4 py-3 text-right font-black text-emerald-900 bg-emerald-50/50 min-w-[110px]">
                  On-Floor Balance
                </th>
                <th className="px-4 py-3 min-w-[140px]">Customer Link</th>
                <th className="px-4 py-3 text-right min-w-[210px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredBatchMatrix.map((item) => {
                const isExpanded = expandedBatchIds.has(item.batch.id);

                return (
                  <tr key={item.batch.id} className="group hover:bg-slate-50/90 transition-colors">
                    {/* Expand Button */}
                    <td className="px-3 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => onToggleRowAccordion(item.batch.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-200 transition cursor-pointer"
                        title={isExpanded ? 'Collapse timeline' : 'Expand full timeline'}
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
                          <p className="font-extrabold text-slate-900 leading-tight">{item.batch.batch_no}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{formatDate(item.batch.received_on)}</p>
                        </div>
                      </div>
                    </td>

                    {/* Item Name, Category, Color & Components */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-slate-900">{item.batch.item?.name ?? '—'}</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ItemCategoryBadge category={item.batch.item?.category} />
                          <ColorBadge color={item.batch.color} />
                        </div>
                        {(item.batch.cap_item || item.batch.atomizer_item) && (
                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                            {item.batch.cap_item && (
                              <span className="text-[10px] font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200">
                                🧴 {item.batch.cap_item.name}
                              </span>
                            )}
                            {item.batch.atomizer_item && (
                              <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                                💨 {item.batch.atomizer_item.name}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Supplier */}
                    <td className="px-3 py-3.5 text-xs text-slate-600 font-medium">
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
                      {formatNumber(item.batch.qty_received)}
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
                          ) : (
                            '—'
                          )}
                        </td>
                      );
                    })}

                    {/* Dispatched */}
                    <td className="px-3 py-3.5 text-right font-black text-violet-800">
                      {item.dispatchedQty > 0 ? formatNumber(item.dispatchedQty) : '—'}
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

                    {/* Actions: Inspect 360° & Move/Ship */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
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

          {/* Expandable Accordion Rows */}
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

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                  {/* Movement History */}
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
                              <p className="text-[10px] text-slate-400">bottles moved</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Dispatch History */}
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
      )}
    </Card>
  );
}
