import { useEffect, useState, useRef } from 'react';
import { Tag, Save, Trash2, Edit2, Plus, CheckCircle2, X, Zap, Truck, Eye, PackagePlus, Download, FileSpreadsheet } from 'lucide-react';
import {
  Card,
  PageHeader,
  ErrorBanner,
  EmptyState,
  Field,
  inputClass,
  Button,
  SearchInput,
  Modal,
  ConfirmModal,
  ItemCategoryBadge,
  ColorBadge,
  ColorChipsInput,
  CardSkeleton,
  TableSkeleton,
  TableScrollContainer,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import { fetchItems, insertItem, updateItem, fetchComponentStockSummary, fetchSuppliers, insertItemStockReceipt, fetchItemStockReceipts } from '@/lib/queries';
import { supabase, ITEM_CATEGORIES, COMMON_COLORS } from '@/lib/supabase';
import type { Item, ComponentStockSummary, Supplier } from '@/lib/supabase';
import { getErrorMessage, formatNumber, formatDate, getTodayDateString, downloadCSV } from '@/lib/utils';

const COMMON_UNITS = ['pcs', 'units', 'boxes', 'sets', 'kg', 'ml', 'L'] as const;

export type ItemsViewProps = {
  initialItemId?: string;
};

export function ItemsView({ initialItemId }: ItemsViewProps = {}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockSummaryMap, setStockSummaryMap] = useState<Map<string, ComponentStockSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Item State
  const [showAddModal, setShowAddModal] = useState(false);
  const [category, setCategory] = useState<string>('Bottle');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Receive Stock Intake Modal State
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveItemId, setReceiveItemId] = useState('');
  const [receiveSupplierId, setReceiveSupplierId] = useState('');
  const [receiveQty, setReceiveQty] = useState('');
  const [receiveDate, setReceiveDate] = useState(getTodayDateString());
  const [receiveInvoiceNo, setReceiveInvoiceNo] = useState('');
  const [receiveLocation, setReceiveLocation] = useState('');
  const [receiveRemarks, setReceiveRemarks] = useState('');
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  // Edit Item Modal State
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Bottle');
  const [editUnit, setEditUnit] = useState('pcs');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete State
  const [deleteModalItem, setDeleteModalItem] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');

  // Selected item for 360 journey inspection
  const [inspectedItemSummary, setInspectedItemSummary] = useState<ComponentStockSummary | null>(null);
  const lastHandledItemIdRef = useRef<string | null>(null);

  const toast = useToast();

  const load = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [itms, summary, supps] = await Promise.all([
        fetchItems(),
        fetchComponentStockSummary().catch(() => [] as ComponentStockSummary[]),
        fetchSuppliers().catch(() => [] as Supplier[]),
      ]);
      setItems(itms);
      setSuppliers(supps);
      const sMap = new Map<string, ComponentStockSummary>();
      for (const s of summary) sMap.set(s.item.id, s);
      setStockSummaryMap(sMap);

      if (initialItemId && lastHandledItemIdRef.current !== initialItemId && sMap.has(initialItemId)) {
        lastHandledItemIdRef.current = initialItemId;
        setInspectedItemSummary(sMap.get(initialItemId) || null);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load items catalogue'));
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    if (initialItemId && lastHandledItemIdRef.current !== initialItemId && stockSummaryMap.has(initialItemId)) {
      lastHandledItemIdRef.current = initialItemId;
      setInspectedItemSummary(stockSummaryMap.get(initialItemId) || null);
    }
  }, [initialItemId, stockSummaryMap]);

  useEffect(() => {
    load();
  }, []);

  // Realtime live syncing across multi-user terminals
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const debouncedReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        load(true);
      }, 300);
    };

    const channel = supabase
      .channel('items-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_stock_receipts' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inward_batches' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_movements' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, debouncedReload)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Item name / specification is required.');
      return;
    }

    setSubmitting(true);
    try {
      await insertItem({
        name: name.trim(),
        category: category.trim() || 'Bottle',
        unit: unit.trim() || 'pcs',
        description: description.trim() || null,
        color: color.trim() || null,
      });

      toast.success(`Added "${name.trim()}" (${category}) to stock catalogue.`, 'Item Registered');
      setName('');
      setDescription('');
      setColor('');
      setShowAddModal(false);
      await load(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to add item');
      setFormError(msg);
      toast.error(msg, 'Registration Error');
    } finally {
      setSubmitting(false);
    }
  };

  const openReceiveModal = (item?: Item) => {
    setReceiveItemId(item?.id || (items && items[0]?.id) || '');
    setReceiveSupplierId('');
    setReceiveQty('');
    setReceiveDate(getTodayDateString());
    setReceiveInvoiceNo('');
    setReceiveLocation('');
    setReceiveRemarks('');
    setReceiveError(null);
    setShowReceiveModal(true);
  };

  const handleReceiveStockSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setReceiveError(null);

    if (!receiveItemId) {
      setReceiveError('Please select an item to receive stock.');
      return;
    }
    const qtyNum = Number(receiveQty);
    if (!receiveQty || !Number.isInteger(qtyNum) || qtyNum <= 0) {
      setReceiveError('Quantity received must be a positive whole number.');
      return;
    }

    setReceiveSubmitting(true);
    try {
      await insertItemStockReceipt({
        item_id: receiveItemId,
        supplier_id: receiveSupplierId || null,
        qty: qtyNum,
        received_on: receiveDate,
        invoice_no: receiveInvoiceNo.trim() || null,
        location: receiveLocation.trim() || null,
        remarks: receiveRemarks.trim() || null,
      });

      const targetItem = items?.find((i) => i.id === receiveItemId);
      toast.success(
        `Received ${formatNumber(qtyNum)} ${targetItem?.unit || 'units'} into warehouse stock for "${targetItem?.name}".`,
        'Stock Intake Logged'
      );
      setShowReceiveModal(false);
      await load(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to record stock intake');
      setReceiveError(msg);
      toast.error(msg, 'Intake Error');
    } finally {
      setReceiveSubmitting(false);
    }
  };

  const openEditModal = (item: Item) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditCategory(item.category || 'Bottle');
    setEditUnit(item.unit || 'pcs');
    setEditDescription(item.description || '');
    setEditColor(item.color || '');
    setEditError(null);
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setEditError(null);

    if (!editName.trim()) {
      setEditError('Item name is required.');
      return;
    }

    setEditSubmitting(true);
    try {
      await updateItem(editingItem!.id, {
        name: editName.trim(),
        category: editCategory.trim() || 'Bottle',
        unit: editUnit.trim() || 'pcs',
        description: editDescription.trim() || null,
        color: editColor.trim() || null,
      });

      toast.success(`Updated item "${editName.trim()}".`, 'Item Updated');
      setEditingItem(null);
      await load(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to update item');
      setEditError(msg);
      toast.error(msg, 'Update Error');
    } finally {
      setEditSubmitting(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteModalItem) return;
    setDeleting(true);
    try {
      const { error: deleteErr } = await supabase.from('items').delete().eq('id', deleteModalItem.id);
      if (deleteErr) throw deleteErr;
      toast.success(`Item "${deleteModalItem.name}" deleted.`, 'Item Removed');
      setDeleteModalItem(null);
      await load(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to delete item');
      toast.error(msg, 'Delete Blocked');
    } finally {
      setDeleting(false);
    }
  };

  // Calculate category aggregates from live stock summary
  const categoryAggregates = (items ?? []).reduce((acc, item) => {
    const cat = item.category || 'Bottle';
    const sum = stockSummaryMap.get(item.id);
    if (!acc[cat]) {
      acc[cat] = { skuCount: 0, available: 0, inwarded: 0, inFactory: 0, dispatched: 0, scrapped: 0, used: 0 };
    }
    acc[cat].skuCount += 1;
    if (sum) {
      acc[cat].available += sum.availableStock;
      acc[cat].inwarded += sum.totalInwarded;
      acc[cat].inFactory += sum.totalInFactoryAssembled;
      acc[cat].dispatched += sum.totalDispatchedInOrders;
      acc[cat].scrapped += sum.totalScrapped;
      acc[cat].used += sum.totalUsedInBatches;
    }
    return acc;
  }, {} as Record<string, { skuCount: number; available: number; inwarded: number; inFactory: number; dispatched: number; scrapped: number; used: number }>);

  const totalAllInwarded = Object.values(categoryAggregates).reduce((s, a) => s + a.inwarded, 0);
  const totalAllAvailable = Object.values(categoryAggregates).reduce((s, a) => s + a.available, 0);
  const totalAllInFactory = Object.values(categoryAggregates).reduce((s, a) => s + a.inFactory, 0);
  const totalAllDispatched = Object.values(categoryAggregates).reduce((s, a) => s + a.dispatched, 0);

  const filteredItems = (items ?? []).filter((i) => {
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

  // Filtered sums for the current view
  const currentViewInwarded = filteredItems.reduce((s, i) => s + (stockSummaryMap.get(i.id)?.totalInwarded ?? 0), 0);
  const currentViewAvailable = filteredItems.reduce((s, i) => s + (stockSummaryMap.get(i.id)?.availableStock ?? 0), 0);
  const currentViewInFactory = filteredItems.reduce((s, i) => s + (stockSummaryMap.get(i.id)?.totalInFactoryAssembled ?? 0), 0);
  const currentViewDispatched = filteredItems.reduce((s, i) => s + (stockSummaryMap.get(i.id)?.totalDispatchedInOrders ?? 0), 0);

  // Category Icon & Color Helper
  const getCategoryTheme = (cat: string) => {
    const c = cat.toLowerCase();
    if (c.includes('bottle')) return { icon: '🍾', label: 'Glass Bottles', border: 'border-blue-200', bg: 'bg-blue-50/60', text: 'text-blue-900', activeRing: 'ring-blue-500' };
    if (c.includes('cap') || c.includes('closure')) return { icon: '🧴', label: 'Caps & Closures', border: 'border-violet-200', bg: 'bg-violet-50/60', text: 'text-violet-900', activeRing: 'ring-violet-500' };
    if (c.includes('atomizer') || c.includes('pump')) return { icon: '💨', label: 'Atomizers & Pumps', border: 'border-sky-200', bg: 'bg-sky-50/60', text: 'text-sky-900', activeRing: 'ring-sky-500' };
    if (c.includes('packaging') || c.includes('box')) return { icon: '📦', label: 'Packaging Boxes', border: 'border-amber-200', bg: 'bg-amber-50/60', text: 'text-amber-900', activeRing: 'ring-amber-500' };
    if (c.includes('label')) return { icon: '🏷️', label: 'Labels & Tags', border: 'border-fuchsia-200', bg: 'bg-fuchsia-50/60', text: 'text-fuchsia-900', activeRing: 'ring-fuchsia-500' };
    if (c.includes('fragrance') || c.includes('oil')) return { icon: '🧪', label: 'Fragrance Oils', border: 'border-teal-200', bg: 'bg-teal-50/60', text: 'text-teal-900', activeRing: 'ring-teal-500' };
    return { icon: '⚙️', label: cat, border: 'border-slate-200', bg: 'bg-slate-50/60', text: 'text-slate-900', activeRing: 'ring-slate-500' };
  };

  // CSV Export Handlers
  const exportItemsCatalogCSV = () => {
    if (!items || items.length === 0) return;
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
    } catch (err) {
      toast.error(getErrorMessage(err), 'Export Failed');
    }
  };

  const exportStockReceiptsLedgerCSV = async () => {
    try {
      const receipts = await fetchItemStockReceipts();
      const headers = [
        'Receipt Date',
        'Item Name',
        'Category',
        'Supplier',
        'Invoice No',
        'Warehouse Bay',
        'Quantity Received',
        'Remarks',
      ];
      const itemMap = new Map(items?.map((i) => [i.id, i]) || []);
      const suppMap = new Map(suppliers?.map((s) => [s.id, s]) || []);

      const rows = receipts.map((r) => {
        const itm = itemMap.get(r.item_id);
        const supp = r.supplier_id ? suppMap.get(r.supplier_id) : null;
        return [
          r.received_on,
          itm?.name ?? 'Unknown Item',
          itm?.category ?? 'Bottle',
          supp?.name ?? '—',
          r.invoice_no ?? '',
          r.location ?? '',
          r.qty,
          r.remarks ?? '',
        ];
      });

      const filename = `ffstock_stock_receipts_ledger_${getTodayDateString()}`;
      downloadCSV(filename, headers, rows);
      toast.success('Stock receipts ledger CSV exported successfully', 'Export Complete');
    } catch (err) {
      toast.error(getErrorMessage(err), 'Export Failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <PageHeader
        title="Stock Item Master Catalogue & Live Inventory"
        subtitle="Live reconciled inventory ledger across Bottles, Caps, Atomizers, Packaging Boxes, Labels, and Fragrances."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={exportItemsCatalogCSV}
              className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50 cursor-pointer"
              title="Download full items inventory balance CSV"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Export Inventory CSV
            </Button>
            <Button
              variant="outline"
              onClick={exportStockReceiptsLedgerCSV}
              className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50 cursor-pointer"
              title="Download stock receipts intake ledger CSV"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
              Receipts Ledger CSV
            </Button>
            <Button
              variant="primary"
              onClick={() => openReceiveModal()}
              className="font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm py-2 px-3.5 rounded-xl flex items-center gap-1.5 text-xs"
            >
              <PackagePlus className="h-4 w-4 text-emerald-100" />
              Receive Stock Intake
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setFormError(null);
                setShowAddModal(true);
              }}
              className="font-bold bg-slate-950 text-white hover:bg-slate-800 shadow-sm py-2 px-3.5 rounded-xl flex items-center gap-1.5 text-xs"
            >
              <Plus className="h-4 w-4 text-emerald-400" />
              Register New Item
            </Button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}

      {/* EXECUTIVE CATEGORY PILLS */}
      {loading ? (
        <CardSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          {/* Card 0: ALL ITEMS */}
          <button
            type="button"
            onClick={() => setSelectedCategoryFilter('ALL')}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden group ${
              selectedCategoryFilter === 'ALL'
                ? 'bg-slate-950 text-white border-slate-900 ring-2 ring-indigo-500 shadow-md'
                : 'bg-white text-slate-800 border-slate-200 hover:border-slate-400 hover:shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🌐</span>
                <p className={`text-xs font-black uppercase tracking-wider ${selectedCategoryFilter === 'ALL' ? 'text-white' : 'text-slate-900'}`}>All Stock</p>
              </div>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${selectedCategoryFilter === 'ALL' ? 'bg-slate-800 text-indigo-300' : 'bg-slate-100 text-slate-700'}`}>
                {items?.length || 0} SKUs
              </span>
            </div>

            <div className="mt-2.5">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${selectedCategoryFilter === 'ALL' ? 'text-slate-400' : 'text-slate-500'}`}>
                Total Received
              </span>
              <p className={`text-xl font-black ${selectedCategoryFilter === 'ALL' ? 'text-emerald-400' : 'text-slate-950'}`}>
                {formatNumber(totalAllInwarded)}
              </p>
            </div>

            <div className={`mt-2 pt-2 border-t text-[10px] flex items-center justify-between font-bold ${selectedCategoryFilter === 'ALL' ? 'border-slate-800 text-slate-300' : 'border-slate-100 text-slate-600'}`}>
              <span className="text-emerald-600 font-extrabold">{formatNumber(totalAllAvailable)} Buf</span>
              <span className="text-indigo-600 font-extrabold">{formatNumber(totalAllInFactory)} Fac</span>
              <span className="text-violet-600 font-extrabold">{formatNumber(totalAllDispatched)} Ship</span>
            </div>
          </button>

          {/* Categories Cards */}
          {ITEM_CATEGORIES.map((cat) => {
            const agg = categoryAggregates[cat] || { skuCount: 0, available: 0, inwarded: 0, inFactory: 0, dispatched: 0, scrapped: 0, used: 0 };
            const isSelected = selectedCategoryFilter.toLowerCase() === cat.toLowerCase();
            const theme = getCategoryTheme(cat);

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategoryFilter(cat)}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative group ${
                  isSelected
                    ? 'bg-slate-950 text-white border-slate-900 ring-2 ring-indigo-500 shadow-md'
                    : `bg-white hover:bg-slate-50/80 ${theme.border} text-slate-800 hover:shadow-xs`
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 truncate">
                    <span className="text-sm">{theme.icon}</span>
                    <p className={`text-xs font-black uppercase tracking-wider truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>{cat}</p>
                  </div>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${isSelected ? 'bg-slate-800 text-indigo-300' : 'bg-slate-100 text-slate-700'}`}>
                    {agg.skuCount}
                  </span>
                </div>

                <div className="mt-2.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                    Received
                  </span>
                  <p className={`text-xl font-black ${isSelected ? 'text-emerald-400' : 'text-slate-950'}`}>
                    {formatNumber(agg.inwarded)}
                  </p>
                </div>

                <div className={`mt-2 pt-2 border-t text-[10px] flex items-center justify-between font-bold ${isSelected ? 'border-slate-800 text-slate-300' : 'border-slate-100 text-slate-600'}`}>
                  <span className="text-emerald-600 font-extrabold" title="Available in Warehouse Buffer">{formatNumber(agg.available)} Buf</span>
                  <span className="text-indigo-600 font-extrabold" title="In Factory Assembled on Units">{formatNumber(agg.inFactory)} Fac</span>
                  <span className="text-violet-600 font-extrabold" title="Shipped in Customer Orders">{formatNumber(agg.dispatched)} Ship</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* MASTER STOCK CATALOGUE TABLE CARD */}
      <Card className="p-0 overflow-hidden shadow-xs border-slate-200 bg-white">
        {/* Table Control Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
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
              Clear 5-state accounting: <strong className="text-slate-900">Received</strong> = <strong className="text-emerald-700">Buffer</strong> + <strong className="text-indigo-700">In Factory</strong> + <strong className="text-violet-700">Shipped</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {selectedCategoryFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('ALL')}
                className="rounded-xl bg-slate-200/80 hover:bg-slate-300 px-3 py-1.5 text-xs font-bold text-slate-800 transition flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <span>Filter: <strong>{selectedCategoryFilter}</strong></span>
                <X className="h-3.5 w-3.5 ml-1" />
              </button>
            )}
            <div className="w-64">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search SKU name, specs, color…"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setFormError(null);
                setShowAddModal(true);
              }}
              className="text-xs font-bold py-1.5 px-3 bg-slate-900 text-white hover:bg-slate-800 shadow-2xs shrink-0"
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openReceiveModal(i)}
                          className="text-xs font-bold text-emerald-800 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 min-h-[36px]"
                        >
                          <PackagePlus className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                          Receive Stock
                        </Button>
                        {sum && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setInspectedItemSummary(sum)}
                            className="text-xs font-bold text-indigo-700 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 min-h-[36px]"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Audit
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(i)}
                          className="rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-600 hover:bg-slate-100 border border-slate-200 cursor-pointer"
                          title="Edit item"
                          aria-label={`Edit ${i.name}`}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteModalItem({ id: i.id, name: i.name })}
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReceiveModal(i)}
                              className="text-[11px] py-1 px-2.5 font-bold text-emerald-800 border-emerald-300 bg-emerald-50/80 hover:bg-emerald-100 shadow-2xs"
                              title="Receive incoming stock for this item"
                            >
                              <PackagePlus className="h-3 w-3 mr-1 text-emerald-600" />
                              Receive Stock
                            </Button>
                            {sum && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setInspectedItemSummary(sum)}
                                className="text-[11px] py-1 px-2.5 font-bold text-indigo-700 border-indigo-300 bg-indigo-50/70 hover:bg-indigo-100 shadow-2xs"
                                title="Inspect 360° lifecycle audit"
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Audit
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditModal(i)}
                              className="text-[11px] py-1 px-2 font-bold text-slate-700 border-slate-300 hover:bg-slate-100 shadow-2xs"
                              title="Edit item specifications"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteModalItem({ id: i.id, name: i.name })}
                              className="text-[11px] py-1 px-2 font-bold text-rose-600 border-rose-300 hover:bg-rose-50 shadow-2xs"
                              title="Delete item"
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

      {/* MODAL 1: REGISTER NEW STOCK ITEM MODAL */}
      {showAddModal && (
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Register New Stock Item"
          maxWidthClass="max-w-xl"
        >
          <form
            onSubmit={handleAdd}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            className="space-y-4"
          >
            <p className="text-xs text-slate-500">
              Create a stock catalogue specification for Bottles, Caps, Atomizers, Packaging Boxes, Labels, or Fragrances.
            </p>

            <Field label="Item Category" htmlFor="category" required hint="Select the physical component type">
              <select
                id="category"
                className={`${inputClass} font-bold text-slate-900 bg-slate-50 focus:bg-white`}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              >
                <option value="Bottle">🍾 Bottle (Glass, PET, Vial, Decant)</option>
                <option value="Cap">🧴 Cap / Closure (Screw, Dropper, Magnetic, Crown)</option>
                <option value="Atomizer">💨 Atomizer / Pump (Mist Sprayer, Lotion Pump, Crimp)</option>
                <option value="Packaging">📦 Packaging / Box (Monocarton, Outer Box, Shipper)</option>
                <option value="Label">🏷️ Label / Sticker (Foil, Screenprint, Neck Tag)</option>
                <option value="Fragrance">🧪 Fragrance / Raw Material (Oil, Compound, Alcohol)</option>
                <option value="Other">⚙️ Other / Custom Component</option>
              </select>
            </Field>

            <Field
              label="Item Name / Specification"
              htmlFor="name"
              required
              hint={
                category === 'Cap'
                  ? 'e.g. 24/410 Shiny Gold Magnetic Cap'
                  : category === 'Atomizer'
                  ? 'e.g. 18/415 Black Fine Mist Spray Pump'
                  : category === 'Packaging'
                  ? 'e.g. 100ml Embossed Luxury Monocarton'
                  : category === 'Label'
                  ? 'e.g. Metallic Gold Foil Front Label'
                  : 'e.g. 100ml Boston Round Clear Glass Bottle'
              }
            >
              <input
                id="name"
                className={`${inputClass} font-bold text-slate-900`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  category === 'Cap'
                    ? '24/410 Shiny Gold Magnetic Cap'
                    : category === 'Atomizer'
                    ? '18/415 Black Fine Mist Spray Pump'
                    : '100ml Clear Boston Round Glass Bottle'
                }
                required
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Unit of Measure (UOM)" htmlFor="unit" required>
                <select
                  id="unit"
                  className={`${inputClass} font-semibold`}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  required
                >
                  {COMMON_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Custom UOM (if other)" htmlFor="custom-unit" hint="e.g. rolls, drums">
                <input
                  id="custom-unit"
                  className={inputClass}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="pcs"
                />
              </Field>
            </div>

            <Field label="Specification Notes / SKU (Optional)" htmlFor="description">
              <input
                id="description"
                className={inputClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Neck finish 24/410, Weight 180g, Master Carton 48pcs"
              />
            </Field>

            <Field label="Default Color / Finish (Optional)" htmlFor="color" hint="Select chip or type any finish">
              <ColorChipsInput
                value={color}
                onChange={setColor}
                colors={COMMON_COLORS}
                placeholder="e.g. Frosted Blue, Electroplated Gold, Matte Black…"
              />
            </Field>

            {formError && <ErrorBanner message={formError} />}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={submitting} className="font-bold bg-slate-900 text-white hover:bg-slate-800">
                <Save className="h-4 w-4 mr-1 text-emerald-400" />
                <span>Save Item Specification</span>
                <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-300 rounded">Ctrl+Enter</kbd>
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: RECEIVE STOCK INTAKE MODAL (WAREHOUSE INTAKE) */}
      {showReceiveModal && (
        <Modal
          isOpen={showReceiveModal}
          onClose={() => setShowReceiveModal(false)}
          title="Receive Stock Intake (Warehouse Receiving)"
          maxWidthClass="max-w-xl"
        >
          <form
            onSubmit={handleReceiveStockSubmit}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleReceiveStockSubmit();
              }
            }}
            className="space-y-4"
          >
            <p className="text-xs text-slate-600 leading-relaxed">
              Log incoming physical shipments from suppliers directly into warehouse master inventory. This increases available stock for production batches.
            </p>

            <Field label="Stock Item / SKU" htmlFor="receive-item" required hint="Select the catalogue item received">
              <select
                id="receive-item"
                className={`${inputClass} font-bold text-slate-900 bg-slate-50 focus:bg-white`}
                value={receiveItemId}
                onChange={(e) => setReceiveItemId(e.target.value)}
                required
              >
                <option value="">Select stock item…</option>
                {items?.map((itm) => (
                  <option key={itm.id} value={itm.id}>
                    [{itm.category || 'Bottle'}] {itm.name}{itm.color ? ` (${itm.color})` : ''} — Unit: {itm.unit || 'pcs'}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Supplier / Vendor" htmlFor="receive-supplier" hint="Optional supplier reference">
                <select
                  id="receive-supplier"
                  className={inputClass}
                  value={receiveSupplierId}
                  onChange={(e) => setReceiveSupplierId(e.target.value)}
                >
                  <option value="">Select supplier (optional)…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Quantity Received" htmlFor="receive-qty" required hint="Whole number of units received">
                <input
                  id="receive-qty"
                  type="number"
                  min={1}
                  className={`${inputClass} font-black text-slate-950 text-base`}
                  value={receiveQty}
                  onChange={(e) => setReceiveQty(e.target.value)}
                  placeholder="e.g. 5000"
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Received On Date" htmlFor="receive-date" required>
                <input
                  id="receive-date"
                  type="date"
                  className={inputClass}
                  value={receiveDate}
                  onChange={(e) => setReceiveDate(e.target.value)}
                  required
                />
              </Field>

              <Field label="Invoice / Delivery Challan No." htmlFor="receive-invoice" hint="e.g. INV-9842, DC-104">
                <input
                  id="receive-invoice"
                  className={inputClass}
                  value={receiveInvoiceNo}
                  onChange={(e) => setReceiveInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-2026-081"
                />
              </Field>
            </div>

            <Field label="Storage Location / Warehouse Bay" htmlFor="receive-location" hint="Where is this stock physically stored?">
              <input
                id="receive-location"
                className={inputClass}
                value={receiveLocation}
                onChange={(e) => setReceiveLocation(e.target.value)}
                placeholder="e.g. Warehouse Bay A-1, Rack 3"
              />
            </Field>

            <Field label="Shipment Notes / Remarks (Optional)" htmlFor="receive-remarks">
              <input
                id="receive-remarks"
                className={inputClass}
                value={receiveRemarks}
                onChange={(e) => setReceiveRemarks(e.target.value)}
                placeholder="e.g. Verified QC sample, batch carton seals intact"
              />
            </Field>

            {receiveError && <ErrorBanner message={receiveError} />}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setShowReceiveModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={receiveSubmitting} className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
                <PackagePlus className="h-4 w-4 mr-1 text-emerald-100" />
                <span>Confirm Stock Intake</span>
                <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-emerald-800 text-emerald-200 rounded">Ctrl+Enter</kbd>
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 2: 360° ITEM LIFECYCLE AUDIT DRILLDOWN MODAL */}
      {inspectedItemSummary && (
        <Modal
          isOpen={Boolean(inspectedItemSummary)}
          onClose={() => setInspectedItemSummary(null)}
          title={`360° Stock Audit — ${inspectedItemSummary.item.name}`}
          maxWidthClass="max-w-4xl"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-100 rounded-xl border border-slate-200 text-xs">
              <div className="flex items-center gap-2">
                <ItemCategoryBadge category={inspectedItemSummary.category} />
                <ColorBadge color={inspectedItemSummary.item.color} />
                <span className="font-bold text-slate-700">UOM: {inspectedItemSummary.item.unit || 'pcs'}</span>
              </div>
              <span className="font-black text-indigo-700">
                ID: {inspectedItemSummary.item.id}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-center">
              <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <p className="text-[10px] font-black uppercase text-slate-500">1. Total Received</p>
                <p className="text-xl font-black text-slate-950 mt-0.5">{formatNumber(inspectedItemSummary.totalInwarded)}</p>
                <p className="text-[10px] text-slate-400">{inspectedItemSummary.inwardBatchCount} intake batches</p>
              </div>

              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-300 shadow-2xs">
                <p className="text-[10px] font-black uppercase text-emerald-800">2. In Stock (Buffer)</p>
                <p className="text-xl font-black text-emerald-900 mt-0.5">{formatNumber(inspectedItemSummary.availableStock)}</p>
                <p className="text-[10px] text-emerald-700 font-semibold">Loose in warehouse buffer</p>
              </div>

              <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-300 shadow-2xs">
                <p className="text-[10px] font-black uppercase text-indigo-800">3. In Factory (Assembled)</p>
                <p className="text-xl font-black text-indigo-900 mt-0.5">{formatNumber(inspectedItemSummary.totalInFactoryAssembled)}</p>
                <p className="text-[10px] text-indigo-700 font-semibold">{inspectedItemSummary.usedInBatchCount} active floor batches</p>
              </div>

              <div className="p-2 rounded-xl bg-violet-50 border border-violet-300 shadow-2xs">
                <p className="text-[10px] font-black uppercase text-violet-800">4. Shipped in Orders</p>
                <p className="text-xl font-black text-violet-900 mt-0.5">{formatNumber(inspectedItemSummary.totalDispatchedInOrders)}</p>
                <p className="text-[10px] text-violet-700 font-semibold">{inspectedItemSummary.orderUsageList.length} customer dispatches</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 text-white border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2 shadow-sm">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-black text-white">Balanced Ledger Equation: </span>
                  <span className="text-slate-300 font-medium">
                    {formatNumber(inspectedItemSummary.totalInwarded)} Received = {formatNumber(inspectedItemSummary.availableStock)} Buffer + {formatNumber(inspectedItemSummary.totalInFactoryAssembled)} Factory + {formatNumber(inspectedItemSummary.totalDispatchedInOrders)} Shipped{inspectedItemSummary.totalScrapped > 0 ? ` + ${formatNumber(inspectedItemSummary.totalScrapped)} Scrapped` : ''}
                  </span>
                </div>
              </div>
              <span className="font-black text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider">
                100% Reconciled
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Zap className="h-4 w-4 text-indigo-600" /> Floor Batches ({inspectedItemSummary.batchUsageList.length})</span>
                  <span className="text-indigo-700 font-black">{formatNumber(inspectedItemSummary.totalUsedInBatches)} pcs total usage</span>
                </h4>
                {inspectedItemSummary.batchUsageList.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                    No production batches have consumed this item yet.
                  </p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                    {inspectedItemSummary.batchUsageList.map((bu, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs hover:bg-slate-100/80 transition-colors">
                        <div>
                          <p className="font-bold text-slate-900">Batch #{bu.batchNo}</p>
                          <p className="text-[11px] text-slate-500">{bu.itemName} • {bu.movedOn ? formatDate(bu.movedOn) : 'In progress'}</p>
                        </div>
                        <span className="font-black text-indigo-800 bg-indigo-100 border border-indigo-300 px-2 py-0.5 rounded">
                          {formatNumber(bu.qtyUsed)} pcs
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Truck className="h-4 w-4 text-violet-600" /> Customer Orders ({inspectedItemSummary.orderUsageList.length})</span>
                  <span className="text-violet-700 font-black">{formatNumber(inspectedItemSummary.totalDispatchedInOrders)} pcs shipped</span>
                </h4>
                {inspectedItemSummary.orderUsageList.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                    No customer orders have dispatched this item yet.
                  </p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                    {inspectedItemSummary.orderUsageList.map((ou) => (
                      <div key={ou.dispatchId} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs hover:bg-slate-100/80 transition-colors">
                        <div>
                          <p className="font-bold text-slate-900">{ou.customerName}</p>
                          <p className="text-[11px] text-slate-500">Invoice: {ou.invoiceNo} • {formatDate(ou.dispatchedOn)}</p>
                        </div>
                        <span className="font-black text-violet-800 bg-violet-100 border border-violet-300 px-2 py-0.5 rounded">
                          {formatNumber(ou.qtyUsed)} pcs
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setInspectedItemSummary(null)}>
                Close Audit Modal
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 3: EDIT STOCK ITEM SPECIFICATION MODAL */}
      {editingItem && (
        <Modal
          isOpen={Boolean(editingItem)}
          onClose={() => setEditingItem(null)}
          title={`Edit Stock Item — ${editingItem.name}`}
          maxWidthClass="max-w-lg"
        >
          <form
            onSubmit={handleSaveEdit}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSaveEdit();
              }
            }}
            className="space-y-4"
          >
            <Field label="Item Category" htmlFor="edit-category" required>
              <select
                id="edit-category"
                className={`${inputClass} font-bold text-slate-900`}
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                required
              >
                <option value="Bottle">🍾 Bottle (Glass, PET, Vial, Decant)</option>
                <option value="Cap">🧴 Cap / Closure (Screw, Dropper, Magnetic, Crown)</option>
                <option value="Atomizer">💨 Atomizer / Pump (Mist Sprayer, Lotion Pump, Crimp)</option>
                <option value="Packaging">📦 Packaging / Box (Monocarton, Outer Box, Shipper)</option>
                <option value="Label">🏷️ Label / Sticker (Foil, Screenprint, Neck Tag)</option>
                <option value="Fragrance">🧪 Fragrance / Raw Material (Oil, Compound, Alcohol)</option>
                <option value="Other">⚙️ Other / Custom Component</option>
              </select>
            </Field>

            <Field label="Item Name / Specification" htmlFor="edit-name" required>
              <input
                id="edit-name"
                className={`${inputClass} font-bold text-slate-900`}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Unit of Measure (UOM)" htmlFor="edit-unit" required>
                <select
                  id="edit-unit"
                  className={`${inputClass} font-semibold`}
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  required
                >
                  {COMMON_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Custom UOM (if other)" htmlFor="edit-custom-unit">
                <input
                  id="edit-custom-unit"
                  className={inputClass}
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  placeholder="pcs"
                />
              </Field>
            </div>

            <Field label="Specification Notes / SKU (Optional)" htmlFor="edit-description">
              <input
                id="edit-description"
                className={inputClass}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="e.g. Neck finish 24/410, Weight 180g"
              />
            </Field>

            <Field label="Default Color / Finish (Optional)" htmlFor="edit-color" hint="Quick-select or type any color">
              <ColorChipsInput
                value={editColor}
                onChange={setEditColor}
                colors={COMMON_COLORS}
                placeholder="e.g. Frosted Blue, Matte Black, Custom…"
              />
            </Field>

            {editError && <ErrorBanner message={editError} />}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setEditingItem(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={editSubmitting} className="font-bold bg-slate-900 text-white hover:bg-slate-800">
                <Save className="h-4 w-4 mr-1 text-emerald-400" />
                <span>Save Changes</span>
                <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-300 rounded">Ctrl+Enter</kbd>
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={Boolean(deleteModalItem)}
        onClose={() => setDeleteModalItem(null)}
        onConfirm={executeDelete}
        title="Delete Stock Item"
        message={`Are you sure you want to delete item "${deleteModalItem?.name}"?`}
        details="Note: Deletion will be safely blocked if this SKU has existing batch history, movements, or intake receipts in the ledger."
        confirmText="Yes, Delete Item"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
