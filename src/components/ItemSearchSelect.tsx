import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, X, Check, ChevronDown, Sparkles, PlusCircle, Package, Building2 } from 'lucide-react';
import { ItemCategoryBadge, ColorBadge } from '@/components/ui';
import type { Item, BatchWithRelations } from '@/lib/supabase';

export type ItemSearchSelectProps = {
  items: Item[];
  batches?: BatchWithRelations[];
  selectedItemId: string;
  onSelectItem: (itemId: string) => void;
  onAddNewSku?: () => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean | string;
  autoFocus?: boolean;
  className?: string;
};

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

export function ItemSearchSelect({
  items,
  batches = [],
  selectedItemId,
  onSelectItem,
  onAddNewSku,
  placeholder = 'Search item name, supplier/vendor, brand, color…',
  disabled = false,
  error = false,
  autoFocus = false,
  className = '',
}: ItemSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) || null,
    [items, selectedItemId]
  );

  // Map each item to its historical suppliers, brands, and batch numbers from batches
  const itemMetadataMap = useMemo(() => {
    const map = new Map<
      string,
      {
        supplierNames: string[];
        brandNames: string[];
        batchNos: string[];
        searchableText: string;
      }
    >();

    for (const b of batches) {
      if (!b.item_id) continue;
      let entry = map.get(b.item_id);
      if (!entry) {
        entry = { supplierNames: [], brandNames: [], batchNos: [], searchableText: '' };
        map.set(b.item_id, entry);
      }
      if (b.supplier?.name && !entry.supplierNames.includes(b.supplier.name)) {
        entry.supplierNames.push(b.supplier.name);
      }
      if (b.brand_name && b.brand_name.trim() && !entry.brandNames.includes(b.brand_name.trim())) {
        entry.brandNames.push(b.brand_name.trim());
      }
      if (b.batch_no && !entry.batchNos.includes(b.batch_no)) {
        entry.batchNos.push(b.batch_no);
      }
    }

    // Precompile lower-cased searchable text
    for (const [, entry] of map.entries()) {
      entry.searchableText = `${entry.supplierNames.join(' ')} ${entry.brandNames.join(' ')} ${entry.batchNos.join(' ')}`.toLowerCase();
    }

    return map;
  }, [batches]);

  // Extract unique categories with counts
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const cat = (item.category || 'General').trim();
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  // Filtered items based on search query (name, category, color, unit, supplier, brand, batch) & category tab
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      // Category tab filter
      if (selectedCategory !== 'ALL') {
        const cat = (item.category || 'General').toLowerCase();
        if (cat !== selectedCategory.toLowerCase()) return false;
      }

      // Search query filter
      if (!q) return true;

      const nameMatch = (item.name || '').toLowerCase().includes(q);
      const catMatch = (item.category || '').toLowerCase().includes(q);
      const colorMatch = (item.color || '').toLowerCase().includes(q);
      const unitMatch = (item.unit || '').toLowerCase().includes(q);
      const descMatch = (item.description || '').toLowerCase().includes(q);

      // Check linked supplier name, brand name, and batch numbers
      const meta = itemMetadataMap.get(item.id);
      const metaMatch = meta ? meta.searchableText.includes(q) : false;

      return nameMatch || catMatch || colorMatch || unitMatch || descMatch || metaMatch;
    });
  }, [items, searchQuery, selectedCategory, itemMetadataMap]);

  // Reset highlighted index on filter changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredItems.length, searchQuery, selectedCategory]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredItems.length === 0) return;
        const nextIndex = (highlightedIndex + 1) % filteredItems.length;
        setHighlightedIndex(nextIndex);
        const el = listRef.current?.children[nextIndex] as HTMLElement;
        el?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredItems.length === 0) return;
        const nextIndex = highlightedIndex - 1 < 0 ? filteredItems.length - 1 : highlightedIndex - 1;
        setHighlightedIndex(nextIndex);
        const el = listRef.current?.children[nextIndex] as HTMLElement;
        el?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[highlightedIndex]) {
          onSelectItem(filteredItems[highlightedIndex].id);
          setIsOpen(false);
        }
      }
    },
    [isOpen, filteredItems, highlightedIndex, onSelectItem]
  );

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      {/* TRIGGER BUTTON (Closed state) */}
      <button
        type="button"
        autoFocus={autoFocus}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full rounded-xl border text-left transition-all duration-150 flex items-center justify-between gap-2.5 px-3.5 py-2.5 cursor-pointer shadow-2xs ${
          error
            ? 'border-rose-400 bg-rose-50/30 ring-2 ring-rose-200'
            : isOpen
            ? 'border-emerald-600 ring-2 ring-emerald-500/20 bg-white'
            : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/50'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {selectedItem ? (
            <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
              <ItemCategoryBadge category={selectedItem.category} />
              <span className="font-bold text-slate-900 truncate text-sm">
                {selectedItem.name}
              </span>
              <ColorBadge color={selectedItem.color} />
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                Unit: {selectedItem.unit || 'pcs'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="truncate">{placeholder}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="hidden sm:inline-block text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
            {items.length} SKUs
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-emerald-600' : ''
            }`}
          />
        </div>
      </button>

      {/* DROPDOWN POPUP */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[75vh] flex flex-col min-w-[300px]">
          {/* Top Search Input */}
          <div className="relative flex items-center mb-2.5">
            <Search className="absolute left-3 h-4 w-4 text-emerald-600 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by item name, supplier/vendor, brand, color, SKU…"
              className="w-full rounded-xl border border-emerald-200 bg-emerald-50/30 pl-9 pr-8 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:border-emerald-600 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Quick Category Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 border-b border-slate-100 scrollbar-none text-xs">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition flex items-center gap-1 cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              <span>All ({items.length})</span>
            </button>

            {categories.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setSelectedCategory(c.name)}
                className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory.toLowerCase() === c.name.toLowerCase()
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{c.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    selectedCategory.toLowerCase() === c.name.toLowerCase()
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {c.count}
                </span>
              </button>
            ))}
          </div>

          {/* Pinned Action: Register New SKU */}
          {onAddNewSku && (
            <div className="pb-1.5 mb-1 border-b border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onAddNewSku();
                }}
                className="w-full text-left px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <PlusCircle className="h-4 w-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                  <span>➕ Register New Master Component SKU…</span>
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider bg-emerald-200/60 px-1.5 py-0.5 rounded text-emerald-900">
                  New SKU
                </span>
              </button>
            </div>
          )}

          {/* Items List Results */}
          <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-slate-100 py-1 space-y-1 max-h-64">
            {filteredItems.length === 0 ? (
              <div className="py-8 text-center space-y-1.5">
                <Package className="h-7 w-7 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">No matching SKUs found</p>
                <p className="text-[11px] text-slate-400">
                  Try a different search term or register this as a new SKU above.
                </p>
                {onAddNewSku && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onAddNewSku();
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition cursor-pointer"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>Create "{searchQuery || 'New SKU'}"</span>
                  </button>
                )}
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const isSelected = selectedItemId === item.id;
                const isHighlighted = highlightedIndex === idx;
                const meta = itemMetadataMap.get(item.id);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectItem(item.id);
                      setIsOpen(false);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left p-2.5 rounded-xl transition flex items-center justify-between gap-2.5 cursor-pointer group ${
                      isSelected
                        ? 'bg-emerald-50 border border-emerald-200 shadow-2xs'
                        : isHighlighted
                        ? 'bg-slate-50 border border-slate-200'
                        : 'hover:bg-slate-50/70 border border-transparent'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ItemCategoryBadge category={item.category} />
                        <span className="font-bold text-slate-900 text-xs sm:text-sm">
                          <HighlightMatch text={item.name} query={searchQuery} />
                        </span>
                        <ColorBadge color={item.color} />
                      </div>

                      {/* Display linked Vendor & Brand tags for this item with match highlighting */}
                      {meta && (meta.supplierNames.length > 0 || meta.brandNames.length > 0) && (
                        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500 pt-0.5">
                          {meta.supplierNames.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                              <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>Vendor: <HighlightMatch text={meta.supplierNames.join(', ')} query={searchQuery} /></span>
                            </span>
                          )}
                          {meta.brandNames.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-medium">
                              🏢 <HighlightMatch text={meta.brandNames.join(', ')} query={searchQuery} />
                            </span>
                          )}
                        </div>
                      )}

                      {item.description && (
                        <p className="text-[11px] text-slate-400 truncate">
                          <HighlightMatch text={item.description} query={searchQuery} />
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        {item.unit || 'pcs'}
                      </span>
                      {isSelected && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Helper */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
            <span>Showing {filteredItems.length} of {items.length} SKUs</span>
            <div className="flex items-center gap-2">
              <span><kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded border border-slate-200">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded border border-slate-200">↵</kbd> select</span>
              <span><kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded border border-slate-200">ESC</kbd> close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
