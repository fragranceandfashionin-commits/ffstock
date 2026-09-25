import {
  Building2,
  Calendar,
  MapPin,
  Package,
  Search,
  X,
  Copy,
  CheckCheck,
  Truck,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, Badge, ItemCategoryBadge, ColorBadge } from '@/components/ui';
import { ItemGroupedPicker } from '@/components/ItemGroupedPicker';
import type { BatchWithRelations, Item, Stage } from '@/lib/supabase';
import type { ItemGroup, BatchStageDetail } from './types';
import { formatNumber, formatDate } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';

export type ItemSelectorCardProps = {
  batches: BatchWithRelations[];
  batchId: string;
  onBatchChange: (id: string) => void;
  selectedBatch: BatchWithRelations | null;
  inFactory: number;
  readyQty: number;
  dispatchedTotal: number;
  unitLabel: string;
  onStartDispatch?: () => void;
  allocatedInQty?: number;
  allocatedOutQty?: number;
  netReceivedQty?: number;
  scrappedTotal?: number;

  // Multi-batch & item-first props
  selectedItemId?: string | null;
  onSelectItem?: (itemId: string, activeBatchId?: string) => void;
  itemGroups?: ItemGroup[];
  selectedItem?: Item | null;
  batchStageDetails?: BatchStageDetail[];
  stages?: Stage[] | null;
};

export function ItemSelectorCard({
  batches,
  batchId,
  onBatchChange,
  selectedBatch,
  inFactory,
  readyQty,
  dispatchedTotal,
  unitLabel,
  onStartDispatch,
  allocatedInQty = 0,
  allocatedOutQty = 0,
  netReceivedQty,
  scrappedTotal = 0,
  selectedItemId,
  onSelectItem,
  itemGroups,
  selectedItem,
  batchStageDetails = [],
  stages,
}: ItemSelectorCardProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Global Ctrl+B shortcut to open search modal
  useEffect(() => {
    const handleGlobalShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, [isSearchOpen]);

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1800);
  };

  // Derive itemGroups if not provided
  const derivedItemGroups = useMemo<ItemGroup[]>(() => {
    if (itemGroups && itemGroups.length > 0) return itemGroups;
    if (!batches || batches.length === 0) return [];
    const map = new Map<string, { item: Item; batches: BatchWithRelations[]; totalIntake: number }>();
    for (const b of batches) {
      if (!b.item) continue;
      const itemId = b.item_id;
      if (!map.has(itemId)) {
        map.set(itemId, { item: b.item, batches: [], totalIntake: 0 });
      }
      const entry = map.get(itemId)!;
      entry.batches.push(b);
      entry.totalIntake += b.qty_received || 0;
    }
    return Array.from(map.entries()).map(([itemId, val]) => ({
      item_id: itemId,
      item: val.item,
      batches: val.batches,
      supplierNames: [],
      locations: Array.from(new Set(val.batches.map((b) => b.location).filter(Boolean))),
      totalIntake: val.totalIntake,
    }));
  }, [itemGroups, batches]);

  // Handle selection (delegates to onSelectItem if provided, or onBatchChange)
  const handleItemSelect = (itemId: string, activeBatchId?: string) => {
    if (onSelectItem) {
      onSelectItem(itemId, activeBatchId);
    } else if (activeBatchId) {
      onBatchChange(activeBatchId);
    } else {
      const firstBatch = batches.find((b) => b.item_id === itemId);
      if (firstBatch) onBatchChange(firstBatch.id);
    }
    setIsSearchOpen(false);
  };

  const currentItem = selectedItem || selectedBatch?.item || null;
  const childBatches = useMemo(() => {
    if (selectedItemId && itemGroups) {
      return itemGroups.find((g) => g.item_id === selectedItemId)?.batches || [];
    }
    if (currentItem) {
      return batches.filter((b) => b.item_id === currentItem.id);
    }
    return selectedBatch ? [selectedBatch] : [];
  }, [selectedItemId, itemGroups, currentItem, batches, selectedBatch]);

  const totalReceived = childBatches.reduce((sum, b) => sum + (b.qty_received || 0), 0);
  const effectiveTotal = netReceivedQty !== undefined ? netReceivedQty : totalReceived;
  const inFactoryPercent = effectiveTotal > 0 ? Math.round((inFactory / effectiveTotal) * 100) : 0;
  const readyPercent = effectiveTotal > 0 ? Math.round((readyQty / effectiveTotal) * 100) : 0;
  const dispatchedPercent = effectiveTotal > 0 ? Math.round((dispatchedTotal / effectiveTotal) * 100) : 0;

  // Distinct locations for display
  const locationList = useMemo(() => {
    const locs = childBatches.map((b) => b.location).filter(Boolean);
    return Array.from(new Set(locs));
  }, [childBatches]);

  // If no item or batch is selected, show initial selection card
  if (!currentItem && !selectedBatch) {
    return (
      <Card className="border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white shadow-2xs">
              1
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Select Product &amp; Consolidated Batches
            </span>
            <Badge label="Required" variant="amber" size="sm" />
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {derivedItemGroups.length} items ({batches.length} batches) in factory
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="w-full py-3 px-4 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-900 font-bold text-sm flex items-center justify-between transition group cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Search className="h-4 w-4 text-indigo-600 group-hover:scale-110 transition" />
            <span>Click to browse products, storage locations, or search batch #...</span>
          </span>
          <kbd className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-600 shadow-2xs">
            Ctrl+B
          </kbd>
        </button>

        {isSearchOpen && (
          <ItemGroupedPicker
            itemGroups={derivedItemGroups}
            selectedItemId={selectedItemId || null}
            onSelectItem={handleItemSelect}
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            stages={stages}
          />
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* 1-Click Direct Modal Search Panel */}
      {isSearchOpen && (
        <ItemGroupedPicker
          itemGroups={derivedItemGroups}
          selectedItemId={selectedItemId || currentItem?.id || null}
          onSelectItem={handleItemSelect}
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          stages={stages}
        />
      )}

      {/* Unified High-Density Product Command HUD */}
      <Card className="border-slate-200/90 bg-white shadow-2xs overflow-hidden p-0">
        {/* Top Tier: Product Identity & Meta Attributes */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 text-white relative">
          {/* Subtle background glow */}
          <div className="absolute right-0 top-0 h-32 w-64 bg-indigo-500/10 blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
            <div className="space-y-2 flex-1 min-w-0">
              {/* Step indicator + Badges Row */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 text-indigo-200 text-[11px] font-bold border border-white/15">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Consolidated Item
                </span>

                <ItemCategoryBadge category={currentItem?.category} />

                {/* Batches count toggle button */}
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen((prev) => !prev)}
                  className={`font-bold text-xs px-3 py-1 rounded-lg border inline-flex items-center gap-1.5 transition-all duration-150 cursor-pointer shadow-sm active:scale-95 ${
                    isDrawerOpen
                      ? 'bg-indigo-600 text-white border-indigo-300 ring-2 ring-indigo-400 shadow-md'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400 hover:border-indigo-300 ring-1 ring-white/20'
                  }`}
                  title="Click to view date-wise batch breakdown sorted by FIFO"
                >
                  <Calendar className="h-3.5 w-3.5 text-indigo-200 shrink-0" />
                  <span>
                    📅 Date-Wise Batches ({childBatches.length})
                  </span>
                  {isDrawerOpen ? (
                    <ChevronUp className="h-3.5 w-3.5 text-white shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-white shrink-0" />
                  )}
                </button>

                {selectedBatch?.brand_name && (
                  <span className="font-extrabold text-amber-200 bg-amber-950/80 border border-amber-500/50 px-2.5 py-0.5 rounded-lg text-xs shadow-2xs inline-flex items-center gap-1.5">
                    🏢 {selectedBatch.brand_name}
                  </span>
                )}

                {selectedBatch?.color && <ColorBadge color={selectedBatch.color} />}
              </div>

              {/* Product Title */}
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug truncate">
                {currentItem?.name ?? 'Stock Item'}
              </h1>

              {/* Meta information tags */}
              <div className="flex items-center gap-x-4 gap-y-1 text-xs text-slate-300 flex-wrap font-medium">
                {selectedBatch?.supplier && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span>
                      Supplier: <strong className="text-white font-semibold">{selectedBatch.supplier.name}</strong>
                    </span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <span>
                    Total Intake:{' '}
                    <strong className="text-white font-bold">
                      {formatNumber(effectiveTotal)} {unitLabel}
                    </strong>
                    {allocatedInQty > 0 ? (
                      <span className="ml-1 text-emerald-300 text-[11px] font-bold">
                        (+{formatNumber(allocatedInQty)} alloc)
                      </span>
                    ) : null}
                    {allocatedOutQty > 0 ? (
                      <span className="ml-1 text-amber-300 text-[11px] font-bold">
                        (-{formatNumber(allocatedOutQty)} alloc)
                      </span>
                    ) : null}
                  </span>
                </span>
                {locationList.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span>
                      Storage:{' '}
                      <strong className="text-white font-semibold">
                        {locationList.join(', ')}
                      </strong>
                    </span>
                  </span>
                )}
                {selectedBatch?.received_on && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span>FIFO Lead Date: {formatDate(selectedBatch.received_on)}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Quick Actions (Switch / Clear) */}
            <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/10">
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-slate-900 hover:bg-indigo-50 px-3.5 py-2 text-xs font-extrabold shadow-sm hover:shadow transition-all duration-150 active:scale-98 cursor-pointer"
                title="Search and change item/batch (Shortcut: Ctrl+B)"
              >
                <Search className="h-3.5 w-3.5 text-indigo-600" />
                <span>Switch Item</span>
                <kbd className="hidden sm:inline-block text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                  Ctrl+B
                </kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onSelectItem) onSelectItem('');
                  onBatchChange('');
                }}
                className="inline-flex items-center justify-center p-2 rounded-xl bg-white/10 hover:bg-rose-500/80 text-white border border-white/15 hover:border-rose-400 transition cursor-pointer"
                title="Clear selected product"
                aria-label="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Date-Wise Batch & Location Drawer */}
        {isDrawerOpen && (
          <div className="border-b border-indigo-100 bg-indigo-50/30 p-4 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-indigo-600 text-white">
                  <Layers className="h-3.5 w-3.5" />
                </span>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  Date-Wise Batch &amp; Warehouse Location Inventory
                </h4>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                Sorted by First-In-First-Out (FIFO) Receipt Date
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">FIFO Rank</th>
                    <th className="py-2.5 px-3">Batch #</th>
                    <th className="py-2.5 px-3">Inward Date</th>
                    <th className="py-2.5 px-3">Storage Bay</th>
                    <th className="py-2.5 px-3">Supplier</th>
                    <th className="py-2.5 px-3 text-right">Intake Qty</th>
                    {stages &&
                      stages
                        .filter((s) => s.name !== 'Dispatched' && s.name !== 'Scrap / Defect')
                        .map((st) => (
                          <th key={st.id} className="py-2.5 px-3 text-right">
                            {st.name}
                          </th>
                        ))}
                    <th className="py-2.5 px-3 text-right text-violet-800">Dispatched</th>
                    <th className="py-2.5 px-3 text-right text-rose-700">Scrapped</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batchStageDetails.length > 0 ? (
                    batchStageDetails.map((b) => {
                      const isLeader = b.fifo_rank === 1;
                      const isActive = b.batch_id === batchId;

                      return (
                        <tr
                          key={b.batch_id}
                          className={`transition ${
                            isActive
                              ? 'bg-indigo-50/60 font-semibold'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                isLeader
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {isLeader ? '⚡ #1 Next FIFO' : `#${b.fifo_rank}`}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <span>{b.batch_no}</span>
                              <button
                                type="button"
                                onClick={(e) => handleCopy(e, b.batch_no)}
                                className="text-slate-400 hover:text-indigo-600"
                                title="Copy batch #"
                              >
                                {copiedText === b.batch_no ? (
                                  <CheckCheck className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-slate-400" />
                              <span>{formatDate(b.received_on)}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-indigo-500" />
                              <span>{b.location || 'Bay Unassigned'}</span>
                              {b.location && (
                                <button
                                  type="button"
                                  onClick={(e) => handleCopy(e, b.location)}
                                  className="text-slate-300 hover:text-indigo-600"
                                  title="Copy location"
                                >
                                  {copiedText === b.location ? (
                                    <CheckCheck className="h-2.5 w-2.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-2.5 w-2.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 truncate max-w-[120px]">
                            {b.supplier_name || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {formatNumber(b.qty_received)}
                          </td>
                          {b.stageStock.map((stk) => (
                            <td
                              key={stk.stage_id}
                              className={`py-2.5 px-3 text-right font-mono ${
                                stk.qty > 0
                                  ? 'font-bold text-indigo-950'
                                  : 'text-slate-300'
                              }`}
                            >
                              {stk.qty > 0 ? formatNumber(stk.qty) : '—'}
                            </td>
                          ))}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-violet-800">
                            {b.dispatchedQty > 0 ? formatNumber(b.dispatchedQty) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">
                            {b.scrappedQty > 0 ? formatNumber(b.scrappedQty) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => onBatchChange(b.batch_id)}
                              className={`text-[10px] font-extrabold px-2 py-1 rounded-md transition cursor-pointer ${
                                isActive
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 hover:bg-indigo-100 text-slate-700 hover:text-indigo-900 border border-slate-200'
                              }`}
                              title="Focus and select this batch"
                            >
                              {isActive ? 'Active' : 'Select'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    childBatches.map((b, idx) => (
                      <tr key={b.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3">#{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {b.batch_no}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {formatDate(b.received_on)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {b.location}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {b.supplier?.name || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {formatNumber(b.qty_received)}
                        </td>
                        {stages &&
                          stages
                            .filter((s) => s.name !== 'Dispatched' && s.name !== 'Scrap / Defect')
                            .map((st) => (
                              <td key={st.id} className="py-2.5 px-3 text-right text-slate-300 font-mono">
                                —
                              </td>
                            ))}
                        <td className="py-2.5 px-3 text-right text-slate-300 font-mono">—</td>
                        <td className="py-2.5 px-3 text-right text-slate-300 font-mono">—</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => onBatchChange(b.id)}
                            className="text-[10px] font-extrabold px-2 py-1 rounded bg-slate-100 hover:bg-indigo-100 text-slate-700"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Integrated KPI Metric Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 bg-slate-50/50">
          {/* Total Intake */}
          <div className="p-3.5 sm:p-4 transition hover:bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Total Intake
              </span>
              {allocatedInQty > 0 ? (
                <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                  +{formatNumber(allocatedInQty)} Alloc
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-slate-900">
                {formatNumber(effectiveTotal)}
              </span>
              <span className="text-xs font-semibold text-slate-500">{unitLabel}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Across {childBatches.length} {childBatches.length === 1 ? 'batch' : 'batches'}
            </p>
          </div>

          {/* In Factory */}
          <div className="p-3.5 sm:p-4 transition hover:bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                In Factory
              </span>
              <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-200">
                {inFactoryPercent}%
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-emerald-700">
                {formatNumber(inFactory)}
              </span>
              <span className="text-xs font-semibold text-emerald-600">{unitLabel}</span>
            </div>
            <p className="text-[11px] text-emerald-600/90 mt-0.5">Across production stages</p>
          </div>

          {/* Ready for Dispatch */}
          <div className="p-3.5 sm:p-4 transition hover:bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-800">
                Ready to Dispatch
              </span>
              {readyQty > 0 ? (
                <span className="text-[10px] font-extrabold text-sky-700 bg-sky-100 px-1.5 py-0.2 rounded border border-sky-200">
                  {readyPercent}%
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-400">0%</span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-sky-700">
                {formatNumber(readyQty)}
              </span>
              <span className="text-xs font-semibold text-sky-600">{unitLabel}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-[11px] text-sky-600/90">Finished goods in stock</span>
              {readyQty > 0 && onStartDispatch && (
                <button
                  type="button"
                  onClick={onStartDispatch}
                  className="text-[10px] font-extrabold text-sky-700 hover:text-sky-900 underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Truck className="h-2.5 w-2.5" /> Ship Now →
                </button>
              )}
            </div>
          </div>

          {/* Dispatched */}
          <div className="p-3.5 sm:p-4 transition hover:bg-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-violet-800">
                Dispatched
              </span>
              <span className="text-[10px] font-extrabold text-violet-700 bg-violet-100/80 px-1.5 py-0.2 rounded border border-violet-200">
                {dispatchedPercent}%
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-black text-violet-700">
                {formatNumber(dispatchedTotal)}
              </span>
              <span className="text-xs font-semibold text-violet-600">{unitLabel}</span>
            </div>
            <p className="text-[11px] text-violet-600/90 mt-0.5">Shipped to clients</p>
          </div>
        </div>

        {scrappedTotal > 0 && (
          <div className="px-4 py-2.5 bg-amber-50/70 border-t border-amber-200/60 flex items-center justify-between text-xs text-amber-950">
            <span className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Logged Scrap &amp; Defect Loss
            </span>
            <span className="font-mono font-black text-xs text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-200">
              {formatNumber(scrappedTotal)} {unitLabel} (
              {Math.round((scrappedTotal / effectiveTotal) * 100)}% of net intake)
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}

// Export ItemSelectorCard and alias BatchSelectorCard for 100% backward compatibility
export const BatchSelectorCard = ItemSelectorCard;
export type BatchSelectorCardProps = ItemSelectorCardProps;
