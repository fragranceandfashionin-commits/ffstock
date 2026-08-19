import React from 'react';
import { Flame, AlertCircle } from 'lucide-react';
import { Field, inputClass, Button, ErrorBanner } from '@/components/ui';
import { SCRAP_REASONS } from '@/lib/supabase';
import { formatNumber } from '@/lib/utils';

export type ScrapFormProps = {
  activeSourceQty: number;
  fromStageName: string;
  scrapQty: string;
  setScrapQty: (val: string) => void;
  scrapReason: string;
  setScrapReason: (val: string) => void;
  moveDoneBy: string;
  setMoveDoneBy: (val: string) => void;
  moveRemarks: string;
  setMoveRemarks: (val: string) => void;
  submitting: boolean;
  unitLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
  formError: string | null;
};

export function ScrapForm({
  activeSourceQty,
  fromStageName,
  scrapQty,
  setScrapQty,
  scrapReason,
  setScrapReason,
  moveDoneBy,
  setMoveDoneBy,
  moveRemarks,
  setMoveRemarks,
  submitting,
  unitLabel,
  onCancel,
  onSubmit,
  formError,
}: ScrapFormProps) {
  const numericQty = Number(scrapQty) || 0;
  const isOverQty = numericQty > activeSourceQty;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isOverQty && numericQty > 0 && !submitting) {
        onSubmit();
      }
    }
  };

  return (
    <div onKeyDown={handleKeyDown} className="space-y-4">
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 space-y-1">
        <p className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
          <Flame className="h-4 w-4 text-rose-600" />
          Defect from {fromStageName}
        </p>
        <p className="text-[11px] text-rose-700">
          {formatNumber(activeSourceQty)} {unitLabel} available in this stage. Scrapped units will be permanently deducted from production inventory balance.
        </p>
      </div>

      <Field label={`Quantity Scrapped / Lost (${unitLabel})`} htmlFor="scrap-qty" required>
        <div className="relative">
          <input
            id="scrap-qty"
            type="number"
            min={1}
            max={activeSourceQty}
            className={`${inputClass} text-base font-black pr-24 ${isOverQty ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/40' : ''}`}
            value={scrapQty}
            onChange={(e) => setScrapQty(e.target.value)}
            placeholder={`1 to ${formatNumber(activeSourceQty)}`}
            disabled={activeSourceQty === 0 || submitting}
            autoFocus
          />
          {activeSourceQty > 0 && (
            <button
              type="button"
              onClick={() => setScrapQty(String(activeSourceQty))}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              All ({formatNumber(activeSourceQty)})
            </button>
          )}
        </div>
        {isOverQty && (
          <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Exceeds available: Only {formatNumber(activeSourceQty)} {unitLabel} in stage.
          </div>
        )}
      </Field>

      <Field label="Defect Reason / Failure Category" required>
        <select
          value={scrapReason}
          onChange={(e) => setScrapReason(e.target.value)}
          className={inputClass}
          required
        >
          {SCRAP_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Inspector / Operator Name">
          <input
            type="text"
            value={moveDoneBy}
            onChange={(e) => setMoveDoneBy(e.target.value)}
            placeholder="e.g. Line Inspector"
            className={inputClass}
            disabled={submitting}
          />
        </Field>
        <Field label="Incident Notes (optional)">
          <input
            type="text"
            value={moveRemarks}
            onChange={(e) => setMoveRemarks(e.target.value)}
            placeholder="e.g. Breakage on uncasing"
            className={inputClass}
            disabled={submitting}
          />
        </Field>
      </div>

      {formError && <ErrorBanner message={formError} />}

      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="danger"
          loading={submitting}
          disabled={activeSourceQty <= 0 || isOverQty || !scrapQty || submitting}
          onClick={onSubmit}
          className="flex-1 font-bold"
        >
          <Flame className="h-4 w-4" />
          <span>
            {numericQty > 0 && !isOverQty
              ? `Confirm Scrap of ${formatNumber(numericQty)} ${unitLabel}`
              : 'Record Defect Loss'}
          </span>
          <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-rose-800 text-rose-200 rounded">Ctrl+Enter</kbd>
        </Button>
      </div>
    </div>
  );
}
