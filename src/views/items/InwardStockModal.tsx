import { useState, useEffect, useCallback } from 'react';
import { PackagePlus, Sparkles, PlusCircle, Layers, AlertTriangle } from 'lucide-react';
import { Modal, Field, inputClass, Button, ErrorBanner, Dropzone, ColorChipsInput } from '@/components/ui';
import { insertInwardBatch } from '@/lib/queries';
import { supabase, COMMON_COLORS, type Item, type Supplier, type ComponentStockSummary } from '@/lib/supabase';
import { getErrorMessage, formatNumber, getTodayDateString } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { QuickSupplierModal } from './QuickSupplierModal';
import { NEW_OPTION, MAX_IMAGE_BYTES } from './types';

export type InwardStockModalProps = {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  suppliers: Supplier[];
  caps: Item[];
  atomizers: Item[];
  boxes: Item[];
  stockSummaryMap?: Map<string, ComponentStockSummary>;
  preselectedItemId?: string;
  onBatchCreated: () => void;
  onSupplierCreated: (newSupplier: Supplier) => void;
};

export function InwardStockModal({
  isOpen,
  onClose,
  items,
  suppliers,
  caps,
  atomizers,
  boxes,
  stockSummaryMap,
  preselectedItemId,
  onBatchCreated,
  onSupplierCreated,
}: InwardStockModalProps) {
  const [inwardItemId, setInwardItemId] = useState(preselectedItemId || (items.length > 0 ? items[0].id : ''));
  const [brandName, setBrandName] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [supplierId, setSupplierId] = useState(suppliers.length === 1 ? suppliers[0].id : '');
  const [receivedOn, setReceivedOn] = useState(getTodayDateString());
  const [qtyReceived, setQtyReceived] = useState('');
  const [location, setLocation] = useState('');
  const [batchColor, setBatchColor] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Attached BOM Components
  const [showBomSection, setShowBomSection] = useState(false);
  const [capItemId, setCapItemId] = useState('');
  const [atomizerItemId, setAtomizerItemId] = useState('');
  const [boxItemId, setBoxItemId] = useState('');
  const [capQty, setCapQty] = useState('');
  const [atomizerQty, setAtomizerQty] = useState('');
  const [boxQty, setBoxQty] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  const toast = useToast();

  const generateSmartBatchNo = useCallback((currentBrand?: string) => {
    const brandPrefix = (currentBrand !== undefined ? currentBrand : brandName)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3) || 'BAT';
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    setBatchNo(`${brandPrefix}-${yy}${mm}-${rand}`);
  }, [brandName]);

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialId = preselectedItemId || (items.length > 0 ? items[0].id : '');
      setInwardItemId(initialId);
      const sel = items.find((i) => i.id === initialId);
      if (sel?.color) {
        setBatchColor(sel.color);
      } else {
        setBatchColor('');
      }

      if (suppliers.length === 1) {
        setSupplierId(suppliers[0].id);
      } else if (!supplierId && suppliers.length > 0) {
        setSupplierId('');
      }

      // Auto-generate a batch number if not already present
      if (!batchNo) {
        generateSmartBatchNo();
      }
      setReceivedOn(getTodayDateString());
      setError(null);
    } else {
      // Clear form when closed
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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!inwardItemId) {
      setError('Please select a stock item / SKU.');
      return;
    }
    if (!batchNo.trim()) {
      setError('Batch number / Lot identifier is required.');
      return;
    }
    if (!supplierId) {
      setError('Please select a supplier.');
      return;
    }
    const qtyNum = Number(qtyReceived);
    if (!qtyReceived || !Number.isInteger(qtyNum) || qtyNum <= 0) {
      setError('Quantity received must be a positive whole number.');
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

    // Validate attached component stock availability
    if (stockSummaryMap) {
      if (capItemId) {
        const requiredCapQty = capQty ? Number(capQty) : qtyNum;
        const capSum = stockSummaryMap.get(capItemId);
        const capAvail = capSum?.availableStock ?? 0;
        if (capAvail < requiredCapQty) {
          const capName = caps.find((c) => c.id === capItemId)?.name || 'Selected Cap';
          setError(
            `Insufficient Cap Stock: "${capName}" has only ${formatNumber(capAvail)} units available in warehouse buffer, but this batch requires ${formatNumber(requiredCapQty)}.`
          );
          return;
        }
      }

      if (atomizerItemId) {
        const requiredAtomQty = atomizerQty ? Number(atomizerQty) : qtyNum;
        const atomSum = stockSummaryMap.get(atomizerItemId);
        const atomAvail = atomSum?.availableStock ?? 0;
        if (atomAvail < requiredAtomQty) {
          const atomName = atomizers.find((a) => a.id === atomizerItemId)?.name || 'Selected Atomizer';
          setError(
            `Insufficient Atomizer Stock: "${atomName}" has only ${formatNumber(atomAvail)} units available in warehouse buffer, but this batch requires ${formatNumber(requiredAtomQty)}.`
          );
          return;
        }
      }

      if (boxItemId) {
        const requiredBoxQty = boxQty ? Number(boxQty) : qtyNum;
        const boxSum = stockSummaryMap.get(boxItemId);
        const boxAvail = boxSum?.availableStock ?? 0;
        if (boxAvail < requiredBoxQty) {
          const boxName = boxes.find((b) => b.id === boxItemId)?.name || 'Selected Box';
          setError(
            `Insufficient Box / Packaging Stock: "${boxName}" has only ${formatNumber(boxAvail)} units available in warehouse buffer, but this batch requires ${formatNumber(requiredBoxQty)}.`
          );
          return;
        }
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
        batch_no: batchNo.trim(),
        brand_name: brandName.trim() || null,
        supplier_id: supplierId,
        item_id: inwardItemId,
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

      const selectedItem = items.find((i) => i.id === inwardItemId);
      const batchTitle = brandName.trim()
        ? `[${brandName.trim()}] Batch ${batchNo.trim()}`
        : `Batch ${batchNo.trim()}`;

      toast.success(
        `${batchTitle} logged with ${formatNumber(qtyNum)} ${selectedItem?.unit || 'units'} (${selectedItem?.name || 'Stock Item'}).`,
        'Inward Stock Logged'
      );

      // Reset
      setBatchNo('');
      setBrandName('');
      setQtyReceived('');
      setLocation('');
      setBatchColor('');
      setCapItemId('');
      setAtomizerItemId('');
      setBoxItemId('');
      setCapQty('');
      setAtomizerQty('');
      setBoxQty('');
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

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Inward Stock Receiving & Batch Creation"
        maxWidthClass="max-w-3xl"
      >
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          className="space-y-4"
        >
          <p className="text-xs text-slate-600 leading-relaxed border-b border-slate-100 pb-3">
            Log incoming physical shipments from suppliers. Tag the <strong>Client / Brand Name</strong>, generate a unique <strong>Batch No</strong>, allocate warehouse bays, and attach optional Bill of Materials components (caps, atomizers, packaging).
          </p>

          {/* Row 1: Stock Item Selection */}
          <Field label="1. Stock Item / SKU Received" htmlFor="inward-item" required hint="Select the primary bottle, component, or raw material">
            <select
              id="inward-item"
              className={`${inputClass} font-bold text-slate-950 bg-slate-50 focus:bg-white`}
              value={inwardItemId}
              onChange={(e) => {
                setInwardItemId(e.target.value);
                const sel = items.find((i) => i.id === e.target.value);
                if (sel?.color) setBatchColor(sel.color);
              }}
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
                  // Update batch number prefix if batchNo was auto-generated
                  if (!batchNo || batchNo.startsWith('BAT-') || batchNo.startsWith('RC-')) {
                    generateSmartBatchNo(e.target.value);
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
                  className="shrink-0 text-xs font-bold text-indigo-700 border-indigo-300 bg-indigo-50 hover:bg-indigo-100"
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
                value={qtyReceived}
                onChange={(e) => setQtyReceived(e.target.value)}
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
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Warehouse Bay A-1, Rack 4"
                required
              />
            </Field>
          </div>

          {/* Row 5: Finish / Color Chips */}
          <Field label="8. Finish / Color Coating (Optional)" htmlFor="inward-color" hint="Select color finish chip or type custom">
            <ColorChipsInput
              value={batchColor}
              onChange={setBatchColor}
              colors={COMMON_COLORS}
              placeholder="e.g. Frosted Blue, Electroplated Gold, Gloss Black…"
            />
          </Field>

          {/* Collapsible Section: Attached BOM Components */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <button
              type="button"
              onClick={() => setShowBomSection((prev) => !prev)}
              className="w-full flex items-center justify-between text-xs font-bold text-slate-800 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-600" />
                <span>Attached Bill of Materials (Caps, Atomizers, Packaging Boxes)</span>
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded">Optional</span>
              </div>
              <span className="text-xs font-black text-indigo-600">
                {showBomSection ? '▲ Hide' : '▼ Expand'}
              </span>
            </button>

            {showBomSection && (
              <div className="pt-2 border-t border-slate-200/70 grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Cap Item */}
                <div className="space-y-1.5 p-2.5 bg-white rounded-xl border border-slate-200">
                  <label className="text-[11px] font-bold text-slate-700 block">🧴 Cap / Closure</label>
                  <select
                    className={`${inputClass} text-xs`}
                    value={capItemId}
                    onChange={(e) => {
                      setCapItemId(e.target.value);
                      if (e.target.value && !capQty && qtyReceived) {
                        setCapQty(qtyReceived);
                      }
                    }}
                  >
                    <option value="">No cap attached…</option>
                    {caps.map((c) => {
                      const avail = stockSummaryMap?.get(c.id)?.availableStock;
                      const availText = avail !== undefined ? ` — ${avail <= 0 ? '0 available [OUT OF STOCK]' : `${formatNumber(avail)} available`}` : '';
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name}{availText}
                        </option>
                      );
                    })}
                  </select>
                  {capItemId && (
                    <>
                      <input
                        type="number"
                        min={1}
                        className={`${inputClass} text-xs font-bold mt-1`}
                        value={capQty}
                        onChange={(e) => setCapQty(e.target.value)}
                        placeholder={`Qty (defaults to ${qtyReceived || 'batch qty'})`}
                      />
                      {(() => {
                        const avail = stockSummaryMap?.get(capItemId)?.availableStock;
                        const req = Number(capQty) || Number(qtyReceived) || 0;
                        if (avail !== undefined && req > avail) {
                          return (
                            <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span>Only {formatNumber(avail)} available in warehouse</span>
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </>
                  )}
                </div>

                {/* Atomizer Item */}
                <div className="space-y-1.5 p-2.5 bg-white rounded-xl border border-slate-200">
                  <label className="text-[11px] font-bold text-slate-700 block">💨 Atomizer / Pump</label>
                  <select
                    className={`${inputClass} text-xs`}
                    value={atomizerItemId}
                    onChange={(e) => {
                      setAtomizerItemId(e.target.value);
                      if (e.target.value && !atomizerQty && qtyReceived) {
                        setAtomizerQty(qtyReceived);
                      }
                    }}
                  >
                    <option value="">No atomizer attached…</option>
                    {atomizers.map((a) => {
                      const avail = stockSummaryMap?.get(a.id)?.availableStock;
                      const availText = avail !== undefined ? ` — ${avail <= 0 ? '0 available [OUT OF STOCK]' : `${formatNumber(avail)} available`}` : '';
                      return (
                        <option key={a.id} value={a.id}>
                          {a.name}{availText}
                        </option>
                      );
                    })}
                  </select>
                  {atomizerItemId && (
                    <>
                      <input
                        type="number"
                        min={1}
                        className={`${inputClass} text-xs font-bold mt-1`}
                        value={atomizerQty}
                        onChange={(e) => setAtomizerQty(e.target.value)}
                        placeholder={`Qty (defaults to ${qtyReceived || 'batch qty'})`}
                      />
                      {(() => {
                        const avail = stockSummaryMap?.get(atomizerItemId)?.availableStock;
                        const req = Number(atomizerQty) || Number(qtyReceived) || 0;
                        if (avail !== undefined && req > avail) {
                          return (
                            <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span>Only {formatNumber(avail)} available in warehouse</span>
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </>
                  )}
                </div>

                {/* Box Item */}
                <div className="space-y-1.5 p-2.5 bg-white rounded-xl border border-slate-200">
                  <label className="text-[11px] font-bold text-slate-700 block">📦 Box / Packaging</label>
                  <select
                    className={`${inputClass} text-xs`}
                    value={boxItemId}
                    onChange={(e) => {
                      setBoxItemId(e.target.value);
                      if (e.target.value && !boxQty && qtyReceived) {
                        setBoxQty(qtyReceived);
                      }
                    }}
                  >
                    <option value="">No packaging box attached…</option>
                    {boxes.map((bx) => {
                      const avail = stockSummaryMap?.get(bx.id)?.availableStock;
                      const availText = avail !== undefined ? ` — ${avail <= 0 ? '0 available [OUT OF STOCK]' : `${formatNumber(avail)} available`}` : '';
                      return (
                        <option key={bx.id} value={bx.id}>
                          {bx.name}{availText}
                        </option>
                      );
                    })}
                  </select>
                  {boxItemId && (
                    <>
                      <input
                        type="number"
                        min={1}
                        className={`${inputClass} text-xs font-bold mt-1`}
                        value={boxQty}
                        onChange={(e) => setBoxQty(e.target.value)}
                        placeholder={`Qty (defaults to ${qtyReceived || 'batch qty'})`}
                      />
                      {(() => {
                        const avail = stockSummaryMap?.get(boxItemId)?.availableStock;
                        const req = Number(boxQty) || Number(qtyReceived) || 0;
                        if (avail !== undefined && req > avail) {
                          return (
                            <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span>Only {formatNumber(avail)} available in warehouse</span>
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Shipment Photo Upload Dropzone */}
          <Field label="9. Shipment / Sample Photo (Optional)" htmlFor="dropzone" hint="Upload QC or warehouse intake photo (max 10MB)">
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
