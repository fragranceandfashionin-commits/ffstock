import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  Check,
  ChevronDown,
  Building2,
  Calendar,
  MapPin,
  Sparkles,
  ArrowUpDown,
  Copy,
  CheckCheck,
  SlidersHorizontal,
  Package,
} from 'lucide-react';
import { ItemCategoryBadge, ColorBadge } from '@/components/ui';
import type { BatchWithRelations } from '@/lib/supabase';
import { formatNumber, formatDate } from '@/lib/utils';

export type BatchSearchSelectProps = {
  batches: BatchWithRelations[];
  selectedBatchId: string;
  onSelectBatch: (batchId: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  alwaysOpen?: boolean;
  defaultOpen?: boolean;
  onClose?: () => void;
};

type SortOption = 'newest' | 'oldest' | 'batch_asc' | 'batch_desc' | 'qty_desc' | 'name_asc';

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

export function BatchSearchSelect({
  batches,
  selectedBatchId,
  onSelectBatch,
  placeholder = 'Search batch # (e.g. CU9), item name, supplier, brand, color...',
  label,
  className = '',
  compact = false,
  disabled = false,
  alwaysOpen = false,
  defaultOpen = false,
  onClose,
}: BatchSearchSelectProps) {
  const [isOpenState, setIsOpenState] = useState(defaultOpen || alwaysOpen);
  const isOpen = alwaysOpen || isOpenState;

  const handleSetIsOpen = useCallback(
    (val: boolean) => {
      setIsOpenState(val);
      if (!val && onClose) onClose();
    },
    [onClose]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [copiedBatchNo, setCopiedBatchNo] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) || null,
    [batches, selectedBatchId]
  );

  // Extract unique categories, suppliers, and brands with counts for dynamic filtering
  const { categories, suppliers, brands } = useMemo(() => {
    const catMap = new Map<string, number>();
    const supMap = new Map<string, { id: string; name: string; count: number }>();
    const brandMap = new Map<string, number>();

    for (const b of batches) {
      const cat = (b.item?.category || 'General').trim();
      catMap.set(cat, (catMap.get(cat) || 0) + 1);

      if (b.brand_name && b.brand_name.trim()) {
        const br = b.brand_name.trim();
        brandMap.set(br, (brandMap.get(br) || 0) + 1);
      }

      if (b.supplier && b.supplier.id) {
        const existing = supMap.get(b.supplier.id);
        if (existing) {
          existing.count += 1;
        } else {
          supMap.set(b.supplier.id, {
            id: b.supplier.id,
            name: b.supplier.name || 'Unknown Supplier',
            count: 1,
          });
        }
      }
    }

    const catList = Array.from(catMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const supList = Array.from(supMap.values()).sort((a, b) => b.count - a.count);

    const brandList = Array.from(brandMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { categories: catList, suppliers: supList, brands: brandList };
  }, [batches]);

  // Filter and sort batches
  const filteredBatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return batches
      .filter((b) => {
        // Category filter
        if (selectedCategory !== 'ALL') {
          const cat = (b.item?.category || 'General').toLowerCase();
          if (cat !== selectedCategory.toLowerCase()) return false;
        }

        // Brand filter
        if (selectedBrand !== 'ALL') {
          if (selectedBrand === 'UNBRANDED') {
            if (b.brand_name && b.brand_name.trim()) return false;
          } else {
            if ((b.brand_name || '').trim().toLowerCase() !== selectedBrand.toLowerCase()) return false;
          }
        }

        // Supplier filter
        if (selectedSupplierId !== 'ALL') {
          if (b.supplier_id !== selectedSupplierId) return false;
        }

        // Query search
        if (!q) return true;

        const batchNoMatch = (b.batch_no || '').toLowerCase().includes(q);
        const itemNameMatch = (b.item?.name || '').toLowerCase().includes(q);
        const brandMatch = (b.brand_name || '').toLowerCase().includes(q);
        const supplierMatch = (b.supplier?.name || '').toLowerCase().includes(q);
        const categoryMatch = (b.item?.category || '').toLowerCase().includes(q);
        const colorMatch = (b.color || '').toLowerCase().includes(q);
        const locMatch = (b.location || '').toLowerCase().includes(q);

        return (
          batchNoMatch ||
          itemNameMatch ||
          brandMatch ||
          supplierMatch ||
          categoryMatch ||
          colorMatch ||
          locMatch
        );
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'newest':
            return new Date(b.received_on || b.created_at).getTime() >
              new Date(a.received_on || a.created_at).getTime()
              ? -1
              : 1;
          case 'oldest':
            return new Date(a.received_on || a.created_at).getTime() >
              new Date(b.received_on || b.created_at).getTime()
              ? -1
              : 1;
          case 'batch_asc':
            return (a.batch_no || '').localeCompare(b.batch_no || '', undefined, { numeric: true });
          case 'batch_desc':
            return (b.batch_no || '').localeCompare(a.batch_no || '', undefined, { numeric: true });
          case 'qty_desc':
            return (b.qty_received || 0) - (a.qty_received || 0);
          case 'name_asc':
            return (a.item?.name || '').localeCompare(b.item?.name || '');
          default:
            return 0;
        }
      });
  }, [batches, searchQuery, selectedCategory, selectedBrand, selectedSupplierId, sortBy]);


  // Recent quick picks (top 3 most recent batches)
  const recentQuickPicks = useMemo(() => {
    return [...batches]
      .sort(
        (a, b) =>
          new Date(b.received_on || b.created_at).getTime() -
          new Date(a.received_on || a.created_at).getTime()
      )
      .slice(0, 3);
  }, [batches]);

  // Reset highlighted index when filtered items change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredBatches.length, searchQuery, selectedCategory, selectedBrand, selectedSupplierId]);

  // Global keyboard shortcut to open batch search (Ctrl+B or Cmd+B)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        handleSetIsOpen(!isOpen);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleSetIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when opening
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
          handleSetIsOpen(true);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        handleSetIsOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1 < filteredBatches.length ? prev + 1 : 0));
        // Scroll item into view
        const el = listRef.current?.children[highlightedIndex + 1] as HTMLElement;
        el?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredBatches.length - 1));
        const el = listRef.current?.children[highlightedIndex - 1] as HTMLElement;
        el?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredBatches[highlightedIndex]) {
          onSelectBatch(filteredBatches[highlightedIndex].id);
          handleSetIsOpen(false);
        }
      }
    },
    [isOpen, filteredBatches, highlightedIndex, onSelectBatch, handleSetIsOpen]
  );

  const handleCopyBatchNo = (e: React.MouseEvent, batchNo: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(batchNo);
    setCopiedBatchNo(batchNo);
    setTimeout(() => setCopiedBatchNo(null), 1800);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('ALL');
    setSelectedBrand('ALL');
    setSelectedSupplierId('ALL');
    setSortBy('newest');
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedCategory !== 'ALL' ||
    selectedBrand !== 'ALL' ||
    selectedSupplierId !== 'ALL' ||
    sortBy !== 'newest';

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      {label && (
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
          {label}
        </label>
      )}

      {/* Selected Batch Hero Display (When not open and a batch is selected) */}
      {!alwaysOpen && selectedBatch && !compact && (
        <div className="rounded-2xl border-2 border-indigo-200/90 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-5 text-white shadow-md relative overflow-hidden group">
          {/* Subtle background glow */}
          <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
            <div className="space-y-2 flex-1 min-w-0">
              {/* Badges strip */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <ItemCategoryBadge category={selectedBatch.item?.category} />
                <button
                  type="button"
                  onClick={(e) => handleCopyBatchNo(e, selectedBatch.batch_no)}
                  className="font-mono font-black text-indigo-200 bg-indigo-900/80 hover:bg-indigo-800 px-2.5 py-0.5 rounded-lg border border-indigo-700/60 inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Click to copy batch number"
                >
                  <span>Batch {selectedBatch.batch_no}</span>
                  {copiedBatchNo === selectedBatch.batch_no ? (
                    <CheckCheck className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3 opacity-60 hover:opacity-100" />
                  )}
                </button>

                {selectedBatch.brand_name && (
                  <span className="font-extrabold text-amber-200 bg-amber-950/70 border border-amber-500/40 px-2.5 py-0.5 rounded-lg text-xs shadow-2xs inline-flex items-center gap-1">
                    🏢 {selectedBatch.brand_name}
                  </span>
                )}

                <ColorBadge color={selectedBatch.color} />
              </div>

              {/* Item Name */}
              <h4 className="text-base sm:text-lg font-black text-white tracking-tight leading-snug truncate">
                {selectedBatch.item?.name ?? 'Stock Item'}
              </h4>

              {/* Meta information row */}
              <div className="flex items-center gap-x-4 gap-y-1.5 text-xs text-indigo-200/80 flex-wrap font-medium">
                {selectedBatch.supplier && (
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                    <span>
                      Supplier:{' '}
                      <strong className="text-white font-semibold">{selectedBatch.supplier.name}</strong>
                    </span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-indigo-400" />
                  <span>
                    Received:{' '}
                    <strong className="text-white font-bold">
                      {formatNumber(selectedBatch.qty_received)} {selectedBatch.item?.unit || 'pcs'}
                    </strong>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-indigo-400" />
                  <span>
                    Storage:{' '}
                    <strong className="text-white font-semibold">{selectedBatch.location}</strong>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-indigo-400" />
                  <span>{formatDate(selectedBatch.received_on)}</span>
                </span>
              </div>
            </div>

            {/* Quick action buttons */}
            <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-indigo-800/60">
              <button
                type="button"
                onClick={() => handleSetIsOpen(true)}
                disabled={disabled}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-slate-900 hover:bg-indigo-50 px-4 py-2 text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all duration-150 active:scale-98 cursor-pointer disabled:opacity-50"
              >
                <Search className="h-4 w-4 text-indigo-600" />
                <span>Change Batch</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectBatch('')}
                disabled={disabled}
                className="inline-flex items-center justify-center p-2 rounded-xl bg-indigo-900/60 hover:bg-rose-900/70 text-indigo-200 hover:text-white border border-indigo-700/50 hover:border-rose-600/50 transition cursor-pointer disabled:opacity-50"
                title="Clear selected batch"
                aria-label="Clear batch selection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trigger Button when nothing selected or compact */}
      {!alwaysOpen && (!selectedBatch || compact) && (
        <button
          type="button"
          onClick={() => !disabled && handleSetIsOpen(!isOpen)}
          disabled={disabled}
          className={`w-full rounded-2xl border ${
            isOpen
              ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-white'
              : 'border-slate-300 bg-white hover:border-slate-400'
          } p-3.5 sm:p-4 text-left shadow-xs transition-all flex items-center justify-between gap-3 cursor-pointer group disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                selectedBatch
                  ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                  : 'bg-slate-100 text-slate-400 group-hover:text-slate-600 group-hover:bg-slate-200/70'
              }`}
            >
              <Search className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              {selectedBatch ? (
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {selectedBatch.batch_no}
                    </span>
                    <ItemCategoryBadge category={selectedBatch.item?.category} />
                    {selectedBatch.brand_name && (
                      <span className="font-extrabold text-amber-900 text-xs bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        🏢 {selectedBatch.brand_name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-900 truncate mt-0.5">
                    {selectedBatch.item?.name ?? 'Stock Item'}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-slate-700">{placeholder}</p>
                  <p className="text-xs text-slate-400">
                    Click to filter by Brand, Bottle, Cap, Atomizer, Supplier, or Batch #
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-block text-[11px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-lg">
              {batches.length} Batches
            </span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                isOpen ? 'rotate-180 text-indigo-600' : 'group-hover:text-slate-600'
              }`}
            />
          </div>
        </button>
      )}

      {/* Interactive Dropdown & Filter Command Panel */}
      {isOpen && (
        <div
          className={`${
            alwaysOpen ? 'relative w-full' : 'absolute left-0 right-0 z-50 mt-2'
          } rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col`}
          style={{ minWidth: '100%' }}
        >
          {/* Header & Live Search Input */}
          <div className="space-y-3 pb-3 border-b border-slate-100 shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-indigo-600 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-indigo-200 bg-slate-50/70 pl-10 pr-24 py-2.5 text-xs sm:text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <div className="absolute right-2.5 flex items-center gap-1.5">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer"
                    title="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSetIsOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Quick Category Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === 'ALL'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Sparkles className="h-3 w-3" />
                <span>All ({batches.length})</span>
              </button>

              {categories.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setSelectedCategory(c.name)}
                  className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition flex items-center gap-1.5 cursor-pointer ${
                    selectedCategory.toLowerCase() === c.name.toLowerCase()
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>{c.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                      selectedCategory.toLowerCase() === c.name.toLowerCase()
                        ? 'bg-indigo-700 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {c.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Sub-Filters: Brand, Supplier & Sort */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Brand Dropdown */}
                {brands.length > 0 && (
                  <div className="flex items-center gap-1">
                    <select
                      value={selectedBrand}
                      onChange={(e) => setSelectedBrand(e.target.value)}
                      className={`rounded-lg border px-2 py-1 text-xs font-bold transition cursor-pointer ${
                        selectedBrand !== 'ALL'
                          ? 'border-amber-400 bg-amber-50 text-amber-950 ring-1 ring-amber-300'
                          : 'border-slate-200 bg-slate-50 text-slate-700 focus:border-indigo-600 focus:outline-none'
                      }`}
                      title="Filter by Client / Brand"
                    >
                      <option value="ALL">🏢 All Brands ({brands.length})</option>
                      {brands.map((br) => (
                        <option key={br.name} value={br.name}>
                          🏢 {br.name} ({br.count})
                        </option>
                      ))}
                      <option value="UNBRANDED">In-House / No Brand</option>
                    </select>
                  </div>
                )}

                {/* Supplier Dropdown */}
                <div className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 focus:border-indigo-600 focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">All Suppliers ({suppliers.length})</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.count})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-1">
                  <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 focus:border-indigo-600 focus:outline-none cursor-pointer"
                  >
                    <option value="newest">📅 Newest Inward First</option>
                    <option value="oldest">📅 Oldest Inward First</option>
                    <option value="batch_asc">🏷️ Batch No (A → Z)</option>
                    <option value="batch_desc">🏷️ Batch No (Z → A)</option>
                    <option value="qty_desc">📊 Highest Qty Received</option>
                    <option value="name_asc">🔤 Item Name (A → Z)</option>
                  </select>
                </div>
              </div>

              {/* Results status & Reset filter button */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-slate-500">
                  Showing <strong className="text-slate-900">{filteredBatches.length}</strong> of{' '}
                  {batches.length}
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Batches List Container */}
          <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-slate-100 py-1 space-y-1">
            {/* Quick Access Recent Picks when not filtering */}
            {!searchQuery && selectedCategory === 'ALL' && selectedBrand === 'ALL' && selectedSupplierId === 'ALL' && (
              <div className="pb-2 mb-1 px-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-indigo-500" />
                  <span>Recent Inward Picks</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {recentQuickPicks.map((rb) => (
                    <button
                      key={`recent-${rb.id}`}
                      type="button"
                      onClick={() => {
                        onSelectBatch(rb.id);
                        handleSetIsOpen(false);
                      }}
                      className={`text-left p-2 rounded-xl border transition cursor-pointer ${
                        selectedBatchId === rb.id
                          ? 'border-indigo-500 bg-indigo-50/50 shadow-2xs'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[11px] font-black text-indigo-900">
                          {rb.batch_no}
                        </span>
                        <ItemCategoryBadge category={rb.item?.category} />
                      </div>
                      <p className="text-xs font-bold text-slate-800 truncate mt-1">
                        {rb.brand_name ? `[${rb.brand_name}] ` : ''}{rb.item?.name ?? 'Stock Item'}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        {formatNumber(rb.qty_received)} {rb.item?.unit || 'pcs'} • {rb.supplier?.name}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* List Results */}
            {filteredBatches.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Package className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No matching batches found</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  We couldn't find any batches matching your active search/filter. Try searching by a different brand name, batch
                  number, item SKU, or resetting the filters.
                </p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition cursor-pointer"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Reset All Filters</span>
                </button>
              </div>
            ) : (
              filteredBatches.map((b, idx) => {
                const isSelected = selectedBatchId === b.id;
                const isHighlighted = highlightedIndex === idx;

                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      onSelectBatch(b.id);
                      handleSetIsOpen(false);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left p-3 rounded-xl transition flex items-center justify-between gap-3 cursor-pointer group ${
                      isSelected
                        ? 'bg-indigo-50 border border-indigo-200 shadow-2xs'
                        : isHighlighted
                        ? 'bg-slate-50/90 border border-slate-200'
                        : 'hover:bg-slate-50/70 border border-transparent'
                    }`}
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      {/* Batch Top Header Row */}
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <ItemCategoryBadge category={b.item?.category} />
                        <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                          <HighlightMatch text={b.batch_no} query={searchQuery} />
                        </span>

                        {b.brand_name ? (
                          <span className="font-black text-amber-950 bg-amber-100 border border-amber-300/80 px-2 py-0.5 rounded-md text-[11px] inline-flex items-center gap-1 shadow-2xs">
                            🏢 <HighlightMatch text={b.brand_name} query={searchQuery} />
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px] italic font-semibold px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200">
                            In-House
                          </span>
                        )}

                        <ColorBadge color={b.color} />
                      </div>

                      {/* Item Name */}
                      <h5 className="text-sm font-black text-slate-900 tracking-tight leading-snug truncate">
                        <HighlightMatch text={b.item?.name ?? 'Stock Item'} query={searchQuery} />
                      </h5>

                      {/* Meta information row */}
                      <div className="flex items-center gap-x-3 gap-y-1 text-xs text-slate-500 flex-wrap">
                        {b.supplier && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-slate-400" />
                            <span>
                              Supplier:{' '}
                              <strong className="text-slate-700 font-semibold">
                                <HighlightMatch text={b.supplier.name} query={searchQuery} />
                              </strong>
                            </span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          <span>
                            Storage:{' '}
                            <strong className="text-slate-700">{b.location || 'Default'}</strong>
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span>{formatDate(b.received_on)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Right side Quantity & Selection Indicator */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="font-extrabold text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-xl text-xs shadow-2xs">
                        {formatNumber(b.qty_received)} <span className="text-[10px] text-slate-500 font-semibold">{b.item?.unit || 'pcs'}</span>
                      </span>

                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-full">
                          <Check className="h-3 w-3 text-indigo-700" />
                          <span>Selected</span>
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition">
                          Click to select →
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer keyboard helpers */}
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
            <div className="flex items-center gap-3">
              <span>
                <kbd className="font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] text-slate-600">
                  ↑
                </kbd>{' '}
                <kbd className="font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] text-slate-600">
                  ↓
                </kbd>{' '}
                navigate
              </span>
              <span>
                <kbd className="font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] text-slate-600">
                  ↵
                </kbd>{' '}
                select
              </span>
              <span>
                <kbd className="font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] text-slate-600">
                  ESC
                </kbd>{' '}
                close
              </span>
            </div>
            <span className="font-medium text-indigo-600">ffstock Fast Picker</span>
          </div>
        </div>
      )}
    </div>
  );
}
