import { Fragment } from 'react';
import {
  Package, CheckCircle2, Zap, Truck, PackageCheck, ChevronRight, ChevronDown, Maximize2, Flame
} from 'lucide-react';
import { Card, Button, Badge, ItemCategoryBadge, ColorBadge } from '@/components/ui';
import type { DashboardCalculations } from './dashboardCalculations';
import type { ComponentStockSummary, MovementWithRelations } from '@/lib/supabase';
import { SCRAP_REASONS } from '@/lib/supabase';
import { formatNumber, formatDate } from '@/lib/utils';
import type { View } from '@/lib/types';

export type ComponentsTabProps = {
  componentStocks: ComponentStockSummary[];
  filteredDispatches: DashboardCalculations['enrichedDispatches'];
  expandedComponentIds: Set<string>;
  onToggleComponentAccordion: (itemId: string) => void;
  onSetSelectedComponentForDrilldown: (cs: ComponentStockSummary) => void;
  selectedCategory: string;
  searchQuery: string;
  onViewChange: (view: View) => void;
  movements: MovementWithRelations[];
};

export function ComponentsTab({
  componentStocks,
  filteredDispatches,
  expandedComponentIds,
  onToggleComponentAccordion,
  onSetSelectedComponentForDrilldown,
  selectedCategory,
  searchQuery,
  onViewChange,
  movements,
}: ComponentsTabProps) {
  const q = searchQuery.toLowerCase().trim();

  return (
    <div className="space-y-6">
      {/* Component Inventory High-Level KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Inwarded Components */}
        <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Parts Received</span>
            <Package className="h-4 w-4 text-slate-700" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {formatNumber(componentStocks.reduce((sum, cs) => sum + cs.totalInwarded, 0))}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            {componentStocks.length} component items tracked
          </p>
        </div>

        {/* Available In-Stock Balance */}
        <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Available in Stock</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-900">
            {formatNumber(componentStocks.reduce((sum, cs) => sum + cs.availableStock, 0))}
          </p>
          <p className="mt-1 text-xs text-emerald-700 font-medium">
            Loose unassembled units in buffer
          </p>
        </div>

        {/* In Factory Assembled on Units */}
        <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">In Factory (Assembled)</span>
            <Zap className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-indigo-900">
            {formatNumber(componentStocks.reduce((sum, cs) => sum + cs.totalInFactoryAssembled, 0))}
          </p>
          <p className="mt-1 text-xs text-indigo-700 font-medium">
            Fitted on WIP & Ready stock bottles
          </p>
        </div>

        {/* Total Consumed in Dispatched Orders */}
        <div className="p-4 rounded-2xl border border-violet-200 bg-violet-50/50 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-800">Shipped to Customers</span>
            <Truck className="h-4 w-4 text-violet-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-violet-900">
            {formatNumber(componentStocks.reduce((sum, cs) => sum + cs.totalDispatchedInOrders, 0))}
          </p>
          <p className="mt-1 text-xs text-violet-700 font-medium">
            Fulfilled in customer order invoices
          </p>
        </div>
      </div>

      {/* SECTION 1: ORDER-WISE COMPONENT CONSUMPTION TABLE */}
      <Card className="p-0 overflow-hidden border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Truck className="h-5 w-5 text-indigo-600" />
              Order-Wise Parts Used (Customer Shipments)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Shipment breakdown showing the exact Caps, Atomizers, and Boxes used on each order.
            </p>
          </div>
          <Badge label={`${filteredDispatches.length} orders`} variant="sky" size="sm" />
        </div>

        {filteredDispatches.length === 0 ? (
          <p className="text-sm text-slate-500 py-10 text-center">No customer dispatches recorded yet.</p>
        ) : (
          <div>
            {/* Mobile View: Cards (< sm) */}
            <div className="p-3.5 space-y-3 sm:hidden">
              {filteredDispatches.map((d) => (
                <div key={`mobile-order-consumption-${d.id}`} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 font-mono text-xs font-black text-slate-800">
                        #{d.invoice_no}
                      </span>
                      <h4 className="font-black text-slate-900 text-sm mt-1">{d.customer_name}</h4>
                      <p className="text-[11px] text-slate-500">{formatDate(d.dispatched_on)}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-black text-slate-900 text-base">{formatNumber(d.qty)}</p>
                      <p className="text-[10px] text-slate-500 font-bold">units</p>
                    </div>
                  </div>

                  <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <span className="font-bold text-indigo-700 font-mono">{d.batchNo}</span>
                    <span className="text-slate-600 ml-1.5">{d.itemName}</span>
                  </div>

                  {/* Consumed Parts */}
                  {(d.resolvedCapName || d.resolvedAtomizerName || d.resolvedBoxName) && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {d.resolvedCapName && (
                        <span className="inline-flex items-center gap-1 font-bold text-violet-900 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-lg text-xs">
                          🧴 {d.resolvedCapName}: <span className="font-black">{formatNumber(d.capsUsed)}</span>
                        </span>
                      )}
                      {d.resolvedAtomizerName && (
                        <span className="inline-flex items-center gap-1 font-bold text-sky-900 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-lg text-xs">
                          💨 {d.resolvedAtomizerName}: <span className="font-black">{formatNumber(d.atomizersUsed)}</span>
                        </span>
                      )}
                      {d.resolvedBoxName && (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg text-xs">
                          📦 {d.resolvedBoxName}: <span className="font-black">{formatNumber(d.boxesUsed)}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop View: Table (>= sm) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-slate-100 text-left text-[11px] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Order / Invoice</th>
                    <th className="px-4 py-3">Customer Account</th>
                    <th className="px-3.5 py-3">Dispatch Date</th>
                    <th className="px-4 py-3">Batch & Bottle Item</th>
                    <th className="px-3.5 py-3 text-right font-black text-slate-900">Order Quantity</th>
                    <th className="px-4 py-3 font-extrabold text-violet-900">🧴 Cap Used</th>
                    <th className="px-4 py-3 font-extrabold text-sky-900">💨 Atomizer Used</th>
                    <th className="px-4 py-3 font-extrabold text-amber-900">📦 Box Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredDispatches.map((d) => (
                    <tr key={`order-consumption-${d.id}`} className="hover:bg-slate-50/90 transition-colors">
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 font-black text-slate-800">
                          {d.invoice_no}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-black text-slate-900 text-sm">
                        {d.customer_name}
                      </td>
                      <td className="px-3.5 py-3 text-slate-500">{formatDate(d.dispatched_on)}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-indigo-700">{d.batchNo}</span>
                        <span className="text-slate-500 ml-1">({d.itemName})</span>
                      </td>
                      <td className="px-3.5 py-3 text-right font-black text-slate-900 text-sm">
                        {formatNumber(d.qty)} <span className="text-[10px] font-normal text-slate-500">pcs</span>
                      </td>
                      <td className="px-4 py-3">
                        {d.resolvedCapName ? (
                          <span className="inline-flex items-center gap-1 font-bold text-violet-900 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded text-[11px]">
                            🧴 {d.resolvedCapName}: <span className="font-black">{formatNumber(d.capsUsed)}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {d.resolvedAtomizerName ? (
                          <span className="inline-flex items-center gap-1 font-bold text-sky-900 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded text-[11px]">
                            💨 {d.resolvedAtomizerName}: <span className="font-black">{formatNumber(d.atomizersUsed)}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {d.resolvedBoxName ? (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                            📦 {d.resolvedBoxName}: <span className="font-black">{formatNumber(d.boxesUsed)}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* SECTION 2: COMPONENT MASTER LEDGER & DRILLDOWN */}
      <Card className="p-0 overflow-hidden border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-indigo-600" />
              All Components & Parts Stock
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any component row or "Inspect" to view the exact customer orders and batches that used it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewChange('items')}
              className="text-xs font-bold cursor-pointer"
            >
              Open Items Catalogue →
            </Button>
          </div>
        </div>

        {componentStocks.length === 0 ? (
          <p className="text-sm text-slate-500 py-12 text-center">No components registered in catalogue.</p>
        ) : (
          <div>
            {/* Mobile View: Component Stock Cards (< sm) */}
            <div className="p-3.5 space-y-3 sm:hidden">
              {componentStocks
                .filter((cs) => {
                  if (selectedCategory !== 'ALL' && cs.category.toLowerCase() !== selectedCategory.toLowerCase()) {
                    return false;
                  }
                  if (q) {
                    const match =
                      cs.item.name.toLowerCase().includes(q) ||
                      cs.category.toLowerCase().includes(q) ||
                      (cs.item.color ?? '').toLowerCase().includes(q);
                    if (!match) return false;
                  }
                  return true;
                })
                .map((cs) => {
                  const { item, totalInwarded, totalInFactoryAssembled, totalDispatchedInOrders, availableStock, orderUsageList, batchUsageList } = cs;
                  const isExpanded = expandedComponentIds.has(item.id);
                  const isLowStock = availableStock <= 0 && totalInwarded > 0;
                  const isNotYetInwarded = totalInwarded === 0;

                  return (
                    <div
                      key={`mobile-comp-card-${item.id}`}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <ItemCategoryBadge category={item.category} />
                            <ColorBadge color={item.color} />
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.unit || 'pcs'}
                            </span>
                          </div>
                          <h4 className="font-black text-slate-900 text-sm mt-1">{item.name}</h4>
                          {item.description && (
                            <p className="text-xs text-slate-500">{item.description}</p>
                          )}
                        </div>

                        <div>
                          {isNotYetInwarded ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 bg-slate-100">
                              Unreceived
                            </span>
                          ) : isLowStock ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-amber-800 bg-amber-100">
                              Exhausted
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-emerald-800 bg-emerald-100">
                              In Stock
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 4-Box Metrics */}
                      <div className="grid grid-cols-4 gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
                        <div className="p-1">
                          <p className="text-[9px] uppercase font-bold text-slate-500">Inward</p>
                          <p className="font-black text-slate-900 text-xs mt-0.5">{formatNumber(totalInwarded)}</p>
                        </div>
                        <div className="p-1 bg-emerald-50 rounded-lg border border-emerald-200">
                          <p className="text-[9px] uppercase font-black text-emerald-800">Buffer</p>
                          <p className="font-black text-emerald-900 text-xs mt-0.5">{formatNumber(availableStock)}</p>
                        </div>
                        <div className="p-1 bg-indigo-50 rounded-lg border border-indigo-200">
                          <p className="text-[9px] uppercase font-black text-indigo-800">Factory</p>
                          <p className="font-black text-indigo-900 text-xs mt-0.5">{formatNumber(totalInFactoryAssembled)}</p>
                        </div>
                        <div className="p-1 bg-violet-50 rounded-lg border border-violet-200">
                          <p className="text-[9px] uppercase font-black text-violet-800">Shipped</p>
                          <p className="font-black text-violet-900 text-xs mt-0.5">{formatNumber(totalDispatchedInOrders)}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => onToggleComponentAccordion(item.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 py-1 px-2 rounded-lg hover:bg-slate-100 cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronDown className="h-3.5 w-3.5 text-slate-900 font-bold" />
                              <span>Hide Usage ({orderUsageList.length + batchUsageList.length})</span>
                            </>
                          ) : (
                            <>
                              <ChevronRight className="h-3.5 w-3.5" />
                              <span>Usage Ledger ({orderUsageList.length + batchUsageList.length})</span>
                            </>
                          )}
                        </button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onSetSelectedComponentForDrilldown(cs)}
                          className="text-xs font-bold text-indigo-700 border-indigo-200 bg-indigo-50 min-h-[34px] px-2.5"
                        >
                          <Maximize2 className="h-3 w-3 mr-1" />
                          Inspect
                        </Button>
                      </div>

                      {/* Expandable Drilldown on Mobile */}
                      {isExpanded && (
                        <div className="p-3 bg-slate-900 text-white rounded-xl space-y-3 mt-2 animate-in fade-in duration-150">
                          <p className="text-xs font-black text-amber-400 font-mono">
                            Traceability for {item.name}
                          </p>

                          {orderUsageList.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-[10px] uppercase font-bold text-violet-300">
                                🚚 Orders Shipped ({orderUsageList.length})
                              </p>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {orderUsageList.map((ord, idx) => (
                                  <div key={`mob-ord-${idx}`} className="p-1.5 rounded bg-slate-800 text-xs flex justify-between">
                                    <div>
                                      <p className="font-bold text-white">#{ord.invoiceNo} {ord.customerName}</p>
                                      <p className="text-[10px] text-slate-400">Batch {ord.batchNo}</p>
                                    </div>
                                    <span className="font-black text-emerald-400 text-xs">{formatNumber(ord.qtyUsed)} pcs</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {batchUsageList.length > 0 && (
                            <div className="space-y-1.5 border-t border-slate-800 pt-2">
                              <p className="text-[10px] uppercase font-bold text-indigo-300">
                                ⚡ Production Batches ({batchUsageList.length})
                              </p>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {batchUsageList.map((bat, idx) => (
                                  <div key={`mob-bat-${idx}`} className="p-1.5 rounded bg-slate-800 text-xs flex justify-between">
                                    <div>
                                      <p className="font-bold text-indigo-300">{bat.batchNo}</p>
                                      <p className="text-[10px] text-slate-400">{bat.itemName}</p>
                                    </div>
                                    <span className="font-black text-indigo-300 text-xs">{formatNumber(bat.qtyUsed)} pcs</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Desktop View: Table (>= sm) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-left text-[11px] font-black uppercase tracking-wider text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 w-8 text-center">#</th>
                    <th className="px-4 py-3">Component / Stock Item</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3">Color / Finish</th>
                    <th className="px-3 py-3">Unit</th>
                    <th className="px-3 py-3 text-right">Received</th>
                    <th className="px-3 py-3 text-right font-black text-emerald-800">Available</th>
                    <th className="px-3 py-3 text-right font-extrabold text-indigo-800">In Factory</th>
                    <th className="px-3 py-3 text-right font-extrabold text-violet-800">Shipped</th>
                    <th className="px-3 py-3 text-right font-extrabold text-rose-600">Scrapped</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {componentStocks
                    .filter((cs) => {
                      if (selectedCategory !== 'ALL' && cs.category.toLowerCase() !== selectedCategory.toLowerCase()) {
                        return false;
                      }
                      if (q) {
                        const match =
                          cs.item.name.toLowerCase().includes(q) ||
                          cs.category.toLowerCase().includes(q) ||
                          (cs.item.color ?? '').toLowerCase().includes(q);
                        if (!match) return false;
                      }
                      return true;
                    })
                    .map((cs) => {
                      const { item, category, totalInwarded, totalInFactoryAssembled, totalDispatchedInOrders, totalScrapped, availableStock, orderUsageList, batchUsageList } = cs;
                      const isExpanded = expandedComponentIds.has(item.id);
                      const isLowStock = availableStock <= 0 && totalInwarded > 0;
                      const isNotYetInwarded = totalInwarded === 0;

                      return (
                        <Fragment key={`comp-group-${item.id}`}>
                          <tr className="hover:bg-slate-50/90 transition-colors group">
                            <td className="px-3 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => onToggleComponentAccordion(item.id)}
                                className="p-1 rounded text-slate-400 hover:text-slate-900 transition cursor-pointer"
                                title="Expand order usage"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-slate-900 font-bold" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div>
                                  <p className="font-extrabold text-slate-900 text-xs">{item.name}</p>
                                  {item.description && (
                                    <p className="text-[10px] text-slate-500 truncate max-w-xs">{item.description}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <ItemCategoryBadge category={item.category} />
                            </td>
                            <td className="px-3 py-3">
                              <ColorBadge color={item.color} />
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-600">{item.unit || 'pcs'}</td>
                            <td className="px-3 py-3 text-right font-black text-slate-900">
                              {formatNumber(totalInwarded)}
                            </td>
                            <td className="px-3 py-3 text-right font-black text-sm bg-emerald-50/40">
                              <span className={availableStock > 0 ? 'text-emerald-700' : 'text-slate-400'}>
                                {formatNumber(availableStock)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-black text-indigo-700">
                              {formatNumber(totalInFactoryAssembled)}
                            </td>
                            <td className="px-3 py-3 text-right font-black text-violet-700">
                              {formatNumber(totalDispatchedInOrders)}
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-rose-600">
                              {totalScrapped > 0 ? formatNumber(totalScrapped) : '0'}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {isNotYetInwarded ? (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 bg-slate-100">
                                  Unreceived
                                </span>
                              ) : isLowStock ? (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-amber-800 bg-amber-100">
                                  Exhausted
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-emerald-800 bg-emerald-100">
                                  In Stock
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onSetSelectedComponentForDrilldown(cs)}
                                className="text-[11px] py-0.5 px-2 font-bold text-indigo-700 border-indigo-200 bg-indigo-50/50 cursor-pointer"
                              >
                                <Maximize2 className="h-3 w-3 mr-1" />
                                Inspect
                              </Button>
                            </td>
                          </tr>

                          {/* Inline Expandable Traceability Breakdown */}
                          {isExpanded && (
                            <tr className="bg-slate-900 text-white">
                              <td colSpan={12} className="p-4">
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-700 text-xs">
                                    <span className="font-black text-amber-400 flex items-center gap-1.5">
                                      Traceability Audit Ledger for: {item.name} [{category}]
                                    </span>
                                    <span className="text-[11px] text-slate-400">
                                      Total Intake: {formatNumber(totalInwarded)} | Shipped in Orders: {formatNumber(totalDispatchedInOrders)} | Remaining In-Stock: {formatNumber(availableStock)}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-2">
                                      <h5 className="text-[11px] font-black uppercase text-violet-300 flex items-center gap-1">
                                        <Truck className="h-3.5 w-3.5" /> Customer Orders Consuming this Component ({orderUsageList.length})
                                      </h5>
                                      {orderUsageList.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic py-2">
                                          No customer orders have dispatched this component yet.
                                        </p>
                                      ) : (
                                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                          {orderUsageList.map((ord, idx) => (
                                            <div key={`ord-${idx}`} className="flex items-center justify-between p-2 rounded bg-slate-900/90 text-xs border border-slate-800">
                                              <div>
                                                <span className="font-bold text-amber-300 mr-2">{ord.invoiceNo}</span>
                                                <span className="text-white font-semibold">{ord.customerName}</span>
                                                <p className="text-[10px] text-slate-400">Batch {ord.batchNo} • {formatDate(ord.dispatchedOn)}</p>
                                              </div>
                                              <div className="text-right">
                                                <span className="font-black text-emerald-400">{formatNumber(ord.qtyUsed)} pcs</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-2">
                                      <h5 className="text-[11px] font-black uppercase text-indigo-300 flex items-center gap-1">
                                        <Zap className="h-3.5 w-3.5" /> Production Batches Assembling this Component ({batchUsageList.length})
                                      </h5>
                                      {batchUsageList.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic py-2">
                                          No active floor batches currently using this component.
                                        </p>
                                      ) : (
                                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                          {batchUsageList.map((bat, idx) => (
                                            <div key={`bat-${idx}`} className="flex items-center justify-between p-2 rounded bg-slate-900/90 text-xs border border-slate-800">
                                              <div>
                                                <span className="font-bold text-indigo-300 mr-2">{bat.batchNo}</span>
                                                <span className="text-white">{bat.itemName}</span>
                                                {bat.movedOn && <p className="text-[10px] text-slate-400">Assembled on {formatDate(bat.movedOn)}</p>}
                                              </div>
                                              <div className="text-right">
                                                <span className="font-black text-indigo-300">{formatNumber(bat.qtyUsed)} pcs</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* Scrap & Defect Intelligence */}
      <Card className="p-5 border-slate-200 bg-white shadow-2xs">
        <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
          <Flame className="h-4 w-4 text-rose-600" />
          Factory Defect & Scrap Intelligence Breakdown
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          All recorded defect losses with classified root causes.
        </p>
        {movements.filter((m) => (m.remarks ?? '').startsWith('[SCRAP') || m.to_stage?.name === 'Scrap / Defect').length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6 border border-dashed rounded-xl">
            Zero defects or scrap losses recorded across any batch.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SCRAP_REASONS.map((reason) => {
              const matching = movements.filter(
                (m) =>
                  (m.remarks ?? '').includes(reason) ||
                  (m.to_stage?.name === 'Scrap / Defect' && (m.remarks ?? '').includes(reason))
              );
              const totalScrapForReason = matching.reduce((sum, m) => sum + m.qty_moved, 0);

              return (
                <div
                  key={reason}
                  className={`p-3.5 rounded-xl border transition ${
                    totalScrapForReason > 0
                      ? 'border-rose-200 bg-rose-50/50'
                      : 'border-slate-100 bg-slate-50/40 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{reason}</span>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${totalScrapForReason > 0 ? 'bg-rose-200 text-rose-900' : 'bg-slate-200 text-slate-600'}`}>
                      {matching.length} incidents
                    </span>
                  </div>
                  <p className={`mt-2 text-xl font-black ${totalScrapForReason > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                    {formatNumber(totalScrapForReason)} <span className="text-xs font-normal text-slate-500">units</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
