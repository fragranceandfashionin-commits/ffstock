import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, X, Check, ChevronDown, Building2, PlusCircle } from 'lucide-react';
import type { Supplier } from '@/lib/supabase';

export type SupplierSearchSelectProps = {
  suppliers: Supplier[];
  selectedSupplierId: string;
  onSelectSupplier: (supplierId: string) => void;
  onAddNewSupplier?: () => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean | string;
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

export function SupplierSearchSelect({
  suppliers,
  selectedSupplierId,
  onSelectSupplier,
  onAddNewSupplier,
  placeholder = 'Search supplier or factory name…',
  disabled = false,
  error = false,
  className = '',
}: SupplierSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId) || null,
    [suppliers, selectedSupplierId]
  );

  // Filter suppliers based on search query
  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      const nameMatch = (s.name || '').toLowerCase().includes(q);
      const contactMatch = (s.contact_info || '').toLowerCase().includes(q);
      const notesMatch = (s.notes || '').toLowerCase().includes(q);
      return nameMatch || contactMatch || notesMatch;
    });
  }, [suppliers, searchQuery]);

  // Reset highlighted index on filter changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredSuppliers.length, searchQuery]);

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
        if (filteredSuppliers.length === 0) return;
        const nextIndex = (highlightedIndex + 1) % filteredSuppliers.length;
        setHighlightedIndex(nextIndex);
        const el = listRef.current?.children[nextIndex] as HTMLElement;
        el?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredSuppliers.length === 0) return;
        const nextIndex =
          highlightedIndex - 1 < 0 ? filteredSuppliers.length - 1 : highlightedIndex - 1;
        setHighlightedIndex(nextIndex);
        const el = listRef.current?.children[nextIndex] as HTMLElement;
        el?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredSuppliers[highlightedIndex]) {
          onSelectSupplier(filteredSuppliers[highlightedIndex].id);
          setIsOpen(false);
        }
      }
    },
    [isOpen, filteredSuppliers, highlightedIndex, onSelectSupplier]
  );

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      {/* TRIGGER BUTTON (Closed state) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full rounded-xl border text-left transition-all duration-150 flex items-center justify-between gap-2.5 px-3.5 py-2.5 cursor-pointer shadow-2xs ${
          error
            ? 'border-rose-400 bg-rose-50/30 ring-2 ring-rose-200'
            : isOpen
            ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-white'
            : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/50'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Building2 className={`h-4 w-4 shrink-0 ${selectedSupplier ? 'text-indigo-600' : 'text-slate-400'}`} />
          {selectedSupplier ? (
            <span className="font-bold text-slate-900 truncate text-sm">
              {selectedSupplier.name}
            </span>
          ) : (
            <span className="text-slate-400 text-sm truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="hidden sm:inline-block text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
            {suppliers.length} Vendors
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-indigo-600' : ''
            }`}
          />
        </div>
      </button>

      {/* DROPDOWN POPUP */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[75vh] flex flex-col min-w-[280px]">
          {/* Top Search Input */}
          <div className="relative flex items-center mb-2">
            <Search className="absolute left-3 h-4 w-4 text-indigo-600 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vendor / factory name…"
              className="w-full rounded-xl border border-indigo-200 bg-indigo-50/30 pl-9 pr-8 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:border-indigo-600 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
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

          {/* Pinned Action: Add New Supplier */}
          {onAddNewSupplier && (
            <div className="pb-1.5 mb-1 border-b border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onAddNewSupplier();
                }}
                className="w-full text-left px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold transition flex items-center justify-between gap-2 cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <PlusCircle className="h-4 w-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                  <span>➕ Add New Supplier / Factory…</span>
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider bg-indigo-200/60 px-1.5 py-0.5 rounded text-indigo-900">
                  New Vendor
                </span>
              </button>
            </div>
          )}

          {/* Supplier List Results */}
          <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-slate-100 py-1 space-y-1 max-h-56">
            {filteredSuppliers.length === 0 ? (
              <div className="py-6 text-center space-y-1.5">
                <Building2 className="h-6 w-6 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">No matching suppliers found</p>
                {onAddNewSupplier && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onAddNewSupplier();
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition cursor-pointer"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>Create "{searchQuery || 'New Supplier'}"</span>
                  </button>
                )}
              </div>
            ) : (
              filteredSuppliers.map((s, idx) => {
                const isSelected = selectedSupplierId === s.id;
                const isHighlighted = highlightedIndex === idx;

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onSelectSupplier(s.id);
                      setIsOpen(false);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left p-2.5 rounded-xl transition flex items-center justify-between gap-2.5 cursor-pointer group ${
                      isSelected
                        ? 'bg-indigo-50 border border-indigo-200 shadow-2xs'
                        : isHighlighted
                        ? 'bg-slate-50 border border-slate-200'
                        : 'hover:bg-slate-50/70 border border-transparent'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                        <HighlightMatch text={s.name} query={searchQuery} />
                      </p>
                      {s.contact_info && (
                        <p className="text-[11px] text-slate-400 truncate">
                          <HighlightMatch text={s.contact_info} query={searchQuery} />
                        </p>
                      )}
                    </div>

                    {isSelected && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white shrink-0">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Helper */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
            <span>Showing {filteredSuppliers.length} of {suppliers.length} Vendors</span>
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
