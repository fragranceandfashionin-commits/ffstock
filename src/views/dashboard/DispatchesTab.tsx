import { Truck, Printer } from 'lucide-react';
import { Card, Badge, Button, ColorBadge, PrintingBadge } from '@/components/ui';
import type { DashboardCalculations } from './dashboardCalculations';
import type { BatchWithRelations, Dispatch } from '@/lib/supabase';
import { formatNumber, formatDate } from '@/lib/utils';

export type DispatchesTabProps = {
  filteredDispatches: DashboardCalculations['enrichedDispatches'];
  totalDispatched: number;
  onOpenChallanModal: (
    d: Dispatch & { batch?: BatchWithRelations; batchNo?: string; itemName?: string; supplierName?: string }
  ) => void;
};

export function DispatchesTab({
  filteredDispatches,
  totalDispatched,
  onOpenChallanModal,
}: DispatchesTabProps) {
  return (
    <Card className="p-0 overflow-hidden border-slate-200 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-5 py-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-slate-900">
              Customer Dispatches & Order Component Consumption Ledger
            </h2>
            <Badge label={`${filteredDispatches.length} shipments`} variant="sky" size="sm" />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Exact component deduction breakdown (Caps, Atomizers, Boxes) for every customer shipment and invoice.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold text-violet-900 bg-violet-50 border border-violet-200 px-3 py-1 rounded-xl">
            Total Shipped: {formatNumber(totalDispatched)} units
          </span>
        </div>
      </div>

      {filteredDispatches.length === 0 ? (
        <div className="p-12 text-center text-sm text-slate-500">
          <Truck className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <p className="font-bold text-slate-700">No customer dispatches match the active filters.</p>
          <p className="text-xs text-slate-400 mt-1">Try clearing filters or recording a new customer dispatch.</p>
        </div>
      ) : (
        <div>
          {/* Mobile View: Cards (< sm) */}
          <div className="p-3.5 space-y-3 sm:hidden">
            {filteredDispatches.map((d) => (
              <Card key={`mobile-dispatch-${d.id}`} className="p-4 border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="rounded-lg bg-slate-900 text-white px-2.5 py-1 text-xs font-black">
                      #{d.invoice_no}
                    </span>
                    <h3 className="font-black text-slate-900 text-base mt-1.5 leading-snug">
                      {d.customer_name}
                    </h3>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-black text-violet-800 text-lg leading-tight">
                      {formatNumber(d.qty)}
                    </p>
                    <p className="text-[10px] text-slate-500 font-bold">{d.item?.unit || 'units'} shipped</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(d.dispatched_on)}</p>
                  </div>
                </div>

                {/* Batch and Product */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-900 text-xs font-mono">{d.batchNo}</span>
                    <ColorBadge color={d.resolvedColor} />
                    {d.printing_design && <PrintingBadge design={d.printing_design} />}
                  </div>
                  <p className="text-xs text-slate-600 font-medium">{d.itemName}</p>
                </div>

                {/* Parts Attached */}
                {(d.resolvedCapName || d.resolvedAtomizerName || d.resolvedBoxName) && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {d.resolvedCapName && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 border border-violet-200 px-2 py-0.5 text-xs font-bold text-violet-700">
                        🧴 {d.resolvedCapName} ({formatNumber(d.capsUsed)})
                      </span>
                    )}
                    {d.resolvedAtomizerName && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 border border-sky-200 px-2 py-0.5 text-xs font-bold text-sky-700">
                        💨 {d.resolvedAtomizerName} ({formatNumber(d.atomizersUsed)})
                      </span>
                    )}
                    {d.resolvedBoxName && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-bold text-amber-700">
                        📦 {d.resolvedBoxName} ({formatNumber(d.boxesUsed)})
                      </span>
                    )}
                  </div>
                )}

                {/* Challan Action */}
                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenChallanModal(d)}
                    className="text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border-violet-200 min-h-[38px] px-3.5"
                  >
                    <Printer className="h-3.5 w-3.5 mr-1" />
                    Delivery Challan
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop View: Table (>= sm) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-100 text-left text-[11px] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200 select-none">
                <tr>
                  <th className="px-3.5 py-3">Dispatch Date</th>
                  <th className="px-3.5 py-3">Invoice No</th>
                  <th className="px-4 py-3">Customer Account</th>
                  <th className="px-3.5 py-3">Origin Batch & Product</th>
                  <th className="px-3.5 py-3 text-right font-black text-violet-900">Shipped Qty</th>
                  <th className="px-3.5 py-3 font-extrabold text-violet-900">🧴 Cap Consumed</th>
                  <th className="px-3.5 py-3 font-extrabold text-sky-900">💨 Atomizer Consumed</th>
                  <th className="px-3.5 py-3 font-extrabold text-amber-900">📦 Box Consumed</th>
                  <th className="px-3.5 py-3 text-right">Delivery Challan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredDispatches.map((d) => (
                  <tr key={d.id} className="transition hover:bg-slate-50/90">
                    <td className="px-3.5 py-3.5 text-slate-500 font-semibold">{formatDate(d.dispatched_on)}</td>
                    <td className="px-3.5 py-3.5">
                      <span className="rounded-lg bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-black text-slate-800">
                        {d.invoice_no}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-black text-slate-900 text-sm">
                      {d.customer_name}
                    </td>
                    <td className="px-3.5 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-slate-900">{d.batchNo}</span>
                        <span className="text-[10px] text-slate-500 font-normal">{d.itemName}</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <ColorBadge color={d.resolvedColor} />
                          {d.printing_design && <PrintingBadge design={d.printing_design} />}
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-3.5 text-right font-black text-violet-800 text-sm">
                      {formatNumber(d.qty)}
                    </td>
                    <td className="px-3.5 py-3.5">
                      {d.resolvedCapName ? (
                        <span className="inline-flex items-center gap-1 rounded bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                          🧴 {d.resolvedCapName} ({formatNumber(d.capsUsed)})
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3.5">
                      {d.resolvedAtomizerName ? (
                        <span className="inline-flex items-center gap-1 rounded bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                          💨 {d.resolvedAtomizerName} ({formatNumber(d.atomizersUsed)})
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3.5">
                      {d.resolvedBoxName ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          📦 {d.resolvedBoxName} ({formatNumber(d.boxesUsed)})
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChallanModal(d)}
                        className="text-[11px] font-bold text-violet-700 bg-violet-50/50 hover:bg-violet-100 border-violet-200 shadow-2xs cursor-pointer"
                      >
                        <Printer className="h-3 w-3 mr-1" />
                        Challan
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
