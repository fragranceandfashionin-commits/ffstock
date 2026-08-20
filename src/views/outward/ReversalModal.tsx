import React from 'react';
import { Undo2, AlertTriangle, CheckCircle } from 'lucide-react';
import { Modal, Field, inputClass, Button, ErrorBanner } from '@/components/ui';
import type { MovementWithRelations, BatchWithRelations } from '@/lib/supabase';
import type { BatchStock } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

export type ReversalModalProps = {
  isOpen: boolean;
  onClose: () => void;
  reversalTarget: MovementWithRelations | null;
  selectedBatch?: BatchWithRelations | null;
  stock: BatchStock[];
  reversalQty: string;
  setReversalQty: (val: string) => void;
  reversalReason: string;
  setReversalReason: (val: string) => void;
  reversalDoneBy: string;
  setReversalDoneBy: (val: string) => void;
  reversalError: string | null;
  reversalSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  unitLabel: string;
};

export function ReversalModal({
  isOpen,
  onClose,
  reversalTarget,
  selectedBatch,
  stock,
  reversalQty,
  setReversalQty,
  reversalReason,
  setReversalReason,
  reversalDoneBy,
  setReversalDoneBy,
  reversalError,
  reversalSubmitting,
  onSubmit,
  unitLabel,
}: ReversalModalProps) {
  if (!isOpen || !reversalTarget) return null;

  const availableInStage = stock.find((s) => s.stage_id === reversalTarget.to_stage_id)?.qty ?? 0;
  const maxReversible = Math.min(reversalTarget.qty_moved, Math.max(0, availableInStage));
  const isFullyAvailable = availableInStage >= reversalTarget.qty_moved;
  const isPartiallyAvailable = availableInStage > 0 && availableInStage < reversalTarget.qty_moved;
  const isZeroAvailable = availableInStage <= 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="↩️ Record Ledger Reversal Entry"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <Undo2 className="h-4 w-4 text-amber-700" />
            Compensating Ledger Reversal
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            You are recording a corrective reverse transfer for movement{' '}
            <strong className="font-mono bg-white/70 px-1 py-0.5 rounded border border-amber-200">{reversalTarget.id.slice(0, 8)}</strong>{' '}
            from <strong>{reversalTarget.to_stage?.name}</strong> back to <strong>{reversalTarget.from_stage?.name}</strong>.
          </p>
        </div>

        {/* Movement Summary Details */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Batch / Item:</span>
            <span className="font-bold text-slate-900">{selectedBatch?.batch_no} ({selectedBatch?.item?.name ?? 'Item'})</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Original Movement:</span>
            <span className="font-bold text-slate-800">{reversalTarget.from_stage?.name ?? '—'} ➔ {reversalTarget.to_stage?.name ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Original Quantity Moved:</span>
            <span className="font-black text-slate-900">{formatNumber(reversalTarget.qty_moved)} {unitLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Reversal Pathway:</span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {reversalTarget.to_stage?.name ?? '—'} ➔ {reversalTarget.from_stage?.name ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-200">
            <span className="text-slate-600 font-bold">Current Stock in {reversalTarget.to_stage?.name ?? 'Stage'}:</span>
            <span className={`font-black text-sm ${availableInStage > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              {formatNumber(availableInStage)} {unitLabel}
            </span>
          </div>
        </div>

        {/* Stock Status Guidance */}
        {isZeroAvailable && (
          <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/90 text-xs text-rose-900 space-y-1">
            <div className="flex items-center gap-1.5 font-black text-rose-800">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              Cannot Reverse (0 {unitLabel} remaining in {reversalTarget.to_stage?.name ?? 'Stage'})
            </div>
            <p className="leading-relaxed">
              All {formatNumber(reversalTarget.qty_moved)} {unitLabel} from this transfer were already moved to subsequent stages or dispatched to customers.
              To reverse this transfer, you must first reverse downstream movements from later stages to return stock back to {reversalTarget.to_stage?.name ?? 'this stage'}.
            </p>
          </div>
        )}

        {isPartiallyAvailable && (
          <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/90 text-xs text-amber-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Partial Stock Available ({formatNumber(availableInStage)} of {formatNumber(reversalTarget.qty_moved)} {unitLabel})
            </div>
            <p className="leading-relaxed">
              {formatNumber(reversalTarget.qty_moved - availableInStage)} {unitLabel} have already advanced downstream.
              You can reverse up to <strong>{formatNumber(availableInStage)} {unitLabel}</strong> right now. (To reverse the full amount, first reverse downstream transfers).
            </p>
          </div>
        )}

        {isFullyAvailable && (
          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/80 text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Full stock is available in {reversalTarget.to_stage?.name ?? 'Stage'} for complete reversal.</span>
          </div>
        )}

        {reversalError && <ErrorBanner message={reversalError} />}

        {/* Quantity to Reverse */}
        <Field
          label="Quantity to Reverse"
          required
          hint={maxReversible > 0 ? `Max currently reversible: ${formatNumber(maxReversible)} ${unitLabel}` : `No ${unitLabel} currently available in this stage`}
        >
          <div className="relative flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={maxReversible}
              value={reversalQty}
              onChange={(e) => setReversalQty(e.target.value)}
              placeholder="Enter quantity"
              className={inputClass}
              disabled={isZeroAvailable}
              required
            />
            {maxReversible > 0 && (
              <button
                type="button"
                onClick={() => setReversalQty(String(maxReversible))}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition whitespace-nowrap cursor-pointer"
              >
                Set Max ({maxReversible})
              </button>
            )}
          </div>
        </Field>

        <Field label="Reversal Reason / Justification" required hint="Required for factory audit compliance">
          <input
            type="text"
            value={reversalReason}
            onChange={(e) => setReversalReason(e.target.value)}
            placeholder="e.g. Stage selection error during physical transfer"
            className={inputClass}
            required
          />
        </Field>

        <Field label="Authorized By / Operator Name">
          <input
            type="text"
            value={reversalDoneBy}
            onChange={(e) => setReversalDoneBy(e.target.value)}
            placeholder="e.g. Plant Supervisor"
            className={inputClass}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button
            variant="outline"
            type="button"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={reversalSubmitting}
            disabled={isZeroAvailable || maxReversible <= 0}
            className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
          >
            Confirm Ledger Reversal
          </Button>
        </div>
      </form>
    </Modal>
  );
}
