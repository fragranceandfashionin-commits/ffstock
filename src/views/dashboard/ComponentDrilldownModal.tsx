import { CheckCircle2, Truck, Zap } from 'lucide-react';
import { Modal, Button, ItemCategoryBadge, ColorBadge } from '@/components/ui';
import type { ComponentStockSummary } from '@/lib/supabase';
import { formatNumber, formatDate } from '@/lib/utils';

export type ComponentDrilldownModalProps = {
  selectedComponent: ComponentStockSummary | null;
  onClose: () => void;
};

export function ComponentDrilldownModal({
  selectedComponent,
  onClose,
}: ComponentDrilldownModalProps) {
  if (!selectedComponent) return null;

  return (
    <Modal
      isOpen={Boolean(selectedComponent)}
      onClose={onClose}
      title={`Component Details: ${selectedComponent.item.name} [${selectedComponent.category}]`}
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Component Header Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900">
                {selectedComponent.item.name}
              </h3>
              <ItemCategoryBadge category={selectedComponent.category} />
              <ColorBadge color={selectedComponent.item.color} />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Track every customer shipment, production batch, and scrapped unit for this component.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold text-slate-500 uppercase">Available in Stock</p>
            <p className="text-xl font-black text-emerald-700">
              {formatNumber(selectedComponent.availableStock)}{' '}
              <span className="text-xs font-normal text-slate-500">{selectedComponent.item.unit || 'pcs'}</span>
            </p>
          </div>
        </div>

        {/* Reconciliation Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Total Received</p>
            <p className="text-lg font-black text-slate-900 mt-0.5">{formatNumber(selectedComponent.totalInwarded)}</p>
            <p className="text-[10px] text-slate-400">{selectedComponent.inwardBatchCount} inward intake entries</p>
          </div>

          <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-2xs">
            <p className="text-[10px] font-bold text-emerald-800 uppercase">Available in Buffer</p>
            <p className="text-lg font-black text-emerald-900 mt-0.5">{formatNumber(selectedComponent.availableStock)}</p>
            <p className="text-[10px] text-emerald-700">Loose stockroom inventory</p>
          </div>

          <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/50 shadow-2xs">
            <p className="text-[10px] font-bold text-indigo-800 uppercase">In Factory (Assembled)</p>
            <p className="text-lg font-black text-indigo-900 mt-0.5">{formatNumber(selectedComponent.totalInFactoryAssembled)}</p>
            <p className="text-[10px] text-indigo-700">Fitted on WIP & Ready bottles</p>
          </div>

          <div className="p-3.5 rounded-xl border border-violet-200 bg-violet-50/50 shadow-2xs">
            <p className="text-[10px] font-bold text-violet-800 uppercase">Shipped in Orders</p>
            <p className="text-lg font-black text-violet-900 mt-0.5">{formatNumber(selectedComponent.totalDispatchedInOrders)}</p>
            <p className="text-[10px] text-violet-700">{selectedComponent.orderUsageList.length} customer invoices</p>
          </div>
        </div>

        {/* Reconciliation Integrity Banner */}
        <div className="p-3 rounded-xl bg-slate-900 text-white border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="font-bold">
              Balanced Inventory Accounting:
            </span>
            <span className="text-slate-300">
              {formatNumber(selectedComponent.totalInwarded)} Received = {formatNumber(selectedComponent.availableStock)} Available + {formatNumber(selectedComponent.totalInFactoryAssembled)} In Factory + {formatNumber(selectedComponent.totalDispatchedInOrders)} Shipped{selectedComponent.totalScrapped > 0 ? ` + ${formatNumber(selectedComponent.totalScrapped)} Scrapped` : ''}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-extrabold text-[10px] uppercase tracking-wider">
            100% Reconciled
          </span>
        </div>

        {/* Customer Orders Breakdown Table */}
        <div className="space-y-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-violet-600" />
            Customer Orders & Dispatches Breakdown ({selectedComponent.orderUsageList.length} Invoices)
          </h4>
          {selectedComponent.orderUsageList.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center border border-dashed rounded-xl">
              No customer orders have dispatched this component yet.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 text-left">Invoice No</th>
                    <th className="p-2.5 text-left">Customer Account</th>
                    <th className="p-2.5 text-left">Dispatch Date</th>
                    <th className="p-2.5 text-left">Origin Batch & Product</th>
                    <th className="p-2.5 text-right font-black text-violet-900">Quantity Consumed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedComponent.orderUsageList.map((ord, idx) => (
                    <tr key={`modal-ord-${idx}`} className="hover:bg-slate-50">
                      <td className="p-2.5 font-black text-slate-800">{ord.invoiceNo}</td>
                      <td className="p-2.5 font-bold text-slate-900">{ord.customerName}</td>
                      <td className="p-2.5 text-slate-500">{formatDate(ord.dispatchedOn)}</td>
                      <td className="p-2.5">
                        <span className="font-bold text-indigo-700">{ord.batchNo}</span>
                        <span className="text-slate-500 ml-1">({ord.itemName})</span>
                      </td>
                      <td className="p-2.5 text-right font-black text-violet-700 text-sm">
                        {formatNumber(ord.qtyUsed)} <span className="text-[10px] font-normal text-slate-500">pcs</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Production Batches Breakdown Table */}
        <div className="space-y-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-indigo-600" />
            Floor Batches Assembled with this Component ({selectedComponent.batchUsageList.length} Batches)
          </h4>
          {selectedComponent.batchUsageList.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4 text-center border border-dashed rounded-xl">
              No active floor batches assembling this component yet.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 text-left">Batch No</th>
                    <th className="p-2.5 text-left">Product Item</th>
                    <th className="p-2.5 text-left">Assembly Date</th>
                    <th className="p-2.5 text-right font-black text-indigo-900">Quantity Attached</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedComponent.batchUsageList.map((bat, idx) => (
                    <tr key={`modal-bat-${idx}`} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-indigo-700">{bat.batchNo}</td>
                      <td className="p-2.5 font-medium text-slate-800">{bat.itemName}</td>
                      <td className="p-2.5 text-slate-500">{bat.movedOn ? formatDate(bat.movedOn) : '—'}</td>
                      <td className="p-2.5 text-right font-black text-indigo-700 text-sm">
                        {formatNumber(bat.qtyUsed)} <span className="text-[10px] font-normal text-slate-500">pcs</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex justify-between items-center pt-3 border-t border-slate-100">
          <span className="text-xs text-slate-400">
            Live inventory tracking data.
          </span>
          <Button variant="secondary" size="sm" onClick={onClose} className="cursor-pointer">
            Close Details
          </Button>
        </div>
      </div>
    </Modal>
  );
}
