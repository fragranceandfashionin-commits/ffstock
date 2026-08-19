import { ArrowLeftRight, ArrowRight, Undo2, Truck, Printer } from 'lucide-react';
import { Card, Badge, ColorBadge, PrintingBadge, Button } from '@/components/ui';
import type { MovementWithRelations, Dispatch } from '@/lib/supabase';
import { formatNumber, formatDate } from '@/lib/utils';

export type MovementAuditTrailProps = {
  movements: MovementWithRelations[];
  dispatches: Dispatch[];
  unitLabel: string;
  onOpenReversalModal: (m: MovementWithRelations) => void;
  onOpenChallanModal: (d: Dispatch) => void;
};

export function MovementAuditTrail({
  movements,
  dispatches,
  unitLabel,
  onOpenReversalModal,
  onOpenChallanModal,
}: MovementAuditTrailProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Movement History */}
      <Card className="lg:col-span-6 shadow-2xs border-slate-200/90">
        <h3 className="mb-3 flex items-center justify-between text-sm font-extrabold text-slate-900">
          <span className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-slate-500" />
            Stage Movement Timeline
          </span>
          <Badge label={`${movements.length} logged`} variant="default" size="sm" />
        </h3>

        {movements.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl">
            No stage movements recorded for this batch yet.
          </p>
        ) : (
          <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5 my-2">
            {movements.map((m) => {
              const isScrap = (m.remarks ?? '').startsWith('[SCRAP') || m.to_stage?.name === 'Scrap / Defect';
              const isReversal = (m.remarks ?? '').startsWith('[REVERSAL');

              return (
                <li key={m.id} className="relative">
                  <span
                    className={`absolute -left-[27px] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-white ${
                      isScrap ? 'bg-rose-600' : isReversal ? 'bg-amber-500' : 'bg-slate-900'
                    }`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`font-bold ${isScrap ? 'text-rose-900' : isReversal ? 'text-amber-900' : 'text-slate-900'}`}>
                        {m.from_stage?.name ?? '—'}{' '}
                        <ArrowRight className="mx-1 inline h-3 w-3 text-slate-400" />{' '}
                        {m.to_stage?.name ?? '—'}
                      </span>
                      {isScrap && <Badge label="Scrap Loss" variant="rose" size="sm" />}
                      {isReversal && <Badge label="Reversal Entry" variant="amber" size="sm" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge label={`${formatNumber(m.qty_moved)} ${unitLabel}`} variant={isScrap ? 'rose' : isReversal ? 'amber' : 'emerald'} />
                      {!isReversal && (
                        <button
                          type="button"
                          onClick={() => onOpenReversalModal(m)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition cursor-pointer"
                          title="Record compensating reversal movement"
                        >
                          <Undo2 className="h-3 w-3" />
                          Reverse
                        </button>
                      )}
                    </div>
                  </div>
                  {(m.color || m.printing_design || m.cap_name || m.atomizer_name || m.box_name) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
                      {m.color && <ColorBadge color={m.color} />}
                      {m.printing_design && <PrintingBadge design={m.printing_design} />}
                      {m.cap_name && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-violet-100/80 px-2 py-0.5 text-[10px] font-bold text-violet-800 border border-violet-200">
                          🧴 Cap: {m.cap_name}
                        </span>
                      )}
                      {m.atomizer_name && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-sky-100/80 px-2 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-200">
                          💨 Atomizer: {m.atomizer_name}
                        </span>
                      )}
                      {m.box_name && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100/80 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                          📦 Box: {m.box_name}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-medium px-1">
                    <span>{formatDate(m.moved_on)}</span>
                    {m.remarks && <span className="text-slate-600 font-medium">{m.remarks}</span>}
                    {m.done_by && <span>Operator: {m.done_by}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* Dispatch History */}
      <Card className="lg:col-span-6 shadow-2xs border-slate-200/90">
        <h3 className="mb-3 flex items-center justify-between text-sm font-extrabold text-slate-900">
          <span className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-slate-500" />
            Customer Dispatch Log
          </span>
          <Badge label={`${dispatches.length} shipments`} variant="default" size="sm" />
        </h3>

        {dispatches.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl">
            No customer dispatches recorded for this batch yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Invoice #</th>
                  <th className="px-3 py-2">Specs & Packaging</th>
                  <th className="px-3 py-2 text-right">Quantity</th>
                  <th className="px-3 py-2 text-right">Delivery Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {dispatches.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-3 py-2.5 text-slate-500">{formatDate(d.dispatched_on)}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-800">{d.customer_name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{d.invoice_no}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <ColorBadge color={d.color} />
                        {d.printing_design && <PrintingBadge design={d.printing_design} />}
                        {d.cap_name && (
                          <span className="text-[10px] font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200">
                            🧴 {d.cap_name}
                          </span>
                        )}
                        {d.atomizer_name && (
                          <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                            💨 {d.atomizer_name}
                          </span>
                        )}
                        {d.box_name && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            📦 {d.box_name}
                          </span>
                        )}
                        {d.product_specs && (
                          <span className="text-[10px] text-slate-500">{d.product_specs}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-black text-slate-900">
                      {formatNumber(d.qty)} {unitLabel}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenChallanModal(d)}
                        className="text-[11px] font-bold text-violet-700 bg-violet-50/50 border-violet-200 cursor-pointer"
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
        )}
      </Card>
    </div>
  );
}
