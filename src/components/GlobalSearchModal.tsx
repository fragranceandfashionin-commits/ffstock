import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Box,
  Tag,
  Truck,
  Boxes,
  X,
  CornerDownLeft,
  Activity,
  ClipboardList,
  Users,
} from 'lucide-react';
import {
  fetchBatches,
  fetchItems,
  fetchSuppliers,
  fetchDispatches,
  fetchMovements,
  fetchProductionOrders,
  fetchClients,
} from '@/lib/queries';
import type {
  BatchWithRelations,
  Item,
  Supplier,
  Dispatch,
  MovementWithRelations,
  ProductionOrderWithRelations,
  Client,
} from '@/lib/supabase';
import { formatDate, formatNumber, classNames } from '@/lib/utils';
import type { View } from '@/lib/types';
import type { NavigationContext } from '@/components/AppShell';

export type GlobalSearchResult =
  | {
      type: 'batch';
      id: string;
      title: string;
      subtitle: string;
      tag?: string;
      meta?: string;
      batch: BatchWithRelations;
    }
  | {
      type: 'item';
      id: string;
      title: string;
      subtitle: string;
      tag?: string;
      meta?: string;
      item: Item;
    }
  | {
      type: 'order';
      id: string;
      title: string;
      subtitle: string;
      tag?: string;
      meta?: string;
      order: ProductionOrderWithRelations;
    }
  | {
      type: 'client';
      id: string;
      title: string;
      subtitle: string;
      tag?: string;
      meta?: string;
      client: Client;
    }
  | {
      type: 'dispatch';
      id: string;
      title: string;
      subtitle: string;
      tag?: string;
      meta?: string;
      dispatch: Dispatch;
    }
  | {
      type: 'supplier';
      id: string;
      title: string;
      subtitle: string;
      tag?: string;
      meta?: string;
      supplier: Supplier;
    }
  | {
      type: 'movement';
      id: string;
      title: string;
      subtitle: string;
      tag?: string;
      meta?: string;
      movement: MovementWithRelations;
    };

export type GlobalSearchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: View, context?: NavigationContext) => void;
};

type FilterCategory = 'ALL' | 'batch' | 'order' | 'item' | 'client' | 'dispatch' | 'supplier' | 'movement';

export function GlobalSearchModal({ isOpen, onClose, onNavigate }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Cached data sets for fast sub-millisecond querying
  const [batches, setBatches] = useState<BatchWithRelations[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [movements, setMovements] = useState<MovementWithRelations[]>([]);
  const [orders, setOrders] = useState<ProductionOrderWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load data whenever search opens
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveCategory('ALL');
      setSelectedIndex(0);
      return;
    }

    let isSubscribed = true;
    setLoading(true);
    Promise.all([
      fetchBatches().catch(() => []),
      fetchItems().catch(() => []),
      fetchSuppliers().catch(() => []),
      fetchDispatches().catch(() => []),
      fetchMovements().catch(() => []),
      fetchProductionOrders().catch(() => []),
      fetchClients().catch(() => []),
    ])
      .then(([b, i, s, d, m, ord, cli]) => {
        if (!isSubscribed) return;
        setBatches(b);
        setItems(i);
        setSuppliers(s);
        setDispatches(d);
        setMovements(m);
        setOrders(ord);
        setClients(cli);
      })
      .finally(() => {
        if (!isSubscribed) return;
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      });

    return () => {
      isSubscribed = false;
    };
  }, [isOpen]);

  // Unified Fuzzy Search Engine
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const res: GlobalSearchResult[] = [];

    // 1. Search Production Orders
    if (activeCategory === 'ALL' || activeCategory === 'order') {
      for (const ord of orders) {
        const matchOrderNo = ord.order_no.toLowerCase().includes(q);
        const matchProd = ord.product_name.toLowerCase().includes(q);
        const matchClient = (ord.client?.name || '').toLowerCase().includes(q);
        const matchCompany = (ord.client?.company_name || '').toLowerCase().includes(q);
        const matchNotes = (ord.notes || '').toLowerCase().includes(q);

        if (matchOrderNo || matchProd || matchClient || matchCompany || matchNotes) {
          res.push({
            type: 'order',
            id: `order-${ord.id}`,
            title: `${ord.order_no} • ${ord.product_name}`,
            subtitle: `Client: ${ord.client?.name || '—'} • Qty: ${formatNumber(ord.total_qty)} pcs • Status: ${ord.status}`,
            tag: `📋 ${ord.status === 'completed' ? 'Completed Order' : 'Order'}`,
            meta: ord.due_date ? `Due ${formatDate(ord.due_date)}` : undefined,
            order: ord,
          });
        }
      }
    }

    // 2. Search Clients
    if (activeCategory === 'ALL' || activeCategory === 'client') {
      for (const c of clients) {
        const matchName = c.name.toLowerCase().includes(q);
        const matchComp = (c.company_name || '').toLowerCase().includes(q);
        const matchEmail = (c.email || '').toLowerCase().includes(q);
        const matchPhone = (c.phone || '').toLowerCase().includes(q);
        const matchPref = (c.preferences || '').toLowerCase().includes(q);

        if (matchName || matchComp || matchEmail || matchPhone || matchPref) {
          res.push({
            type: 'client',
            id: `client-${c.id}`,
            title: `${c.name}${c.company_name ? ` (${c.company_name})` : ''}`,
            subtitle: `${c.phone ? `Ph: ${c.phone} • ` : ''}${c.email || 'Client Profile'}${c.preferences ? ` • ${c.preferences}` : ''}`,
            tag: `👥 ${c.status === 'active' ? 'Active Client' : 'Inactive Client'}`,
            meta: `Registered ${formatDate(c.created_at)}`,
            client: c,
          });
        }
      }
    }

    // 3. Search Batches
    if (activeCategory === 'ALL' || activeCategory === 'batch') {
      for (const b of batches) {
        const matchBatchNo = b.batch_no.toLowerCase().includes(q);
        const matchBrand = (b.brand_name || '').toLowerCase().includes(q);
        const matchItem = (b.item?.name || '').toLowerCase().includes(q);
        const matchSupplier = (b.supplier?.name || '').toLowerCase().includes(q);
        const matchLocation = (b.location || '').toLowerCase().includes(q);
        const matchColor = (b.color || '').toLowerCase().includes(q);

        if (matchBatchNo || matchBrand || matchItem || matchSupplier || matchLocation || matchColor) {
          res.push({
            type: 'batch',
            id: `batch-${b.id}`,
            title: b.brand_name ? `${b.brand_name} • Batch ${b.batch_no}` : `Batch ${b.batch_no}`,
            subtitle: `${b.item?.name || 'Product'} • Supplier: ${b.supplier?.name || '—'} • ${formatNumber(b.qty_received)} pcs`,
            tag: b.brand_name ? `🏢 ${b.brand_name}` : (b.color || b.location),
            meta: `Received ${formatDate(b.received_on)} • Bay ${b.location}`,
            batch: b,
          });
        }
      }
    }

    // 4. Search Items & BOM Components
    if (activeCategory === 'ALL' || activeCategory === 'item') {
      for (const itm of items) {
        const matchName = itm.name.toLowerCase().includes(q);
        const matchCat = (itm.category || '').toLowerCase().includes(q);
        const matchColor = (itm.color || '').toLowerCase().includes(q);
        const matchDesc = (itm.description || '').toLowerCase().includes(q);

        if (matchName || matchCat || matchColor || matchDesc) {
          res.push({
            type: 'item',
            id: `item-${itm.id}`,
            title: itm.name,
            subtitle: `Category: ${itm.category || 'Bottle'} • Unit: ${itm.unit || 'pcs'}${itm.description ? ` • ${itm.description}` : ''}`,
            tag: itm.category || 'Item',
            meta: itm.color ? `Color: ${itm.color}` : undefined,
            item: itm,
          });
        }
      }
    }

    // 5. Search Customer Invoices & Dispatches
    if (activeCategory === 'ALL' || activeCategory === 'dispatch') {
      for (const d of dispatches) {
        const matchInvoice = (d.invoice_no || '').toLowerCase().includes(q);
        const matchCust = (d.customer_name || '').toLowerCase().includes(q);
        const matchVariant = (d.variant_name || '').toLowerCase().includes(q);
        const matchSpecs = (d.product_specs || '').toLowerCase().includes(q);
        const matchColor = (d.color || '').toLowerCase().includes(q);

        if (matchInvoice || matchCust || matchVariant || matchSpecs || matchColor) {
          res.push({
            type: 'dispatch',
            id: `dispatch-${d.id}`,
            title: `Invoice #${d.invoice_no || '—'}${d.variant_name ? ` • 🏷️ ${d.variant_name}` : ''}`,
            subtitle: `Customer: ${d.customer_name} • Shipped: ${formatNumber(d.qty)} pcs`,
            tag: d.variant_name ? `🏷️ ${d.variant_name}` : 'Customer Order',
            meta: `Dispatched ${formatDate(d.dispatched_on)}`,
            dispatch: d,
          });
        }
      }
    }

    // 6. Search Suppliers
    if (activeCategory === 'ALL' || activeCategory === 'supplier') {
      for (const s of suppliers) {
        const matchName = s.name.toLowerCase().includes(q);
        const matchContact = (s.contact || '').toLowerCase().includes(q);

        if (matchName || matchContact) {
          res.push({
            type: 'supplier',
            id: `supplier-${s.id}`,
            title: s.name,
            subtitle: s.contact ? `Contact: ${s.contact}` : 'Supplier Partner',
            tag: 'Supplier',
            meta: `Registered ${formatDate(s.created_at)}`,
            supplier: s,
          });
        }
      }
    }

    // 7. Search Movements & Operations
    if (activeCategory === 'ALL' || activeCategory === 'movement') {
      for (const m of movements) {
        const matchVariant = (m.variant_name || '').toLowerCase().includes(q);
        const matchRemarks = (m.remarks || '').toLowerCase().includes(q);
        const matchDoneBy = (m.done_by || '').toLowerCase().includes(q);
        const matchCap = (m.cap_name || '').toLowerCase().includes(q);
        const matchAtomizer = (m.atomizer_name || '').toLowerCase().includes(q);
        const matchBox = (m.box_name || '').toLowerCase().includes(q);

        if (matchVariant || matchRemarks || matchDoneBy || matchCap || matchAtomizer || matchBox) {
          res.push({
            type: 'movement',
            id: `movement-${m.id}`,
            title: `Movement: ${formatNumber(m.qty_moved)} pcs (${m.from_stage?.name ?? 'Stage'} → ${m.to_stage?.name ?? 'Stage'})${m.variant_name ? ` • 🏷️ ${m.variant_name}` : ''}`,
            subtitle: m.remarks ? `Remarks: "${m.remarks}"` : `Logged on ${formatDate(m.moved_on)}`,
            tag: m.variant_name ? `🏷️ ${m.variant_name}` : (m.done_by ? `By: ${m.done_by}` : 'Movement'),
            meta: `${formatDate(m.moved_on)}`,
            movement: m,
          });
        }
      }
    }

    return res.slice(0, 50); // Cap for clean fast rendering
  }, [query, activeCategory, orders, clients, batches, items, suppliers, dispatches, movements]);

  // Keep selection within bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  // Action Dispatcher
  const handleSelectResult = (item: GlobalSearchResult) => {
    if (item.type === 'order') {
      if (item.order.status === 'completed') {
        onNavigate('order-history', { orderId: item.order.id });
      } else {
        onNavigate('orders', { orderId: item.order.id });
      }
    } else if (item.type === 'client') {
      onNavigate('clients', { clientId: item.client.id });
    } else if (item.type === 'batch') {
      onNavigate('dashboard', { inspectBatch: item.batch, batchId: item.batch.id });
    } else if (item.type === 'item') {
      onNavigate('items', { itemId: item.item.id });
    } else if (item.type === 'dispatch') {
      onNavigate('dashboard', { openChallan: item.dispatch, invoiceNo: item.dispatch.invoice_no });
    } else if (item.type === 'supplier') {
      onNavigate('suppliers', { supplierId: item.supplier.id });
    } else if (item.type === 'movement') {
      onNavigate('outward', { batchId: item.movement.batch_id, movementId: item.movement.id });
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      handleSelectResult(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      onClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 md:p-14 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200/90 transition-all animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header Bar */}
        <div className="flex items-center gap-3 border-b border-slate-200/80 px-4 py-3.5 bg-slate-50/60">
          <Search className="h-5 w-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orders (PO-), clients, batches, items, suppliers... (e.g. PO-2026, Oud, Amber)"
            className="w-full bg-transparent text-base font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-300">
            ESC
          </kbd>
        </div>

        {/* Category Filters Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 px-4 py-2 bg-white text-xs font-semibold text-slate-600 shrink-0 scrollbar-none">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Filter:</span>
          {(
            [
              { id: 'ALL', label: 'All Results' },
              { id: 'order', label: '📋 Orders' },
              { id: 'client', label: '👥 Clients' },
              { id: 'batch', label: '📦 Batches' },
              { id: 'item', label: '🏷️ Catalog Items' },
              { id: 'dispatch', label: '📄 Invoices / Dispatches' },
              { id: 'supplier', label: '🏢 Suppliers' },
              { id: 'movement', label: '⚡ Movements' },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={classNames(
                'rounded-lg px-2.5 py-1 transition cursor-pointer whitespace-nowrap',
                activeCategory === cat.id
                  ? 'bg-slate-900 text-white font-bold shadow-xs'
                  : 'hover:bg-slate-100 text-slate-600',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Results Container */}
        <div ref={listRef} className="overflow-y-auto p-2 flex-1 divide-y divide-slate-100">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
              <Activity className="h-4 w-4 animate-spin text-slate-500" />
              Loading factory ledger records...
            </div>
          ) : query.trim() === '' ? (
            <div className="p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 mb-3">
                <Search className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">Omni-Search Factory &amp; Production Portal</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Type any order number (PO-), client name, batch code, component, supplier, or invoice to retrieve records instantly.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
                <span className="font-medium">Quick suggestions:</span>
                {orders.slice(0, 2).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setQuery(o.order_no)}
                    className="rounded-md bg-slate-100 px-2 py-0.5 font-mono font-bold text-slate-700 hover:bg-slate-200 cursor-pointer border border-slate-200"
                  >
                    {o.order_no}
                  </button>
                ))}
                {batches.slice(0, 2).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setQuery(b.batch_no)}
                    className="rounded-md bg-slate-100 px-2 py-0.5 font-mono font-bold text-slate-700 hover:bg-slate-200 cursor-pointer border border-slate-200"
                  >
                    {b.batch_no}
                  </button>
                ))}
                {clients.slice(0, 2).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setQuery(c.name)}
                    className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer border border-slate-200"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-bold text-slate-700">No records found for "{query}"</p>
              <p className="text-xs text-slate-400 mt-1">
                Try searching with partial terms, order numbers, SKU names, or changing your filter category.
              </p>
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  data-index={idx}
                  onClick={() => handleSelectResult(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={classNames(
                    'flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all gap-3',
                    isSelected
                      ? 'bg-indigo-50/80 border border-indigo-300/80 shadow-xs'
                      : 'hover:bg-slate-50 border border-transparent',
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Category Icon */}
                    <div
                      className={classNames(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold border',
                        item.type === 'order' && 'bg-indigo-100/80 border-indigo-300 text-indigo-800',
                        item.type === 'client' && 'bg-teal-100/80 border-teal-300 text-teal-800',
                        item.type === 'batch' && 'bg-amber-100/70 border-amber-300 text-amber-800',
                        item.type === 'item' && 'bg-blue-100/70 border-blue-300 text-blue-800',
                        item.type === 'dispatch' && 'bg-emerald-100/70 border-emerald-300 text-emerald-800',
                        item.type === 'supplier' && 'bg-purple-100/70 border-purple-300 text-purple-800',
                        item.type === 'movement' && 'bg-violet-100/70 border-violet-300 text-violet-800',
                      )}
                    >
                      {item.type === 'order' && <ClipboardList className="h-5 w-5" />}
                      {item.type === 'client' && <Users className="h-5 w-5" />}
                      {item.type === 'batch' && <Box className="h-5 w-5" />}
                      {item.type === 'item' && <Tag className="h-5 w-5" />}
                      {item.type === 'dispatch' && <Truck className="h-5 w-5" />}
                      {item.type === 'supplier' && <Boxes className="h-5 w-5" />}
                      {item.type === 'movement' && <Activity className="h-5 w-5" />}
                    </div>

                    {/* Text Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 tracking-tight font-mono">
                          {item.title}
                        </span>
                        {item.tag && (
                          <span className="rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                            {item.tag}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 truncate mt-0.5 font-medium">{item.subtitle}</p>
                    </div>
                  </div>

                  {/* Metadata & Enter Prompt */}
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    {item.meta && (
                      <span className="hidden sm:inline-block text-[11px] font-medium text-slate-400">
                        {item.meta}
                      </span>
                    )}
                    <div
                      className={classNames(
                        'flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold transition',
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500 opacity-80 sm:opacity-100',
                      )}
                    >
                      <span>Open</span>
                      <CornerDownLeft className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="flex items-center justify-between border-t border-slate-200/80 px-4 py-2.5 bg-slate-50 text-[11px] font-semibold text-slate-500 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white px-1.5 py-0.5 font-bold shadow-2xs border border-slate-200">↑</kbd>
              <kbd className="rounded bg-white px-1.5 py-0.5 font-bold shadow-2xs border border-slate-200">↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded bg-white px-1.5 py-0.5 font-bold shadow-2xs border border-slate-200">↵</kbd>
              Inspect
            </span>
          </div>
          <div>
            Showing <strong className="text-slate-800">{results.length}</strong> matching records
          </div>
        </div>
      </div>
    </div>
  );
}
