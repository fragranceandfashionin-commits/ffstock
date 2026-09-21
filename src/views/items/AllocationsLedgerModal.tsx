import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowRightLeft,
  History,
  Download,
  Search,
  Calendar,
  User,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { Modal, Button, EmptyState, Field, inputClass } from '@/components/ui';
import { fetchBatchAllocations, reverseBatchAllocation } from '@/lib/queries';
import type { BatchAllocationWithRelations } from '@/lib/supabase';
import { formatNumber, formatDate, downloadCSV, getTodayDateString, getErrorMessage } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export type AllocationsLedgerModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AllocationsLedgerModal({ isOpen, onClose }: AllocationsLedgerModalProps) {
  const [allocations, setAllocations] = useState<BatchAllocationWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [reversingAlloc, setReversingAlloc] = useState<BatchAllocationWithRelations | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalDoneBy, setReversalDoneBy] = useState('');
  const [submittingReversal, setSubmittingReversal] = useState(false);
  const toast = useToast();

  const loadAllocations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchBatchAllocations();
      setAllocations(data);
    } catch (err) {
      console.warn('Failed to load allocations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadAllocations();
  }, [isOpen, loadAllocations]);

  const filteredAllocations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allocations;
    return allocations.filter((a) => {
      const srcBatchNo = a.source_batch?.batch_no || '';
      const srcBrand = a.source_batch?.brand_name || '';
      const srcItem = a.source_batch?.item?.name || '';
      const destBatchNo = a.destination_batch?.batch_no || '';
      const destBrand = a.destination_batch?.brand_name || '';
      const destItem = a.destination_batch?.item?.name || '';
      const operator = a.allocated_by || '';
      const remarks = a.remarks || '';
      return (
        srcBatchNo.toLowerCase().includes(q) ||
        srcBrand.toLowerCase().includes(q) ||
        srcItem.toLowerCase().includes(q) ||
        destBatchNo.toLowerCase().includes(q) ||
        destBrand.toLowerCase().includes(q) ||
        destItem.toLowerCase().includes(q) ||
        operator.toLowerCase().includes(q) ||
        remarks.toLowerCase().includes(q)
      );
    });
  }, [allocations, searchQuery]);

  const totalAllocatedQty = useMemo(() => {
    return filteredAllocations.reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
  }, [filteredAllocations]);

  const exportAllocationsCSV = () => {
    if (allocations.length === 0) return;
    try {
      const headers = [
        'Allocation Date',
        'Quantity Allocated',
        'Unit',
        'Source Batch No',
        'Source Item Name',
        'Source Brand',
        'Destination Batch No',
        'Destination Item Name',
        'Destination Brand',
        'Allocated By',
        'Remarks',
      ];
      const rows = allocations.map((a) => [
        a.allocated_on,
        a.qty,
        a.source_batch?.item?.unit || 'pcs',
        a.source_batch?.batch_no || '',
        a.source_batch?.item?.name || '',
        a.source_batch?.brand_name || '',
        a.destination_batch?.batch_no || '',
        a.destination_batch?.item?.name || '',
        a.destination_batch?.brand_name || '',
        a.allocated_by || '',
        a.remarks || '',
      ]);

      const filename = `ffstock_allocations_ledger_${getTodayDateString()}`;
      downloadCSV(filename, headers, rows);
      toast.success('Allocations ledger exported to CSV.', 'Export Complete');
    } catch {
      toast.error('Failed to export allocations CSV.', 'Export Error');
    }
  };

  const handleConfirmReversal = async () => {
    if (!reversingAlloc) return;
    setSubmittingReversal(true);
    try {
      await reverseBatchAllocation({
        allocationId: reversingAlloc.id,
        reversedBy: reversalDoneBy.trim() || undefined,
        reason: reversalReason.trim() || undefined,
      });
      toast.success(
        `Allocation of ${formatNumber(reversingAlloc.qty)} units reversed successfully.`,
        'Reversal Logged'
      );
      setReversingAlloc(null);
      setReversalReason('');
      setReversalDoneBy('');
      await loadAllocations();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to reverse allocation');
      toast.error(msg, 'Reversal Failed');
    } finally {
      setSubmittingReversal(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stock Allocations Audit Ledger"
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Top Filter & Export Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by batch #, brand, item, operator, or remarks..."
              className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
              {filteredAllocations.length} {filteredAllocations.length === 1 ? 'record' : 'records'} ({formatNumber(totalAllocatedQty)} {allocations[0]?.source_batch?.item?.unit || 'units'})
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={exportAllocationsCSV}
              disabled={allocations.length === 0}
              className="text-xs font-bold shrink-0 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Ledger Rows */}
        {loading ? (
          <div className="p-8 text-center text-xs font-semibold text-slate-400 animate-pulse">
            Loading allocations ledger...
          </div>
        ) : filteredAllocations.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
            <EmptyState
              icon={History}
              title="No Allocations Found"
              description={
                searchQuery
                  ? 'No allocations match your active search filter.'
                  : 'No stock has been reallocated between batches yet. Use the "Allocate" action on any inward batch to transfer stock.'
              }
            />
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-2.5 pr-1">
            {filteredAllocations.map((alloc) => {
              const src = alloc.source_batch;
              const dest = alloc.destination_batch;
              const isReversal = alloc.allocation_type === 'reversal';
              return (
                <div
                  key={`alloc-item-${alloc.id}`}
                  className={`p-3.5 rounded-2xl border bg-white transition shadow-2xs space-y-2.5 ${
                    isReversal
                      ? 'border-rose-200 bg-rose-50/20 hover:border-rose-300'
                      : 'border-slate-200 hover:border-teal-200 hover:bg-teal-50/20'
                  }`}
                >
                  {/* Top Bar: Date, Operator, Qty Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        {formatDate(alloc.allocated_on)}
                      </span>
                      {alloc.allocated_by && (
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <User className="h-3 w-3 text-slate-400" />
                          {alloc.allocated_by}
                        </span>
                      )}
                      {isReversal && (
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-md">
                          Reversal
                        </span>
                      )}
                    </div>

                    <span className={`font-black px-2.5 py-1 rounded-lg text-xs shadow-2xs flex items-center gap-1 ${
                      isReversal
                        ? 'text-rose-950 bg-rose-100 border border-rose-300'
                        : 'text-teal-950 bg-teal-100 border border-teal-300'
                    }`}>
                      <ArrowRightLeft className="h-3 w-3" />
                      {formatNumber(alloc.qty)} {src?.item?.unit || 'pcs'}
                    </span>
                  </div>

                  {/* Transfer Pipeline Visualization: Source ➔ Destination */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    {/* Source Batch */}
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 flex items-center gap-1">
                        📤 Transferred From:
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {src?.brand_name && (
                          <span className="text-[10px] font-extrabold text-amber-950 bg-amber-100 px-1.5 py-0.2 rounded">
                            🏢 {src.brand_name}
                          </span>
                        )}
                        <span className="font-mono font-black text-xs text-slate-900 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                          {src?.batch_no || 'Unknown'}
                        </span>
                      </div>
                      <p className="font-bold text-slate-950 text-xs truncate">
                        {src?.item?.name || 'Stock Item'}
                      </p>
                      <p className="text-[10px] text-slate-500">Bay: {src?.location || '—'}</p>
                    </div>

                    {/* Destination Batch */}
                    <div className="space-y-0.5 min-w-0 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-2.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                        📥 Transferred To:
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {dest?.brand_name && (
                          <span className="text-[10px] font-extrabold text-amber-950 bg-amber-100 px-1.5 py-0.2 rounded">
                            🏢 {dest.brand_name}
                          </span>
                        )}
                        <span className="font-mono font-black text-xs text-slate-900 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                          {dest?.batch_no || 'Unknown'}
                        </span>
                      </div>
                      <p className="font-bold text-slate-950 text-xs truncate">
                        {dest?.item?.name || 'Stock Item'}
                      </p>
                      <p className="text-[10px] text-slate-500">Bay: {dest?.location || '—'}</p>
                    </div>
                  </div>

                  {/* Footer: Remarks & Reversal Action */}
                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100 flex-wrap">
                    {alloc.remarks ? (
                      <p className="text-[11px] text-slate-600 italic bg-white px-2 py-1 rounded-lg border border-slate-100 truncate max-w-md">
                        &quot;{alloc.remarks}&quot;
                      </p>
                    ) : (
                      <span className="text-[10px] text-slate-400">No remarks</span>
                    )}

                    {!isReversal && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReversingAlloc(alloc);
                          setReversalReason('');
                          setReversalDoneBy('');
                        }}
                        className="text-xs font-bold text-rose-700 border-rose-200 bg-rose-50/60 hover:bg-rose-100 cursor-pointer shadow-2xs"
                        title="Reverse this allocation and return stock to source batch"
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Reverse Transfer
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reversal Confirmation Modal */}
      {reversingAlloc && (
        <Modal
          isOpen={Boolean(reversingAlloc)}
          onClose={() => {
            if (!submittingReversal) setReversingAlloc(null);
          }}
          title="Reverse Stock Allocation"
          maxWidthClass="max-w-md"
        >
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Ledger-Safe Append-Only Reversal</p>
                <p className="mt-0.5 text-amber-800">
                  This will log an inverse transfer returning <strong>{formatNumber(reversingAlloc.qty)} units</strong> from{' '}
                  <strong>Batch {reversingAlloc.destination_batch?.batch_no}</strong> back to{' '}
                  <strong>Batch {reversingAlloc.source_batch?.batch_no}</strong> in Raw Stock.
                </p>
              </div>
            </div>

            <Field label="Operator / Supervisor Name" htmlFor="reversal-by">
              <input
                id="reversal-by"
                type="text"
                value={reversalDoneBy}
                onChange={(e) => setReversalDoneBy(e.target.value)}
                placeholder="e.g. Warehouse Supervisor"
                className={inputClass}
              />
            </Field>

            <Field label="Reason for Reversal" htmlFor="reversal-reason" required>
              <textarea
                id="reversal-reason"
                rows={3}
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="e.g. Incorrect destination batch selected during morning intake."
                className={inputClass}
                required
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => setReversingAlloc(null)}
                disabled={submittingReversal}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmReversal}
                disabled={submittingReversal || !reversalReason.trim()}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {submittingReversal ? 'Processing Reversal...' : 'Confirm Reversal'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
