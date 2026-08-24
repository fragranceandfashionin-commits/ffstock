import { useMemo } from 'react';
import { Tag, Plus, Download, Edit2, Trash2, Eye, X } from 'lucide-react';
import {
  Card,
  Button,
  SearchInput,
  ItemCategoryBadge,
  ColorBadge,
  TableSkeleton,
  TableScrollContainer,
  EmptyState,
} from '@/components/ui';
import { ITEM_CATEGORIES, type Item, type ComponentStockSummary } from '@/lib/supabase';
import { formatNumber, downloadCSV, getTodayDateString } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { getCategoryTheme, type CategoryAggregates } from './types';

export type ItemCatalogueTabProps = {
  items: Item[];
  stockSummaryMap: Map<string, ComponentStockSummary>;
  categoryAggregates: CategoryAggregates;
  selectedCategoryFilter: string;
  onSelectCategoryFilter: (cat: string) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  loading: boolean;
  onOpenAddModal: () => void;
  onOpenEditModal: (item: Item) => void;
  onOpenDeleteModal: (item: { id: string; name: string }) => void;
  onOpenAuditModal: (summary: ComponentStockSummary) => void;
};

export function ItemCatalogueTab({
  items,
  stockSummaryMap,
  categoryAggregates,
  selectedCategoryFilter,
  onSelectCategoryFilter,
  searchQuery,
  onSearchQueryChange,
  loading,
  onOpenAddModal,
  onOpenEditModal,
  onOpenDeleteModal,
  onOpenAuditModal,
}: ItemCatalogueTabProps) {
  const toast = useToast();

  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      const matchesCategory =
        selectedCategoryFilter === 'ALL' ||
        (i.category || 'Bottle').toLowerCase() === selectedCategoryFilter.toLowerCase();

      if (!matchesCategory) return false;

      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.category ?? '').toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q) ||
        (i.color ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, selectedCategoryFilter, searchQuery]);

  const currentViewInwarded = filteredItems.reduce((s, i) => s + (stockSummaryMap.get(i.id)?.totalInwarded ?? 0), 0);
  const currentViewAvailable = filteredItems.reduce((s, i) => s + (stockSummaryMap.get(i.id)?.availableStock ?? 0), 0);
  const currentViewInFactory = filteredItems.reduce((s, i) => s + (stockSummaryMap.get(i.id)?.totalInFactoryAssembled ?? 0), 0);
  const currentViewDispatched = filteredItems.reduce((s, i) => s + (stockSummaryMap.get(i.id)?.totalDispatchedInOrders ?? 0), 0);

  const exportItemsCatalogCSV = () => {
    if (items.length === 0) return;
    try {
      const headers = [
        'Item Name',
        'Category',
        'Unit',
        'Color',
        'Description',
        'Total Inward Intake',
        'Warehouse Buffer Stock',
        'In-Factory Assembled WIP',
        'Dispatched to Customers',
        'Total Scrapped Defect',
        'Total Net Available',
      ];
      const rows = items.map((item) => {
        const sum = stockSummaryMap.get(item.id);
        return [
          item.name,
          item.category || 'Bottle',
          item.unit || 'pcs',
          item.color || '',
          item.description || '',
          sum?.totalInwarded ?? 0,
          sum?.unallocatedWarehouseStock ?? 0,
          sum?.totalInFactoryAssembled ?? 0,
          sum?.totalDispatchedInOrders ?? 0,
          sum?.totalScrapped ?? 0,
          sum?.availableStock ?? 0,
        ];
      });

      const filename = `ffstock_items_inventory_${getTodayDateString()}`;
      downloadCSV(filename, headers, rows);
      toast.success('Items inventory balance CSV exported successfully', 'Export Complete');
    } catch {
      toast.error('Failed to export CSV', 'Export Failed');
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── Compact Category Pills Navigation Bar (Saves 300px vertical space) ─── */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* ALL Category Pill */}
          <button
            type="button"
            onClick={() => onSelectCategoryFilter('ALL')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
              selectedCategoryFilter === 'ALL'
                ? 'bg-slate-950 text-white ring-2 ring-slate-800'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>🌐 All Items</span>
            <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-md ${
              selectedCategoryFilter === 'ALL' ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
            }`}>
              {items.length}
            </span>
          </button>

          {/* Individual Category Pills */}
          {ITEM_CATEGORIES.map((cat) => {
            const agg = categoryAggregates[cat] || { skuCount: 0, available: 0, inwarded: 0, inFactory: 0, dispatched: 0, scrapped: 0, used: 0 };
            const isSelected = selectedCategoryFilter.toLowerCase() === cat.toLowerCase();
            const theme = getCategoryTheme(cat);

            return (
              <button
                key={cat}
                type="button"
                onClick={() => onSelectCategoryFilter(cat)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                  isSelected
                    ? `${theme.pillActive} ring-2 ring-indigo-400`
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>{theme.icon} {cat}</span>
                <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-md ${
                  isSelected ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {agg.skuCount}
                </span>
              </button>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={exportItemsCatalogCSV}
          className="text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 shrink-0 ml-auto"
          title="Export CSV"
        >
          <Download className="h-3.5 w-3.5 mr-1 text-slate-500" />
          Export CSV
        </Button>
      </div>

      {/* ─── Master Stock Catalogue Table Card ─── */}
      <Card className="p-0 overflow-hidden shadow-xs border-slate-200 bg-white">
        {/* Table Control Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-950 flex items-center gap-2">
                <Tag className="h-5 w-5 text-indigo-600" />
                Stock Catalogue & Inventory Balances
              </h2>
              <span className="bg-indigo-100 text-indigo-900 font-black text-xs px-2.5 py-0.5 rounded-full border border-indigo-200">
                {filteredItems.length} SKUs Listed
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Clear 5-state accounting: <strong className="text-slate-900">Received</strong> = <strong className="text-emerald-700">Buffer</strong> + <strong className="text-indigo-700">In Factory</strong> + <strong className="text-violet-700">Shipped</strong> + <strong className="text-rose-600">Scrap</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {selectedCategoryFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => onSelectCategoryFilter('ALL')}
                className="rounded-xl bg-slate-200/80 hover:bg-slate-300 px-3 py-1.5 text-xs font-bold text-slate-800 transition flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <span>Filter: <strong>{selectedCategoryFilter}</strong></span>
                <X className="h-3.5 w-3.5 ml-1" />
              </button>
            )}
            <div className="w-64">
              <SearchInput
                value={searchQuery}
                onChange={onSearchQueryChange}
                placeholder="Search SKU name, specs, color…"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenAddModal}
              className="text-xs font-bold py-1.5 px-3 bg-slate-900 text-white hover:bg-slate-800 shadow-2xs shrink-0 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 mr-1 text-emerald-400" /> Add SKU
            </Button>
          </div>
        </div>

        {/* Quick Dynamic Reconciliation Ledger HUD */}
        <div className="grid grid-cols-2 sm:grid-cols-4 bg-slate-900 text-white p-3 border-b border-slate-800 text-center gap-2">
          <div className="border-r border-slate-800/80 pr-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">1. Total Inward Intake</span>
            <span className="text-base font-black text-white">{formatNumber(currentViewInwarded)} <span className="text-[10px] font-normal text-slate-400">units</span></span>
          </div>
          <div className="border-r border-slate-800/80 pr-2">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">2. In Stock (Buffer)</span>
            <span className="text-base font-black text-emerald-400">{formatNumber(currentViewAvailable)} <span className="text-[10px] font-normal text-slate-400">units</span></span>
          </div>
          <div className="border-r border-slate-800/80 pr-2">
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">3. In Factory (Assembled)</span>
            <span className="text-base font-black text-indigo-300">{formatNumber(currentViewInFactory)} <span className="text-[10px] font-normal text-slate-400">units</span></span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-violet-300 uppercase tracking-wider block">4. Shipped in Orders</span>
            <span className="text-base font-black text-violet-300">{formatNumber(currentViewDispatched)} <span className="text-[10px] font-normal text-slate-400">units</span></span>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              icon={Tag}
              title="No items found"
              description={
                searchQuery || selectedCategoryFilter !== 'ALL'
                  ? 'No items match your active search or filter. Try clearing filters.'
                  : 'Register your first component SKU using the button above.'
              }
            />
          </div>
        ) : (
          <div>
            {/* ─── Mobile View: Item Cards (< sm) ─── */}
            <div className="p-3.5 space-y-3 sm:hidden">
              {filteredItems.map((i) => {
                const sum = stockSummaryMap.get(i.id);
                const inwarded = sum?.totalInwarded ?? 0;
                const available = sum?.availableStock ?? 0;
                const inFactory = sum?.totalInFactoryAssembled ?? 0;
                const shipped = sum?.totalDispatchedInOrders ?? 0;
                const scrapped = sum?.totalScrapped ?? 0;
                const isNotYetInwarded = inwarded === 0;

                return (
                  <Card key={`mobile-item-${i.id}`} className="p-4 border-slate-200 shadow-2xs space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ItemCategoryBadge category={i.category} />
                          <ColorBadge color={i.color} />
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {i.unit || 'pcs'}
                          </span>
                        </div>
                        <h3 className="font-black text-slate-950 text-base mt-1 leading-snug">
                          {i.name}
                        </h3>
                        {i.description && (
                          <p className="text-xs text-slate-500 font-normal mt-0.5 leading-snug">
                            {i.description}
                          </p>
                        )}
                      </div>

                      {/* Floor Status */}
                      <div className="shrink-0">
                        {isNotYetInwarded ? (
                          <span className="inline-flex items-center gap-1 font-bold text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Unreceived
                          </span>
                        ) : available > 0 ? (
                          <span className="inline-flex items-center gap-1 font-extrabold text-[10px] text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            In Stock
                          </span>
                        ) : inFactory > 0 ? (
                          <span className="inline-flex items-center gap-1 font-extrabold text-[10px] text-indigo-800 bg-indigo-100 border border-indigo-300 px-2 py-0.5 rounded-full">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
                            On Floor
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-extrabold text-[10px] text-violet-800 bg-violet-100 border border-violet-300 px-2 py-0.5 rounded-full">
                            <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                            Dispatched
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stock Metrics (4-Box Grid) */}
                    <div className="grid grid-cols-4 gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                      <div className="p-1">
                        <p className="text-[9px] uppercase font-bold text-slate-500">1. Inward</p>
                        <p className="font-black text-slate-900 text-xs mt-0.5">{formatNumber(inwarded)}</p>
                      </div>
                      <div className="p-1 bg-emerald-50 rounded-lg border border-emerald-200">
                        <p className="text-[9px] uppercase font-black text-emerald-800">2. Buffer</p>
                        <p className="font-black text-emerald-900 text-xs mt-0.5">{formatNumber(available)}</p>
                      </div>
                      <div className="p-1 bg-indigo-50 rounded-lg border border-indigo-200">
                        <p className="text-[9px] uppercase font-black text-indigo-800">3. Factory</p>
                        <p className="font-black text-indigo-900 text-xs mt-0.5">{formatNumber(inFactory)}</p>
                      </div>
                      <div className="p-1 bg-violet-50 rounded-lg border border-violet-200">
                        <p className="text-[9px] uppercase font-black text-violet-800">4. Ship</p>
                        <p className="font-black text-violet-900 text-xs mt-0.5">{formatNumber(shipped)}</p>
                      </div>
                    </div>

                    {scrapped > 0 && (
                      <div className="flex items-center justify-between text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                        <span>Defect / Scrap Loss:</span>
                        <span>{formatNumber(scrapped)} {i.unit || 'pcs'}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        {sum && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenAuditModal(sum)}
                            className="text-xs font-bold text-indigo-700 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 min-h-[36px] cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Audit Lifecycle
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenEditModal(i)}
                          className="rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-600 hover:bg-slate-100 border border-slate-200 cursor-pointer"
                          title="Edit item"
                          aria-label={`Edit ${i.name}`}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenDeleteModal({ id: i.id, name: i.name })}
                          className="rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer"
                          title="Delete item"
                          aria-label={`Delete ${i.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* ─── Desktop View: 12-Column Table (>= sm) ─── */}
            <div className="hidden sm:block">
              <TableScrollContainer className="border-0 rounded-none">
                <table className="w-full text-left border-collapse min-w-[1050px]">
                  <thead className="bg-slate-100/90 text-slate-700 text-[11px] font-black uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-3.5 py-3 w-10 text-center text-slate-400">#</th>
                      <th className="px-4 py-3 min-w-[220px]">Item Specification / SKU</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3">Color / Finish</th>
                      <th className="px-3.5 py-3 text-right">1. Received</th>
                      <th className="px-3.5 py-3 text-right bg-emerald-50/80 text-emerald-900 font-black">2. In Buffer</th>
                      <th className="px-3.5 py-3 text-right bg-indigo-50/50 text-indigo-900 font-black">3. In Factory</th>
                      <th className="px-3.5 py-3 text-right bg-violet-50/50 text-violet-900 font-black">4. Shipped</th>
                      <th className="px-3.5 py-3 text-right text-rose-700 font-bold">Scrap</th>
                      <th className="px-3.5 py-3 text-center">UOM</th>
                      <th className="px-3.5 py-3 text-center">Floor Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium bg-white">
                    {filteredItems.map((i, index) => {
                      const sum = stockSummaryMap.get(i.id);
                      const inwarded = sum?.totalInwarded ?? 0;
                      const available = sum?.availableStock ?? 0;
                      const inFactory = sum?.totalInFactoryAssembled ?? 0;
                      const shipped = sum?.totalDispatchedInOrders ?? 0;
                      const scrapped = sum?.totalScrapped ?? 0;
                      const isNotYetInwarded = inwarded === 0;

                      return (
                        <tr key={i.id} className="hover:bg-slate-50/90 transition-colors group">
                          <td className="px-3.5 py-3 text-center font-bold text-slate-400 text-[11px]">
                            {index + 1}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <p className="font-black text-slate-950 text-sm leading-tight group-hover:text-indigo-600 transition-colors">
                                {i.name}
                              </p>
                              {i.description && (
                                <p className="text-[11px] text-slate-500 font-normal mt-0.5 leading-snug">
                                  {i.description}
                                </p>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-3 whitespace-nowrap">
                            <ItemCategoryBadge category={i.category} />
                          </td>

                          <td className="px-3 py-3 whitespace-nowrap">
                            <ColorBadge color={i.color} />
                          </td>

                          <td className="px-3.5 py-3 text-right whitespace-nowrap">
                            <span className="inline-block font-black text-slate-950 bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-lg text-xs shadow-2xs">
                              {formatNumber(inwarded)}
                            </span>
                          </td>

                          <td className="px-3.5 py-3 text-right bg-emerald-50/30 whitespace-nowrap">
                            <span className={`inline-block font-black px-2.5 py-1 rounded-lg text-xs border shadow-2xs ${
                              available > 0
                                ? 'text-emerald-950 bg-emerald-100 border-emerald-300'
                                : 'text-slate-400 bg-slate-50 border-slate-200'
                            }`}>
                              {formatNumber(available)}
                            </span>
                          </td>

                          <td className="px-3.5 py-3 text-right bg-indigo-50/20 whitespace-nowrap">
                            <span className={`inline-block font-black px-2.5 py-1 rounded-lg text-xs border shadow-2xs ${
                              inFactory > 0
                                ? 'text-indigo-950 bg-indigo-100 border-indigo-300'
                                : 'text-slate-400 bg-slate-50 border-slate-200'
                            }`}>
                              {formatNumber(inFactory)}
                            </span>
                          </td>

                          <td className="px-3.5 py-3 text-right bg-violet-50/20 whitespace-nowrap">
                            <span className={`inline-block font-black px-2.5 py-1 rounded-lg text-xs border shadow-2xs ${
                              shipped > 0
                                ? 'text-violet-950 bg-violet-100 border-violet-300'
                                : 'text-slate-400 bg-slate-50 border-slate-200'
                            }`}>
                              {formatNumber(shipped)}
                            </span>
                          </td>

                          <td className="px-3.5 py-3 text-right whitespace-nowrap">
                            {scrapped > 0 ? (
                              <span className="inline-block font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-xs">
                                {formatNumber(scrapped)}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">0</span>
                            )}
                          </td>

                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            <span className="inline-block font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                              {i.unit || 'pcs'}
                            </span>
                          </td>

                          <td className="px-3.5 py-3 text-center whitespace-nowrap">
                            {isNotYetInwarded ? (
                              <span className="inline-flex items-center gap-1 font-bold text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                Unreceived
                              </span>
                            ) : available > 0 ? (
                              <span className="inline-flex items-center gap-1 font-extrabold text-[10px] text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                In Stock
                              </span>
                            ) : inFactory > 0 ? (
                              <span className="inline-flex items-center gap-1 font-extrabold text-[10px] text-indigo-800 bg-indigo-100 border border-indigo-300 px-2 py-0.5 rounded-full">
                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
                                On Floor
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-extrabold text-[10px] text-violet-800 bg-violet-100 border border-violet-300 px-2 py-0.5 rounded-full">
                                <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                                Dispatched
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                            {sum && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenAuditModal(sum)}
                                className="text-[11px] py-1 px-2.5 font-bold text-indigo-700 border-indigo-300 bg-indigo-50/70 hover:bg-indigo-100 shadow-2xs cursor-pointer"
                                title="Inspect 360° lifecycle audit"
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Audit
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onOpenEditModal(i)}
                              className="text-[11px] py-1 px-2 font-bold text-slate-700 border-slate-300 hover:bg-slate-100 shadow-2xs cursor-pointer"
                              title="Edit item specifications"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onOpenDeleteModal({ id: i.id, name: i.name })}
                              className="text-[11px] py-1 px-2 font-bold text-rose-700 border-rose-300 bg-rose-50/50 hover:bg-rose-100 shadow-2xs cursor-pointer"
                              title="Delete item SKU"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScrollContainer>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
