import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  Check,
  ChevronDown,
  Calendar,
  MapPin,
  Copy,
  CheckCheck,
  Package,
} from 'lucide-react';
import { ItemCategoryBadge } from '@/components/ui';
import type { ItemGroup } from '@/views/outward/types';
import type { Stage } from '@/lib/supabase';
import type { BatchStock } from '@/lib/types';
import { formatNumber, formatDate } from '@/lib/utils';

export type ItemGroupedPickerProps = {
  itemGroups: ItemGroup[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string, activeBatchId?: string) => void;
  isOpen: boolean;
  onClose: () => void;
  perBatchStock?: Map<string, BatchStock[]>;
  stages?: Stage[] | null;
};

type SortOption = 'fifo' | 'newest' | 'batch_asc' | 'stock_desc' | 'name_asc';

/** Helper to highlight matching text substrings */
function HighlightMatch({ text, query }: { text?: string | null; query: string }) {
  if (!text) return null;
  if (!query || !query.trim()) return <span>{text}</span>;

  const q = query.trim().toLowerCase();
  const index = text.toLowerCase().indexOf(q);
  if (index === -1) return <span>{text}</span>;

  const before = text.substring(0, index);
  const match = text.substring(index, index + q.length);
  const after = text.substring(index + q.length);

  return (
    <span>
      {before}
      <mark className="bg-amber-200 text-amber-950 font-bold px-0.5 rounded-xs">{match}</mark>
      {after}
    </span>
  );
}

export function ItemGroupedPicker({
  itemGroups,
  selectedItemId,
  onSelectItem,
  isOpen,
  onClose,
}: ItemGroupedPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('fifo');
  const [copiedBatchNo, setCopiedBatchNo] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus search input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedBatchNo(text);
    setTimeout(() => setCopiedBatchNo(null), 1800);
  };

  // Distinct locations from all child batches
  const availableLocations = useMemo(() => {
    const locSet = new Set<string>();
    for (const grp of itemGroups) {
      for (const loc of grp.locations) {
        if (loc) locSet.add(loc);
      }
    }
    return Array.from(locSet).sort();
  }, [itemGroups]);

  // Dynamic category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: itemGroups.length };
    for (const g of itemGroups) {
      const cat = g.item.category || 'Other';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [itemGroups]);

  const categories = useMemo(() => {
    const defaultCats = ['ALL', 'Bottle', 'Cap', 'Atomizer', 'Packaging'];
    const otherCats = Object.keys(categoryCounts).filter(
      (c) => !defaultCats.includes(c) && c !== 'ALL'
    );
    return [...defaultCats, ...otherCats];
  }, [categoryCounts]);

  // Full-text search and faceted filtering
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return itemGroups.filter((grp) => {
      // 1. Category Filter
      if (selectedCategory !== 'ALL' && grp.item.category !== selectedCategory) {
        return false;
      }

      // 2. Location Filter
      if (selectedLocation !== 'ALL') {
        const hasLocation = grp.batches.some(
          (b) => b.location && b.location.toLowerCase() === selectedLocation.toLowerCase()
        );
        if (!hasLocation) return false;
      }

      // 3. Search Query Matching across item name, category, and child batch metadata
      if (q) {
        const itemNameMatch = grp.item.name.toLowerCase().includes(q);
        const itemCatMatch = (grp.item.category || '').toLowerCase().includes(q);

        const childBatchMatch = grp.batches.some((b) => {
          const bNo = b.batch_no.toLowerCase();
          const bLoc = (b.location || '').toLowerCase();
          const bDateRaw = (b.received_on || '').toLowerCase();
          const bDateFmt = formatDate(b.received_on).toLowerCase();
          const bSup = (b.supplier?.name || '').toLowerCase();
          const bBrand = (b.brand_name || '').toLowerCase();
          const bColor = (b.color || '').toLowerCase();

          return (
            bNo.includes(q) ||
            bLoc.includes(q) ||
            bDateRaw.includes(q) ||
            bDateFmt.includes(q) ||
            bSup.includes(q) ||
            bBrand.includes(q) ||
            bColor.includes(q)
          );
        });

        if (!itemNameMatch && !itemCatMatch && !childBatchMatch) {
          return false;
        }
      }

      return true;
    });
  }, [itemGroups, searchQuery, selectedCategory, selectedLocation]);

  // Sorting
  const sortedGroups = useMemo(() => {
    return [...filteredGroups].sort((a, b) => {
      if (sortBy === 'fifo') {
        // Oldest earliest batch date first
        const dateA = a.batches[0]?.received_on
          ? new Date(a.batches[0].received_on).getTime()
          : 0;
        const dateB = b.batches[0]?.received_on
          ? new Date(b.batches[0].received_on).getTime()
          : 0;
        return dateA - dateB;
      }
      if (sortBy === 'newest') {
        const dateA = a.batches[0]?.received_on
          ? new Date(a.batches[0].received_on).getTime()
          : 0;
        const dateB = b.batches[0]?.received_on
          ? new Date(b.batches[0].received_on).getTime()
          : 0;
        return dateB - dateA;
      }
      if (sortBy === 'batch_asc') {
        const bNoA = a.batches[0]?.batch_no || '';
        const bNoB = b.batches[0]?.batch_no || '';
        return bNoA.localeCompare(bNoB);
      }
      if (sortBy === 'stock_desc') {
        return b.totalIntake - a.totalIntake;
      }
      if (sortBy === 'name_asc') {
        return a.item.name.localeCompare(b.item.name);
      }
      return 0;
    });
  }, [filteredGroups, sortBy]);

  // Adjust keyboard navigation index
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, selectedCategory, selectedLocation, sortBy]);

  const handleSelectGroup = useCallback(
    (groupId: string, batchId?: string) => {
      onSelectItem(groupId, batchId);
      onClose();
    },
    [onSelectItem, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < sortedGroups.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (sortedGroups[highlightedIndex]) {
          handleSelectGroup(sortedGroups[highlightedIndex].item_id);
        }
      }
    },
    [sortedGroups, highlightedIndex, handleSelectGroup, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-16 px-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={containerRef}
        className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header Search Section */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-2xs">
                <Package className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Select Product &amp; Consolidated Batches
                </h3>
                <p className="text-[11px] text-slate-500">
                  Search by item name, storage bay, inward date, or batch #
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition"
              title="Close (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search Input Box */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search item, batch # (e.g. CU9), location (e.g. Bay 2-A), date (e.g. 18 Sep)..."
              className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 shadow-2xs transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Bar: Category Tabs + Location Filter + Sort */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* Category Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {categories.map((cat) => {
                const count = categoryCounts[cat] || 0;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition whitespace-nowrap inline-flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                    }`}
                  >
                    <span>{cat}</span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded-full font-black ${
                        isSelected
                          ? 'bg-indigo-800 text-indigo-100'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Controls: Location Dropdown & Sort */}
            <div className="flex items-center gap-2">
              {/* Location Filter */}
              {availableLocations.length > 0 && (
                <div className="relative">
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    aria-label="Filter by storage location"
                    className="bg-white border border-slate-200 rounded-lg pl-2 pr-7 py-1 text-[11px] font-bold text-slate-700 hover:border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs appearance-none"
                  >
                    <option value="ALL">📍 All Locations</option>
                    {availableLocations.map((loc) => (
                      <option key={loc} value={loc}>
                        📍 {loc}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                </div>
              )}

              {/* Sort Dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  aria-label="Sort product items"
                  className="bg-white border border-slate-200 rounded-lg pl-2 pr-7 py-1 text-[11px] font-bold text-slate-700 hover:border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-2xs appearance-none"
                >
                  <option value="fifo">📅 Oldest Inward (FIFO)</option>
                  <option value="newest">📅 Newest Inward</option>
                  <option value="batch_asc">🏷️ Batch Number (A → Z)</option>
                  <option value="stock_desc">📊 Highest Stock</option>
                  <option value="name_asc">🔤 Item Name (A → Z)</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Results List */}
        <div ref={listRef} className="overflow-y-auto flex-1 p-3 sm:p-4 space-y-3">
          {sortedGroups.length === 0 ? (
            <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-xl">
              <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700">No matching products or batches found</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Try adjusting your search terms, category, or location filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                  setSelectedLocation('ALL');
                }}
                className="mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            sortedGroups.map((grp, idx) => {
              const isSelected = selectedItemId === grp.item_id;
              const isHighlighted = highlightedIndex === idx;

              return (
                <div
                  key={grp.item_id}
                  onClick={() => handleSelectGroup(grp.item_id)}
                  className={`rounded-xl border transition cursor-pointer p-3.5 sm:p-4 text-left ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-500/20'
                      : isHighlighted
                      ? 'border-slate-300 bg-slate-50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 shadow-2xs'
                  }`}
                >
                  {/* Top Item Summary Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <ItemCategoryBadge category={grp.item.category} />
                      <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                        <HighlightMatch text={grp.item.name} query={searchQuery} />
                      </h4>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {grp.batches.length} {grp.batches.length === 1 ? 'batch' : 'batches'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                          Total Intake
                        </span>
                        <span className="text-sm font-black text-slate-900">
                          {formatNumber(grp.totalIntake)} {grp.item.unit}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Date-Wise Batch & Location Matrix */}
                  <div className="mt-3 border-t border-slate-100 pt-2.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Date-Wise Batches &amp; Storage Locations
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {grp.batches.map((b, bIdx) => (
                        <div
                          key={b.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectGroup(grp.item_id, b.id);
                          }}
                          className="p-2 rounded-lg bg-slate-50 hover:bg-indigo-50/80 border border-slate-200/80 hover:border-indigo-300 transition text-[11px] group"
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-mono font-bold text-slate-900 flex items-center gap-1">
                              <HighlightMatch text={b.batch_no} query={searchQuery} />
                              <button
                                type="button"
                                onClick={(e) => handleCopy(e, b.batch_no)}
                                className="opacity-0 group-hover:opacity-100 hover:text-indigo-600 transition"
                                title="Copy batch number"
                              >
                                {copiedBatchNo === b.batch_no ? (
                                  <CheckCheck className="h-2.5 w-2.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-2.5 w-2.5" />
                                )}
                              </button>
                            </span>
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.2 rounded-full ${
                                bIdx === 0
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {bIdx === 0 ? '⚡ FIFO #1' : `#${bIdx + 1}`}
                            </span>
                          </div>

                          <div className="space-y-0.5 text-[10px] text-slate-500">
                            {/* Date */}
                            <div className="flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5 text-slate-400" />
                              <span>
                                <HighlightMatch
                                  text={formatDate(b.received_on)}
                                  query={searchQuery}
                                />
                              </span>
                            </div>

                            {/* Storage Location */}
                            <div className="flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5 text-indigo-500" />
                              <span className="font-semibold text-slate-700">
                                <HighlightMatch
                                  text={b.location || 'Unknown Bay'}
                                  query={searchQuery}
                                />
                              </span>
                            </div>

                            {/* Intake Quantity */}
                            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 font-medium">
                              <span>Intake:</span>
                              <span className="font-bold text-slate-800">
                                {formatNumber(b.qty_received)} {grp.item.unit}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[11px] text-slate-500 flex items-center justify-between px-4">
          <span>
            Showing <strong className="text-slate-800">{sortedGroups.length}</strong> items •{' '}
            <strong className="text-slate-800">
              {sortedGroups.reduce((acc, g) => acc + g.batches.length, 0)}
            </strong>{' '}
            total batches
          </span>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span>
              <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono">↑</kbd>{' '}
              <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono">↓</kbd> navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono">Enter</kbd> select
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded font-mono">Esc</kbd> close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
