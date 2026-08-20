import { ArrowRight, Undo2 } from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import type { DashboardCalculations } from './dashboardCalculations';
import type { BatchWithRelations, MovementWithRelations } from '@/lib/supabase';
import { formatNumber, formatDate } from '@/lib/utils';

export type TransitionsTabProps = {
  filteredMovements: DashboardCalculations['enrichedMovements'];
  onOpenReversalModal: (
    m: MovementWithRelations & { batch?: BatchWithRelations; batchNo?: string; itemName?: string; supplierName?: string }
  ) => void;
};

export function TransitionsTab({
  filteredMovements,
  onOpenReversalModal,
}: TransitionsTabProps) {
  return (
    <Card className="p-0 overflow-hidden border-slate-200 shadow-2xs">
      <div className="flex items-center justify-between bg-slate-50 px-5 py-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Real-Time Factory Transitions Ledger
          </h2>
          <p className="text-xs text-slate-500">
            Immutable audit trail of all stock movements between manufacturing stages with dates and operator remarks.
          </p>
        </div>
        <Badge label={`${filteredMovements.length} transitions`} variant="indigo" />
      </div>

      {filteredMovements.length === 0 ? (
        <div className="p-12 text-center text-sm text-slate-500">
          No stage transitions recorded yet.
        </div>
      ) : (
        <div>
          {/* Mobile View: Cards (< sm) */}
          <div className="p-3.5 space-y-3 sm:hidden">
            {filteredMovements.map((m) => {
              const isScrap = (m.remarks ?? '').startsWith('[SCRAP') || m.to_stage?.name === 'Scrap / Defect';
              const isReversal = (m.remarks ?? '').startsWith('[REVERSAL');

              return (
                <div
                  key={`mobile-movement-${m.id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${
                          isScrap
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : isReversal
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-indigo-50 border-indigo-200/80 text-indigo-900'
                        }`}
                      >
                        {m.from_stage?.name ?? '—'}
                        <ArrowRight className="h-3 w-3 text-indigo-500" />
                        {m.to_stage?.name ?? '—'}
                      </span>
                      {isScrap && <Badge label="Scrap Loss" variant="rose" size="sm" />}
                      {isReversal && <Badge label="Reversal" variant="amber" size="sm" />}
                    </div>

                    <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                      {formatDate(m.moved_on)}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-2 pt-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-slate-900 text-sm">{m.batchNo}</span>
                      </div>
                      <p className="font-bold text-slate-800 text-xs mt-0.5">{m.itemName}</p>
                      <p className="text-[11px] text-slate-500">🏢 {m.supplierName}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`font-black text-base ${isScrap ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {formatNumber(m.qty_moved)}
                      </span>
                      <p className="text-[10px] text-slate-500 font-bold">units</p>
                    </div>
                  </div>

                  {/* Components */}
                  {(m.cap_name || m.atomizer_name) && (
                    <div className="flex flex-wrap gap-1 p-2 bg-slate-50 rounded-xl border border-slate-100">
                      {m.cap_name && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800 border border-violet-200">
                          🧴 Cap: {m.cap_name}
                        </span>
                      )}
                      {m.atomizer_name && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-800 border border-sky-200">
                          💨 Atomizer: {m.atomizer_name}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Operator / Remarks */}
                  {(m.remarks || m.done_by) && (
                    <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100 italic">
                      {m.remarks ? `"${m.remarks}"` : ''} {m.done_by ? `(by ${m.done_by})` : ''}
                    </p>
                  )}

                  {!isReversal && (
                    <div className="pt-2 border-t border-slate-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onOpenReversalModal(m)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-xl cursor-pointer"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Audit Reversal Entry
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop View: Table (>= sm) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Brand / Batch</th>
                  <th className="px-4 py-3">Stock Item</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Stage Transition</th>
                  <th className="px-4 py-3">Cap & Atomizer Spec</th>
                  <th className="px-4 py-3 text-right font-extrabold text-slate-900">Qty Moved</th>
                  <th className="px-4 py-3">Operator Remarks / Done By</th>
                  <th className="px-4 py-3 text-right">Audit Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMovements.map((m) => {
                  const isScrap = (m.remarks ?? '').startsWith('[SCRAP') || m.to_stage?.name === 'Scrap / Defect';
                  const isReversal = (m.remarks ?? '').startsWith('[REVERSAL');

                  return (
                    <tr key={m.id} className="transition hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-xs font-medium text-slate-500">{formatDate(m.moved_on)}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{m.batchNo}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{m.itemName}</td>
                      <td className="px-4 py-3 text-slate-600">{m.supplierName}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${
                              isScrap
                                ? 'bg-rose-50 border-rose-200 text-rose-900'
                                : isReversal
                                ? 'bg-amber-50 border-amber-200 text-amber-900'
                                : 'bg-indigo-50 border-indigo-200/80 text-indigo-900'
                            }`}
                          >
                            {m.from_stage?.name ?? '—'}
                            <ArrowRight className="h-3 w-3 text-indigo-500" />
                            {m.to_stage?.name ?? '—'}
                          </span>
                          {isScrap && <Badge label="Scrap Loss" variant="rose" size="sm" />}
                          {isReversal && <Badge label="Reversal Entry" variant="amber" size="sm" />}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {m.cap_name || m.atomizer_name ? (
                          <div className="flex flex-col gap-1 text-xs">
                            {m.cap_name && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800 border border-violet-200">
                                🧴 Cap: {m.cap_name}
                              </span>
                            )}
                            {m.atomizer_name && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-800 border border-sky-200">
                                💨 Atomizer: {m.atomizer_name}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-emerald-700">
                        {formatNumber(m.qty_moved)} <span className="text-xs font-normal text-slate-500">units</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {m.remarks || m.done_by ? `${m.remarks ?? ''} ${m.done_by ? `(by ${m.done_by})` : ''}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isReversal && (
                          <button
                            type="button"
                            onClick={() => onOpenReversalModal(m)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                            title="Create audit reversal entry for this movement"
                          >
                            <Undo2 className="h-3 w-3" />
                            Reverse
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
