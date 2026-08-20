import { Card, Badge, ItemCategoryBadge, ColorBadge, inputClass } from '@/components/ui';
import type { BatchWithRelations } from '@/lib/supabase';
import { formatNumber, formatDate } from '@/lib/utils';

export type BatchSelectorCardProps = {
  batches: BatchWithRelations[];
  batchId: string;
  onBatchChange: (id: string) => void;
  selectedBatch: BatchWithRelations | null;
  inFactory: number;
  readyQty: number;
  dispatchedTotal: number;
  unitLabel: string;
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
}: BatchSelectorCardProps) {
  return (
    <div className="space-y-4">
      {/* Pick Batch Selection Card */}
      <Card className="border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
          <label htmlFor="batch" className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <span>Step 1 — Pick Batch / Brand / Item</span>
            <Badge label="Required" variant="amber" size="sm" />
          </label>
          {selectedBatch && (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium flex-wrap">
              {selectedBatch.brand_name && (
                <span className="font-black text-indigo-900 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md text-xs shadow-2xs">
                  🏢 {selectedBatch.brand_name}
                </span>
              )}
              <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                {selectedBatch.batch_no}
              </span>
              <ItemCategoryBadge category={selectedBatch.item?.category} />
              <ColorBadge color={selectedBatch.color} />
              <span>
                Received {formatDate(selectedBatch.received_on)} • Storage: <strong className="text-slate-700">{selectedBatch.location}</strong>
              </span>
            </div>
          )}
        </div>

        <select
          id="batch"
          className={`${inputClass} font-semibold`}
          value={batchId}
          onChange={(e) => onBatchChange(e.target.value)}
        >
          <option value="">Select Stock Batch / Brand…</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              [{b.item?.category || 'Item'}] {b.brand_name ? `[${b.brand_name}] Batch ${b.batch_no}` : `Batch ${b.batch_no}`} — {b.item?.name ?? 'Stock Item'} (Supplier: {b.supplier?.name ?? 'Unknown'} • {formatNumber(b.qty_received)} {b.item?.unit || 'pcs'} received)
            </option>
          ))}
        </select>
      </Card>

      {/* Batch Summary KPIs */}
      {selectedBatch && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="border-slate-200/80 shadow-2xs">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Received</p>
            <p className="mt-1.5 text-2xl font-black text-slate-900">{formatNumber(selectedBatch.qty_received)}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">{unitLabel} received</p>
          </Card>
          <Card className="border-emerald-200/80 bg-emerald-50/30 shadow-2xs">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">In Factory</p>
            <p className="mt-1.5 text-2xl font-black text-emerald-700">{formatNumber(inFactory)}</p>
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5">received − dispatched ({unitLabel})</p>
          </Card>
          <Card className="border-sky-200/80 bg-sky-50/30 shadow-2xs">
            <p className="text-xs font-bold uppercase tracking-wider text-sky-800">Ready</p>
            <p className="mt-1.5 text-2xl font-black text-sky-700">{formatNumber(readyQty)}</p>
            <p className="text-[11px] text-sky-600 font-medium mt-0.5">ready for dispatch ({unitLabel})</p>
          </Card>
          <Card className="border-violet-200/80 bg-violet-50/30 shadow-2xs">
            <p className="text-xs font-bold uppercase tracking-wider text-violet-800">Dispatched</p>
            <p className="mt-1.5 text-2xl font-black text-violet-700">{formatNumber(dispatchedTotal)}</p>
            <p className="text-[11px] text-violet-600 font-medium mt-0.5">shipped to clients ({unitLabel})</p>
          </Card>
        </div>
      )}
    </div>
  );
}
