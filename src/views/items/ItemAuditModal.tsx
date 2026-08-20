import { Modal, Button, ItemCategoryBadge, ColorBadge } from '@/components/ui';
import { formatNumber } from '@/lib/utils';
import type { ComponentStockSummary } from '@/lib/supabase';

export type ItemAuditModalProps = {
  summary: ComponentStockSummary | null;
  onClose: () => void;
};

export function ItemAuditModal({ summary, onClose }: ItemAuditModalProps) {
  if (!summary) return null;

  return (
    <Modal
      isOpen={Boolean(summary)}
      onClose={onClose}
      title={`360° Stock Reconciliation: ${summary.item.name}`}
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-slate-900 text-white p-4 rounded-2xl">
          <div>
            <div className="flex items-center gap-2">
              <ItemCategoryBadge category={summary.item.category} />
              <ColorBadge color={summary.item.color} />
              <span className="text-xs font-mono text-slate-400">ID: {summary.item.id.slice(0, 8)}</span>
            </div>
            <h3 className="text-lg font-black text-white mt-1">{summary.item.name}</h3>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-emerald-400">{formatNumber(summary.availableStock)}</p>
            <p className="text-[11px] font-bold text-slate-400">Available Buffer ({summary.item.unit || 'pcs'})</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-bold">
          <div className="p-3 bg-slate-100 rounded-xl">
            <p className="text-slate-500">1. Total Inwarded</p>
            <p className="text-base font-black text-slate-900 mt-1">{formatNumber(summary.totalInwarded)}</p>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <p className="text-emerald-800">2. In Warehouse Buffer</p>
            <p className="text-base font-black text-emerald-950 mt-1">{formatNumber(summary.availableStock)}</p>
          </div>
          <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
            <p className="text-indigo-800">3. In-Factory WIP</p>
            <p className="text-base font-black text-indigo-950 mt-1">{formatNumber(summary.totalInFactoryAssembled)}</p>
          </div>
          <div className="p-3 bg-violet-50 rounded-xl border border-violet-200">
            <p className="text-violet-800">4. Shipped Orders</p>
            <p className="text-base font-black text-violet-950 mt-1">{formatNumber(summary.totalDispatchedInOrders)}</p>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose}>
            Close Audit
          </Button>
        </div>
      </div>
    </Modal>
  );
}
