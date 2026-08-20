import {
  Box, CheckCircle, AlertTriangle, TrendingUp, Zap, Truck, Maximize2, MapPin
} from 'lucide-react';
import { Modal, Button, Badge, ColorBadge } from '@/components/ui';
import type { DashboardCalculations } from './dashboardCalculations';
import type { DynamicContext, InspectedBatchItem } from './types';
import type { ComponentStockSummary } from '@/lib/supabase';
import { formatNumber, formatDate } from '@/lib/utils';

export type MilestoneDrilldownModalProps = {
  dynamicContext: DynamicContext | null;
  onClose: () => void;
  calculations: DashboardCalculations;
  componentStocks: ComponentStockSummary[];
  onSetInspectedBatchItem: (item: InspectedBatchItem) => void;
  onSetSelectedComponentForDrilldown: (cs: ComponentStockSummary) => void;
  onOpenQuickModal: (batchId?: string, defaultTab?: 'move' | 'scrap' | 'dispatch') => void;
};

export function MilestoneDrilldownModal({
  dynamicContext,
  onClose,
  calculations,
  componentStocks,
  onSetInspectedBatchItem,
  onSetSelectedComponentForDrilldown,
  onOpenQuickModal,
}: MilestoneDrilldownModalProps) {
  if (!dynamicContext) return null;

  let scopeBatches: typeof calculations.batchMatrix = [];
  let scopeDispatches: typeof calculations.enrichedDispatches = [];
  let scopeTotalQty = 0;
  let isDispatchScope = false;
  let isComponentScope = false;
  let scopeComponents: ComponentStockSummary[] = [];

  const rawStage = calculations.processStages.find((s) => s.name === 'Raw Stock');
  const readyStage = calculations.processStages.find((s) => s.name === 'Ready');

  if (dynamicContext.key === 'RAW') {
    scopeBatches = calculations.batchMatrix.filter(
      (b) => (b.stageQuantities[rawStage?.id ?? ''] ?? 0) > 0
    );
    scopeTotalQty = calculations.rawStockTotal;
  } else if (dynamicContext.key === 'IN_PRODUCTION') {
    scopeBatches = calculations.batchMatrix.filter((b) => b.isInProduction);
    scopeTotalQty = calculations.productionTotal;
  } else if (dynamicContext.key === 'READY') {
    scopeBatches = calculations.batchMatrix.filter(
      (b) => (b.stageQuantities[readyStage?.id ?? ''] ?? 0) > 0
    );
    scopeTotalQty = calculations.readyStockTotal;
  } else if (dynamicContext.key === 'DISPATCHED') {
    isDispatchScope = true;
    scopeDispatches = calculations.enrichedDispatches;
    scopeTotalQty = calculations.totalDispatched;
  } else if (dynamicContext.key === 'IN_FACTORY') {
    scopeBatches = calculations.batchMatrix.filter((b) => b.inFactoryQty > 0);
    scopeTotalQty = calculations.totalInsideFactory;
  } else if (dynamicContext.key === 'STALLED') {
    scopeBatches = calculations.batchMatrix.filter((b) => b.isStalled);
    scopeTotalQty = scopeBatches.reduce((acc, b) => acc + b.inFactoryQty, 0);
  } else if (dynamicContext.key === 'BOTTLES') {
    scopeBatches = calculations.batchMatrix.filter(
      (b) => (b.batch.item?.category || 'Bottle') === 'Bottle'
    );
    scopeTotalQty = calculations.totalBottlesInsideFactory;
  } else if (dynamicContext.key === 'CAPS') {
    isComponentScope = true;
    scopeComponents = componentStocks.filter((c) => c.category.toLowerCase() === 'cap');
    scopeTotalQty = calculations.totalCapsAvailable;
  } else if (dynamicContext.key === 'ATOMIZERS') {
    isComponentScope = true;
    scopeComponents = componentStocks.filter((c) => c.category.toLowerCase() === 'atomizer');
    scopeTotalQty = calculations.totalAtomizersAvailable;
  } else if (dynamicContext.key === 'BOXES') {
    isComponentScope = true;
    scopeComponents = componentStocks.filter((c) => c.category.toLowerCase() === 'packaging');
    scopeTotalQty = calculations.totalBoxesAvailable;
  } else if (dynamicContext.key === 'STAGE' && dynamicContext.stageId) {
    const targetStageId = dynamicContext.stageId;
    scopeBatches = calculations.batchMatrix.filter(
      (b) => (b.stageQuantities[targetStageId] ?? 0) > 0
    );
    scopeTotalQty = scopeBatches.reduce(
      (acc, b) => acc + (b.stageQuantities[targetStageId] ?? 0),
      0
    );
  } else {
    scopeBatches = calculations.batchMatrix;
    scopeTotalQty = calculations.totalReceived;
  }

  const uniqueItemsInScope = isComponentScope
    ? scopeComponents.length
    : isDispatchScope
    ? new Set(scopeDispatches.map((d) => d.itemName)).size
    : new Set(scopeBatches.map((b) => b.batch.item?.name).filter(Boolean)).size;

  const uniqueLocationsInScope = isComponentScope
    ? new Set(scopeComponents.map((c) => c.item.color).filter(Boolean)).size
    : isDispatchScope
    ? new Set(scopeDispatches.map((d) => d.customer_name)).size
    : new Set(scopeBatches.map((b) => b.batch.location).filter(Boolean)).size;

  return (
    <Modal
      isOpen={Boolean(dynamicContext)}
      onClose={onClose}
      title={dynamicContext.title}
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Context Subtitle & Filter Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div>
            <p className="text-xs font-semibold text-slate-700">{dynamicContext.subtitle}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Showing live data from the factory stock ledger.
            </p>
          </div>
          <Badge label={dynamicContext.badgeLabel} variant={dynamicContext.color} size="md" />
        </div>

        {/* Actionable Executive Guidance Banner */}
        <div
          className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
            dynamicContext.key === 'RAW'
              ? 'bg-slate-900 text-white border-slate-800'
              : dynamicContext.key === 'IN_PRODUCTION'
              ? 'bg-amber-950 text-amber-50 border-amber-800'
              : dynamicContext.key === 'READY'
              ? 'bg-sky-950 text-sky-50 border-sky-800'
              : dynamicContext.key === 'STALLED'
              ? 'bg-rose-950 text-rose-50 border-rose-800'
              : 'bg-slate-900 text-white border-slate-800'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded-xl bg-white/10 text-white mt-0.5 shrink-0">
              {dynamicContext.key === 'RAW' ? (
                <Box className="h-5 w-5 text-amber-300" />
              ) : dynamicContext.key === 'READY' ? (
                <CheckCircle className="h-5 w-5 text-emerald-300" />
              ) : dynamicContext.key === 'STALLED' ? (
                <AlertTriangle className="h-5 w-5 text-rose-300" />
              ) : (
                <TrendingUp className="h-5 w-5 text-sky-300" />
              )}
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-amber-300">
                {dynamicContext.key === 'RAW'
                  ? '⚡ What to do next with this Raw Stock:'
                  : dynamicContext.key === 'READY'
                  ? '⚡ Ready for Customer Fulfillment:'
                  : dynamicContext.key === 'STALLED'
                  ? '⚠️ Operational Bottleneck Action:'
                  : dynamicContext.key === 'STAGE'
                  ? '⚡ Current Stage Status & Progression:'
                  : '⚡ Factory Manager Summary:'}
              </p>
              <p className="text-sm font-bold text-white mt-0.5 leading-snug">
                {dynamicContext.key === 'RAW'
                  ? `${formatNumber(scopeTotalQty)} raw units waiting in storage bays. Ready to transfer to Coloring or Printing to start shop floor production.`
                  : dynamicContext.key === 'READY'
                  ? `${formatNumber(scopeTotalQty)} inspected finished units ready in stock. Issue delivery challans and dispatch to customer accounts.`
                  : dynamicContext.key === 'STALLED'
                  ? `${scopeBatches.length} batches have had no movement or dispatch for over 7 days. Inspect floor status or advance stages immediately.`
                  : dynamicContext.key === 'STAGE'
                  ? `${formatNumber(scopeTotalQty)} units currently inside this stage across ${scopeBatches.length} batches.`
                  : `${formatNumber(scopeTotalQty)} units tracked across ${scopeBatches.length} active batches.`}
              </p>
            </div>
          </div>
          {scopeBatches.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const firstBatchId = scopeBatches[0].batch.id;
                onClose();
                onOpenQuickModal(firstBatchId, dynamicContext.key === 'READY' ? 'dispatch' : 'move');
              }}
              className="text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-950 border-none shrink-0 shadow-sm cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5" />
              {dynamicContext.key === 'READY' ? 'Dispatch Batch' : 'Move Batch to Next Stage'}
            </Button>
          )}
        </div>

        {/* Scope Summary HUD */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs">
            <p className="text-[10px] font-bold text-slate-500 uppercase">
              {isComponentScope ? 'Total Parts Received' : 'Total Quantity'}
            </p>
            <p className="text-xl font-black text-slate-900 mt-0.5">
              {formatNumber(
                isComponentScope
                  ? scopeComponents.reduce((s, c) => s + c.totalInwarded, 0)
                  : scopeTotalQty
              )}
            </p>
            <p className="text-[10px] text-slate-400">
              {isComponentScope ? 'inwarded intake' : 'units in scope'}
            </p>
          </div>

          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-2xs">
            <p className="text-[10px] font-bold text-emerald-800 uppercase">
              {isComponentScope ? 'Available in Stock' : 'Batches Count'}
            </p>
            <p className="text-xl font-black text-emerald-900 mt-0.5">
              {formatNumber(
                isComponentScope
                  ? scopeComponents.reduce((s, c) => s + c.availableStock, 0)
                  : isDispatchScope
                  ? scopeDispatches.length
                  : scopeBatches.length
              )}
            </p>
            <p className="text-[10px] text-emerald-700">
              {isComponentScope ? 'loose in warehouse' : isDispatchScope ? 'dispatches recorded' : 'active batches'}
            </p>
          </div>

          <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/50 shadow-2xs">
            <p className="text-[10px] font-bold text-indigo-800 uppercase">
              {isComponentScope ? 'In Factory (Assembled)' : 'Distinct SKUs / Items'}
            </p>
            <p className="text-xl font-black text-indigo-900 mt-0.5">
              {formatNumber(
                isComponentScope
                  ? scopeComponents.reduce((s, c) => s + c.totalInFactoryAssembled, 0)
                  : uniqueItemsInScope
              )}
            </p>
            <p className="text-[10px] text-indigo-700">
              {isComponentScope ? 'fitted on WIP / Ready stock' : 'products involved'}
            </p>
          </div>

          <div className="p-3 rounded-xl border border-violet-200 bg-violet-50/50 shadow-2xs">
            <p className="text-[10px] font-bold text-violet-800 uppercase">
              {isComponentScope ? 'Shipped to Customers' : 'Storage Bays'}
            </p>
            <p className="text-xl font-black text-violet-900 mt-0.5">
              {formatNumber(
                isComponentScope
                  ? scopeComponents.reduce((s, c) => s + c.totalDispatchedInOrders, 0)
                  : uniqueLocationsInScope
              )}
            </p>
            <p className="text-[10px] text-violet-700">
              {isComponentScope ? 'units in customer orders' : isDispatchScope ? 'client accounts' : 'active bays'}
            </p>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
          <div className="bg-slate-50 p-2.5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              {isComponentScope
                ? 'Component Master Inventory Ledger'
                : isDispatchScope
                ? 'Dispatched Orders Ledger'
                : 'Ground-Truth Batches Detail (Click Any Row for 360° Journey)'}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">
              {isComponentScope
                ? scopeComponents.length
                : isDispatchScope
                ? scopeDispatches.length
                : scopeBatches.length}{' '}
              records found
            </span>
          </div>

          {isComponentScope ? (
            <div className="space-y-4">
              {/* Master Component Inventory Table */}
              {scopeComponents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Zero registered components found in this category.
                </div>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-[10px] font-extrabold uppercase text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Component / SKU</th>
                        <th className="p-2.5">Color / Finish</th>
                        <th className="p-2.5 text-right">Received</th>
                        <th className="p-2.5 text-right font-black text-emerald-800">Available</th>
                        <th className="p-2.5 text-right font-bold text-indigo-800">In Factory</th>
                        <th className="p-2.5 text-right font-bold text-violet-800">Shipped</th>
                        <th className="p-2.5 text-right font-bold text-rose-600">Scrapped</th>
                        <th className="p-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {scopeComponents.map((cs) => (
                        <tr key={cs.item.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-900">{cs.item.name}</td>
                          <td className="p-2.5">
                            <ColorBadge color={cs.item.color} />
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-900">
                            {formatNumber(cs.totalInwarded)}
                          </td>
                          <td className="p-2.5 text-right font-black text-emerald-700 text-sm bg-emerald-50/40">
                            {formatNumber(cs.availableStock)} {cs.item.unit || 'pcs'}
                          </td>
                          <td className="p-2.5 text-right font-bold text-indigo-700">
                            {formatNumber(cs.totalInFactoryAssembled)}
                          </td>
                          <td className="p-2.5 text-right font-bold text-violet-700">
                            {formatNumber(cs.totalDispatchedInOrders)}
                          </td>
                          <td className="p-2.5 text-right font-bold text-rose-600">
                            {cs.totalScrapped > 0 ? formatNumber(cs.totalScrapped) : '0'}
                          </td>
                          <td className="p-2.5 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onClose();
                                onSetSelectedComponentForDrilldown(cs);
                              }}
                              className="text-[11px] py-1 px-2 font-bold text-indigo-700 border-indigo-200 bg-indigo-50/50 cursor-pointer"
                            >
                              <Maximize2 className="h-2.5 w-2.5 mr-1" />
                              Audit Traceability
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Customer Orders Breakdown */}
              {(() => {
                const categoryOrders = calculations.enrichedDispatches.filter((d) => {
                  if (dynamicContext.key === 'CAPS') return Boolean(d.resolvedCapName);
                  if (dynamicContext.key === 'ATOMIZERS') return Boolean(d.resolvedAtomizerName);
                  if (dynamicContext.key === 'BOXES') return Boolean(d.resolvedBoxName);
                  return false;
                });

                return (
                  <div className="border-t border-slate-200 pt-3 space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                        <Truck className="h-4 w-4 text-violet-600" />
                        Customer Orders & Dispatches Breakdown ({categoryOrders.length} Invoices)
                      </span>
                    </div>
                    {categoryOrders.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-3 text-center border border-dashed rounded-xl">
                        No customer dispatches recorded yet for this component category.
                      </p>
                    ) : (
                      <div className="max-h-[220px] overflow-y-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-100 text-[10px] font-extrabold uppercase text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="p-2">Invoice No</th>
                              <th className="p-2">Customer Account</th>
                              <th className="p-2">Component Attached</th>
                              <th className="p-2">Origin Batch & Product</th>
                              <th className="p-2 text-right font-bold text-violet-900">Quantity Consumed</th>
                              <th className="p-2">Dispatch Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {categoryOrders.map((ord, idx) => (
                              <tr key={`comp-ord-${idx}`} className="hover:bg-slate-50">
                                <td className="p-2 font-black text-violet-900">{ord.invoice_no}</td>
                                <td className="p-2 font-bold text-slate-800">{ord.customer_name}</td>
                                <td className="p-2 font-bold text-indigo-700">
                                  {dynamicContext.key === 'CAPS'
                                    ? ord.resolvedCapName
                                    : dynamicContext.key === 'ATOMIZERS'
                                    ? ord.resolvedAtomizerName
                                    : ord.resolvedBoxName}
                                </td>
                                <td className="p-2 text-slate-600">
                                  <span className="font-mono font-bold text-slate-800 mr-1">{ord.batchNo}</span>
                                  ({ord.itemName})
                                </td>
                                <td className="p-2 text-right font-black text-violet-700">
                                  {formatNumber(ord.qty)} pcs
                                </td>
                                <td className="p-2 text-slate-500 text-[11px]">{formatDate(ord.dispatched_on)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : isDispatchScope ? (
            scopeDispatches.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Zero dispatches currently recorded in this context.
              </div>
            ) : (
              <div className="max-h-[350px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-[10px] font-extrabold uppercase text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Invoice No</th>
                      <th className="p-2.5">Customer</th>
                      <th className="p-2.5">Batch No</th>
                      <th className="p-2.5">Item</th>
                      <th className="p-2.5 text-right">Shipped Qty</th>
                      <th className="p-2.5">Dispatch Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scopeDispatches.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-extrabold text-violet-900">{d.invoice_no}</td>
                        <td className="p-2.5 font-bold text-slate-800">{d.customer_name}</td>
                        <td className="p-2.5 font-mono text-slate-700">{d.batchNo}</td>
                        <td className="p-2.5 text-slate-600">{d.itemName}</td>
                        <td className="p-2.5 text-right font-black text-slate-900">
                          {formatNumber(d.qty)}
                        </td>
                        <td className="p-2.5 text-slate-500 text-[11px]">
                          {formatDate(d.dispatched_on)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : scopeBatches.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Zero batches currently active in this stage/milestone. Reconciled inventory ledger is clean.
            </div>
          ) : (
            <div className="max-h-[350px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-[10px] font-extrabold uppercase text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Batch / Bay</th>
                    <th className="p-2.5">Item & Supplier</th>
                    <th className="p-2.5 text-right">
                      {dynamicContext.key === 'STAGE' && dynamicContext.stageId
                        ? 'Stage Qty'
                        : 'Factory Qty'}
                    </th>
                    <th className="p-2.5">Active Stages</th>
                    <th className="p-2.5">Inward & Age</th>
                    <th className="p-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scopeBatches.map((item) => {
                    const targetStageQty =
                      dynamicContext.key === 'STAGE' && dynamicContext.stageId
                        ? item.stageQuantities[dynamicContext.stageId] ?? 0
                        : item.inFactoryQty;

                    return (
                      <tr key={item.batch.id} className="hover:bg-slate-50">
                        <td className="p-2.5">
                          <div
                            onClick={() => {
                              onClose();
                              onSetInspectedBatchItem(item);
                            }}
                            className="font-extrabold font-mono text-indigo-700 hover:underline cursor-pointer flex items-center gap-1"
                            title="Click to open 360° Batch Journey"
                          >
                            {item.batch.batch_no}
                            <Maximize2 className="h-2.5 w-2.5 text-indigo-400" />
                          </div>
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-semibold mt-0.5">
                            <MapPin className="h-2.5 w-2.5 text-slate-400" />
                            {item.batch.location || 'Unassigned Bay'}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-800">{item.batch.item?.name ?? '—'}</span>
                            <ColorBadge color={item.batch.color} />
                          </div>
                          <div className="text-[11px] text-slate-500">{item.batch.supplier?.name ?? '—'}</div>
                        </td>
                        <td className="p-2.5 text-right">
                          <span className="font-black text-slate-900 text-sm">
                            {formatNumber(targetStageQty)}
                          </span>
                          <div className="text-[10px] text-slate-400">
                            of {formatNumber(item.batch.qty_received)} total
                          </div>
                        </td>
                        <td className="p-2.5">
                          <div className="flex flex-wrap gap-1">
                            {item.activeStages.map((as: { stageId: string; stageName: string; sequenceNo: number; qty: number }) => (
                              <span
                                key={as.stageId}
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  dynamicContext.key === 'STAGE' && dynamicContext.stageId === as.stageId
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {as.stageName}: {formatNumber(as.qty)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-2.5 text-[11px]">
                          <div className="font-medium text-slate-700">{formatDate(item.batch.received_on)}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span
                              className={`font-extrabold ${
                                item.isStalled ? 'text-rose-600' : item.ageInDays <= 2 ? 'text-emerald-700' : 'text-slate-600'
                              }`}
                            >
                              {item.ageInDays === 0 ? 'Today' : `${item.ageInDays} days`}
                            </span>
                            {item.isStalled && (
                              <span className="bg-rose-100 text-rose-800 text-[9px] font-black px-1 py-0.2 rounded uppercase">
                                Stalled
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onClose();
                                onSetInspectedBatchItem(item);
                              }}
                              className="text-[11px] py-1 px-2 font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-100 cursor-pointer"
                              title="Inspect 360° Journey"
                            >
                              <Maximize2 className="h-2.5 w-2.5 mr-1" />
                              Inspect 360°
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                onClose();
                                onOpenQuickModal(item.batch.id, dynamicContext.key === 'READY' ? 'dispatch' : 'move');
                              }}
                              className="text-[11px] py-1 px-2 font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200 cursor-pointer"
                            >
                              {dynamicContext.key === 'READY' ? 'Dispatch' : 'Move Stock'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Customer Orders Breakdown for Bottles */}
          {dynamicContext.key === 'BOTTLES' && (() => {
            const bottleDispatches = calculations.enrichedDispatches.filter(
              (d) => (d.batch?.item?.category || 'Bottle') === 'Bottle'
            );

            return (
              <div className="border-t border-slate-200 p-3 space-y-2 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Truck className="h-4 w-4 text-violet-600" />
                    Customer Orders & Dispatches Breakdown ({bottleDispatches.length} Invoices)
                  </span>
                  <span className="text-[11px] font-bold text-violet-800">
                    Total Shipped: {formatNumber(calculations.totalBottlesDispatched)} bottles
                  </span>
                </div>
                {bottleDispatches.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-3 text-center border border-dashed rounded-xl">
                    No customer bottle dispatches recorded yet.
                  </p>
                ) : (
                  <div className="max-h-[220px] overflow-y-auto border border-slate-200 rounded-xl bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-100 text-[10px] font-extrabold uppercase text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="p-2">Invoice No</th>
                          <th className="p-2">Customer Account</th>
                          <th className="p-2">Bottle Product</th>
                          <th className="p-2">Batch No</th>
                          <th className="p-2 text-right font-bold text-violet-900">Bottles Shipped</th>
                          <th className="p-2">Dispatch Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bottleDispatches.map((ord, idx) => (
                          <tr key={`bottle-ord-${idx}`} className="hover:bg-slate-50">
                            <td className="p-2 font-black text-violet-900">{ord.invoice_no}</td>
                            <td className="p-2 font-bold text-slate-800">{ord.customer_name}</td>
                            <td className="p-2 font-medium text-slate-800">{ord.itemName}</td>
                            <td className="p-2 font-mono text-slate-700 font-bold">{ord.batchNo}</td>
                            <td className="p-2 text-right font-black text-violet-700">
                              {formatNumber(ord.qty)} pcs
                            </td>
                            <td className="p-2 text-slate-500 text-[11px]">{formatDate(ord.dispatched_on)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Modal Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 pt-3 border-t border-slate-100">
          <span className="text-xs text-slate-400">
            Data reconciled dynamically from live inventory state.
          </span>
          <Button variant="secondary" size="sm" onClick={onClose} className="cursor-pointer min-h-[38px] justify-center">
            Close Context Modal
          </Button>
        </div>
      </div>
    </Modal>
  );
}
