import { useState, useEffect, useMemo } from 'react';
import {
  ArrowRightLeft,
  History,
  Download,
  Search,
  Calendar,
  User,
} from 'lucide-react';
import { Modal, Button, EmptyState } from '@/components/ui';
import { fetchBatchAllocations } from '@/lib/queries';
import type { BatchAllocationWithRelations } from '@/lib/supabase';
import { formatNumber, formatDate, downloadCSV, getTodayDateString } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export type AllocationsLedgerModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AllocationsLedgerModal({ isOpen, onClose }: AllocationsLedgerModalProps) {
  const [allocations, setAllocations] = useState<BatchAllocationWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);

    fetchBatchAllocations()
      .then((data) => {
        if (isMounted) setAllocations(data);
      })
      .catch((err) => {
        console.warn('Failed to load allocations:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stock Allocations Audit Ledger"
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Header Summary & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-teal-100 border border-teal-200 flex items-center justify-center text-teal-800">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-900">
                {filteredAllocations.length} Allocation Transfers Logged
              </p>
              <p className="text-[11px] text-slate-500">
                Total Stock Reallocated: <strong>{formatNumber(totalAllocatedQty)} units</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search batch, brand, operator…"
                className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs font-medium text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 shadow-2xs"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={exportAllocationsCSV}
              disabled={allocations.length === 0}
              className="text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 shrink-0 cursor-pointer shadow-2xs"
              title="Download allocations ledger CSV"
            >
              <Download className="h-3.5 w-3.5 mr-1 text-slate-500" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Allocations Feed */}
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 font-medium">
            Loading allocation ledger records...
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
              return (
                <div
                  key={`alloc-item-${alloc.id}`}
                  className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-teal-200 hover:bg-teal-50/20 transition shadow-2xs space-y-2.5"
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
                    </div>

                    <span className="font-black text-teal-950 bg-teal-100 border border-teal-300 px-2.5 py-1 rounded-lg text-xs shadow-2xs flex items-center gap-1">
                      <ArrowRightLeft className="h-3 w-3 text-teal-700" />
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

                  {/* Remarks */}
                  {alloc.remarks && (
                    <p className="text-[11px] text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100">
                      "{alloc.remarks}"
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
