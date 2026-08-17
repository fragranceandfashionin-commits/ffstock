import { useEffect, useState } from 'react';
import { PackagePlus, Save, Trash2, PlusCircle } from 'lucide-react';
import { Card, PageHeader, Spinner, ErrorBanner, Field, inputClass, Button, SearchInput, Dropzone, Modal } from '@/components/ui';
import { fetchBatches, fetchItems, fetchSuppliers, fetchUsedBatchIds } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { BatchWithRelations, Item, Supplier } from '@/lib/supabase';
import { formatNumber, formatDate, getErrorMessage, getTodayDateString } from '@/lib/utils';

const NEW_OPTION = '__new__';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export function InwardView() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [batches, setBatches] = useState<BatchWithRelations[] | null>(null);
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
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [usedBatchIds, setUsedBatchIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Quick-add modals state
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, i, b, used] = await Promise.all([fetchSuppliers(), fetchItems(), fetchBatches(), fetchUsedBatchIds()]);
      setSuppliers(s);
      setItems(i);
      setBatches(b);
      setUsedBatchIds(used);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // -- Realtime live syncing across multi-user terminals --
  useEffect(() => {
    const channel = supabase
      .channel('inward-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inward_batches' },
        () => {
          load();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'suppliers' },
        () => {
          load();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
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

  const handleDelete = async (b: BatchWithRelations) => {
    setDeleteError(null);
    if (!confirm(`Delete batch ${b.batch_no}? This only works if it has no movements or dispatches yet.`)) return;
    try {
      const { error: deleteErr } = await supabase.from('inward_batches').delete().eq('id', b.id);
      if (deleteErr) throw deleteErr;

      // Clean up storage photo if one was uploaded
      if (b.image_url && b.image_url.includes('/batch-images/')) {
        const imagePath = b.image_url.split('/batch-images/')[1];
        if (imagePath) {
          await supabase.storage.from('batch-images').remove([decodeURIComponent(imagePath)]).catch(() => {});
        }
      }

      setSuccess(`Batch ${b.batch_no} deleted.`);
      await load();
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Failed to delete batch'));
    }
  };

  const handleAddSupplierQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) return;
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({ name: newSupplierName.trim() })
        .select('id')
        .single();
      if (error) throw error;
      await load();
      setSupplierId(data.id);
      setNewSupplierName('');
      setShowSupplierModal(false);
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to add supplier'));
    }
  };

  const handleAddItemQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    try {
      const { data, error } = await supabase
        .from('items')
        .insert({ name: newItemName.trim() })
        .select('id')
        .single();
      if (error) throw error;
      await load();
      setItemId(data.id);
      setNewItemName('');
      setShowItemModal(false);
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to add item'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!batchNo.trim() || !supplierId || !itemId || !qty || !location.trim()) {
      setFormError('Please fill all required fields.');
      return;
    }
    const qtyNum = Number(qty);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      setFormError('Quantity must be a positive whole number.');
      return;
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

      const { error: insertError } = await supabase.from('inward_batches').insert({
        batch_no: batchNo.trim(),
        supplier_id: supplierId,
        item_id: itemId,
        received_on: receivedOn,
        qty_received: qtyNum,
        location: location.trim(),
        image_url: finalImageUrl || null,
      });
      if (insertError) {
        if (uploadedPath) {
          await supabase.storage.from('batch-images').remove([uploadedPath]).catch(() => {});
        }
        throw insertError;
      }

      setSuccess(`Batch ${batchNo.trim()} created with ${formatNumber(qtyNum)} units.`);
      setBatchNo('');
      setQty('');
      setLocation('');
      clearPhoto();
      await load();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to create batch'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner label="Loading inward entry module…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!suppliers || !items || !batches) return null;

  const filteredBatches = batches.filter((b) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      b.batch_no.toLowerCase().includes(q) ||
      (b.supplier?.name ?? '').toLowerCase().includes(q) ||
      (b.item?.name ?? '').toLowerCase().includes(q) ||
      b.location.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Inward Stock Entry"
        subtitle="Log incoming stock by Brand Name, Party Name, or Batch Code with supplier, received date, quantity, storage location, and bottle photo."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Form Card (5 cols) */}
        <Card className="lg:col-span-5 h-fit">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Step 1: Enter Brand / Party (Batch) Details
            </h2>

            <Field
              label="Brand Name / Party Name (Batch Code)"
              htmlFor="batch_no"
              required
              hint="e.g. Brand name, Party name, or Batch identifier"
            >
              <input
                id="batch_no"
                className={inputClass}
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="e.g. Royal Club, Dhirendra Beverage, BATCH-01"
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
                  className="shrink-0"
                >
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </div>
            </Field>

            <Field label="Item / Bottle Type" htmlFor="item" required>
              <div className="flex gap-2">
                <select
                  id="item"
                  className={inputClass}
                  value={itemId}
                  onChange={(e) => {
                    if (e.target.value === NEW_OPTION) {
                      setShowItemModal(true);
                    } else {
                      setItemId(e.target.value);
                    }
                  }}
                  required
                >
                  <option value="">Select bottle item…</option>
                  <option value={NEW_OPTION}>➕ Add new item…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowItemModal(true)}
                  title="Add new item"
                  className="shrink-0"
                >
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
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

              <Field label="Quantity Received" htmlFor="qty" required>
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

            <Field label="Warehouse Location" htmlFor="location" required hint="e.g. Rack A-12 or Shelf 4">
              <input
                id="location"
                className={inputClass}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Rack A-12"
                required
              />
            </Field>

            <Field label="Bottle Shipment Photo" hint="Attach a photo of the received shipment for audit.">
              <Dropzone
                previewUrl={imageFile ? imagePreview : imageUrl}
                onFileSelect={handleFileSelect}
                onClear={clearPhoto}
              />
            </Field>

            {formError && <ErrorBanner message={formError} />}
            {success && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                ✅ {success}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="submit" variant="primary" loading={submitting} className="w-full">
                <Save className="h-4 w-4" />
                Save Inward Batch
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setBatchNo('');
                  setQty('');
                  setLocation('');
                  clearPhoto();
                  setSuccess(null);
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <PackagePlus className="h-5 w-5 text-slate-500" />
              Recorded Inward Batches
            </h2>
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search inward batches…" />
          </div>

          {deleteError && <ErrorBanner message={deleteError} />}

          {filteredBatches.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500 text-center py-6">
                No inward batches match your search criteria.
              </p>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3.5 py-3">Photo</th>
                    <th className="px-3.5 py-3">Brand / Party (Batch)</th>
                    <th className="px-3.5 py-3">Item / Bottle</th>
                    <th className="px-3.5 py-3">Supplier</th>
                    <th className="px-3.5 py-3">Location</th>
                    <th className="px-3.5 py-3">Date</th>
                    <th className="px-3.5 py-3 text-right">Qty</th>
                    <th className="px-3.5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
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
                      <td className="px-3.5 py-3 text-slate-700 font-medium">{b.item?.name ?? '—'}</td>
                      <td className="px-3.5 py-3 text-slate-600">{b.supplier?.name ?? '—'}</td>
                      <td className="px-3.5 py-3 text-slate-600 font-medium">{b.location}</td>
                      <td className="px-3.5 py-3 text-slate-500 text-xs">{formatDate(b.received_on)}</td>
                      <td className="px-3.5 py-3 text-right font-extrabold text-slate-900">
                        {formatNumber(b.qty_received)}
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(b)}
                          disabled={usedBatchIds.has(b.id)}
                          title={
                            usedBatchIds.has(b.id)
                              ? 'Batch has movements or dispatches — ledger history cannot be deleted'
                              : 'Delete batch entry'
                          }
                          className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
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
        <form onSubmit={handleAddSupplierQuick} className="flex flex-col gap-4">
          <Field label="Supplier Name" required hint="e.g. Apex Glassworks Ltd">
            <input
              className={inputClass}
              placeholder="Apex Glassworks Ltd"
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              autoFocus
              required
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
        title="Quick Add New Bottle Item"
      >
        <form onSubmit={handleAddItemQuick} className="flex flex-col gap-4">
          <Field label="Bottle Item Description" required hint="e.g. 500ml Clear Wine Bottle">
            <input
              className={inputClass}
              placeholder="500ml Clear Wine Bottle"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              autoFocus
              required
            />
          </Field>
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
    </div>
  );
}

