import { Maximize2, MapPin, Clock, Zap } from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import type { DashboardCalculations } from './dashboardCalculations';
import type { InspectedBatchItem, BatchMatrixRow } from './types';
import { formatNumber, formatDate } from '@/lib/utils';

export type StagesTabProps = {
  filteredStageBreakdown: DashboardCalculations['stageBreakdown'];
  selectedStageId: string | 'ALL';
  onSetZoomImageUrl: (data: { url: string; title: string; batchNo: string } | null) => void;
  onSetInspectedBatchItem: (item: InspectedBatchItem) => void;
  onOpenQuickModal: (batchId?: string) => void;
  batchMatrix: BatchMatrixRow[];
};

export function StagesTab({
  filteredStageBreakdown,
  selectedStageId,
  onSetZoomImageUrl,
  onSetInspectedBatchItem,
  onOpenQuickModal,
  batchMatrix,
}: StagesTabProps) {
  return (
    <div className="space-y-5">
      {filteredStageBreakdown.map(({ stage, totalQty, bottlesQty, capsQty, atomizersQty, boxesQty, batches: sBatches }) => {
        if (sBatches.length === 0 && selectedStageId !== 'ALL') {
          return (
            <Card key={stage.id} className="p-8 text-center text-sm text-slate-500 shadow-2xs">
              No stock currently inside {stage.name} matching active filters.
            </Card>
          );
        }
        if (sBatches.length === 0) return null;

        return (
          <Card key={stage.id} className="p-0 overflow-hidden border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-5 py-3.5 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-xs font-black text-white shadow-2xs">
                  {stage.sequence_no}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {stage.name} Stage
                    </h3>
                    <Badge label={`${formatNumber(totalQty)} units total`} variant="emerald" size="sm" />
                    <div className="flex flex-wrap items-center gap-1.5 ml-2">
                      {bottlesQty > 0 && (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-md">
                          🧴 {formatNumber(bottlesQty)} Bottles
                        </span>
                      )}
                      {capsQty > 0 && (
                        <span className="bg-violet-100 text-violet-800 text-[10px] font-black px-2 py-0.5 rounded-md">
                          🎩 {formatNumber(capsQty)} Caps
                        </span>
                      )}
                      {atomizersQty > 0 && (
                        <span className="bg-sky-100 text-sky-800 text-[10px] font-black px-2 py-0.5 rounded-md">
                          💨 {formatNumber(atomizersQty)} Pumps
                        </span>
                      )}
                      {boxesQty > 0 && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-md">
                          📦 {formatNumber(boxesQty)} Boxes
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {sBatches.length} {sBatches.length === 1 ? 'batch' : 'batches'} sitting in this stage
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenQuickModal()}
                className="text-xs font-bold text-indigo-700 bg-white cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5 text-indigo-600" />
                Quick Move Stock
              </Button>
            </div>

            <div>
              {/* Mobile View: Cards (< sm) */}
              <div className="p-3.5 space-y-3 sm:hidden">
                {sBatches.map((bItem) => (
                  <div
                    key={`mobile-stage-batch-${bItem.batch.id}`}
                    className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        {bItem.batch.image_url ? (
                          <img
                            src={bItem.batch.image_url}
                            alt={bItem.batch.batch_no}
                            className="h-10 w-10 rounded-xl object-cover border border-slate-200 cursor-pointer shadow-2xs shrink-0"
                            onClick={() =>
                              onSetZoomImageUrl({
                                url: bItem.batch.image_url!,
                                title: bItem.batch.item?.name ?? 'Photo',
                                batchNo: bItem.batch.batch_no,
                              })
                            }
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                            IMG
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-black text-slate-900 text-sm">{bItem.batch.batch_no}</span>
                            {bItem.category && (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {bItem.category}
                              </span>
                            )}
                          </div>
                          <p className="font-bold text-slate-800 text-xs mt-0.5">{bItem.batch.item?.name ?? '—'}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-base font-black text-emerald-700 leading-tight">
                          {formatNumber(bItem.qty)}
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold">in {stage.name}</p>
                      </div>
                    </div>

                    {/* Parts */}
                    {(bItem.resolvedCapName || bItem.resolvedAtomizerName || bItem.resolvedBoxName) && (
                      <div className="flex flex-wrap gap-1 p-2 bg-slate-50 rounded-xl border border-slate-100">
                        {bItem.resolvedCapName && (
                          <span className="inline-flex items-center gap-1 rounded bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                            🧴 {bItem.resolvedCapName}
                          </span>
                        )}
                        {bItem.resolvedAtomizerName && (
                          <span className="inline-flex items-center gap-1 rounded bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                            💨 {bItem.resolvedAtomizerName}
                          </span>
                        )}
                        {bItem.resolvedBoxName && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                            📦 {bItem.resolvedBoxName}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span>🏢 {bItem.batch.supplier?.name ?? '—'}</span>
                        <span>•</span>
                        <span>📍 {bItem.batch.location}</span>
                        <span>•</span>
                        <span>{bItem.ageInDays}d</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const fullItem = batchMatrix.find((bm) => bm.batch.id === bItem.batch.id);
                            if (fullItem) onSetInspectedBatchItem(fullItem);
                          }}
                          className="text-xs font-bold text-slate-700 bg-white border-slate-300 min-h-[34px] px-2.5"
                        >
                          <Maximize2 className="h-3 w-3 mr-1 text-slate-500" />
                          Inspect
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenQuickModal(bItem.batch.id, stage.name === 'Ready' ? 'dispatch' : 'move')}
                          className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200 min-h-[34px] px-2.5"
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          {stage.name === 'Ready' ? 'Dispatch' : 'Move'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View: Table (>= sm) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100/70 text-left text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Brand / Batch</th>
                      <th className="px-4 py-3">Stock Item</th>
                      <th className="px-4 py-3">Parts Attached</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3">Warehouse Rack</th>
                      <th className="px-4 py-3">Inward Date</th>
                      <th className="px-4 py-3 text-center">Floor Aging</th>
                      <th className="px-4 py-3">Customer Link</th>
                      <th className="px-4 py-3 text-right font-extrabold text-emerald-800">
                        Qty in {stage.name}
                      </th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sBatches.map((bItem) => (
                      <tr key={bItem.batch.id} className="transition hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            {bItem.batch.image_url ? (
                              <img
                                src={bItem.batch.image_url}
                                alt={bItem.batch.batch_no}
                                className="h-8 w-8 rounded-lg object-cover border border-slate-200 cursor-pointer shadow-2xs"
                                onClick={() =>
                                  onSetZoomImageUrl({
                                    url: bItem.batch.image_url!,
                                    title: bItem.batch.item?.name ?? 'Photo',
                                    batchNo: bItem.batch.batch_no,
                                  })
                                }
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                IMG
                              </div>
                            )}
                            <div>
                              <span>{bItem.batch.batch_no}</span>
                              {bItem.category && (
                                <span className="block text-[10px] font-semibold text-slate-400">
                                  {bItem.category}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-800 font-semibold">{bItem.batch.item?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs">
                          {bItem.resolvedCapName || bItem.resolvedAtomizerName || bItem.resolvedBoxName ? (
                            <div className="flex flex-wrap gap-1">
                              {bItem.resolvedCapName && (
                                <span className="inline-flex items-center gap-1 rounded bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                                  🧴 {bItem.resolvedCapName}
                                </span>
                              )}
                              {bItem.resolvedAtomizerName && (
                                <span className="inline-flex items-center gap-1 rounded bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                                  💨 {bItem.resolvedAtomizerName}
                                </span>
                              )}
                              {bItem.resolvedBoxName && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                  📦 {bItem.resolvedBoxName}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">No BOM attached</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{bItem.batch.supplier?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            {bItem.batch.location}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(bItem.batch.received_on)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                            <Clock className="h-3 w-3" />
                            {bItem.ageInDays === 0 ? 'Today' : `${bItem.ageInDays}d`}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {bItem.customerNames.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {bItem.customerNames.map((c: string) => (
                                <span
                                  key={c}
                                  className="rounded-md bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No shipments yet</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-base font-black text-emerald-700">
                            {formatNumber(bItem.qty)}
                          </span>
                          <span className="text-xs font-semibold text-slate-500 ml-1">units</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const fullItem = batchMatrix.find((bm) => bm.batch.id === bItem.batch.id);
                                if (fullItem) onSetInspectedBatchItem(fullItem);
                              }}
                              className="text-xs font-bold text-slate-700 bg-white border-slate-300 shadow-2xs cursor-pointer"
                              title="Inspect 360° Journey"
                            >
                              <Maximize2 className="h-3 w-3 mr-1 text-slate-500" />
                              Inspect 360°
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                onOpenQuickModal(
                                  bItem.batch.id,
                                  stage.name === 'Ready' ? 'dispatch' : 'move'
                                )
                              }
                              className="text-xs font-bold text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 border-indigo-200 cursor-pointer"
                            >
                              <Zap className="h-3 w-3 mr-1" />
                              {stage.name === 'Ready' ? 'Dispatch' : 'Move'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
