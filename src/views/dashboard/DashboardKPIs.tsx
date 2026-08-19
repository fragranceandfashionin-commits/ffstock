import {
  AlertTriangle, CheckCircle, MapPin, Box, Building2, TrendingUp, Truck, Package, Zap, Maximize2,
  ChevronRight, PackageCheck, Clock
} from 'lucide-react';
import { Card } from '@/components/ui';
import type { DashboardCalculations } from './dashboardCalculations';
import type { KpiFilter, DynamicContextType, DashboardTab } from './types';
import { formatNumber, formatDate } from '@/lib/utils';

export type DashboardKPIsProps = {
  calculations: DashboardCalculations;
  kpiFilter: KpiFilter;
  onOpenMilestoneContext: (
    key: DynamicContextType,
    title: string,
    subtitle: string,
    badgeLabel: string,
    color: 'slate' | 'amber' | 'sky' | 'violet' | 'emerald' | 'rose'
  ) => void;
  onSetActiveTab: (tab: DashboardTab) => void;
  activeFilterCount: number;
};

export function DashboardKPIs({
  calculations,
  kpiFilter,
  onOpenMilestoneContext,
  onSetActiveTab,
  activeFilterCount,
}: DashboardKPIsProps) {
  const {
    stalledBatches,
    readyStockTotal,
    readyBatchesCount,
    activeRacksCount,
    totalInsideFactory,
    totalReceived,
    batchesInFactoryCount,
    productionTotal,
    productionBatchesCount,
    totalDispatched,
    enrichedDispatches,
    totalBottlesInwarded,
    totalBottlesRaw,
    totalBottlesInsideFactory,
    totalBottlesDispatched,
    totalCapsInwarded,
    totalCapsAvailable,
    totalCapsInFactoryAssembled,
    totalCapsDispatched,
    totalAtomizersInwarded,
    totalAtomizersAvailable,
    totalAtomizersInFactoryAssembled,
    totalAtomizersDispatched,
    totalBoxesInwarded,
    totalBoxesAvailable,
    totalBoxesInFactoryAssembled,
    totalBoxesDispatched,
    earliestInwardDate,
    latestInwardDate,
    latestDispatchDate,
    rawStockTotal,
    rawBatchesCount,
    dispatchedBatchesCount,
    batchMatrix,
  } = calculations;

  return (
    <div className="space-y-6">
      {/* ─── Operational Exception & Attention Strip ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Stalled Batches Alert */}
        <div
          onClick={() =>
            onOpenMilestoneContext(
              'STALLED',
              'Inactive Batches (> 7 Days)',
              'Batches waiting on the factory floor without movement or dispatch for over 7 days',
              'Waiting Alert',
              'rose'
            )
          }
          className={`cursor-pointer p-3 rounded-2xl border transition-all flex items-center justify-between group ${
            kpiFilter === 'STALLED'
              ? 'bg-rose-100/80 border-rose-400 ring-2 ring-rose-400/40 shadow-xs'
              : stalledBatches.length > 0
              ? 'bg-rose-50/70 border-rose-200 hover:bg-rose-100/50 hover:shadow-2xs'
              : 'bg-slate-50 border-slate-200 opacity-80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${stalledBatches.length > 0 ? 'bg-rose-500 text-white shadow-2xs' : 'bg-slate-200 text-slate-600'}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                {stalledBatches.length} {stalledBatches.length === 1 ? 'Batch' : 'Batches'} Inactive (&gt; 7 Days)
              </p>
              <p className="text-[11px] text-slate-500">
                {stalledBatches.length > 0 ? 'Waiting on floor without dispatch' : 'All floor batches moving within schedule'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-100/80 group-hover:bg-rose-700 group-hover:text-white px-2 py-0.5 rounded-md transition-colors flex items-center gap-1">
            <Maximize2 className="h-2.5 w-2.5" />
            {kpiFilter === 'STALLED' ? 'Viewing' : 'Inspect'}
          </span>
        </div>

        {/* Ready for Customer Dispatch Staging */}
        <div
          onClick={() =>
            onOpenMilestoneContext(
              'READY',
              '3. Ready to Ship (Finished Goods)',
              'Passed inspection and ready for customer dispatch delivery',
              'Finished Goods',
              'sky'
            )
          }
          className={`cursor-pointer p-3 rounded-2xl border transition-all flex items-center justify-between group ${
            kpiFilter === 'READY'
              ? 'bg-sky-100/80 border-sky-400 ring-2 ring-sky-400/40 shadow-xs'
              : readyStockTotal > 0
              ? 'bg-sky-50/70 border-sky-200 hover:bg-sky-100/50 hover:shadow-2xs'
              : 'bg-slate-50 border-slate-200 opacity-80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${readyStockTotal > 0 ? 'bg-sky-600 text-white shadow-2xs' : 'bg-slate-200 text-slate-600'}`}>
              <CheckCircle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                {formatNumber(readyStockTotal)} Units Finished & Ready
              </p>
              <p className="text-[11px] text-slate-500">
                {readyBatchesCount} batches waiting for dispatch
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 bg-sky-100/80 group-hover:bg-sky-700 group-hover:text-white px-2 py-0.5 rounded-md transition-colors flex items-center gap-1">
            <Maximize2 className="h-2.5 w-2.5" />
            {kpiFilter === 'READY' ? 'Viewing' : 'Inspect'}
          </span>
        </div>

        {/* Storage Rack Distribution */}
        <div
          onClick={() => onSetActiveTab('locations')}
          className="cursor-pointer p-3 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition-all flex items-center justify-between group shadow-2xs"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 text-white shadow-2xs">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                {activeRacksCount} Active Storage Bays
              </p>
              <p className="text-[11px] text-slate-500">
                Holding {formatNumber(totalInsideFactory)} total floor units
              </p>
            </div>
          </div>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-200 group-hover:bg-slate-800 group-hover:text-white px-2 py-0.5 rounded-md transition-colors">
            View Bays
          </span>
        </div>
      </div>

      {/* ─── Executive HUD: Hard Operational Unit Cards ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total Inward Received */}
        <button
          type="button"
          onClick={() =>
            onOpenMilestoneContext(
              'ALL',
              'Total Stock Received',
              'All inward shipments received into factory',
              'Total Intake',
              'slate'
            )
          }
          className={`text-left p-4 rounded-2xl border transition-all duration-150 relative bg-white group cursor-pointer ${
            kpiFilter === 'ALL' && activeFilterCount === 0
              ? 'border-slate-800 shadow-md ring-1 ring-slate-800'
              : 'border-slate-200 hover:border-slate-300 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Received</span>
            <Box className="h-4 w-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{formatNumber(totalReceived)}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>{formatNumber(batchMatrix.length)} total batches</span>
            <span className="font-semibold text-slate-700 flex items-center gap-0.5 group-hover:underline">
              Inspect <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </button>

        {/* Live Inside Factory */}
        <button
          type="button"
          onClick={() =>
            onOpenMilestoneContext(
              'IN_FACTORY',
              'Current Stock Inside Factory',
              'Active units remaining on floor inside factory bays',
              'Inside Factory',
              'emerald'
            )
          }
          className={`text-left p-4 rounded-2xl border transition-all duration-150 relative group cursor-pointer ${
            kpiFilter === 'IN_FACTORY'
              ? 'border-emerald-700 bg-emerald-50 text-emerald-950 shadow-md ring-2 ring-emerald-600/30'
              : 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/70 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">Inside Factory</span>
            <Building2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-800">{formatNumber(totalInsideFactory)}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-emerald-700">
            <span>{batchesInFactoryCount} active batches</span>
            <span className="font-bold flex items-center gap-0.5 group-hover:underline">
              Inspect <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          {kpiFilter === 'IN_FACTORY' && (
            <span className="absolute -top-2 right-3 bg-emerald-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">
              Filter Active
            </span>
          )}
        </button>

        {/* In Production */}
        <button
          type="button"
          onClick={() =>
            onOpenMilestoneContext(
              'IN_PRODUCTION',
              '2. In Production (Being Made)',
              'Batches currently undergoing machine and assembly conversion stages',
              'In Production',
              'amber'
            )
          }
          className={`text-left p-4 rounded-2xl border transition-all duration-150 relative group cursor-pointer ${
            kpiFilter === 'IN_PRODUCTION'
              ? 'border-amber-700 bg-amber-50 text-amber-950 shadow-md ring-2 ring-amber-600/30'
              : 'border-amber-200 bg-amber-50/40 hover:bg-amber-50/70 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">In Production</span>
            <TrendingUp className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-amber-800">{formatNumber(productionTotal)}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-amber-700">
            <span>{productionBatchesCount} batches in progress</span>
            <span className="font-bold flex items-center gap-0.5 group-hover:underline">
              Inspect <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          {kpiFilter === 'IN_PRODUCTION' && (
            <span className="absolute -top-2 right-3 bg-amber-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">
              Filter Active
            </span>
          )}
        </button>

        {/* Ready for Dispatch */}
        <button
          type="button"
          onClick={() =>
            onOpenMilestoneContext(
              'READY',
              '3. Ready to Ship (Finished Goods)',
              'Inspected ready stock awaiting customer dispatches',
              'Finished Goods',
              'sky'
            )
          }
          className={`text-left p-4 rounded-2xl border transition-all duration-150 relative group cursor-pointer ${
            kpiFilter === 'READY'
              ? 'border-sky-700 bg-sky-50 text-sky-950 shadow-md ring-2 ring-sky-600/30'
              : 'border-sky-200 bg-sky-50/40 hover:bg-sky-50/70 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-900">Ready to Ship</span>
            <CheckCircle className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-sky-800">{formatNumber(readyStockTotal)}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-sky-700">
            <span>{readyBatchesCount} finished batches</span>
            <span className="font-bold flex items-center gap-0.5 group-hover:underline">
              Inspect <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          {kpiFilter === 'READY' && (
            <span className="absolute -top-2 right-3 bg-sky-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">
              Filter Active
            </span>
          )}
        </button>

        {/* Total Dispatched */}
        <button
          type="button"
          onClick={() =>
            onOpenMilestoneContext(
              'DISPATCHED',
              '4. Shipped to Customers',
              'Fulfilled shipments dispatched and delivered to client accounts',
              'Shipped Orders',
              'violet'
            )
          }
          className={`text-left p-4 rounded-2xl border transition-all duration-150 relative group cursor-pointer ${
            kpiFilter === 'DISPATCHED'
              ? 'border-violet-700 bg-violet-50 text-violet-950 shadow-md ring-2 ring-violet-600/30'
              : 'border-violet-200 bg-violet-50/40 hover:bg-violet-50/70 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-violet-900">Total Dispatched</span>
            <Truck className="h-4 w-4 text-violet-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-violet-800">{formatNumber(totalDispatched)}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-violet-700">
            <span>{enrichedDispatches.length} shipments done</span>
            <span className="font-bold flex items-center gap-0.5 group-hover:underline">
              Inspect <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          {kpiFilter === 'DISPATCHED' && (
            <span className="absolute -top-2 right-3 bg-violet-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase">
              Filter Active
            </span>
          )}
        </button>
      </div>

      {/* ─── Executive 4-Category Master Inventory ─── */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-800">
              Key Stock Categories (Bottles, Caps, Atomizers, Boxes)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onSetActiveTab('components')}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
          >
            View All Parts & Components <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Bottles Summary Card */}
          <div
            onClick={() =>
              onOpenMilestoneContext(
                'BOTTLES',
                '1. Glass Bottles — Stock Breakdown',
                'Primary perfume glass containers across factory floor and customer orders',
                'Glass Bottles',
                'sky'
              )
            }
            className="p-4 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/80 to-white hover:border-blue-400 hover:shadow-2xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-600 text-white shadow-2xs">
                  <Box className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-blue-950">1. Glass Bottles</h3>
                  <p className="text-[11px] text-blue-700">Primary perfume glass containers</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase text-blue-700 bg-blue-100 group-hover:bg-blue-600 group-hover:text-white px-2 py-0.5 rounded-md transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> Inspect
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5 pt-3 border-t border-blue-100 text-center">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Received</p>
                <p className="text-xs font-black text-slate-900">{formatNumber(totalBottlesInwarded)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg py-0.5 border border-emerald-200">
                <p className="text-[10px] font-black text-emerald-800 uppercase">Available</p>
                <p className="text-xs font-black text-emerald-700">{formatNumber(totalBottlesRaw)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-indigo-600 uppercase">In Factory</p>
                <p className="text-xs font-black text-indigo-700">{formatNumber(Math.max(0, totalBottlesInsideFactory - totalBottlesRaw))}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-violet-600 uppercase">Shipped</p>
                <p className="text-xs font-black text-violet-700">{formatNumber(totalBottlesDispatched)}</p>
              </div>
            </div>
          </div>

          {/* 2. Caps Summary Card */}
          <div
            onClick={() =>
              onOpenMilestoneContext(
                'CAPS',
                '2. Closures & Caps — Stock Breakdown',
                'Magnetic, zinc & plastic closures across warehouse stockroom, factory floor assemblies, and customer orders',
                'Caps & Closures',
                'violet'
              )
            }
            className="p-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white hover:border-violet-400 hover:shadow-2xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-violet-600 text-white shadow-2xs">
                  <Package className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-violet-950">2. Closures & Caps</h3>
                  <p className="text-[11px] text-violet-700">Magnetic, zinc & plastic closures</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase text-violet-700 bg-violet-100 group-hover:bg-violet-600 group-hover:text-white px-2 py-0.5 rounded-md transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> Inspect
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5 pt-3 border-t border-violet-100 text-center">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Received</p>
                <p className="text-xs font-black text-slate-900">{formatNumber(totalCapsInwarded)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg py-0.5 border border-emerald-200">
                <p className="text-[10px] font-black text-emerald-800 uppercase">Available</p>
                <p className="text-xs font-black text-emerald-700">{formatNumber(totalCapsAvailable)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-indigo-600 uppercase">In Factory</p>
                <p className="text-xs font-black text-indigo-700">{formatNumber(totalCapsInFactoryAssembled)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-violet-600 uppercase">Shipped</p>
                <p className="text-xs font-black text-violet-700">{formatNumber(totalCapsDispatched)}</p>
              </div>
            </div>
          </div>

          {/* 3. Atomizers Summary Card */}
          <div
            onClick={() =>
              onOpenMilestoneContext(
                'ATOMIZERS',
                '3. Atomizers & Pumps — Stock Breakdown',
                'Mist sprays, crimp & screw pumps across warehouse stockroom, factory floor assemblies, and customer orders',
                'Atomizers & Pumps',
                'sky'
              )
            }
            className="p-4 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/80 to-white hover:border-sky-400 hover:shadow-2xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-sky-600 text-white shadow-2xs">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-sky-950">3. Atomizers & Pumps</h3>
                  <p className="text-[11px] text-sky-700">Mist sprays, crimp & screw pumps</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase text-sky-700 bg-sky-100 group-hover:bg-sky-600 group-hover:text-white px-2 py-0.5 rounded-md transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> Inspect
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5 pt-3 border-t border-sky-100 text-center">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Received</p>
                <p className="text-xs font-black text-slate-900">{formatNumber(totalAtomizersInwarded)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg py-0.5 border border-emerald-200">
                <p className="text-[10px] font-black text-emerald-800 uppercase">Available</p>
                <p className="text-xs font-black text-emerald-700">{formatNumber(totalAtomizersAvailable)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-indigo-600 uppercase">In Factory</p>
                <p className="text-xs font-black text-indigo-700">{formatNumber(totalAtomizersInFactoryAssembled)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-violet-600 uppercase">Shipped</p>
                <p className="text-xs font-black text-violet-700">{formatNumber(totalAtomizersDispatched)}</p>
              </div>
            </div>
          </div>

          {/* 4. Packaging Boxes Summary Card */}
          <div
            onClick={() =>
              onOpenMilestoneContext(
                'BOXES',
                '4. Boxes & Cartons — Stock Breakdown',
                'Monocartons, gift & outer boxes across warehouse stockroom, factory floor assemblies, and customer orders',
                'Boxes & Cartons',
                'amber'
              )
            }
            className="p-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white hover:border-amber-400 hover:shadow-2xs transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-600 text-white shadow-2xs">
                  <Box className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-950">4. Boxes & Cartons</h3>
                  <p className="text-[11px] text-amber-700">Monocartons, gift & outer boxes</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 group-hover:bg-amber-600 group-hover:text-white px-2 py-0.5 rounded-md transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> Inspect
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5 pt-3 border-t border-amber-100 text-center">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Received</p>
                <p className="text-xs font-black text-slate-900">{formatNumber(totalBoxesInwarded)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg py-0.5 border border-emerald-200">
                <p className="text-[10px] font-black text-emerald-800 uppercase">Available</p>
                <p className="text-xs font-black text-emerald-700">{formatNumber(totalBoxesAvailable)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-indigo-600 uppercase">In Factory</p>
                <p className="text-xs font-black text-indigo-700">{formatNumber(totalBoxesInFactoryAssembled)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-violet-600 uppercase">Shipped</p>
                <p className="text-xs font-black text-violet-700">{formatNumber(totalBoxesDispatched)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Physical Inventory Lifecycle & Timeline Pipeline ─── */}
      <Card className="p-5 border-slate-200 bg-white shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-indigo-600 animate-pulse" />
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-800">
                Live Stock Flow & Production Stages
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Progression of all {formatNumber(totalReceived)} units across manufacturing stages to customer delivery.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              Intake Span: {earliestInwardDate ? formatDate(earliestInwardDate) : '—'} → {latestInwardDate ? formatDate(latestInwardDate) : '—'}
            </span>
            {latestDispatchDate && (
              <span className="inline-flex items-center gap-1 font-semibold text-violet-800 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-lg">
                <Truck className="h-3.5 w-3.5 text-violet-600" />
                Latest Dispatch: {formatDate(latestDispatchDate)}
              </span>
            )}
          </div>
        </div>

        {/* 4 Physical Lifecycle Milestone Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Milestone 1: Raw Stock Buffer */}
          <button
            type="button"
            onClick={() =>
              onOpenMilestoneContext(
                'RAW',
                '1. Raw Material — Waiting Buffer',
                'Intake stock waiting in storage to enter production floor pipeline',
                'Raw Material',
                'slate'
              )
            }
            className={`text-left p-3.5 rounded-xl border transition-all duration-150 relative overflow-hidden group cursor-pointer ${
              kpiFilter === 'RAW'
                ? 'border-slate-800 bg-slate-100 shadow-md ring-2 ring-slate-800'
                : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 hover:border-slate-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                1. Raw Material
              </span>
              <span className="text-[10px] font-black text-slate-700 bg-slate-200 group-hover:bg-slate-800 group-hover:text-white px-1.5 py-0.5 rounded transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> Buffer
              </span>
            </div>
            <p className="text-xl font-black text-slate-900 mt-1">
              {formatNumber(rawStockTotal)} <span className="text-xs font-bold text-slate-500">units</span>
            </p>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{rawBatchesCount} {rawBatchesCount === 1 ? 'batch' : 'batches'} waiting</span>
              <span className="font-semibold text-indigo-600 group-hover:underline text-[11px] flex items-center gap-0.5">
                View Details <ChevronRight className="h-3 w-3" />
              </span>
            </div>
            {kpiFilter === 'RAW' && (
              <div className="absolute top-0 right-0 h-full w-1 bg-slate-800" />
            )}
          </button>

          {/* Milestone 2: Active Floor WIP */}
          <button
            type="button"
            onClick={() =>
              onOpenMilestoneContext(
                'IN_PRODUCTION',
                '2. In Production (Being Made)',
                'Batches currently undergoing machine and assembly conversion stages',
                'In Production',
                'amber'
              )
            }
            className={`text-left p-3.5 rounded-xl border transition-all duration-150 relative overflow-hidden group cursor-pointer ${
              kpiFilter === 'IN_PRODUCTION'
                ? 'border-amber-600 bg-amber-100/70 shadow-md ring-2 ring-amber-500'
                : 'border-amber-200 bg-amber-50/50 hover:bg-amber-100/60 hover:border-amber-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                2. In Production
              </span>
              <span className="text-[10px] font-black text-amber-900 bg-amber-200 group-hover:bg-amber-800 group-hover:text-white px-1.5 py-0.5 rounded transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> Being Made
              </span>
            </div>
            <p className="text-xl font-black text-amber-900 mt-1">
              {formatNumber(productionTotal)} <span className="text-xs font-bold text-amber-700">units</span>
            </p>
            <div className="mt-1 flex items-center justify-between text-xs text-amber-800">
              <span>{productionBatchesCount} {productionBatchesCount === 1 ? 'batch' : 'batches'} in progress</span>
              <span className="font-semibold text-amber-700 group-hover:underline text-[11px] flex items-center gap-0.5">
                View Details <ChevronRight className="h-3 w-3" />
              </span>
            </div>
            {kpiFilter === 'IN_PRODUCTION' && (
              <div className="absolute top-0 right-0 h-full w-1 bg-amber-500" />
            )}
          </button>

          {/* Milestone 3: Finished Goods Staging */}
          <button
            type="button"
            onClick={() =>
              onOpenMilestoneContext(
                'READY',
                '3. Ready to Ship (Finished Goods)',
                'Inspected and ready stock awaiting customer dispatches',
                'Finished Goods',
                'sky'
              )
            }
            className={`text-left p-3.5 rounded-xl border transition-all duration-150 relative overflow-hidden group cursor-pointer ${
              kpiFilter === 'READY'
                ? 'border-sky-600 bg-sky-100/70 shadow-md ring-2 ring-sky-500'
                : 'border-sky-200 bg-sky-50/50 hover:bg-sky-100/60 hover:border-sky-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-800 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                3. Ready to Ship
              </span>
              <span className="text-[10px] font-black text-sky-900 bg-sky-200 group-hover:bg-sky-800 group-hover:text-white px-1.5 py-0.5 rounded transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> Inspected
              </span>
            </div>
            <p className="text-xl font-black text-sky-900 mt-1">
              {formatNumber(readyStockTotal)} <span className="text-xs font-bold text-sky-700">units</span>
            </p>
            <div className="mt-1 flex items-center justify-between text-xs text-sky-800">
              <span>{readyBatchesCount} {readyBatchesCount === 1 ? 'batch' : 'batches'} ready</span>
              <span className="font-semibold text-sky-700 group-hover:underline text-[11px] flex items-center gap-0.5">
                View Details <ChevronRight className="h-3 w-3" />
              </span>
            </div>
            {kpiFilter === 'READY' && (
              <div className="absolute top-0 right-0 h-full w-1 bg-sky-500" />
            )}
          </button>

          {/* Milestone 4: Shipped & Dispatched */}
          <button
            type="button"
            onClick={() =>
              onOpenMilestoneContext(
                'DISPATCHED',
                '4. Shipped to Customers',
                'Fulfilled shipments dispatched and delivered to client accounts',
                'Shipped Orders',
                'violet'
              )
            }
            className={`text-left p-3.5 rounded-xl border transition-all duration-150 relative overflow-hidden group cursor-pointer ${
              kpiFilter === 'DISPATCHED'
                ? 'border-violet-600 bg-violet-100/70 shadow-md ring-2 ring-violet-500'
                : 'border-violet-200 bg-violet-50/50 hover:bg-violet-100/60 hover:border-violet-400 hover:shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-800 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-violet-500" />
                4. Shipped Orders
              </span>
              <span className="text-[10px] font-black text-violet-900 bg-violet-200 group-hover:bg-violet-800 group-hover:text-white px-1.5 py-0.5 rounded transition-colors flex items-center gap-1">
                <Maximize2 className="h-2.5 w-2.5" /> Dispatched
              </span>
            </div>
            <p className="text-xl font-black text-violet-900 mt-1">
              {formatNumber(totalDispatched)} <span className="text-xs font-bold text-violet-700">units</span>
            </p>
            <div className="mt-1 flex items-center justify-between text-xs text-violet-800">
              <span>{dispatchedBatchesCount} {dispatchedBatchesCount === 1 ? 'batch' : 'batches'} shipped</span>
              <span className="font-semibold text-violet-700 group-hover:underline text-[11px] flex items-center gap-0.5">
                View Details <ChevronRight className="h-3 w-3" />
              </span>
            </div>
            {kpiFilter === 'DISPATCHED' && (
              <div className="absolute top-0 right-0 h-full w-1 bg-violet-500" />
            )}
          </button>
        </div>
      </Card>
    </div>
  );
}
