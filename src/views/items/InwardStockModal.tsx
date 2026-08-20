import { useState, useEffect, useCallback } from 'react';
import { PackagePlus, Sparkles, PlusCircle, Plus, Trash2, Copy, FileText, Boxes } from 'lucide-react';
import { Modal, Field, inputClass, Button, ErrorBanner, Dropzone } from '@/components/ui';
import { insertInwardBatch, insertInwardBatches } from '@/lib/queries';
import { supabase, type Item, type Supplier, type ComponentStockSummary } from '@/lib/supabase';
import { getErrorMessage, formatNumber, getTodayDateString } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { QuickSupplierModal } from './QuickSupplierModal';
import { NEW_OPTION, MAX_IMAGE_BYTES } from './types';

export type InwardStockModalProps = {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  suppliers: Supplier[];
  caps?: Item[];
  atomizers?: Item[];
  boxes?: Item[];
  stockSummaryMap?: Map<string, ComponentStockSummary>;
  preselectedItemId?: string;
  onBatchCreated: () => void;
  onSupplierCreated: (newSupplier: Supplier) => void;
};

export type MultiInwardRow = {
  id: string;
  itemId: string;
  batchNo: string;
  qtyReceived: string;
  location: string;
};

const createEmptyInwardRow = (defaultItemId = '', defaultLocation = ''): MultiInwardRow => ({
  id: crypto.randomUUID(),
  itemId: defaultItemId,
  batchNo: '',
  qtyReceived: '',
  location: defaultLocation,
});

export function InwardStockModal({
  isOpen,
  onClose,
  items,
  suppliers,
  preselectedItemId,
  onBatchCreated,
  onSupplierCreated,
}: InwardStockModalProps) {
  // Mode: 'single' vs 'multi'
  const [entryMode, setEntryMode] = useState<'single' | 'multi'>('single');

  // Shared / Consignment Header
  const [brandName, setBrandName] = useState('');
  const [supplierId, setSupplierId] = useState(suppliers.length === 1 ? suppliers[0].id : '');
  const [receivedOn, setReceivedOn] = useState(getTodayDateString());
  const [defaultLocation, setDefaultLocation] = useState('');

  // Single Item Inward State
  const [inwardItemId, setInwardItemId] = useState(preselectedItemId || (items.length > 0 ? items[0].id : ''));
  const [singleBatchNo, setSingleBatchNo] = useState('');
  const [singleQtyReceived, setSingleQtyReceived] = useState('');
  const [singleLocation, setSingleLocation] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Multi-Item Consignment Inward State
  const [rows, setRows] = useState<MultiInwardRow[]>([
    createEmptyInwardRow(preselectedItemId || (items.length > 0 ? items[0].id : '')),
    createEmptyInwardRow(items.length > 1 ? items[1].id : ''),
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  const toast = useToast();

  const generateBatchNoString = useCallback((brand: string, suffixIndex?: number) => {
    const brandPrefix = brand
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3) || 'BAT';
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    const suffix = suffixIndex !== undefined ? `-${suffixIndex + 1}` : `-${rand}`;
    return `${brandPrefix}-${yy}${mm}${suffix}`;
  }, []);

  const generateSmartBatchNoSingle = useCallback((currentBrand?: string) => {
    const b = currentBrand !== undefined ? currentBrand : brandName;
    setSingleBatchNo(generateBatchNoString(b));
  }, [brandName, generateBatchNoString]);

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialId = preselectedItemId || (items.length > 0 ? items[0].id : '');
      setInwardItemId(initialId);

      if (suppliers.length === 1) {
        setSupplierId(suppliers[0].id);
      } else if (!supplierId && suppliers.length > 0) {
        setSupplierId('');
      }

      if (!singleBatchNo) {
        setSingleBatchNo(generateBatchNoString(brandName));
      }
      setReceivedOn(getTodayDateString());
      setError(null);
    } else {
      clearPhoto();
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, preselectedItemId]);

  const clearPhoto = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview('');
    setImageUrl('');
  };

  const handleFileSelect = (file: File | null) => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (!file) {
      setImageFile(null);
      setImagePreview('');
      setImageUrl('');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // Multi row operations
  const handleAddRow = () => {
    const defaultItem = items.length > 0 ? items[0].id : '';
    const newRow = createEmptyInwardRow(defaultItem, defaultLocation);
    newRow.batchNo = generateBatchNoString(brandName, rows.length);
    setRows((prev) => [...prev, newRow]);
  };

  const handleDuplicateRow = (index: number) => {
    const target = rows[index];
    if (!target) return;
    const newRow: MultiInwardRow = {
      ...target,
      id: crypto.randomUUID(),
      batchNo: generateBatchNoString(brandName, rows.length),
    };
    const next = [...rows];
    next.splice(index + 1, 0, newRow);
    setRows(next);
  };

  const handleDeleteRow = (index: number) => {
    if (rows.length <= 1) {
      setRows([createEmptyInwardRow(items[0]?.id || '', defaultLocation)]);
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof MultiInwardRow, val: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleGenerateAllBatchNumbers = () => {
    setRows((prev) =>
      prev.map((r, i) => ({
        ...r,
        batchNo: generateBatchNoString(brandName, i),
      }))
    );
    toast.success('Generated unique batch numbers for all line items.', 'Batches Generated');
  };

  // Single Inward Submit
  const handleSubmitSingle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!inwardItemId) {
      setError('Please select a stock item / SKU.');
      return;
    }
    if (!singleBatchNo.trim()) {
      setError('Batch number / Lot identifier is required.');
      return;
    }
    if (!supplierId) {
      setError('Please select a supplier.');
      return;
    }
    const qtyNum = Number(singleQtyReceived);
    if (!singleQtyReceived || !Number.isInteger(qtyNum) || qtyNum <= 0) {
      setError('Quantity received must be a positive whole number.');
      return;
    }
    if (!singleLocation.trim()) {
      setError('Storage location / Warehouse bay is required.');
      return;
    }

    if (imageFile) {
      if (!imageFile.type.startsWith('image/')) {
        setError('Please choose a valid image file (jpg, png, webp).');
        return;
      }
      if (imageFile.size > MAX_IMAGE_BYTES) {
        setError('Photo is too big. Choose an image under 10 MB.');
        return;
      }
    }

    setSubmitting(true);
    let uploadedPath: string | null = null;
    let finalImageUrl = imageUrl;

    try {
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

      await insertInwardBatch({
        batch_no: singleBatchNo.trim(),
        brand_name: brandName.trim() || null,
        supplier_id: supplierId,
        item_id: inwardItemId,
        received_on: receivedOn,
        qty_received: qtyNum,
        location: singleLocation.trim(),
        image_url: finalImageUrl || null,
      });

      const selectedItem = items.find((i) => i.id === inwardItemId);
      const batchTitle = brandName.trim()
        ? `[${brandName.trim()}] Batch ${singleBatchNo.trim()}`
        : `Batch ${singleBatchNo.trim()}`;

      toast.success(
        `${batchTitle} logged with ${formatNumber(qtyNum)} ${selectedItem?.unit || 'units'} (${selectedItem?.name || 'Stock Item'}).`,
        'Inward Stock Logged'
      );

      // Reset
      setSingleBatchNo('');
      setBrandName('');
      setSingleQtyReceived('');
      setSingleLocation('');
      clearPhoto();

      onBatchCreated();
      onClose();
    } catch (err) {
      if (uploadedPath) {
        await supabase.storage.from('batch-images').remove([uploadedPath]).catch(() => {});
      }
      const msg = getErrorMessage(err, 'Failed to log inward stock');
      setError(msg);
      toast.error(msg, 'Inward Error');
    } finally {
      setSubmitting(false);
    }
  };

  // Multi Inward Submit
  const handleSubmitMulti = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!supplierId) {
      setError('Please select a supplier for the consignment.');
      return;
    }
    if (!receivedOn) {
      setError('Please specify the received date.');
      return;
    }

    const validRows = rows.filter((r) => r.itemId && r.qtyReceived && Number(r.qtyReceived) > 0);
    if (validRows.length === 0) {
      setError('Please enter at least one valid line item with SKU and positive received quantity.');
      return;
    }

    // Validate batch numbers and locations
    const batchSet = new Set<string>();
    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      if (!r.batchNo.trim()) {
        setError(`Line item #${i + 1} is missing a Batch Number.`);
        return;
      }
      const bUpper = r.batchNo.trim().toUpperCase();
      if (batchSet.has(bUpper)) {
        setError(`Duplicate Batch Number "${r.batchNo.trim()}" in line item #${i + 1}. Each batch must have a unique identifier.`);
        return;
      }
      batchSet.add(bUpper);

      const loc = r.location.trim() || defaultLocation.trim();
      if (!loc) {
        setError(`Line item #${i + 1} is missing a Storage Location / Warehouse Bay.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payloads = validRows.map((r) => ({
        batch_no: r.batchNo.trim(),
        brand_name: brandName.trim() || null,
        supplier_id: supplierId,
        item_id: r.itemId,
        received_on: receivedOn,
        qty_received: Number(r.qtyReceived),
        location: (r.location.trim() || defaultLocation.trim()),
      }));

      await insertInwardBatches(payloads);

      const totalQty = payloads.reduce((sum, p) => sum + p.qty_received, 0);
      toast.success(
        `Successfully logged ${payloads.length} stock line items (${formatNumber(totalQty)} total units received).`,
        'Consignment Inward Complete'
      );

      // Reset
      setBrandName('');
      setDefaultLocation('');
      setRows([
        createEmptyInwardRow(items[0]?.id || ''),
        createEmptyInwardRow(items[1]?.id || ''),
      ]);

      onBatchCreated();
      onClose();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to log consignment batch stock');
      setError(msg);
      toast.error(msg, 'Inward Batch Error');
    } finally {
      setSubmitting(false);
    }
  };

  const filledMultiRows = rows.filter((r) => r.itemId && r.qtyReceived && Number(r.qtyReceived) > 0);
  const totalMultiQty = filledMultiRows.reduce((sum, r) => sum + (Number(r.qtyReceived) || 0), 0);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Inward Stock Receiving & Batch Creation"
        maxWidthClass={entryMode === 'multi' ? 'max-w-4xl' : 'max-w-3xl'}
      >
        <div className="space-y-4">
          {/* MODE TOGGLE SWITCH */}
          <div className="flex items-center justify-between bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setEntryMode('single')}
              className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                entryMode === 'single'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Single Batch Inward</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEntryMode('multi');
                // Ensure rows have batch numbers
                setRows((prev) =>
                  prev.map((r, i) => ({
                    ...r,
                    batchNo: r.batchNo || generateBatchNoString(brandName, i),
                    location: r.location || defaultLocation,
                  }))
                );
              }}
              className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                entryMode === 'multi'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Boxes className="h-3.5 w-3.5 text-emerald-200" />
              <span>Multi-Item Consignment Inward</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                entryMode === 'multi' ? 'bg-emerald-800 text-emerald-200' : 'bg-slate-200 text-slate-600'
              }`}>
                Batch Receiving
              </span>
            </button>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed border-b border-slate-100 pb-2">
            Log incoming physical shipments from suppliers. Tag the <strong>Client / Brand Name</strong>, generate unique <strong>Batch Numbers</strong>, and allocate warehouse storage bays.
          </p>

          {/* -------------------- MODE 1: SINGLE BATCH INWARD -------------------- */}
          {entryMode === 'single' && (
            <form
              onSubmit={handleSubmitSingle}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmitSingle();
                }
              }}
              className="space-y-4"
            >
              {/* Row 1: Stock Item Selection */}
              <Field label="1. Stock Item / SKU Received" htmlFor="inward-item" required hint="Select the primary bottle, cap, atomizer, box or component">
                <select
                  id="inward-item"
                  className={`${inputClass} font-bold text-slate-950 bg-slate-50 focus:bg-white`}
                  value={inwardItemId}
                  onChange={(e) => setInwardItemId(e.target.value)}
                  required
                >
                  <option value="">Select stock item…</option>
                  {items.map((itm) => (
                    <option key={itm.id} value={itm.id}>
                      [{itm.category || 'Bottle'}] {itm.name}{itm.color ? ` (${itm.color})` : ''} — Unit: {itm.unit || 'pcs'}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Row 2: Brand Name & Batch No with Auto-Generator */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label="2. Client / Brand Name (Party)"
                  htmlFor="inward-brand"
                  hint="e.g. Royal Club, Zara, Bella Vita, In-House"
                >
                  <input
                    id="inward-brand"
                    className={`${inputClass} font-bold`}
                    value={brandName}
                    onChange={(e) => {
                      setBrandName(e.target.value);
                      if (!singleBatchNo || singleBatchNo.startsWith('BAT-') || singleBatchNo.startsWith('RC-')) {
                        generateSmartBatchNoSingle(e.target.value);
                      }
                    }}
                    placeholder="e.g. Royal Club, Bella Vita"
                  />
                </Field>

                <Field
                  label="3. Batch No / Lot Code"
                  htmlFor="inward-batch-no"
                  required
                  hint="Unique production trace identifier"
                >
                  <div className="flex gap-2">
                    <input
                      id="inward-batch-no"
                      className={`${inputClass} font-mono font-black text-slate-950`}
                      value={singleBatchNo}
                      onChange={(e) => setSingleBatchNo(e.target.value)}
                      placeholder="e.g. RC-2608-ABC"
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => generateSmartBatchNoSingle()}
                      title="Auto-generate new unique batch code"
                      className="shrink-0 text-xs font-bold text-indigo-700 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      Auto
                    </Button>
                  </div>
                </Field>
              </div>

              {/* Row 3: Supplier & Quantity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="4. Supplier / Vendor" htmlFor="inward-supplier" required hint="Choose supplier or add new">
                  <div className="flex gap-2">
                    <select
                      id="inward-supplier"
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
                      {suppliers.map((s) => (
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
                      className="shrink-0 min-w-[38px] min-h-[38px] cursor-pointer"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </Field>

                <Field label="5. Quantity Received" htmlFor="inward-qty" required hint="Positive whole number">
                  <input
                    id="inward-qty"
                    type="number"
                    min={1}
                    className={`${inputClass} font-black text-slate-950 text-base`}
                    value={singleQtyReceived}
                    onChange={(e) => setSingleQtyReceived(e.target.value)}
                    placeholder="e.g. 10000"
                    required
                  />
                </Field>
              </div>

              {/* Row 4: Received Date & Storage Bay */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="6. Received Date" htmlFor="inward-date" required>
                  <input
                    id="inward-date"
                    type="date"
                    className={inputClass}
                    value={receivedOn}
                    onChange={(e) => setReceivedOn(e.target.value)}
                    required
                  />
                </Field>

                <Field label="7. Storage Location / Bay" htmlFor="inward-location" required hint="e.g. Bay A-1, Rack 4, Shelf 2">
                  <input
                    id="inward-location"
                    className={inputClass}
                    value={singleLocation}
                    onChange={(e) => setSingleLocation(e.target.value)}
                    placeholder="e.g. Warehouse Bay A-1, Rack 4"
                    required
                  />
                </Field>
              </div>

              {/* Shipment Photo Upload Dropzone */}
              <Field label="Shipment / Sample Photo (Optional)" htmlFor="dropzone" hint="Upload QC or warehouse intake photo (max 10MB)">
                <Dropzone
                  previewUrl={imagePreview || imageUrl}
                  onFileSelect={handleFileSelect}
                  onClear={clearPhoto}
                />
              </Field>

              {error && <ErrorBanner message={error} />}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer"
                >
                  <PackagePlus className="h-4 w-4 mr-1 text-emerald-100" />
                  <span>Confirm Inward Stock</span>
                  <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-emerald-800 text-emerald-200 rounded">Ctrl+Enter</kbd>
                </Button>
              </div>
            </form>
          )}

          {/* -------------------- MODE 2: MULTI-ITEM CONSIGNMENT INWARD -------------------- */}
          {entryMode === 'multi' && (
            <form onSubmit={handleSubmitMulti} className="space-y-4">
              {/* Consignment Header Information */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Consignment & Supplier Info (Shared across all line items)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Supplier */}
                  <Field label="Supplier / Vendor" htmlFor="multi-supp" required>
                    <div className="flex gap-1.5">
                      <select
                        id="multi-supp"
                        className={`${inputClass} text-xs font-bold`}
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
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSupplierModal(true)}
                        title="Add new supplier"
                        className="shrink-0 p-2 cursor-pointer"
                      >
                        <PlusCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </Field>

                  {/* Brand / Party */}
                  <Field label="Client / Brand (Party)" htmlFor="multi-brand" hint="Optional tag">
                    <input
                      id="multi-brand"
                      className={`${inputClass} text-xs font-bold`}
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="e.g. Royal Club, In-House"
                    />
                  </Field>

                  {/* Received Date & Default Bay */}
                  <Field label="Received Date" htmlFor="multi-date" required>
                    <input
                      id="multi-date"
                      type="date"
                      className={`${inputClass} text-xs`}
                      value={receivedOn}
                      onChange={(e) => setReceivedOn(e.target.value)}
                      required
                    />
                  </Field>
                </div>

                <div className="pt-1">
                  <Field label="Default Storage Bay / Location" htmlFor="multi-def-loc" hint="Pre-fills empty rows">
                    <input
                      id="multi-def-loc"
                      className={`${inputClass} text-xs`}
                      value={defaultLocation}
                      onChange={(e) => {
                        const nextLoc = e.target.value;
                        setDefaultLocation(nextLoc);
                        setRows((prev) =>
                          prev.map((r) => ({
                            ...r,
                            location: r.location || nextLoc,
                          }))
                        );
                      }}
                      placeholder="e.g. Warehouse Bay A-1, Rack 4"
                    />
                  </Field>
                </div>
              </div>

              {/* Line Items Table Header Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="text-xs font-bold text-slate-800">
                  Consignment Line Items ({rows.length})
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateAllBatchNumbers}
                    className="text-xs font-semibold text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Auto-Generate All Batch Numbers
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddRow}
                    className="text-xs font-bold text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Item Row
                  </Button>
                </div>
              </div>

              {/* Multi-Item Line Items Table Grid */}
              <div className="max-h-[340px] overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold text-[11px] uppercase tracking-wider z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-2 text-center w-8">#</th>
                      <th className="py-2.5 px-2 min-w-[200px]">Stock Item / SKU *</th>
                      <th className="py-2.5 px-2 min-w-[150px]">Batch No / Lot Code *</th>
                      <th className="py-2.5 px-2 w-28">Quantity *</th>
                      <th className="py-2.5 px-2 min-w-[130px]">Storage Bay</th>
                      <th className="py-2.5 px-2 text-center w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-400 font-bold">
                          {idx + 1}
                        </td>

                        {/* SKU */}
                        <td className="py-2 px-1.5">
                          <select
                            className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:bg-white focus:ring-1 focus:ring-emerald-500"
                            value={row.itemId}
                            onChange={(e) => updateRow(idx, 'itemId', e.target.value)}
                            required
                          >
                            <option value="">Select SKU…</option>
                            {items.map((i) => (
                              <option key={i.id} value={i.id}>
                                [{i.category || 'SKU'}] {i.name}{i.color ? ` (${i.color})` : ''}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Batch No */}
                        <td className="py-2 px-1.5">
                          <div className="flex gap-1">
                            <input
                              type="text"
                              className="w-full text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:border-emerald-500"
                              placeholder="e.g. BAT-2608-A1"
                              value={row.batchNo}
                              onChange={(e) => updateRow(idx, 'batchNo', e.target.value)}
                              required
                            />
                            <button
                              type="button"
                              onClick={() => updateRow(idx, 'batchNo', generateBatchNoString(brandName, idx))}
                              title="Generate batch code"
                              className="px-1.5 py-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded text-[10px] font-bold cursor-pointer"
                            >
                              Auto
                            </button>
                          </div>
                        </td>

                        {/* Quantity */}
                        <td className="py-2 px-1.5">
                          <input
                            type="number"
                            min={1}
                            className="w-full text-xs font-black text-slate-900 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:border-emerald-500"
                            placeholder="Qty"
                            value={row.qtyReceived}
                            onChange={(e) => updateRow(idx, 'qtyReceived', e.target.value)}
                            required
                          />
                        </td>

                        {/* Location */}
                        <td className="py-2 px-1.5">
                          <input
                            type="text"
                            className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:border-emerald-500"
                            placeholder={defaultLocation || 'e.g. Bay A-1'}
                            value={row.location}
                            onChange={(e) => updateRow(idx, 'location', e.target.value)}
                          />
                        </td>

                        {/* Actions */}
                        <td className="py-2 px-1.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDuplicateRow(idx)}
                              title="Duplicate Row"
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(idx)}
                              title="Remove Row"
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Consignment Multi Summary Bar */}
              <div className="flex items-center justify-between bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddRow}
                    className="text-xs font-bold text-slate-800 bg-white"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                    Add Another Item Row
                  </Button>
                </div>

                <div className="text-xs font-bold text-slate-800 flex items-center gap-3">
                  <span>Line Items: <strong className="text-emerald-800">{filledMultiRows.length}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span>Total Inward Units: <strong className="text-emerald-800 text-sm font-black">{formatNumber(totalMultiQty)}</strong></span>
                </div>
              </div>

              {error && <ErrorBanner message={error} />}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  disabled={filledMultiRows.length === 0}
                  className="font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-md cursor-pointer"
                >
                  <PackagePlus className="h-4 w-4 mr-1 text-emerald-100" />
                  <span>Confirm Inward ({filledMultiRows.length} {filledMultiRows.length === 1 ? 'Item' : 'Items'} • {formatNumber(totalMultiQty)} Units)</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* Inline Quick-Add Supplier Modal */}
      {showSupplierModal && (
        <QuickSupplierModal
          isOpen={showSupplierModal}
          onClose={() => {
            setShowSupplierModal(false);
            if (supplierId === NEW_OPTION) setSupplierId('');
          }}
          onSupplierCreated={(newSupp) => {
            onSupplierCreated(newSupp);
            setSupplierId(newSupp.id);
            setShowSupplierModal(false);
          }}
        />
      )}
    </>
  );
}
