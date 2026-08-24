import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PackagePlus, Sparkles, PlusCircle, Plus, Check, RotateCcw, Box } from 'lucide-react';
import { Modal, Field, inputClass, Button, ErrorBanner, Dropzone } from '@/components/ui';
import { insertInwardBatch } from '@/lib/queries';
import { supabase, type Item, type Supplier, type ComponentStockSummary, type BatchWithRelations } from '@/lib/supabase';
import { getErrorMessage, formatNumber, getTodayDateString } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { QuickSupplierModal } from './QuickSupplierModal';
import { AddItemModal } from './AddItemModal';
import { NEW_OPTION, MAX_IMAGE_BYTES } from './types';

export type InwardStockModalProps = {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  suppliers: Supplier[];
  batches?: BatchWithRelations[];
  caps?: Item[];
  atomizers?: Item[];
  boxes?: Item[];
  stockSummaryMap?: Map<string, ComponentStockSummary>;
  preselectedItemId?: string;
  onBatchCreated: () => void;
  onSupplierCreated: (newSupplier: Supplier) => void;
  onItemCreated?: (newItem: Item) => void;
};

export function InwardStockModal({
  isOpen,
  onClose,
  items: initialItems,
  suppliers: initialSuppliers,
  batches = [],
  preselectedItemId,
  onBatchCreated,
  onSupplierCreated,
  onItemCreated,
}: InwardStockModalProps) {
  // Local items & suppliers lists to ensure instant local updates when (+) modals are used
  const [localItems, setLocalItems] = useState<Item[]>(initialItems);
  const [localSuppliers, setLocalSuppliers] = useState<Supplier[]>(initialSuppliers);

  // Extract distinct known brands from past batches for auto-suggestion
  const knownBrands = useMemo<string[]>(() => {
    const brandSet = new Set<string>();
    for (const b of batches) {
      if (b.brand_name && b.brand_name.trim()) {
        brandSet.add(b.brand_name.trim());
      }
    }
    return Array.from(brandSet).sort((a, b) => a.localeCompare(b));
  }, [batches]);



  // Consignment / Shipment Context (Shared across consecutive batches)
  const [brandName, setBrandName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [receivedOn, setReceivedOn] = useState(getTodayDateString());
  const [location, setLocation] = useState('');

  // Batch Specific Fields
  const [inwardItemId, setInwardItemId] = useState(preselectedItemId || '');
  const [batchNo, setBatchNo] = useState('');
  const [qtyReceived, setQtyReceived] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Session Statistics for Multi-Batch Inward
  const [sessionBatchCount, setSessionBatchCount] = useState(0);
  const [lastLoggedBatch, setLastLoggedBatch] = useState<{ batchNo: string; qty: number; itemName: string } | null>(null);

  // Modal child states
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemSelectRef = useRef<HTMLSelectElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // Sync props to local lists
  useEffect(() => {
    setLocalItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    setLocalSuppliers(initialSuppliers);
  }, [initialSuppliers]);

  const generateBatchNoString = useCallback((brand: string, suffixIndex?: number) => {
    const brandPrefix =
      brand
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

  const generateSmartBatchNo = useCallback(
    (currentBrand?: string) => {
      const b = currentBrand !== undefined ? currentBrand : brandName;
      setBatchNo(generateBatchNoString(b));
    },
    [brandName, generateBatchNoString]
  );

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialId = preselectedItemId || (localItems.length > 0 ? localItems[0].id : '');
      setInwardItemId(initialId);

      if (localSuppliers.length === 1) {
        setSupplierId(localSuppliers[0].id);
      } else if (!supplierId && localSuppliers.length > 0) {
        setSupplierId('');
      }

      if (!batchNo) {
        setBatchNo(generateBatchNoString(brandName));
      }
      setReceivedOn(getTodayDateString());
      setError(null);
      setSessionBatchCount(0);
      setLastLoggedBatch(null);
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

  // Reset batch-specific fields to start a new batch cleanly
  const handleResetForm = () => {
    setBatchNo(generateBatchNoString(brandName));
    setQtyReceived('');
    clearPhoto();
    setError(null);
    if (itemSelectRef.current) {
      itemSelectRef.current.focus();
    }
  };

  // Save Inward Batch (Handles both continuous "Add Another" and "Save & Close")
  const handleSaveInwardBatch = async (shouldClose: boolean, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!inwardItemId || inwardItemId === NEW_OPTION) {
      setError('Please select a stock item / SKU received.');
      itemSelectRef.current?.focus();
      return;
    }
    if (!batchNo.trim()) {
      setError('Batch number / Lot identifier is required.');
      return;
    }
    if (!supplierId || supplierId === NEW_OPTION) {
      setError('Please select a supplier / vendor.');
      return;
    }
    const qtyNum = Number(qtyReceived);
    if (!qtyReceived || !Number.isInteger(qtyNum) || qtyNum <= 0) {
      setError('Quantity received must be a positive whole number.');
      qtyInputRef.current?.focus();
      return;
    }
    if (!location.trim()) {
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
        const ext =
          (imageFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
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
        batch_no: batchNo.trim(),
        brand_name: brandName.trim() || null,
        supplier_id: supplierId,
        item_id: inwardItemId,
        received_on: receivedOn,
        qty_received: qtyNum,
        location: location.trim(),
        image_url: finalImageUrl || null,
      });

      const selectedItem = localItems.find((i) => i.id === inwardItemId);
      const batchTitle = brandName.trim()
        ? `[${brandName.trim()}] Batch ${batchNo.trim()}`
        : `Batch ${batchNo.trim()}`;

      toast.success(
        `${batchTitle} logged with ${formatNumber(qtyNum)} ${selectedItem?.unit || 'units'} (${selectedItem?.name || 'Stock Item'}).${
          shouldClose ? '' : ' Ready for next batch entry.'
        }`,
        'Inward Stock Logged'
      );

      setSessionBatchCount((prev) => prev + 1);
      setLastLoggedBatch({
        batchNo: batchNo.trim(),
        qty: qtyNum,
        itemName: selectedItem?.name || 'Stock Item',
      });

      // Notify parent to refresh background stock summaries & ledger
      onBatchCreated();

      if (shouldClose) {
        setBatchNo('');
        setBrandName('');
        setQtyReceived('');
        setLocation('');
        clearPhoto();
        onClose();
      } else {
        // Continuous Entry Mode:
        // Keep shared context (supplierId, brandName, receivedOn, location)
        // Auto-generate fresh unique batch number
        setBatchNo(generateBatchNoString(brandName));
        setQtyReceived('');
        clearPhoto();
        // Shift focus to quantity or item selector for instant entry
        setTimeout(() => {
          if (qtyInputRef.current) {
            qtyInputRef.current.focus();
          }
        }, 50);
      }
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

  // Handler when a new item is created via inline (+) modal
  const handleItemCreated = (newItem?: Item) => {
    if (newItem) {
      setLocalItems((prev) => {
        const exists = prev.some((i) => i.id === newItem.id);
        if (exists) return prev;
        return [newItem, ...prev];
      });
      setInwardItemId(newItem.id);
      onItemCreated?.(newItem);
    }
    setShowAddItemModal(false);
  };

  // Handler when a new supplier is created via inline (+) modal
  const handleSupplierCreated = (newSupp: Supplier) => {
    setLocalSuppliers((prev) => {
      const exists = prev.some((s) => s.id === newSupp.id);
      if (exists) return prev;
      return [...prev, newSupp].sort((a, b) => a.name.localeCompare(b.name));
    });
    setSupplierId(newSupp.id);
    onSupplierCreated(newSupp);
    setShowSupplierModal(false);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Inward Stock Receiving & Batch Creation"
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-4">
          {/* HEADER SUMMARY & CONTINUOUS ENTRY BADGE */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
              Log incoming physical shipments from suppliers. Tag the <strong>Client / Brand Name</strong>, generate unique <strong>Batch Numbers</strong>, and allocate warehouse storage bays.
            </p>

            {sessionBatchCount > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0 animate-in fade-in">
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>{sessionBatchCount} {sessionBatchCount === 1 ? 'Batch' : 'Batches'} Logged</span>
              </span>
            )}
          </div>

          {/* Last Logged Batch Flash Banner */}
          {sessionBatchCount > 0 && lastLoggedBatch && (
            <div className="flex items-center justify-between bg-emerald-50/90 border border-emerald-200 rounded-xl px-3 py-2 text-xs text-emerald-900 animate-in fade-in">
              <div className="flex items-center gap-2 truncate">
                <Box className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  Successfully logged <strong>Batch {lastLoggedBatch.batchNo}</strong> ({formatNumber(lastLoggedBatch.qty)} units of {lastLoggedBatch.itemName}).
                </span>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 shrink-0 ml-2">
                Ready for next batch ↓
              </span>
            </div>
          )}

          <form
            onSubmit={(e) => handleSaveInwardBatch(false, e)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSaveInwardBatch(false);
              }
            }}
            className="space-y-4"
          >
            {/* ROW 1: STOCK ITEM SELECTION WITH PROMINENT (+) BUTTON */}
            <Field
              label="1. Stock Item / SKU Received"
              htmlFor="inward-item"
              required
              hint="Select the primary bottle, cap, atomizer, box or component, or click (+) to register new SKU"
            >
              <div className="flex gap-2">
                <select
                  ref={itemSelectRef}
                  id="inward-item"
                  className={`${inputClass} font-bold text-slate-950 bg-slate-50 focus:bg-white flex-1`}
                  value={inwardItemId}
                  onChange={(e) => {
                    if (e.target.value === NEW_OPTION) {
                      setShowAddItemModal(true);
                    } else {
                      setInwardItemId(e.target.value);
                    }
                  }}
                  required
                >
                  <option value="">Select stock item…</option>
                  <option value={NEW_OPTION} className="font-bold text-emerald-700 bg-emerald-50">
                    ➕ Register new Master Component SKU…
                  </option>
                  {localItems.map((itm) => (
                    <option key={itm.id} value={itm.id}>
                      [{itm.category || 'Bottle'}] {itm.name}{itm.color ? ` (${itm.color})` : ''} — Unit: {itm.unit || 'pcs'}
                    </option>
                  ))}
                </select>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddItemModal(true)}
                  title="Quick-Register New Master Component SKU (+)"
                  className="shrink-0 min-w-[38px] min-h-[38px] text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 cursor-pointer shadow-2xs"
                >
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </div>
            </Field>

            {/* ROW 2: BRAND NAME & BATCH NO WITH AUTO-GENERATOR */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="2. Client / Brand Name (Party)"
                htmlFor="inward-brand"
                hint="e.g. Royal Club, Zara, Bella Vita, In-House"
              >
                <input
                  id="inward-brand"
                  list="inward-brand-suggestions"
                  className={`${inputClass} font-bold text-slate-950`}
                  value={brandName}
                  onChange={(e) => {
                    setBrandName(e.target.value);
                    if (!batchNo || batchNo.startsWith('BAT-') || batchNo.startsWith('RC-')) {
                      generateSmartBatchNo(e.target.value);
                    }
                  }}
                  placeholder="e.g. Royal Club, Bella Vita"
                />
                <datalist id="inward-brand-suggestions">
                  {knownBrands.map((kb) => (
                    <option key={kb} value={kb} />
                  ))}
                </datalist>

                {knownBrands.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Recent Brands:
                    </span>
                    {knownBrands.slice(0, 4).map((kb) => (
                      <button
                        key={kb}
                        type="button"
                        onClick={() => {
                          setBrandName(kb);
                          generateSmartBatchNo(kb);
                        }}
                        className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 hover:border-amber-300 text-[10px] font-bold hover:bg-amber-100 transition cursor-pointer shadow-2xs"
                      >
                        🏢 {kb}
                      </button>
                    ))}
                  </div>
                )}
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
                    value={batchNo}
                    onChange={(e) => setBatchNo(e.target.value)}
                    placeholder="e.g. RC-2608-ABC"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => generateSmartBatchNo()}
                    title="Auto-generate new unique batch code"
                    className="shrink-0 text-xs font-bold text-indigo-700 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Auto
                  </Button>
                </div>
              </Field>
            </div>

            {/* ROW 3: SUPPLIER & QUANTITY WITH PROMINENT (+) BUTTON */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="4. Supplier / Vendor"
                htmlFor="inward-supplier"
                required
                hint="Choose supplier or click (+) to add new"
              >
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
                    <option value={NEW_OPTION} className="font-bold text-emerald-700 bg-emerald-50">
                      ➕ Add new supplier / factory…
                    </option>
                    {localSuppliers.map((s) => (
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
                    title="Quick-Add New Supplier (+)"
                    className="shrink-0 min-w-[38px] min-h-[38px] text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 cursor-pointer shadow-2xs"
                  >
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                </div>
              </Field>

              <Field
                label="5. Quantity Received"
                htmlFor="inward-qty"
                required
                hint="Positive whole number of units"
              >
                <input
                  ref={qtyInputRef}
                  id="inward-qty"
                  type="number"
                  min={1}
                  className={`${inputClass} font-black text-slate-950 text-base`}
                  value={qtyReceived}
                  onChange={(e) => setQtyReceived(e.target.value)}
                  placeholder="e.g. 10000"
                  required
                />
              </Field>
            </div>

            {/* ROW 4: RECEIVED DATE & STORAGE BAY */}
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

              <Field
                label="7. Storage Location / Bay"
                htmlFor="inward-location"
                required
                hint="e.g. Warehouse Bay A-1, Rack 4, Shelf 2"
              >
                <input
                  id="inward-location"
                  className={inputClass}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Warehouse Bay A-1, Rack 4"
                  required
                />
              </Field>
            </div>

            {/* Shipment Photo Upload Dropzone */}
            <Field
              label="Shipment / Sample Photo (Optional)"
              htmlFor="dropzone"
              hint="Upload QC or warehouse intake photo (max 10MB)"
            >
              <Dropzone
                previewUrl={imagePreview || imageUrl}
                onFileSelect={handleFileSelect}
                onClear={clearPhoto}
              />
            </Field>

            {error && <ErrorBanner message={error} />}

            {/* ACTION BUTTONS: SAVE & ADD ANOTHER (+), SAVE & CLOSE, DONE */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  {sessionBatchCount > 0 ? `Done (${sessionBatchCount} Batches Logged)` : 'Cancel'}
                </Button>
                {qtyReceived && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetForm}
                    className="text-xs text-slate-500 hover:text-slate-800"
                    title="Clear batch inputs"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reset
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  loading={submitting}
                  onClick={() => handleSaveInwardBatch(false)}
                  className="font-bold text-emerald-800 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 cursor-pointer shadow-2xs"
                  title="Log this batch and keep the form open with shared supplier/brand to add another batch immediately"
                >
                  <Plus className="h-4 w-4 mr-1 text-emerald-600" />
                  <span>Save & Add Another Batch (+)</span>
                  <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-emerald-100 text-emerald-800 rounded">
                    Ctrl+Enter
                  </kbd>
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  loading={submitting}
                  onClick={() => handleSaveInwardBatch(true)}
                  className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer"
                >
                  <PackagePlus className="h-4 w-4 mr-1 text-emerald-100" />
                  <span>Confirm Inward & Close</span>
                </Button>
              </div>
            </div>
          </form>
        </div>
      </Modal>

      {/* Inline Quick-Register Master Component SKU Modal */}
      {showAddItemModal && (
        <AddItemModal
          isOpen={showAddItemModal}
          onClose={() => {
            setShowAddItemModal(false);
            if (inwardItemId === NEW_OPTION) setInwardItemId('');
          }}
          onItemCreated={handleItemCreated}
          existingItems={localItems}
        />
      )}

      {/* Inline Quick-Add Supplier Modal */}
      {showSupplierModal && (
        <QuickSupplierModal
          isOpen={showSupplierModal}
          onClose={() => {
            setShowSupplierModal(false);
            if (supplierId === NEW_OPTION) setSupplierId('');
          }}
          onSupplierCreated={handleSupplierCreated}
        />
      )}
    </>
  );
}
