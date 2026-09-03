import { useState, useMemo } from 'react';
import { Boxes, PackagePlus, Download, Maximize2, Send, Trash2, Pencil, ArrowRightLeft } from 'lucide-react';
import {
  Card,
  Button,
  SearchInput,
  ItemCategoryBadge,
  ColorBadge,
  TableSkeleton,
  TableScrollContainer,
  EmptyState,
  Modal,
} from '@/components/ui';
import type { BatchWithRelations, BatchAllocationWithRelations } from '@/lib/supabase';
import type { View } from '@/lib/types';
import type { NavigationContext } from '@/components/AppShell';
import { updateInwardBatchBrand } from '@/lib/queries';
import { formatNumber, formatDate, downloadCSV, getTodayDateString, getErrorMessage } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { AllocationsLedgerModal } from './AllocationsLedgerModal';

export type InwardBatchesTabProps = {
  batches: BatchWithRelations[];
  allocations?: BatchAllocationWithRelations[];
  usedBatchIds: Set<string>;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  loading: boolean;
  onOpenInwardModal: () => void;
  onOpenDeleteBatchModal: (batch: BatchWithRelations) => void;
  onOpenAllocateModal: (batch: BatchWithRelations) => void;
  onViewChange?: (view: View, context?: NavigationContext) => void;
  onBatchUpdated?: () => void;
};

export function InwardBatchesTab({
  batches,
  allocations = [],
  usedBatchIds,
  searchQuery,
  onSearchQueryChange,
  loading,
  onOpenInwardModal,
  onOpenDeleteBatchModal,
  onOpenAllocateModal,
  onViewChange,
  onBatchUpdated,
}: InwardBatchesTabProps) {
  const [zoomImage, setZoomImage] = useState<{ url: string; title: string; batchNo?: string } | null>(null);
  const [editingBrandBatch, setEditingBrandBatch] = useState<BatchWithRelations | null>(null);
  const [showAllocationsLedger, setShowAllocationsLedger] = useState(false);
  const [newBrandValue, setNewBrandValue] = useState('');
  const [savingBrand, setSavingBrand] = useState(false);
  const toast = useToast();

  const { allocOutByBatch, allocInByBatch } = useMemo(() => {
    const outMap = new Map<string, number>();
    const inMap = new Map<string, number>();
    for (const a of allocations) {
      if (a.source_batch_id) {
        outMap.set(a.source_batch_id, (outMap.get(a.source_batch_id) || 0) + Number(a.qty || 0));
      }
      if (a.destination_batch_id) {
        inMap.set(a.destination_batch_id, (inMap.get(a.destination_batch_id) || 0) + Number(a.qty || 0));
      }
    }
    return { allocOutByBatch: outMap, allocInByBatch: inMap };
  }, [allocations]);

  const openEditBrand = (b: BatchWithRelations) => {
    setEditingBrandBatch(b);
    setNewBrandValue(b.brand_name || '');
  };

  const handleSaveBrand = async () => {
    if (!editingBrandBatch) return;
    setSavingBrand(true);
    try {
      await updateInwardBatchBrand(editingBrandBatch.id, newBrandValue.trim() || null);
      toast.success(
        newBrandValue.trim()
          ? `Brand set to "${newBrandValue.trim()}" for Batch ${editingBrandBatch.batch_no}.`
          : `Batch ${editingBrandBatch.batch_no} set to In-House / No Brand.`,
        'Brand Updated'
      );
      setEditingBrandBatch(null);
      if (onBatchUpdated) onBatchUpdated();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update brand'), 'Update Error');
    } finally {
      setSavingBrand(false);
    }
  };


  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        b.batch_no.toLowerCase().includes(q) ||
        (b.brand_name ?? '').toLowerCase().includes(q) ||
        (b.supplier?.name ?? '').toLowerCase().includes(q) ||
        (b.item?.name ?? '').toLowerCase().includes(q) ||
        (b.item?.category ?? '').toLowerCase().includes(q) ||
        (b.location ?? '').toLowerCase().includes(q) ||
        (b.color ?? '').toLowerCase().includes(q)
      );
    });
  }, [batches, searchQuery]);

  const exportInwardBatchesCSV = () => {
    if (batches.length === 0) return;
    try {
      const headers = [
        'Brand / Party Name',
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
        b.brand_name || '',
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
    } catch {
      toast.error('Failed to export batches CSV', 'Export Failed');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-0 overflow-hidden shadow-xs border-slate-200 bg-white">
        {/* Header Controls */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-950 flex items-center gap-2">
                <Boxes className="h-5 w-5 text-emerald-600" />
                Inward Batches & Receipts Ledger
              </h2>
              <span className="bg-emerald-100 text-emerald-950 font-black text-xs px-2.5 py-0.5 rounded-full border border-emerald-200">
                {filteredBatches.length} Batches Logged
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Every received shipment batch with its Client / Brand name, lot code, warehouse bay, and 1-click launch into the Outward Journey pipeline.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllocationsLedger(true)}
              className="text-xs font-bold text-teal-800 bg-teal-50/60 hover:bg-teal-100 border-teal-200 shadow-2xs cursor-pointer inline-flex items-center gap-1"
              title="View complete stock allocation audit trail across all batches"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 text-teal-600" />
              Allocations Ledger
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportInwardBatchesCSV}
              className="text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 shadow-2xs cursor-pointer"
              title="Download inward batches CSV"
            >
              <Download className="h-3.5 w-3.5 mr-1 text-slate-500" />
              Export CSV
            </Button>
            <div className="w-64">
              <SearchInput
                value={searchQuery}
                onChange={onSearchQueryChange}
                placeholder="Search brand, batch #, supplier…"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenInwardModal}
              className="text-xs font-bold py-1.5 px-3 bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs shrink-0 cursor-pointer"
            >
              <PackagePlus className="h-3.5 w-3.5 mr-1 text-emerald-100" />
              + Inward Stock
            </Button>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : filteredBatches.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              icon={Boxes}
              title="No Inward Batches Found"
              description={
                searchQuery
                  ? 'No batches match your active search filter. Try clearing the search box.'
                  : 'No inward stock batches have been logged yet. Use the "+ Inward Stock" button above to log your first shipment.'
              }
            />
          </div>
        ) : (
          <div>
            {/* ─── Mobile View: Batches Cards (< sm) ─── */}
            <div className="p-3.5 space-y-3 sm:hidden">
              {filteredBatches.map((b) => {
                const isUsed = usedBatchIds.has(b.id);
                return (
                  <Card key={`mobile-batch-${b.id}`} className="p-4 border-slate-200 shadow-2xs space-y-3">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5">
                        {b.image_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              setZoomImage({
                                url: b.image_url!,
                                title: b.item?.name ?? 'Shipment Photo',
                                batchNo: b.batch_no,
                              })
                            }
                            className="relative group shrink-0 cursor-pointer"
                          >
                            <img
                              src={b.image_url}
                              alt={b.batch_no}
                              className="h-12 w-12 rounded-xl object-cover border border-slate-200 shadow-2xs"
                            />
                            <div className="absolute inset-0 bg-black/30 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                              <Maximize2 className="h-3.5 w-3.5 text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                            IMG
                          </div>
                        )}

                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {b.brand_name ? (
                              <button
                                type="button"
                                onClick={() => openEditBrand(b)}
                                className="font-extrabold text-amber-950 bg-amber-100 border border-amber-300/80 px-2 py-0.5 rounded-md text-xs inline-flex items-center gap-1 cursor-pointer hover:bg-amber-200 transition shadow-2xs"
                                title="Click to edit brand"
                              >
                                🏢 {b.brand_name}
                                <Pencil className="h-2.5 w-2.5 opacity-60" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openEditBrand(b)}
                                className="text-slate-500 text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition cursor-pointer inline-flex items-center gap-1"
                                title="Click to assign a brand name"
                              >
                                + Add Brand
                              </button>
                            )}
                            <span className="font-mono font-black text-slate-900 text-sm">
                              {b.batch_no}
                            </span>
                          </div>
                          <p className="font-bold text-slate-950 text-xs mt-1">
                            {b.item?.name ?? 'Stock Item'}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Supplier: <strong>{b.supplier?.name ?? '—'}</strong> • Bay: <strong>{b.location}</strong>
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-base font-black text-emerald-700">
                          {formatNumber(b.qty_received)}
                        </p>
                        <p className="text-[10px] font-bold text-slate-500">{b.item?.unit || 'pcs'}</p>
                        {((allocOutByBatch.get(b.id) || 0) > 0 || (allocInByBatch.get(b.id) || 0) > 0) && (
                          <p className="text-[10px] font-bold text-amber-700 mt-0.5">
                            Net: {formatNumber(Math.max(0, b.qty_received - (allocOutByBatch.get(b.id) || 0) + (allocInByBatch.get(b.id) || 0)))}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* BOM Components Row if attached */}
                    {(b.cap_item || b.atomizer_item || b.box_item) && (
                      <div className="flex flex-wrap gap-1 p-2 bg-slate-50 rounded-xl border border-slate-100 text-[11px] font-medium text-slate-700">
                        {b.cap_item && <span>🧴 Cap: {b.cap_item.name} ({formatNumber(b.cap_qty || b.qty_received)})</span>}
                        {b.atomizer_item && <span>💨 Atomizer: {b.atomizer_item.name} ({formatNumber(b.atomizer_qty || b.qty_received)})</span>}
                        {b.box_item && <span>📦 Box: {b.box_item.name} ({formatNumber(b.box_qty || b.qty_received)})</span>}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-500 font-medium">
                        Received {formatDate(b.received_on)}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenAllocateModal(b)}
                          className="text-xs font-bold text-teal-800 border-teal-300 bg-teal-50/70 hover:bg-teal-100 min-h-[34px] cursor-pointer inline-flex items-center gap-1"
                          title="Allocate stock from this batch to another batch"
                        >
                          <ArrowRightLeft className="h-3 w-3 text-teal-600" />
                          Allocate
                        </Button>
                        {onViewChange && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => onViewChange('outward', { batchId: b.id })}
                            className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white min-h-[34px] cursor-pointer"
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Pipeline ➔
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenDeleteBatchModal(b)}
                          className="rounded-xl min-w-[34px] min-h-[34px] flex items-center justify-center text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer"
                          title={isUsed ? 'Cannot delete batch with movement or allocation history' : 'Delete batch'}
                          aria-label={`Delete batch ${b.batch_no}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* ─── Desktop View: Batches Table (>= sm) ─── */}
            <div className="hidden sm:block">
              <TableScrollContainer className="border-0 rounded-none">
                <table className="w-full text-left border-collapse min-w-[1100px]">
                  <thead className="bg-slate-100/90 text-slate-700 text-[11px] font-black uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-3.5 py-3 w-10 text-center text-slate-400">#</th>
                      <th className="px-3.5 py-3">Photo</th>
                      <th className="px-4 py-3">Brand / Party</th>
                      <th className="px-4 py-3 font-mono">Batch No</th>
                      <th className="px-4 py-3 min-w-[200px]">Primary Stock Item</th>
                      <th className="px-3.5 py-3">Supplier</th>
                      <th className="px-3.5 py-3 text-right">Qty Received</th>
                      <th className="px-3.5 py-3">Warehouse Bay</th>
                      <th className="px-3.5 py-3 min-w-[180px]">BOM Components</th>
                      <th className="px-3.5 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Production Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium bg-white">
                    {filteredBatches.map((b, index) => {
                      const isUsed = usedBatchIds.has(b.id);
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/90 transition-colors group">
                          <td className="px-3.5 py-3 text-center font-bold text-slate-400 text-[11px]">
                            {index + 1}
                          </td>

                          <td className="px-3.5 py-3">
                            {b.image_url ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setZoomImage({
                                    url: b.image_url!,
                                    title: b.item?.name ?? 'Shipment Photo',
                                    batchNo: b.batch_no,
                                  })
                                }
                                className="relative group/img shrink-0 cursor-pointer block"
                                title="Click to zoom image"
                              >
                                <img
                                  src={b.image_url}
                                  alt={b.batch_no}
                                  className="h-10 w-10 rounded-lg object-cover border border-slate-200 shadow-2xs group-hover/img:scale-105 transition"
                                />
                                <div className="absolute inset-0 bg-black/30 rounded-lg opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition">
                                  <Maximize2 className="h-3 w-3 text-white" />
                                </div>
                              </button>
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-400">
                                —
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 group/brand">
                              {b.brand_name ? (
                                <span className="inline-flex items-center gap-1 font-black text-amber-950 bg-amber-100 border border-amber-300/80 px-2.5 py-1 rounded-lg text-xs shadow-2xs">
                                  🏢 {b.brand_name}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                                  In-House
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => openEditBrand(b)}
                                className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition cursor-pointer opacity-0 group-hover/brand:opacity-100"
                                title="Edit or assign brand name"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          </td>

                          <td className="px-4 py-3 font-mono font-black text-slate-900 text-xs whitespace-nowrap">
                            <span className="bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-md">
                              {b.batch_no}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <p className="font-bold text-slate-950 text-xs leading-snug">
                                {b.item?.name ?? 'Stock Item'}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <ItemCategoryBadge category={b.item?.category} />
                                <ColorBadge color={b.color} />
                              </div>
                            </div>
                          </td>

                          <td className="px-3.5 py-3 whitespace-nowrap font-medium text-slate-700">
                            {b.supplier?.name ?? '—'}
                          </td>

                          <td className="px-3.5 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex flex-col items-end">
                              <span className="font-black text-emerald-950 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs shadow-2xs">
                                {formatNumber(b.qty_received)} <span className="text-[10px] font-normal text-slate-500">{b.item?.unit || 'pcs'}</span>
                              </span>
                              {((allocOutByBatch.get(b.id) || 0) > 0 || (allocInByBatch.get(b.id) || 0) > 0) && (
                                <div className="flex items-center gap-1 mt-1 text-[10px] font-bold">
                                  {(allocOutByBatch.get(b.id) || 0) > 0 && (
                                    <span className="text-amber-800 bg-amber-50 border border-amber-200 px-1 rounded" title="Allocated Out">
                                      -{formatNumber(allocOutByBatch.get(b.id) || 0)}
                                    </span>
                                  )}
                                  {(allocInByBatch.get(b.id) || 0) > 0 && (
                                    <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-1 rounded" title="Allocated In">
                                      +{formatNumber(allocInByBatch.get(b.id) || 0)}
                                    </span>
                                  )}
                                  <span className="text-slate-500 font-medium">
                                    net: {formatNumber(Math.max(0, b.qty_received - (allocOutByBatch.get(b.id) || 0) + (allocInByBatch.get(b.id) || 0)))}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="px-3.5 py-3 whitespace-nowrap font-semibold text-slate-700">
                            {b.location}
                          </td>

                          <td className="px-3.5 py-3">
                            {(b.cap_item || b.atomizer_item || b.box_item) ? (
                              <div className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                                {b.cap_item && <span>🧴 {b.cap_item.name}</span>}
                                {b.atomizer_item && <span>💨 {b.atomizer_item.name}</span>}
                                {b.box_item && <span>📦 {b.box_item.name}</span>}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>

                          <td className="px-3.5 py-3 whitespace-nowrap text-slate-600">
                            {formatDate(b.received_on)}
                          </td>

                          <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onOpenAllocateModal(b)}
                              className="text-[11px] py-1 px-2.5 font-bold text-teal-800 border-teal-300 bg-teal-50/70 hover:bg-teal-100 shadow-2xs cursor-pointer inline-flex items-center gap-1"
                              title="Allocate stock from this batch to another batch"
                            >
                              <ArrowRightLeft className="h-3 w-3 text-teal-600" />
                              Allocate
                            </Button>
                            {onViewChange && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => onViewChange('outward', { batchId: b.id })}
                                className="text-[11px] py-1 px-3 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs cursor-pointer"
                                title="Open batch directly in Outward Journey Pipeline"
                              >
                                <Send className="h-3 w-3 mr-1" />
                                Launch Pipeline ➔
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onOpenDeleteBatchModal(b)}
                              className="text-[11px] py-1 px-2 font-bold text-rose-700 border-rose-300 bg-rose-50/50 hover:bg-rose-100 shadow-2xs cursor-pointer"
                              title={isUsed ? 'Cannot delete batch with movement or allocation history' : 'Delete inward batch'}
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

      {/* Image Zoom Modal */}
      {zoomImage && (
        <Modal
          isOpen={Boolean(zoomImage)}
          onClose={() => setZoomImage(null)}
          title={`${zoomImage.batchNo ? `Batch ${zoomImage.batchNo} — ` : ''}${zoomImage.title}`}
          maxWidthClass="max-w-3xl"
        >
          <div className="flex flex-col items-center justify-center p-2">
            <img
              src={zoomImage.url}
              alt={zoomImage.title}
              className="max-h-[70vh] w-auto rounded-2xl object-contain shadow-xl border border-slate-200"
            />
          </div>
        </Modal>
      )}

      {/* Quick Edit Brand Modal */}
      {editingBrandBatch && (
        <Modal
          isOpen={Boolean(editingBrandBatch)}
          onClose={() => setEditingBrandBatch(null)}
          title={`Edit Brand / Party: Batch ${editingBrandBatch.batch_no}`}
          maxWidthClass="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              Assign or update the Client / Brand name for this batch. This ensures it displays properly in the Outward Journey and search filters.
            </p>

            <div>
              <label htmlFor="batch-brand-edit" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Client / Brand Name
              </label>
              <input
                id="batch-brand-edit"
                type="text"
                value={newBrandValue}
                onChange={(e) => setNewBrandValue(e.target.value)}
                placeholder="e.g. Royal Club, Bella Vita, FNF (or leave blank for In-House)"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveBrand();
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingBrandBatch(null)}
                disabled={savingBrand}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveBrand}
                disabled={savingBrand}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              >
                {savingBrand ? 'Saving…' : 'Save Brand'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Allocations Ledger Modal */}
      {showAllocationsLedger && (
        <AllocationsLedgerModal
          isOpen={showAllocationsLedger}
          onClose={() => setShowAllocationsLedger(false)}
        />
      )}
    </div>
  );
}

