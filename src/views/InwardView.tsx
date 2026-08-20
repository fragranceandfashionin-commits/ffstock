import { useEffect, useState } from 'react';
import { PackagePlus, Save, Trash2, PlusCircle, AlertTriangle, Download } from 'lucide-react';
import {
  Card,
  PageHeader,
  ErrorBanner,
  EmptyState,
  Field,
  inputClass,
  Button,
  SearchInput,
  Dropzone,
  Modal,
  ConfirmModal,
  ItemCategoryBadge,
  ColorBadge,
  ColorChipsInput,
  TableSkeleton,
  TableScrollContainer,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import { fetchBatches, fetchItems, fetchSuppliers, fetchUsedBatchIds, insertItem, fetchCaps, fetchAtomizers, fetchBoxes, insertInwardBatch, fetchComponentStockSummary } from '@/lib/queries';
import { supabase, COMMON_COLORS } from '@/lib/supabase';
import type { BatchWithRelations, Item, Supplier, ComponentStockSummary } from '@/lib/supabase';
import { formatNumber, formatDate, getErrorMessage, getTodayDateString, downloadCSV } from '@/lib/utils';

const NEW_OPTION = '__new__';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export function InwardView() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [batches, setBatches] = useState<BatchWithRelations[] | null>(null);
  const [stockSummaryMap, setStockSummaryMap] = useState<Map<string, ComponentStockSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [batchNo, setBatchNo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [itemId, setItemId] = useState('');
  const [receivedOn, setReceivedOn] = useState(getTodayDateString());
  const [qty, setQty] = useState('');
  const [location, setLocation] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [batchColor, setBatchColor] = useState('');
  const [capItemId, setCapItemId] = useState('');
  const [atomizerItemId, setAtomizerItemId] = useState('');
  const [boxItemId, setBoxItemId] = useState('');
  const [capQty, setCapQty] = useState('');
  const [atomizerQty, setAtomizerQty] = useState('');
  const [boxQty, setBoxQty] = useState('');
  const [caps, setCaps] = useState<Item[]>([]);
  const [atomizers, setAtomizers] = useState<Item[]>([]);
  const [boxes, setBoxes] = useState<Item[]>([]);
  const [itemCategoryFilter, setItemCategoryFilter] = useState<string>('ALL');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [usedBatchIds, setUsedBatchIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Delete modal state
  const [deleteModalBatch, setDeleteModalBatch] = useState<BatchWithRelations | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Quick-add Supplier modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierContact, setNewSupplierContact] = useState('');

  // Quick-add Item modal (with category support)
  const [showItemModal, setShowItemModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<string>('Bottle');
  const [newItemUnit, setNewItemUnit] = useState('pcs');
  const [newItemDescription, setNewItemDescription] = useState('');

  const toast = useToast();

  const load = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [s, i, b, used, c, a, bx, summary] = await Promise.all([
        fetchSuppliers(),
        fetchItems(),
        fetchBatches(),
        fetchUsedBatchIds(),
        fetchCaps(),
        fetchAtomizers(),
        fetchBoxes(),
        fetchComponentStockSummary().catch(() => [] as ComponentStockSummary[]),
      ]);
      setSuppliers(s);
      setItems(i);
      setBatches(b);
      setUsedBatchIds(used);
      setCaps(c);
      setAtomizers(a);
      setBoxes(bx);
      const sMap = new Map<string, ComponentStockSummary>();
      for (const sm of summary) sMap.set(sm.item.id, sm);
      setStockSummaryMap(sMap);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load data'));
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

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
      .channel('inward-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inward_batches' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_movements' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_stock_receipts' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, debouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, debouncedReload)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const clearPhoto = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview('');
    setImageUrl('');
  };

  const handleFileSelect = (file: File | null) => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : '');
  };

  const executeDelete = async () => {
    if (!deleteModalBatch) return;
    setDeleting(true);
    try {
      const { error: deleteErr } = await supabase.from('inward_batches').delete().eq('id', deleteModalBatch.id);
      if (deleteErr) throw deleteErr;

      // Clean up storage photo if one was uploaded
      if (deleteModalBatch.image_url && deleteModalBatch.image_url.includes('/batch-images/')) {
        const imagePath = deleteModalBatch.image_url.split('/batch-images/')[1];
        if (imagePath) {
          await supabase.storage.from('batch-images').remove([decodeURIComponent(imagePath)]).catch(() => {});
        }
      }

      toast.success(`Batch "${deleteModalBatch.batch_no}" deleted successfully.`, 'Batch Removed');
      setDeleteModalBatch(null);
      await load(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to delete batch');
      toast.error(msg, 'Delete Blocked');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddSupplierQuick = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newSupplierName.trim()) return;
    try {
      const { data, error: suppErr } = await supabase
        .from('suppliers')
        .insert({
          name: newSupplierName.trim(),
          contact: newSupplierContact.trim() || null,
        })
        .select('id')
        .single();
      if (suppErr) throw suppErr;
      toast.success(`Supplier "${newSupplierName.trim()}" added.`, 'Supplier Added');
      await load(true);
      setSupplierId(data.id);
      setNewSupplierName('');
      setNewSupplierContact('');
      setShowSupplierModal(false);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to add supplier');
      toast.error(msg, 'Error');
    }
  };

  const handleAddItemQuick = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItemName.trim()) return;
    try {
      const data = await insertItem({
        name: newItemName.trim(),
        category: newItemCategory.trim() || 'Bottle',
        unit: newItemUnit.trim() || 'pcs',
        description: newItemDescription.trim() || null,
      });
      toast.success(`Item "${newItemName.trim()}" created.`, 'Item Added');
      await load(true);
      setItemId(data.id);
      setNewItemName('');
      setNewItemDescription('');
      setShowItemModal(false);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to add item');
      toast.error(msg, 'Error');
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);

    if (!batchNo.trim() || !supplierId || !itemId || !qty || !location.trim()) {
      setFormError('Please fill all required fields (Batch Code, Supplier, Item, Quantity, Location).');
      return;
    }
    const qtyNum = Number(qty);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      setFormError('Quantity must be a positive whole number.');
      return;
    }

    // Stock Sufficiency Guard: Check warehouse balance in Items Section
    const selectedItemSum = stockSummaryMap.get(itemId);
    const selectedItemObj = items?.find((i) => i.id === itemId);

    if (selectedItemSum) {
      const unallocatedAvail = selectedItemSum.unallocatedWarehouseStock;
      if (qtyNum > unallocatedAvail) {
        setFormError(
          `Stock Shortage: "${selectedItemObj?.name || 'Selected Item'}" only has ${formatNumber(unallocatedAvail)} units available in warehouse. Receive more stock before allocating ${formatNumber(qtyNum)} units to this batch.`
        );
        return;
      }
    }

    // Validate attached Cap
    if (capItemId && capQty) {
      const capSum = stockSummaryMap.get(capItemId);
      const capAvail = capSum?.unallocatedWarehouseStock ?? capSum?.availableStock ?? 0;
      const reqCap = Number(capQty);
      if (reqCap > capAvail) {
        setFormError(
          `Cap Stock Shortage: "${capSum?.item.name || 'Cap'}" has only ${formatNumber(capAvail)} units in warehouse. Cannot allocate ${formatNumber(reqCap)} caps.`
        );
        return;
      }
    }

    // Validate attached Atomizer
    if (atomizerItemId && atomizerQty) {
      const atomSum = stockSummaryMap.get(atomizerItemId);
      const atomAvail = atomSum?.unallocatedWarehouseStock ?? atomSum?.availableStock ?? 0;
      const reqAtom = Number(atomizerQty);
      if (reqAtom > atomAvail) {
        setFormError(
          `Atomizer Stock Shortage: "${atomSum?.item.name || 'Atomizer'}" has only ${formatNumber(atomAvail)} units in warehouse. Cannot allocate ${formatNumber(reqAtom)} atomizers.`
        );
        return;
      }
    }

    // Validate attached Box
    if (boxItemId && boxQty) {
      const boxSum = stockSummaryMap.get(boxItemId);
      const boxAvail = boxSum?.unallocatedWarehouseStock ?? boxSum?.availableStock ?? 0;
      const reqBox = Number(boxQty);
      if (reqBox > boxAvail) {
        setFormError(
          `Box Stock Shortage: "${boxSum?.item.name || 'Box'}" has only ${formatNumber(boxAvail)} units in warehouse. Cannot allocate ${formatNumber(reqBox)} boxes.`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      // Validate photo before touch storage
      if (imageFile) {
        if (!imageFile.type.startsWith('image/')) {
          setFormError('Please choose an image file (jpg, png, etc.).');
          return;
        }
        if (imageFile.size > MAX_IMAGE_BYTES) {
          setFormError('Photo is too big. Choose an image under 10 MB.');
          return;
        }
      }

      // Upload photo if any
      let finalImageUrl = imageUrl;
      let uploadedPath: string | null = null;
      if (imageFile) {
        const ext = (imageFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `batches/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('batch-images')
          .upload(path, imageFile, { contentType: imageFile.type || 'image/jpeg' });
        if (uploadError) throw uploadError;
        uploadedPath = path;
        const { data: publicUrlData } = supabase.storage.from('batch-images').getPublicUrl(path);
        finalImageUrl = publicUrlData.publicUrl;
      }

      try {
        await insertInwardBatch({
          batch_no: batchNo.trim(),
          supplier_id: supplierId,
          item_id: itemId,
          received_on: receivedOn,
          qty_received: qtyNum,
          location: location.trim(),
          image_url: finalImageUrl || null,
          color: batchColor.trim() || null,
          cap_item_id: capItemId || null,
          atomizer_item_id: atomizerItemId || null,
          box_item_id: boxItemId || null,
          cap_qty: capItemId && capQty ? Number(capQty) : null,
          atomizer_qty: atomizerItemId && atomizerQty ? Number(atomizerQty) : null,
          box_qty: boxItemId && boxQty ? Number(boxQty) : null,
        });
      } catch (insertError) {
        if (uploadedPath) {
          await supabase.storage.from('batch-images').remove([uploadedPath]).catch(() => {});
        }
        throw insertError;
      }

      const selectedItem = items?.find((i) => i.id === itemId);
      toast.success(
        `Inward Batch "${batchNo.trim()}" logged with ${formatNumber(qtyNum)} ${selectedItem?.unit || 'units'} (${selectedItem?.name || 'Stock Item'}).`,
        'Inward Batch Created'
      );
      setBatchNo('');
      setQty('');
      setLocation('');
      setBatchColor('');
      setCapItemId('');
      setAtomizerItemId('');
      setBoxItemId('');
      setCapQty('');
      setAtomizerQty('');
      setBoxQty('');
      clearPhoto();
      await load(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create batch');
      setFormError(msg);
      toast.error(msg, 'Inward Error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedItemObj = items?.find((i) => i.id === itemId);

  // Filter items in dropdown by category tab if selected
  const availableItemsForInward = (items ?? []).filter((i) => {
    if (itemCategoryFilter === 'ALL') return true;
    return (i.category || 'Bottle').toLowerCase() === itemCategoryFilter.toLowerCase();
  });

  const filteredBatches = (batches ?? []).filter((b) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      b.batch_no.toLowerCase().includes(q) ||
      (b.supplier?.name ?? '').toLowerCase().includes(q) ||
      (b.item?.name ?? '').toLowerCase().includes(q) ||
      (b.item?.category ?? '').toLowerCase().includes(q) ||
      (b.box_item?.name ?? '').toLowerCase().includes(q) ||
      b.location.toLowerCase().includes(q)
    );
  });

  // CSV Export Handler
  const exportInwardBatchesCSV = () => {
    if (!batches || batches.length === 0) return;
    try {
      const headers = [
        'Batch No',
        'Item SKU',
        'Category',
        'Supplier',
        'Received Date',
        'Quantity Inwarded',
        'Storage Bay Location',
        'Color',
        'Cap Item',
        'Atomizer Item',
        'Box Item',
        'Image URL',
      ];
      const rows = batches.map((b) => [
        b.batch_no,
        b.item?.name ?? '',
        b.item?.category ?? 'Bottle',
        b.supplier?.name ?? '',
        b.received_on,
        b.qty_received,
        b.location,
        b.color || '',
        b.cap_item?.name || '',
        b.atomizer_item?.name || '',
        b.box_item?.name || '',
        b.image_url || '',
      ]);

      const filename = `ffstock_inward_batches_${getTodayDateString()}`;
      downloadCSV(filename, headers, rows);
      toast.success('Inward batches registry CSV exported successfully', 'Export Complete');
    } catch (err) {
      toast.error(getErrorMessage(err), 'Export Failed');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inward Stock Receiving"
        subtitle="Log incoming stock for any component (Bottles, Caps, Atomizers, Packaging / Boxes, Labels, Raw Materials) with batch code, supplier, quantity, location, and shipment photo."
        action={
          <Button
            variant="outline"
            onClick={exportInwardBatchesCSV}
            className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50 cursor-pointer"
            title="Download inward batches registry CSV"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export Batches CSV
          </Button>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Form Card (5 cols) */}
        <Card className="lg:col-span-5 h-fit shadow-sm border-slate-200/90 lg:sticky lg:top-20">
          <form
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="flex flex-col gap-4"
          >
            <div className="border-b border-slate-100 pb-2">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-slate-900">Step 1: Receive Stock Batch</h2>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shadow-2xs">
                  BOM Ready
                </span>
              </div>
              {/* Category Quick Selector */}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {['ALL', 'Bottle', 'Cap', 'Atomizer', 'Packaging', 'Raw Material'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setItemCategoryFilter(cat)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition cursor-pointer ${
                      itemCategoryFilter.toLowerCase() === cat.toLowerCase()
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat === 'Packaging' ? '📦 Packaging/Box' : cat === 'Cap' ? '🧴 Cap' : cat === 'Atomizer' ? '💨 Atomizer' : cat === 'Bottle' ? '🍾 Bottle' : cat}
                  </button>
                ))}
              </div>
            </div>

            <Field
              label="Brand Name / Party Name (Batch Code)"
              htmlFor="batch_no"
              required
              hint="e.g. Royal Club, Dhirendra Beverage, BATCH-01, CAP-5001"
            >
              <input
                id="batch_no"
                className={inputClass}
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="e.g. Royal Club, BATCH-01, CAP-5001"
                required
              />
            </Field>

            <Field label="Supplier" htmlFor="supplier" required>
              <div className="flex gap-2">
                <select
                  id="supplier"
                  className={inputClass}
                  value={supplierId}
                  onChange={(e) => {
                    if (e.target.value === NEW_OPTION) {
                      setShowSupplierModal(true);
                    } else {
                      setSupplierId(e.target.value);
                    }
                  }}
                  required
                >
                  <option value="">Select supplier…</option>
                  <option value={NEW_OPTION}>➕ Add new supplier…</option>
                  {suppliers?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSupplierModal(true)}
                  title="Add new supplier"
                  className="shrink-0 min-w-[40px] min-h-[40px]"
                >
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </div>
            </Field>

            <Field label="Stock Item / Component" htmlFor="item" required hint="Choose bottle, cap, atomizer, box, or material">
              <div className="flex gap-2">
                <select
                  id="item"
                  className={`${inputClass} font-semibold`}
                  value={itemId}
                  onChange={(e) => {
                    if (e.target.value === NEW_OPTION) {
                      setNewItemCategory(itemCategoryFilter !== 'ALL' ? itemCategoryFilter : 'Bottle');
                      setShowItemModal(true);
                    } else {
                      setItemId(e.target.value);
                    }
                  }}
                  required
                >
                  <option value="">Select stock item…</option>
                  <option value={NEW_OPTION}>➕ Add new stock item…</option>
                  {availableItemsForInward.map((i) => {
                    const sum = stockSummaryMap.get(i.id);
                    const unallocated = sum?.unallocatedWarehouseStock ?? 0;
                    const isOutOfStock = unallocated <= 0;
                    return (
                      <option key={i.id} value={i.id}>
                        [{i.category || 'Bottle'}] {i.name} — {isOutOfStock ? '0 in warehouse [OUT OF STOCK]' : `${formatNumber(unallocated)} ${i.unit || 'units'} available`}
                      </option>
                    );
                  })}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewItemCategory(itemCategoryFilter !== 'ALL' ? itemCategoryFilter : 'Bottle');
                    setShowItemModal(true);
                  }}
                  title="Add new stock item"
                  className="shrink-0 min-w-[40px] min-h-[40px]"
                >
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </div>
              {selectedItemObj && (() => {
                const sum = stockSummaryMap.get(selectedItemObj.id);
                const unallocated = sum?.unallocatedWarehouseStock ?? 0;
                const batchQtyNum = Number(qty) || 0;
                return (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <ItemCategoryBadge category={selectedItemObj.category} />
                      <span className={`inline-flex items-center gap-1 text-xs font-black px-2.5 py-0.5 rounded-md border ${
                        unallocated > 0
                          ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                          : 'bg-rose-50 text-rose-950 border-rose-300'
                      }`}>
                        <span>Warehouse Stock:</span>
                        <strong>{formatNumber(unallocated)} {selectedItemObj.unit || 'units'} available</strong>
                      </span>
                    </div>
                    {unallocated <= 0 && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-xs font-bold text-rose-900 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                        <span>0 units left in warehouse. Please receive stock in Items section before creating this batch.</span>
                      </div>
                    )}
                    {unallocated > 0 && batchQtyNum > unallocated && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-900 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span>Stock shortage: Batch requires {formatNumber(batchQtyNum)}, but only {formatNumber(unallocated)} available in warehouse.</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Received Date" htmlFor="received" required>
                <input
                  id="received"
                  type="date"
                  className={inputClass}
                  value={receivedOn}
                  onChange={(e) => setReceivedOn(e.target.value)}
                  required
                />
              </Field>

              <Field
                label={`Quantity Received (${selectedItemObj?.unit || 'Units'})`}
                htmlFor="qty"
                required
              >
                <input
                  id="qty"
                  type="number"
                  min={1}
                  className={inputClass}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="e.g. 1000"
                  required
                />
              </Field>
            </div>

            <Field label="Warehouse / Storage Location" htmlFor="location" required hint="e.g. Rack A-12, Bin 4, Shelf C">
              <input
                id="location"
                className={inputClass}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Rack A-12"
                required
              />
            </Field>

            <Field label="Shipment / Goods Photo" hint="Attach photo of incoming shipment for audit & verification.">
              <Dropzone
                previewUrl={imageFile ? imagePreview : imageUrl}
                onFileSelect={handleFileSelect}
                onClear={clearPhoto}
              />
            </Field>

            <Field label="Batch Color / Finish (Optional)" htmlFor="batch-color" hint="What color is this specific batch?">
              <ColorChipsInput
                value={batchColor}
                onChange={setBatchColor}
                colors={COMMON_COLORS}
                placeholder="e.g. Frosted Blue, Matte Black, Custom…"
              />
            </Field>

            {/* Components & Packaging — Received Quantities */}
            <div className="rounded-xl border border-violet-200 bg-violet-50/30 p-3.5 space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-violet-900">
                📦 Components & Packaging — Received Quantities
              </p>
              <p className="text-[11px] text-violet-700 font-medium">
                Select component and enter quantity received with this batch. Defaults to bottle qty if left blank.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-2">
                  <Field label="Cap / Closure" htmlFor="cap-item">
                    <select
                      id="cap-item"
                      className={inputClass}
                      value={capItemId}
                      onChange={(e) => {
                        setCapItemId(e.target.value);
                        if (!e.target.value) setCapQty('');
                        else if (!capQty && qty) setCapQty(qty);
                      }}
                    >
                      <option value="">No cap</option>
                      {caps.map((c) => {
                        const sum = stockSummaryMap.get(c.id);
                        const avail = sum?.unallocatedWarehouseStock ?? sum?.availableStock ?? 0;
                        const isOutOfStock = avail <= 0;
                        return (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.color ? ` (${c.color})` : ''} — {isOutOfStock ? '0 in stock [OUT OF STOCK]' : `${formatNumber(avail)} in stock`}
                          </option>
                        );
                      })}
                    </select>
                  </Field>
                  {capItemId && (() => {
                    const sum = stockSummaryMap.get(capItemId);
                    const avail = sum?.unallocatedWarehouseStock ?? sum?.availableStock ?? 0;
                    const req = Number(capQty) || 0;
                    return (
                      <div className="space-y-1">
                        <Field label="Cap Qty Received" htmlFor="cap-qty" hint={qty ? `Bottle qty: ${qty}` : undefined}>
                          <input
                            id="cap-qty"
                            type="number"
                            min={1}
                            className={inputClass}
                            value={capQty}
                            onChange={(e) => setCapQty(e.target.value)}
                            placeholder={qty || 'e.g. 1200'}
                          />
                        </Field>
                        {avail <= 0 ? (
                          <p className="text-[10px] font-bold text-rose-600">⚠️ Out of stock (0 available)</p>
                        ) : req > avail ? (
                          <p className="text-[10px] font-bold text-amber-700">⚠️ Requires {formatNumber(req)}, only {formatNumber(avail)} available</p>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex flex-col gap-2">
                  <Field label="Atomizer / Pump" htmlFor="atomizer-item">
                    <select
                      id="atomizer-item"
                      className={inputClass}
                      value={atomizerItemId}
                      onChange={(e) => {
                        setAtomizerItemId(e.target.value);
                        if (!e.target.value) setAtomizerQty('');
                        else if (!atomizerQty && qty) setAtomizerQty(qty);
                      }}
                    >
                      <option value="">No atomizer</option>
                      {atomizers.map((a) => {
                        const sum = stockSummaryMap.get(a.id);
                        const avail = sum?.unallocatedWarehouseStock ?? sum?.availableStock ?? 0;
                        const isOutOfStock = avail <= 0;
                        return (
                          <option key={a.id} value={a.id}>
                            {a.name}{a.color ? ` (${a.color})` : ''} — {isOutOfStock ? '0 in stock [OUT OF STOCK]' : `${formatNumber(avail)} in stock`}
                          </option>
                        );
                      })}
                    </select>
                  </Field>
                  {atomizerItemId && (() => {
                    const sum = stockSummaryMap.get(atomizerItemId);
                    const avail = sum?.unallocatedWarehouseStock ?? sum?.availableStock ?? 0;
                    const req = Number(atomizerQty) || 0;
                    return (
                      <div className="space-y-1">
                        <Field label="Atomizer Qty Received" htmlFor="atomizer-qty" hint={qty ? `Bottle qty: ${qty}` : undefined}>
                          <input
                            id="atomizer-qty"
                            type="number"
                            min={1}
                            className={inputClass}
                            value={atomizerQty}
                            onChange={(e) => setAtomizerQty(e.target.value)}
                            placeholder={qty || 'e.g. 1000'}
                          />
                        </Field>
                        {avail <= 0 ? (
                          <p className="text-[10px] font-bold text-rose-600">⚠️ Out of stock (0 available)</p>
                        ) : req > avail ? (
                          <p className="text-[10px] font-bold text-amber-700">⚠️ Requires {formatNumber(req)}, only {formatNumber(avail)} available</p>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex flex-col gap-2">
                  <Field label="Box / Packaging" htmlFor="box-item">
                    <select
                      id="box-item"
                      className={inputClass}
                      value={boxItemId}
                      onChange={(e) => {
                        setBoxItemId(e.target.value);
                        if (!e.target.value) setBoxQty('');
                        else if (!boxQty && qty) setBoxQty(qty);
                      }}
                    >
                      <option value="">No box</option>
                      {boxes.map((bx) => {
                        const sum = stockSummaryMap.get(bx.id);
                        const avail = sum?.unallocatedWarehouseStock ?? sum?.availableStock ?? 0;
                        const isOutOfStock = avail <= 0;
                        return (
                          <option key={bx.id} value={bx.id}>
                            {bx.name} — {isOutOfStock ? '0 in stock [OUT OF STOCK]' : `${formatNumber(avail)} in stock`}
                          </option>
                        );
                      })}
                    </select>
                  </Field>
                  {boxItemId && (() => {
                    const sum = stockSummaryMap.get(boxItemId);
                    const avail = sum?.unallocatedWarehouseStock ?? sum?.availableStock ?? 0;
                    const req = Number(boxQty) || 0;
                    return (
                      <div className="space-y-1">
                        <Field label="Box Qty Received" htmlFor="box-qty" hint={qty ? `Bottle qty: ${qty}` : undefined}>
                          <input
                            id="box-qty"
                            type="number"
                            min={1}
                            className={inputClass}
                            value={boxQty}
                            onChange={(e) => setBoxQty(e.target.value)}
                            placeholder={qty || 'e.g. 1000'}
                          />
                        </Field>
                        {avail <= 0 ? (
                          <p className="text-[10px] font-bold text-rose-600">⚠️ Out of stock (0 available)</p>
                        ) : req > avail ? (
                          <p className="text-[10px] font-bold text-amber-700">⚠️ Requires {formatNumber(req)}, only {formatNumber(avail)} available</p>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {formError && <ErrorBanner message={formError} />}

            <div className="flex gap-2 pt-2">
              <Button type="submit" variant="primary" loading={submitting} className="w-full">
                <Save className="h-4 w-4" />
                <span>Save Inward Batch</span>
                <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-300 rounded">Ctrl+Enter</kbd>
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setBatchNo('');
                  setQty('');
                  setLocation('');
                  setBatchColor('');
                  setCapItemId('');
                  setAtomizerItemId('');
                  setBoxItemId('');
                  setCapQty('');
                  setAtomizerQty('');
                  setBoxQty('');
                  clearPhoto();
                  setFormError(null);
                }}
              >
                Clear
              </Button>
            </div>
          </form>
        </Card>

        {/* History Table Card (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
            <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
              <PackagePlus className="h-5 w-5 text-slate-500" />
              <span>Recorded Inward Batches ({filteredBatches.length})</span>
            </h2>
            <div className="w-full sm:w-64">
              <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search batches, items, locations…" />
            </div>
          </div>

          {loading ? (
            <Card className="p-0">
              <TableSkeleton rows={6} cols={5} />
            </Card>
          ) : filteredBatches.length === 0 ? (
            <EmptyState
              icon={PackagePlus}
              title="No inward batches found"
              description={searchQuery ? 'No batches match your search criteria.' : 'Create your first inward batch using the form.'}
            />
          ) : (
            <>
              {/* Mobile View: Cards (< sm) */}
              <div className="grid grid-cols-1 gap-3 sm:hidden">
                {filteredBatches.map((b) => (
                  <Card key={`mobile-inward-batch-${b.id}`} className="p-3.5 border-slate-200 shadow-2xs space-y-3">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-2.5">
                        {b.image_url ? (
                          <a href={b.image_url} target="_blank" rel="noreferrer" title="View photo" className="shrink-0">
                            <img
                              src={b.image_url}
                              alt={b.batch_no}
                              className="h-12 w-12 rounded-xl border border-slate-200 object-cover shadow-2xs"
                            />
                          </a>
                        ) : (
                          <div className="h-12 w-12 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-300 text-xs font-bold shrink-0">
                            —
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-slate-900 text-sm font-mono">{b.batch_no}</span>
                            <ItemCategoryBadge category={b.item?.category} />
                            <ColorBadge color={b.color} />
                          </div>
                          <p className="font-bold text-slate-800 text-xs mt-0.5">{b.item?.name ?? '—'}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-black text-slate-900 text-base leading-tight text-emerald-700">
                          {formatNumber(b.qty_received)}
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold">{b.item?.unit || 'pcs'}</p>
                      </div>
                    </div>

                    {/* Components Breakdown */}
                    {(b.cap_item || b.atomizer_item || b.box_item) && (
                      <div className="flex flex-wrap gap-1 p-2 bg-slate-50 rounded-xl border border-slate-100">
                        {b.cap_item && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200">
                            🧴 {b.cap_item.name}
                            {b.cap_qty != null && <span className="text-violet-500 font-semibold">×{formatNumber(b.cap_qty)}</span>}
                          </span>
                        )}
                        {b.atomizer_item && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                            💨 {b.atomizer_item.name}
                            {b.atomizer_qty != null && <span className="text-sky-500 font-semibold">×{formatNumber(b.atomizer_qty)}</span>}
                          </span>
                        )}
                        {b.box_item && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            📦 {b.box_item.name}
                            {b.box_qty != null && <span className="text-amber-500 font-semibold">×{formatNumber(b.box_qty)}</span>}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Metadata Strip & Actions */}
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-[11px] truncate">
                        <span>🏢 {b.supplier?.name ?? '—'}</span>
                        <span>•</span>
                        <span className="font-semibold text-slate-700">📍 {b.location}</span>
                        <span>•</span>
                        <span>{formatDate(b.received_on)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeleteModalBatch(b)}
                        disabled={usedBatchIds.has(b.id)}
                        title={
                          usedBatchIds.has(b.id)
                            ? 'Batch has movements or dispatches — ledger history cannot be deleted'
                            : 'Delete batch entry'
                        }
                        className="rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                        aria-label="Delete batch"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Desktop View: Table (>= sm) */}
              <div className="hidden sm:block">
                <TableScrollContainer className="bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-3">Photo</th>
                        <th className="px-3.5 py-3">Batch / Brand</th>
                        <th className="px-3.5 py-3">Stock Item</th>
                        <th className="px-3.5 py-3">Color</th>
                        <th className="px-3.5 py-3">Components</th>
                        <th className="px-3.5 py-3">Supplier</th>
                        <th className="px-3.5 py-3">Location</th>
                        <th className="px-3.5 py-3">Date</th>
                        <th className="px-3.5 py-3 text-right">Qty</th>
                        <th className="px-3.5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredBatches.map((b) => (
                        <tr key={b.id} className="transition hover:bg-slate-50/80">
                          <td className="px-3.5 py-3">
                            {b.image_url ? (
                              <a href={b.image_url} target="_blank" rel="noreferrer" title="View photo">
                                <img
                                  src={b.image_url}
                                  alt={b.batch_no}
                                  className="h-10 w-10 rounded-xl border border-slate-200 object-cover shadow-xs"
                                />
                              </a>
                            ) : (
                              <div className="h-10 w-10 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-300 text-xs font-bold">
                                —
                              </div>
                            )}
                          </td>
                          <td className="px-3.5 py-3 font-bold text-slate-900">{b.batch_no}</td>
                          <td className="px-3.5 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="text-slate-800 font-bold">{b.item?.name ?? '—'}</span>
                              <ItemCategoryBadge category={b.item?.category} />
                            </div>
                          </td>
                          <td className="px-3.5 py-3">
                            <ColorBadge color={b.color} />
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="flex flex-col gap-1">
                              {b.cap_item && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200">
                                  🧴 {b.cap_item.name}
                                  {b.cap_qty != null && <span className="text-violet-500 font-semibold">×{formatNumber(b.cap_qty)}</span>}
                                </span>
                              )}
                              {b.atomizer_item && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                                  💨 {b.atomizer_item.name}
                                  {b.atomizer_qty != null && <span className="text-sky-500 font-semibold">×{formatNumber(b.atomizer_qty)}</span>}
                                </span>
                              )}
                              {b.box_item && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  📦 {b.box_item.name}
                                  {b.box_qty != null && <span className="text-amber-500 font-semibold">×{formatNumber(b.box_qty)}</span>}
                                </span>
                              )}
                              {!b.cap_item && !b.atomizer_item && !b.box_item && (
                                <span className="text-[10px] text-slate-400">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3.5 py-3 text-slate-600">{b.supplier?.name ?? '—'}</td>
                          <td className="px-3.5 py-3 text-slate-600 font-semibold">{b.location}</td>
                          <td className="px-3.5 py-3 text-slate-500 text-xs">{formatDate(b.received_on)}</td>
                          <td className="px-3.5 py-3 text-right font-extrabold text-slate-900">
                            {formatNumber(b.qty_received)} <span className="text-[10px] text-slate-500 font-normal">{b.item?.unit || 'pcs'}</span>
                          </td>
                          <td className="px-3.5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setDeleteModalBatch(b)}
                              disabled={usedBatchIds.has(b.id)}
                              title={
                                usedBatchIds.has(b.id)
                                  ? 'Batch has movements or dispatches — ledger history cannot be deleted'
                                  : 'Delete batch entry'
                              }
                              className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScrollContainer>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick-Add Supplier Modal */}
      <Modal
        isOpen={showSupplierModal}
        onClose={() => {
          setShowSupplierModal(false);
          if (supplierId === NEW_OPTION) setSupplierId('');
        }}
        title="Quick Add New Supplier"
      >
        <form
          onSubmit={handleAddSupplierQuick}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              handleAddSupplierQuick();
            }
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Supplier Name" required hint="e.g. Apex Glassworks, Global Closures Ltd">
            <input
              className={inputClass}
              placeholder="e.g. Apex Glassworks Ltd"
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              required
            />
          </Field>
          <Field label="Contact Info (Optional)" hint="Phone or email">
            <input
              className={inputClass}
              placeholder="+91 98765 43210 / info@supplier.com"
              value={newSupplierContact}
              onChange={(e) => setNewSupplierContact(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowSupplierModal(false);
                if (supplierId === NEW_OPTION) setSupplierId('');
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save & Select Supplier
            </Button>
          </div>
        </form>
      </Modal>

      {/* Quick-Add Item Modal */}
      <Modal
        isOpen={showItemModal}
        onClose={() => {
          setShowItemModal(false);
          if (itemId === NEW_OPTION) setItemId('');
        }}
        title="Quick Add New Stock Item"
      >
        <form
          onSubmit={handleAddItemQuick}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              handleAddItemQuick();
            }
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Category" required>
            <select
              className={`${inputClass} font-semibold`}
              value={newItemCategory}
              onChange={(e) => setNewItemCategory(e.target.value)}
              required
            >
              <option value="Bottle">🍾 Bottle</option>
              <option value="Cap">🧴 Cap / Closure</option>
              <option value="Atomizer">💨 Atomizer / Pump</option>
              <option value="Packaging">📦 Packaging / Box</option>
              <option value="Label">🏷️ Label / Sticker</option>
              <option value="Fragrance">🧪 Fragrance / Raw Material</option>
              <option value="Other">⚙️ Other / Custom Component</option>
            </select>
          </Field>

          <Field
            label="Item Description / Specification"
            required
            hint={
              newItemCategory === 'Cap'
                ? 'e.g. 24/410 Shiny Gold Metal Cap'
                : newItemCategory === 'Atomizer'
                ? 'e.g. 18/415 Fine Mist Spray Pump'
                : 'e.g. 500ml Clear Boston Round Glass Bottle'
            }
          >
            <input
              className={inputClass}
              placeholder={
                newItemCategory === 'Cap'
                  ? '24/410 Shiny Gold Metal Cap'
                  : newItemCategory === 'Atomizer'
                  ? '18/415 Fine Mist Spray Pump'
                  : '500ml Clear Boston Round Glass Bottle'
              }
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              required
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Unit of Measure" required>
              <input
                className={inputClass}
                placeholder="pcs"
                value={newItemUnit}
                onChange={(e) => setNewItemUnit(e.target.value)}
                required
              />
            </Field>
            <Field label="Notes / Specs (Optional)">
              <input
                className={inputClass}
                placeholder="Spec details"
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowItemModal(false);
                if (itemId === NEW_OPTION) setItemId('');
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save & Select Item
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteModalBatch)}
        onClose={() => setDeleteModalBatch(null)}
        onConfirm={executeDelete}
        title="Delete Inward Batch"
        message={`Are you sure you want to delete batch ${deleteModalBatch?.batch_no}?`}
        details="Note: Deletion will only succeed if this batch has no downstream movements, split operations, or customer dispatches in the ledger."
        confirmText="Yes, Delete Batch"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
