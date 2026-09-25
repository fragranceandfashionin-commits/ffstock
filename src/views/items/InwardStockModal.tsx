import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PackagePlus, Sparkles, PlusCircle, Plus, Check, RotateCcw, Box, Search, History, ArrowRight, X, Layers, AlertTriangle } from 'lucide-react';
import {
  Modal,
  Field,
  inputClass,
  Button,
  ErrorBanner,
  Dropzone,
  ItemCategoryBadge,
  ItemSearchSelect,
  SupplierSearchSelect,
} from '@/components/ui';
import { insertInwardBatch } from '@/lib/queries';
import { supabase, COMMON_COLORS, type Item, type Supplier, type ComponentStockSummary, type BatchWithRelations } from '@/lib/supabase';
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
  caps = [],
  atomizers = [],
  boxes = [],
  stockSummaryMap = new Map(),
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

  // Optional BOM Component & Packaging Specs
  const [color, setColor] = useState('');
  const [capItemId, setCapItemId] = useState('');
  const [atomizerItemId, setAtomizerItemId] = useState('');
  const [boxItemId, setBoxItemId] = useState('');
  const [capQty, setCapQty] = useState('');
  const [atomizerQty, setAtomizerQty] = useState('');
  const [boxQty, setBoxQty] = useState('');
  const [showBomSection, setShowBomSection] = useState(false);

  // Existing Batch Quick-Fill Search State
  const [showBatchAutofill, setShowBatchAutofill] = useState(false);
  const [batchSearchQuery, setBatchSearchQuery] = useState('');
  const [autofilledBatch, setAutofilledBatch] = useState<BatchWithRelations | null>(null);

  // Session Statistics for Multi-Batch Inward
  const [sessionBatchCount, setSessionBatchCount] = useState(0);
  const [lastLoggedBatch, setLastLoggedBatch] = useState<{ batchNo: string; qty: number; itemName: string } | null>(null);

  // Modal child states
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Filtered past batches for the quick autofill search
  const filteredPastBatches = useMemo(() => {
    const q = batchSearchQuery.trim().toLowerCase();
    if (!q) return batches.slice(0, 6);
    return batches
      .filter((b) => {
        const bNo = (b.batch_no || '').toLowerCase();
        const bBrand = (b.brand_name || '').toLowerCase();
        const bItem = (b.item?.name || '').toLowerCase();
        const bSup = (b.supplier?.name || '').toLowerCase();
        const bLoc = (b.location || '').toLowerCase();
        return bNo.includes(q) || bBrand.includes(q) || bItem.includes(q) || bSup.includes(q) || bLoc.includes(q);
      })
      .slice(0, 8);
  }, [batches, batchSearchQuery]);

  // Live duplicate batch number detection
  const isDuplicateBatchNo = useMemo(
    () => (batches || []).some((b) => b.batch_no?.trim().toLowerCase() === batchNo.trim().toLowerCase()),
    [batches, batchNo]
  );

  // Distinct warehouse locations for quick-pick chips
  const distinctLocations = useMemo(
    () => Array.from(new Set((batches || []).map((b) => b.location?.trim()).filter(Boolean) as string[])),
    [batches]
  );

  // Autofill form from an existing batch
  const handleSelectExistingBatch = (b: BatchWithRelations) => {
    setInwardItemId(b.item_id);
    setBrandName(b.brand_name || '');
    setSupplierId(b.supplier_id);
    setLocation(b.location || '');
    const randSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    setBatchNo(`${b.batch_no}-${randSuffix}`);
    setAutofilledBatch(b);
    setShowBatchAutofill(false);
    setBatchSearchQuery('');
    setError(null);

    // Sync BOM component specs from past batch
    if (b.color) setColor(b.color);
    if (b.cap_item_id) setCapItemId(b.cap_item_id);
    if (b.atomizer_item_id) setAtomizerItemId(b.atomizer_item_id);
    if (b.box_item_id) setBoxItemId(b.box_item_id);
    if (b.cap_qty) setCapQty(String(b.cap_qty));
    if (b.atomizer_qty) setAtomizerQty(String(b.atomizer_qty));
    if (b.box_qty) setBoxQty(String(b.box_qty));
    if (b.cap_item_id || b.atomizer_item_id || b.box_item_id || b.color) {
      setShowBomSection(true);
    }

    toast.success(`Loaded details from Batch ${b.batch_no} (${b.item?.name || 'Stock Item'})`, 'Batch Loaded');
    setTimeout(() => {
      qtyInputRef.current?.focus();
    }, 50);
  };

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
      setAutofilledBatch(null);
      setShowBatchAutofill(false);
    } else {
      clearPhoto();
      setError(null);
      setColor('');
      setCapItemId('');
      setAtomizerItemId('');
      setBoxItemId('');
      setCapQty('');
      setAtomizerQty('');
      setBoxQty('');
      setShowBomSection(false);
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
    setAutofilledBatch(null);
    setColor('');
    setCapItemId('');
    setAtomizerItemId('');
    setBoxItemId('');
    setCapQty('');
    setAtomizerQty('');
    setBoxQty('');
    setShowBomSection(false);
  };

  // Save Inward Batch (Handles both continuous "Add Another" and "Save & Close")
  const handleSaveInwardBatch = async (shouldClose: boolean, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!inwardItemId || inwardItemId === NEW_OPTION) {
      setError('Please search and select a stock item / SKU received.');
      return;
    }
    if (!batchNo.trim()) {
      setError('Batch number / Lot identifier is required.');
      return;
    }
    if (isDuplicateBatchNo) {
      setError('Batch number already exists. Each physical shipment must have a unique lot number.');
      return;
    }
    if (!supplierId || supplierId === NEW_OPTION) {
      setError('Please search and select a supplier / vendor.');
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

      const capQtyNum = capQty ? Number(capQty) : null;
      const atomizerQtyNum = atomizerQty ? Number(atomizerQty) : null;
      const boxQtyNum = boxQty ? Number(boxQty) : null;

      await insertInwardBatch({
        batch_no: batchNo.trim(),
        brand_name: brandName.trim() || null,
        supplier_id: supplierId,
        item_id: inwardItemId,
        received_on: receivedOn,
        qty_received: qtyNum,
        location: location.trim(),
        image_url: finalImageUrl || null,
        color: color.trim() || null,
        cap_item_id: capItemId || null,
        atomizer_item_id: atomizerItemId || null,
        box_item_id: boxItemId || null,
        cap_qty: capQtyNum && !isNaN(capQtyNum) ? capQtyNum : null,
        atomizer_qty: atomizerQtyNum && !isNaN(atomizerQtyNum) ? atomizerQtyNum : null,
        box_qty: boxQtyNum && !isNaN(boxQtyNum) ? boxQtyNum : null,
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
        setAutofilledBatch(null);
        clearPhoto();
        setColor('');
        setCapItemId('');
        setAtomizerItemId('');
        setBoxItemId('');
        setCapQty('');
        setAtomizerQty('');
        setBoxQty('');
        setShowBomSection(false);
        onClose();
      } else {
        // Continuous Entry Mode:
        // Keep shared context (supplierId, brandName, receivedOn, location)
        // Auto-generate fresh unique batch number
        setBatchNo(generateBatchNoString(brandName));
        setQtyReceived('');
        setAutofilledBatch(null);
        clearPhoto();
        // Shift focus to quantity input for instant entry
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
          {/* HEADER SUMMARY & BATCH AUTOFILL QUICK BAR */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
              Log incoming physical shipments from suppliers. Tag the <strong>Client / Brand Name</strong>, generate unique <strong>Batch Numbers</strong>, and allocate warehouse storage bays.
            </p>

            <div className="flex items-center gap-2">
              {batches.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBatchAutofill(!showBatchAutofill)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    showBatchAutofill
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300'
                  }`}
                  title="Search any past batch to autofill Item, Brand, Supplier, and Location in 1-click"
                >
                  <History className="h-3.5 w-3.5" />
                  <span>{showBatchAutofill ? 'Hide Batch Search' : '⚡ Quick-Fill from Past Batch'}</span>
                </button>
              )}

              {sessionBatchCount > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0 animate-in fade-in">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{sessionBatchCount} {sessionBatchCount === 1 ? 'Batch' : 'Batches'} Logged</span>
                </span>
              )}
            </div>
          </div>

          {/* QUICK-FILL FROM PAST BATCH SEARCH DRAWER */}
          {showBatchAutofill && (
            <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-slate-50 to-indigo-50/50 p-3.5 space-y-2.5 animate-in fade-in zoom-in-95 duration-150 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-950">
                    Search Past Batches to Autofill All Fields
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBatchAutofill(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Search input for past batches */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-500 pointer-events-none" />
                <input
                  type="text"
                  value={batchSearchQuery}
                  onChange={(e) => setBatchSearchQuery(e.target.value)}
                  placeholder="Type batch # (e.g. CU9, RC-2608), brand, item name, or vendor to autofill…"
                  className="w-full rounded-xl border border-indigo-300 bg-white pl-9 pr-8 py-2 text-xs sm:text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:border-indigo-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
                  autoFocus
                />
                {batchSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setBatchSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Batch result chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {filteredPastBatches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectExistingBatch(b)}
                    className="text-left p-2.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/60 transition flex items-center justify-between gap-2 cursor-pointer group shadow-2xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-black text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                          {b.batch_no}
                        </span>
                        {b.brand_name && (
                          <span className="text-[10px] font-extrabold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            🏢 {b.brand_name}
                          </span>
                        )}
                        <ItemCategoryBadge category={b.item?.category} />
                      </div>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {b.item?.name ?? 'Stock Item'}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        Vendor: {b.supplier?.name} • Bay: {b.location || 'N/A'}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Autofilled Active Banner */}
          {autofilledBatch && (
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-xs text-indigo-950 animate-in fade-in">
              <div className="flex items-center gap-2 truncate">
                <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
                <span className="truncate">
                  Autofilled specs from past <strong>Batch {autofilledBatch.batch_no}</strong> ({autofilledBatch.brand_name || 'In-House'} • {autofilledBatch.item?.name}). Generated unique lot code for this shipment.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAutofilledBatch(null)}
                className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 shrink-0 ml-2 underline cursor-pointer"
              >
                Clear Tag
              </button>
            </div>
          )}

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
            {/* ROW 1: SEARCHABLE STOCK ITEM SELECTION WITH PROMINENT (+) BUTTON */}
            <Field
              label="1. Stock Item / SKU Received"
              htmlFor="inward-item"
              required
              hint="Search by item name, vendor/supplier, brand, color, category, or click (+) to register new SKU"
            >
              <div className="flex gap-2 items-center">
                <ItemSearchSelect
                  items={localItems}
                  batches={batches}
                  selectedItemId={inwardItemId}
                  onSelectItem={(id) => {
                    setInwardItemId(id);
                    setError(null);
                    // If no supplier or brand selected yet, check if there's a recent batch for this item to save user clicks
                    const recentBatch = batches.find((b) => b.item_id === id);
                    if (recentBatch) {
                      if (!supplierId && recentBatch.supplier_id) {
                        setSupplierId(recentBatch.supplier_id);
                      }
                      if (!brandName && recentBatch.brand_name) {
                        setBrandName(recentBatch.brand_name);
                        generateSmartBatchNo(recentBatch.brand_name);
                      }
                      if (!location && recentBatch.location) {
                        setLocation(recentBatch.location);
                      }
                    }
                  }}
                  onAddNewSku={() => setShowAddItemModal(true)}
                  error={Boolean(error && (!inwardItemId || inwardItemId === NEW_OPTION))}
                  className="flex-1"
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddItemModal(true)}
                  title="Quick-Register New Master Component SKU (+)"
                  className="shrink-0 min-w-[42px] min-h-[42px] text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 cursor-pointer shadow-2xs"
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
                    className={`${inputClass} font-mono font-black text-slate-950 ${isDuplicateBatchNo ? 'border-amber-400 bg-amber-50/50' : ''}`}
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
                {isDuplicateBatchNo && (
                  <p className="mt-1 text-xs font-semibold text-amber-700 flex items-center gap-1 animate-in fade-in">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Batch number already exists. Each shipment must have a unique lot number.
                  </p>
                )}
              </Field>
            </div>

            {/* ROW 3: SEARCHABLE SUPPLIER & QUANTITY WITH PROMINENT (+) BUTTON */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="4. Supplier / Vendor"
                htmlFor="inward-supplier"
                required
                hint="Search supplier or click (+) to add new"
              >
                <div className="flex gap-2 items-center">
                  <SupplierSearchSelect
                    suppliers={localSuppliers}
                    selectedSupplierId={supplierId}
                    onSelectSupplier={(id) => {
                      setSupplierId(id);
                      setError(null);
                    }}
                    onAddNewSupplier={() => setShowSupplierModal(true)}
                    error={Boolean(error && (!supplierId || supplierId === NEW_OPTION))}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSupplierModal(true)}
                    title="Quick-Add New Supplier (+)"
                    className="shrink-0 min-w-[42px] min-h-[42px] text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 cursor-pointer shadow-2xs"
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
                {distinctLocations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {distinctLocations.slice(0, 6).map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => setLocation(loc)}
                        className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-200 transition cursor-pointer"
                      >
                        📍 {loc}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            </div>

            {/* OPTIONAL COMPONENT BOM & PACKAGING ASSIGNMENT */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-600" />
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                      Component BOM & Packaging Intake (Optional)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Attach matching caps, atomizers, boxes, and color received alongside this batch.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBomSection(!showBomSection)}
                  className="text-xs font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                >
                  {showBomSection ? 'Hide BOM ▲' : 'Configure BOM ▼'}
                </Button>
              </div>

              {showBomSection && (
                <div className="pt-2 border-t border-slate-200/60 space-y-3 animate-in fade-in duration-150">
                  {/* Bottle Color / Finish */}
                  <Field label="Bottle Color / Finish" htmlFor="inward-color" hint="e.g. Amber, Clear, Frosted, Matte Black">
                    <input
                      id="inward-color"
                      list="inward-color-suggestions"
                      className={`${inputClass} text-xs font-bold text-slate-900`}
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      placeholder="e.g. Clear, Amber, Matte Black"
                    />
                    <datalist id="inward-color-suggestions">
                      {COMMON_COLORS.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </Field>

                  {/* Caps Intake */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <div className="sm:col-span-2">
                      <Field label="Cap / Closure SKU" htmlFor="inward-cap-sku" hint="Select warehouse cap matching this batch">
                        <select
                          id="inward-cap-sku"
                          className={`${inputClass} text-xs font-bold text-slate-900`}
                          value={capItemId}
                          onChange={(e) => setCapItemId(e.target.value)}
                        >
                          <option value="">-- No Cap Assigned / Separate Inward --</option>
                          {caps.map((c) => {
                            const stock = stockSummaryMap.get(c.id)?.availableStock ?? 0;
                            return (
                              <option key={c.id} value={c.id}>
                                {c.name} {c.color ? `(${c.color})` : ''} — {formatNumber(stock)} {c.unit || 'units'} in wh
                              </option>
                            );
                          })}
                        </select>
                      </Field>
                    </div>
                    <div>
                      <Field label="Cap Intake Qty" htmlFor="inward-cap-qty" hint="Units received">
                        <input
                          id="inward-cap-qty"
                          type="number"
                          min={0}
                          className={`${inputClass} text-xs font-bold text-slate-900`}
                          value={capQty}
                          onChange={(e) => setCapQty(e.target.value)}
                          placeholder="Matches batch"
                        />
                      </Field>
                    </div>
                  </div>

                  {/* Atomizers Intake */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <div className="sm:col-span-2">
                      <Field label="Atomizer / Pump SKU" htmlFor="inward-atom-sku" hint="Select warehouse pump matching this batch">
                        <select
                          id="inward-atom-sku"
                          className={`${inputClass} text-xs font-bold text-slate-900`}
                          value={atomizerItemId}
                          onChange={(e) => setAtomizerItemId(e.target.value)}
                        >
                          <option value="">-- No Atomizer Assigned / Separate Inward --</option>
                          {atomizers.map((a) => {
                            const stock = stockSummaryMap.get(a.id)?.availableStock ?? 0;
                            return (
                              <option key={a.id} value={a.id}>
                                {a.name} {a.color ? `(${a.color})` : ''} — {formatNumber(stock)} {a.unit || 'units'} in wh
                              </option>
                            );
                          })}
                        </select>
                      </Field>
                    </div>
                    <div>
                      <Field label="Atomizer Intake Qty" htmlFor="inward-atom-qty" hint="Units received">
                        <input
                          id="inward-atom-qty"
                          type="number"
                          min={0}
                          className={`${inputClass} text-xs font-bold text-slate-900`}
                          value={atomizerQty}
                          onChange={(e) => setAtomizerQty(e.target.value)}
                          placeholder="Matches batch"
                        />
                      </Field>
                    </div>
                  </div>

                  {/* Boxes Intake */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <div className="sm:col-span-2">
                      <Field label="Box / Mono Carton SKU" htmlFor="inward-box-sku" hint="Select warehouse outer packaging">
                        <select
                          id="inward-box-sku"
                          className={`${inputClass} text-xs font-bold text-slate-900`}
                          value={boxItemId}
                          onChange={(e) => setBoxItemId(e.target.value)}
                        >
                          <option value="">-- No Box Assigned / Separate Inward --</option>
                          {boxes.map((b) => {
                            const stock = stockSummaryMap.get(b.id)?.availableStock ?? 0;
                            return (
                              <option key={b.id} value={b.id}>
                                {b.name} — {formatNumber(stock)} {b.unit || 'units'} in wh
                              </option>
                            );
                          })}
                        </select>
                      </Field>
                    </div>
                    <div>
                      <Field label="Box Intake Qty" htmlFor="inward-box-qty" hint="Units received">
                        <input
                          id="inward-box-qty"
                          type="number"
                          min={0}
                          className={`${inputClass} text-xs font-bold text-slate-900`}
                          value={boxQty}
                          onChange={(e) => setBoxQty(e.target.value)}
                          placeholder="Matches batch"
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              )}
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
                  disabled={submitting || isDuplicateBatchNo}
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
                  disabled={submitting || isDuplicateBatchNo}
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
