import {
  Box, Maximize2, Clock, Truck, AlertTriangle, CheckCircle, TrendingUp, PackageCheck, Layers,
  History, ArrowRight, Zap, Flame, Printer, ArrowRightLeft
} from 'lucide-react';
import { Modal, Button, ItemCategoryBadge, ColorBadge, PrintingBadge } from '@/components/ui';
import type { Stage, BatchWithRelations, Dispatch } from '@/lib/supabase';
import type { InspectedBatchItem } from './types';
import { formatNumber, formatDate } from '@/lib/utils';

export type BatchInspectionModalProps = {
  inspectedBatchItem: InspectedBatchItem | null;
  onClose: () => void;
  stages: Stage[];
  processStages: Stage[];
  onSetZoomImageUrl: (data: { url: string; title: string; batchNo: string } | null) => void;
  onOpenQuickModal: (batchId?: string, defaultTab?: 'move' | 'scrap' | 'dispatch') => void;
  onOpenChallanModal: (
    d: Dispatch & { batch?: BatchWithRelations; batchNo?: string; itemName?: string; supplierName?: string }
  ) => void;
  onOpenAllocateModal?: (batch: BatchWithRelations) => void;
};

export function BatchInspectionModal({
  inspectedBatchItem,
  onClose,
  processStages,
  onSetZoomImageUrl,
  onOpenQuickModal,
  onOpenChallanModal,
  onOpenAllocateModal,
}: BatchInspectionModalProps) {
  if (!inspectedBatchItem) return null;

  return (
    <Modal
      isOpen={Boolean(inspectedBatchItem)}
      onClose={onClose}
      title={`Batch Details: ${inspectedBatchItem.batch.brand_name ? `[${inspectedBatchItem.batch.brand_name}] ` : ''}${inspectedBatchItem.batch.batch_no} [${inspectedBatchItem.batch.item?.name ?? '—'}]`}
      maxWidthClass="max-w-5xl"
    >
      <div className="space-y-5">
        {/* Batch Master Header Strip */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900 text-white p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-3.5">
            {inspectedBatchItem.batch.image_url ? (
              <button
                type="button"
                onClick={() =>
                  onSetZoomImageUrl({
                    url: inspectedBatchItem.batch.image_url!,
                    title: inspectedBatchItem.batch.item?.name ?? 'Shipment Photo',
                    batchNo: inspectedBatchItem.batch.batch_no,
                  })
                }
                className="relative group shrink-0 cursor-pointer"
                title="Click to enlarge"
              >
                <img
                  src={inspectedBatchItem.batch.image_url}
                  alt={inspectedBatchItem.batch.batch_no}
                  className="h-14 w-14 rounded-xl object-cover border border-slate-700 shadow-md group-hover:scale-105 transition"
                />
                <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                  <Maximize2 className="h-4 w-4 text-white" />
                </div>
              </button>
            ) : (
              <div className="h-14 w-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                <Box className="h-6 w-6 text-slate-500" />
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {inspectedBatchItem.batch.brand_name && (
                  <span className="text-xs font-black text-indigo-300 bg-indigo-950/80 px-2.5 py-1 rounded-lg border border-indigo-700 shadow-2xs">
                    🏢 {inspectedBatchItem.batch.brand_name}
                  </span>
                )}
                <span className="text-lg font-black text-amber-400 font-mono tracking-tight">
                  {inspectedBatchItem.batch.batch_no}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-300 border border-slate-700">
                  {inspectedBatchItem.batch.item?.name ?? '—'}
                </span>
                <ItemCategoryBadge category={inspectedBatchItem.batch.item?.category} />
                <ColorBadge color={inspectedBatchItem.batch.color} />
                {inspectedBatchItem.allocatedOutQty > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-lg border border-amber-700 shadow-2xs">
                    <ArrowRightLeft className="h-3 w-3" />
                    -{formatNumber(inspectedBatchItem.allocatedOutQty)} Allocated
                  </span>
                )}
                {inspectedBatchItem.allocatedInQty > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-lg border border-emerald-700 shadow-2xs">
                    <ArrowRightLeft className="h-3 w-3" />
                    +{formatNumber(inspectedBatchItem.allocatedInQty)} Received
                  </span>
                )}
                {inspectedBatchItem.isComponentBatch && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-300 bg-violet-950/80 px-2 py-0.5 rounded-lg border border-violet-700 shadow-2xs">
                    🔩 {inspectedBatchItem.componentTypeLabel || 'Component Batch'}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span>
                  Supplier: <strong className="text-white">{inspectedBatchItem.batch.supplier?.name ?? '—'}</strong>
                </span>
                <span>•</span>
                <span>
                  Storage Bay: <strong className="text-white">{inspectedBatchItem.batch.location}</strong>
                </span>
                <span>•</span>
                <span>
                  Inward: <strong className="text-white">{formatDate(inspectedBatchItem.batch.received_on)}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-amber-400" />
                  Age:{' '}
                  <strong className={inspectedBatchItem.isStalled ? 'text-rose-400 font-black' : 'text-emerald-400'}>
                    {inspectedBatchItem.ageInDays} {inspectedBatchItem.ageInDays === 1 ? 'day' : 'days'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div className="shrink-0 flex items-center gap-2">
            {inspectedBatchItem.dispatchedQty >= inspectedBatchItem.batch.qty_received ? (
              <span className="inline-flex items-center gap-1 rounded-xl bg-violet-500/20 text-violet-300 border border-violet-500/30 px-3 py-1 text-xs font-black">
                <Truck className="h-3.5 w-3.5" /> 100% Fulfilled
              </span>
            ) : inspectedBatchItem.isStalled ? (
              <span className="inline-flex items-center gap-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3 py-1 text-xs font-black">
                <AlertTriangle className="h-3.5 w-3.5" /> Inactive (&gt; 7 Days)
              </span>
            ) : inspectedBatchItem.isReadyOnly ? (
              <span className="inline-flex items-center gap-1 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30 px-3 py-1 text-xs font-black">
                <CheckCircle className="h-3.5 w-3.5" /> Ready for Dispatch
              </span>
            ) : inspectedBatchItem.isInProduction ? (
              <span className="inline-flex items-center gap-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 text-xs font-black">
                <TrendingUp className="h-3.5 w-3.5" /> In Production
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-xl bg-slate-700 text-slate-200 border border-slate-600 px-3 py-1 text-xs font-black">
                <Box className="h-3.5 w-3.5" /> Raw Stock Buffer
              </span>
            )}
          </div>
        </div>

        {/* 5-Pillar Lifecycle Reconciliation Bar */}
        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                <Layers className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Batch Lifecycle Reconciliation Equation
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              Intake ({formatNumber(inspectedBatchItem.batch.qty_received)}) - Allocations Out ({formatNumber(inspectedBatchItem.allocatedOutQty)}) = Net ({formatNumber(inspectedBatchItem.netReceivedQty)})
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {/* 1. Intake */}
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase">1. Intake</p>
              <p className="text-lg font-black text-slate-900 mt-0.5">{formatNumber(inspectedBatchItem.batch.qty_received)}</p>
              <p className="text-[10px] text-slate-400">gross inward units</p>
            </div>

            {/* 2. Allocations */}
            <div className={`p-2.5 rounded-xl border text-center ${
              (inspectedBatchItem.allocatedOutQty > 0 || inspectedBatchItem.allocatedInQty > 0)
                ? 'border-amber-300 bg-amber-50/70 text-amber-950'
                : 'border-slate-200 bg-slate-50 text-slate-400'
            }`}>
              <p className="text-[10px] font-bold uppercase text-amber-800">2. Allocations</p>
              <p className="text-lg font-black mt-0.5">
                {inspectedBatchItem.allocatedOutQty > 0
                  ? `-${formatNumber(inspectedBatchItem.allocatedOutQty)}`
                  : inspectedBatchItem.allocatedInQty > 0
                  ? `+${formatNumber(inspectedBatchItem.allocatedInQty)}`
                  : '0'}
              </p>
              <p className="text-[10px] text-amber-700">
                {inspectedBatchItem.allocatedOutQty > 0 ? 'transferred out' : inspectedBatchItem.allocatedInQty > 0 ? 'transferred in' : 'no transfers'}
              </p>
            </div>

            {/* 3. Raw Stock */}
            <div className="p-2.5 rounded-xl border border-emerald-300 bg-emerald-50/70 text-center">
              <p className="text-[10px] font-bold uppercase text-emerald-800">3. Virgin Raw</p>
              <p className="text-lg font-black text-emerald-950 mt-0.5">{formatNumber(inspectedBatchItem.rawStockQty)}</p>
              <p className="text-[10px] text-emerald-700">on rack {inspectedBatchItem.batch.location}</p>
            </div>

            {/* 4. In Production */}
            <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 text-center">
              <p className="text-[10px] font-bold uppercase text-amber-800">4. In WIP</p>
              <p className="text-lg font-black text-amber-900 mt-0.5">{formatNumber(inspectedBatchItem.wipQty)}</p>
              <p className="text-[10px] text-amber-700">in conversion</p>
            </div>

            {/* 5. Ready */}
            <div className="p-2.5 rounded-xl border border-sky-200 bg-sky-50/50 text-center">
              <p className="text-[10px] font-bold uppercase text-sky-800">5. Ready Stock</p>
              <p className="text-lg font-black text-sky-900 mt-0.5">{formatNumber(inspectedBatchItem.readyQty)}</p>
              <p className="text-[10px] text-sky-700">ready to ship</p>
            </div>

            {/* 6. Dispatched */}
            <div className="p-2.5 rounded-xl border border-violet-200 bg-violet-50/50 text-center">
              <p className="text-[10px] font-bold uppercase text-violet-800">6. Dispatched</p>
              <p className="text-lg font-black text-violet-900 mt-0.5">{formatNumber(inspectedBatchItem.dispatchedQty)}</p>
              <p className="text-[10px] text-violet-700">{inspectedBatchItem.dispatches.length} orders shipped</p>
            </div>
          </div>

          {/* Live Inventory Status Explanation */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
            <p className="font-bold text-slate-900 flex items-center gap-1 text-[11px]">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
              Live Stock Status Explanation:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600 pl-1">
              <li>
                <strong>{formatNumber(inspectedBatchItem.rawStockQty)} units</strong> virgin raw material stored on Rack <strong>{inspectedBatchItem.batch.location}</strong> {inspectedBatchItem.rawStockQty > 0 ? '(Untouched buffer ready for conversion)' : '(Fully converted/allocated)'}.
              </li>
              {inspectedBatchItem.allocatedOutQty > 0 && (
                <li>
                  <strong>{formatNumber(inspectedBatchItem.allocatedOutQty)} units</strong> transferred out to other batches via Batch Allocation ({inspectedBatchItem.allocationsOut.map(a => a.destination_batch?.batch_no || 'Dest').join(', ')}).
                </li>
              )}
              {inspectedBatchItem.allocatedInQty > 0 && (
                <li>
                  <strong>{formatNumber(inspectedBatchItem.allocatedInQty)} units</strong> received from other batches via Batch Allocation ({inspectedBatchItem.allocationsIn.map(a => a.source_batch?.batch_no || 'Source').join(', ')}).
                </li>
              )}
              {inspectedBatchItem.isComponentBatch && inspectedBatchItem.componentFittedQty ? (
                <li>
                  <strong>{formatNumber(inspectedBatchItem.componentFittedQty)} units</strong> fitted and dispatched on customer bottle orders.
                </li>
              ) : null}
              {inspectedBatchItem.wipQty > 0 && (
                <li>
                  <strong>{formatNumber(inspectedBatchItem.wipQty)} units</strong> in active manufacturing stages.
                </li>
              )}
              {inspectedBatchItem.readyQty > 0 && (
                <li>
                  <strong>{formatNumber(inspectedBatchItem.readyQty)} units</strong> in Ready stage awaiting dispatch.
                </li>
              )}
              {inspectedBatchItem.dispatchedQty > 0 && (
                <li>
                  <strong>{formatNumber(inspectedBatchItem.dispatchedQty)} units</strong> dispatched across {inspectedBatchItem.dispatches.length} client invoices.
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Bill of Materials Specifications Attached */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <PackageCheck className="h-4 w-4 text-indigo-600" />
              Parts Attached (Caps, Atomizers, Boxes)
            </span>
            <span className="text-[11px] text-slate-500">
              Exact component links reconciled from intake & movements
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-white border border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Bottle Body</p>
              <p className="font-extrabold text-slate-900 mt-0.5">{inspectedBatchItem.batch.item?.name ?? 'Standard'}</p>
              <span className="text-[10px] text-slate-500">{inspectedBatchItem.batch.color || 'Default Color'}</span>
            </div>
            <div className="p-2 rounded-lg bg-white border border-slate-200">
              <p className="text-[10px] font-bold text-violet-700 uppercase">Closure / Cap</p>
              <p className="font-extrabold text-violet-950 mt-0.5">
                {inspectedBatchItem.resolvedCapName || inspectedBatchItem.batch.cap_item?.name || 'Unassigned'}
              </p>
              <span className="text-[10px] text-slate-500">Attached</span>
            </div>
            <div className="p-2 rounded-lg bg-white border border-slate-200">
              <p className="text-[10px] font-bold text-sky-700 uppercase">Atomizer / Pump</p>
              <p className="font-extrabold text-sky-950 mt-0.5">
                {inspectedBatchItem.resolvedAtomizerName || inspectedBatchItem.batch.atomizer_item?.name || 'Unassigned'}
              </p>
              <span className="text-[10px] text-slate-500">Attached</span>
            </div>
            <div className="p-2 rounded-lg bg-white border border-slate-200">
              <p className="text-[10px] font-bold text-amber-700 uppercase">Packaging Box</p>
              <p className="font-extrabold text-amber-950 mt-0.5">
                {inspectedBatchItem.resolvedBoxName || inspectedBatchItem.batch.box_item?.name || 'Unassigned'}
              </p>
              <span className="text-[10px] text-slate-500">Attached</span>
            </div>
          </div>
        </div>

        {/* Live Manufacturing Flow Visualizer for this Batch */}
        <div className="space-y-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-slate-700" />
            Live Stage Distribution for Batch {inspectedBatchItem.batch.batch_no}
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {processStages.map((s) => {
              const qty = inspectedBatchItem.stageQuantities[s.id] ?? 0;
              return (
                <div
                  key={`batch-stage-${s.id}`}
                  className={`p-2.5 rounded-xl border transition text-center ${
                    qty > 0
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-2xs ring-1 ring-emerald-300'
                      : 'border-slate-200 bg-slate-50/50 text-slate-400 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">#{s.sequence_no}</span>
                    {qty > 0 && <span className="text-emerald-700 font-extrabold">Active</span>}
                  </div>
                  <p className="text-xs font-bold truncate mt-1">{s.name}</p>
                  <p className={`text-base font-black mt-0.5 ${qty > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>
                    {formatNumber(qty)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Three Column Section: Transitions Ledger, Stock Allocations & Customer Dispatches */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Column 1: Transition History */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <History className="h-4 w-4 text-indigo-600" />
                Stage Movements ({inspectedBatchItem.movements.length})
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const bId = inspectedBatchItem.batch.id;
                  onClose();
                  onOpenQuickModal(bId, 'move');
                }}
                className="text-[11px] py-0.5 px-2 font-bold text-indigo-700 bg-indigo-50 border-indigo-200 cursor-pointer"
              >
                + Record Move
              </Button>
            </div>

            {inspectedBatchItem.movements.length === 0 ? (
              <div className="p-5 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                No stage transitions recorded yet. Entire batch sits in Raw Stock.
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {inspectedBatchItem.movements.map((m) => (
                  <div key={m.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span>{m.from_stage?.name ?? '—'}</span>
                        <ArrowRight className="h-3 w-3 text-indigo-500" />
                        <span className="text-emerald-700">{m.to_stage?.name ?? '—'}</span>
                      </div>
                      <span className="font-black text-slate-900 text-sm">
                        {formatNumber(m.qty_moved)} units
                      </span>
                    </div>
                    {(m.variant_name || m.color || m.printing_design || m.cap_name || m.atomizer_name || m.box_name) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {m.variant_name && (
                          <span className="text-[10px] font-black text-indigo-900 bg-indigo-100 px-1.5 py-0.2 rounded border border-indigo-300 shadow-2xs">
                            🏷️ {m.variant_name}
                          </span>
                        )}
                        {m.color && <ColorBadge color={m.color} />}
                        {m.printing_design && <PrintingBadge design={m.printing_design} />}
                        {m.cap_name && (
                          <span className="inline-flex items-center gap-1 rounded bg-violet-100/80 px-1.5 py-0.2 text-[10px] font-bold text-violet-800 border border-violet-200">
                            🧴 {m.cap_name}
                          </span>
                        )}
                        {m.atomizer_name && (
                          <span className="inline-flex items-center gap-1 rounded bg-sky-100/80 px-1.5 py-0.2 text-[10px] font-bold text-sky-800 border border-sky-200">
                            💨 {m.atomizer_name}
                          </span>
                        )}
                        {m.box_name && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100/80 px-1.5 py-0.2 text-[10px] font-bold text-amber-800 border border-amber-200">
                            📦 {m.box_name}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center justify-between text-[10px] text-slate-500">
                      <span>
                        {formatDate(m.moved_on)} {m.done_by ? `• by ${m.done_by}` : ''} {m.remarks ? `• "${m.remarks}"` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: Stock Allocations */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                <ArrowRightLeft className="h-4 w-4 text-teal-600" />
                Allocations & Transfers ({inspectedBatchItem.allocationsOut.length + inspectedBatchItem.allocationsIn.length})
              </span>
              {onOpenAllocateModal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const b = inspectedBatchItem.batch;
                    onClose();
                    onOpenAllocateModal(b);
                  }}
                  className="text-[11px] py-0.5 px-2 font-bold text-teal-800 bg-teal-50 border-teal-200 cursor-pointer"
                >
                  + Allocate
                </Button>
              )}
            </div>

            {inspectedBatchItem.allocationsOut.length === 0 && inspectedBatchItem.allocationsIn.length === 0 ? (
              <div className="p-5 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                No stock allocations recorded yet. Batch sits entirely in its own ledger.
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {inspectedBatchItem.allocationsOut.map((a) => (
                  <div key={a.id} className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900 flex items-center gap-1">
                        <ArrowRight className="h-3 w-3 text-amber-600" />
                        Allocated Out ➔ Batch {a.destination_batch?.batch_no || 'Dest'}
                      </span>
                      <span className="font-black text-amber-950 text-sm">
                        -{formatNumber(a.qty)} pcs
                      </span>
                    </div>
                    {a.destination_batch?.brand_name && (
                      <p className="text-[10px] font-semibold text-indigo-700 mt-0.5">
                        Brand: {a.destination_batch.brand_name}
                      </p>
                    )}
                    <div className="mt-1 text-[10px] text-slate-500 flex flex-wrap justify-between">
                      <span>{formatDate(a.allocated_on)} {a.allocated_by ? `• by ${a.allocated_by}` : ''}</span>
                      {a.remarks && <span className="italic">"{a.remarks}"</span>}
                    </div>
                  </div>
                ))}
                {inspectedBatchItem.allocationsIn.map((a) => (
                  <div key={a.id} className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-900 flex items-center gap-1">
                        <ArrowRight className="h-3 w-3 text-emerald-600 rotate-180" />
                        Received In ➔ from Batch {a.source_batch?.batch_no || 'Source'}
                      </span>
                      <span className="font-black text-emerald-950 text-sm">
                        +{formatNumber(a.qty)} pcs
                      </span>
                    </div>
                    {a.source_batch?.brand_name && (
                      <p className="text-[10px] font-semibold text-indigo-700 mt-0.5">
                        Brand: {a.source_batch.brand_name}
                      </p>
                    )}
                    <div className="mt-1 text-[10px] text-slate-500 flex flex-wrap justify-between">
                      <span>{formatDate(a.allocated_on)} {a.allocated_by ? `• by ${a.allocated_by}` : ''}</span>
                      {a.remarks && <span className="italic">"{a.remarks}"</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 3: Customer Dispatches */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-violet-600" />
                Customer Shipments ({inspectedBatchItem.dispatches.length})
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const bId = inspectedBatchItem.batch.id;
                  onClose();
                  onOpenQuickModal(bId, 'dispatch');
                }}
                className="text-[11px] py-0.5 px-2 font-bold text-violet-700 bg-violet-50 border-violet-200 cursor-pointer"
              >
                + Record Dispatch
              </Button>
            </div>

            {inspectedBatchItem.dispatches.length === 0 ? (
              <div className="p-5 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                No customer dispatches recorded yet from this batch.
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {inspectedBatchItem.dispatches.map((d) => (
                  <div key={d.id} className="p-2.5 rounded-xl bg-violet-50/50 border border-violet-200 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-extrabold text-violet-950 mr-1.5">{d.customer_name}</span>
                        <span className="font-bold text-slate-700 bg-white px-1.5 py-0.2 rounded border border-slate-200 text-[10px]">
                          Inv: {d.invoice_no}
                        </span>
                      </div>
                      <span className="font-black text-violet-900 text-sm">
                        {formatNumber(d.qty)} pcs
                      </span>
                    </div>
                    {(d.variant_name || d.color || d.printing_design || d.cap_name || d.atomizer_name || d.box_name) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {d.variant_name && (
                          <span className="text-[10px] font-black text-indigo-900 bg-indigo-100 px-1.5 py-0.2 rounded border border-indigo-300 shadow-2xs">
                            🏷️ {d.variant_name}
                          </span>
                        )}
                        {d.color && <ColorBadge color={d.color} />}
                        {d.printing_design && <PrintingBadge design={d.printing_design} />}
                        {d.cap_name && (
                          <span className="text-[10px] font-bold text-violet-700 bg-white px-1.5 py-0.2 rounded border border-violet-200">
                            🧴 {d.cap_name}
                          </span>
                        )}
                        {d.atomizer_name && (
                          <span className="text-[10px] font-bold text-sky-700 bg-white px-1.5 py-0.2 rounded border border-sky-200">
                            💨 {d.atomizer_name}
                          </span>
                        )}
                        {d.box_name && (
                          <span className="text-[10px] font-bold text-amber-700 bg-white px-1.5 py-0.2 rounded border border-amber-200">
                            📦 {d.box_name}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Dispatched on {formatDate(d.dispatched_on)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChallanModal({
                            ...d,
                            batch: inspectedBatchItem.batch,
                            batchNo: inspectedBatchItem.batch.batch_no,
                            itemName: inspectedBatchItem.batch.item?.name ?? 'Product',
                            supplierName: inspectedBatchItem.batch.supplier?.name ?? 'Supplier',
                          });
                        }}
                        className="font-bold text-violet-700 hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <Printer className="h-3 w-3" /> Print Challan
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-3 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {onOpenAllocateModal && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const b = inspectedBatchItem.batch;
                  onClose();
                  onOpenAllocateModal(b);
                }}
                className="font-bold text-xs text-teal-800 bg-teal-50 border-teal-200 cursor-pointer min-h-[38px] justify-center inline-flex items-center"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 text-teal-600 mr-1" />
                Allocate Stock
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const bId = inspectedBatchItem.batch.id;
                onClose();
                onOpenQuickModal(bId, 'move');
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer min-h-[38px] justify-center"
            >
              <Zap className="h-3.5 w-3.5 text-amber-300" />
              Move Stock
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const bId = inspectedBatchItem.batch.id;
                onClose();
                onOpenQuickModal(bId, 'scrap');
              }}
              className="font-bold text-xs text-rose-700 bg-rose-50 border-rose-200 cursor-pointer min-h-[38px] justify-center"
            >
              <Flame className="h-3.5 w-3.5" />
              Record Scrap Defect
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const bId = inspectedBatchItem.batch.id;
                onClose();
                onOpenQuickModal(bId, 'dispatch');
              }}
              className="font-bold text-xs text-violet-700 bg-violet-50 border-violet-200 cursor-pointer min-h-[38px] justify-center"
            >
              <Truck className="h-3.5 w-3.5" />
              Record Dispatch
            </Button>
          </div>

          <div className="flex items-center justify-end">
            <Button variant="secondary" size="sm" onClick={onClose} className="cursor-pointer w-full sm:w-auto min-h-[38px] justify-center">
              Close Batch Passport
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
