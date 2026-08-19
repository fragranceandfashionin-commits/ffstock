import React from 'react';
import { Sparkles, Plus, Trash2, ArrowRight, AlertCircle } from 'lucide-react';
import { Field, inputClass, Button, ErrorBanner, ColorSelect, PrintingSelect } from '@/components/ui';
import type { Item, ComponentStockSummary } from '@/lib/supabase';
import type { VariantRow } from './types';
import { formatNumber } from '@/lib/utils';

export type MultiVariantSplitMatrixProps = {
  variantRows: VariantRow[];
  setVariantRows: React.Dispatch<React.SetStateAction<VariantRow[]>>;
  activeSourceQty: number;
  targetStageName: string;
  unitLabel: string;
  allColorSuggestions: string[];
  allPrintingSuggestions: string[];
  boxes: Item[];
  stockSummaryMap: Map<string, ComponentStockSummary>;
  isColoringStage: boolean;
  isLeavingColoring: boolean;
  isPrintingStage: boolean;
  isLeavingPrinting: boolean;
  isFillingStage: boolean;
  isLeavingFilling: boolean;
  isPackagingStage: boolean;
  isLeavingPackaging: boolean;
  moveDoneBy: string;
  setMoveDoneBy: (val: string) => void;
  moveRemarks: string;
  setMoveRemarks: (val: string) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onDistributeEvenly: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  formError: string | null;
};

export function MultiVariantSplitMatrix({
  variantRows,
  setVariantRows,
  activeSourceQty,
  targetStageName,
  unitLabel,
  allColorSuggestions,
  allPrintingSuggestions,
  boxes,
  stockSummaryMap,
  isColoringStage: _isColoringStage,
  isLeavingColoring: _isLeavingColoring,
  isPrintingStage,
  isLeavingPrinting,
  isFillingStage,
  isLeavingFilling,
  isPackagingStage,
  isLeavingPackaging,
  moveDoneBy,
  setMoveDoneBy,
  moveRemarks,
  setMoveRemarks,
  onAddRow,
  onRemoveRow,
  onDistributeEvenly,
  onCancel,
  onSubmit,
  submitting,
  formError,
}: MultiVariantSplitMatrixProps) {
  const totalVariantQty = variantRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  const unallocatedVariantQty = Math.max(0, activeSourceQty - totalVariantQty);
  const isVariantOverAllocated = totalVariantQty > activeSourceQty;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isVariantOverAllocated && totalVariantQty > 0 && !submitting) {
        onSubmit();
      }
    }
  };

  return (
    <div onKeyDown={handleKeyDown} className="space-y-3.5 rounded-2xl border-2 border-indigo-200 bg-gradient-to-b from-indigo-50/40 via-white to-slate-50 p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-2 border-b border-indigo-100">
        <div>
          <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            Variant Allocation Matrix ({variantRows.length} Variants)
          </h4>
          <p className="text-[11px] text-indigo-700 mt-0.5">
            Specify each variant specifications and quantity to advance into <strong>{targetStageName}</strong>.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDistributeEvenly}
            className="text-[10px] font-bold text-indigo-700 bg-white border-indigo-200 hover:bg-indigo-50 py-1 px-2 h-auto cursor-pointer"
          >
            ⚡ Distribute Evenly
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onAddRow}
            className="text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white py-1 px-2.5 h-auto shadow-xs cursor-pointer"
          >
            <Plus className="h-3 w-3 mr-0.5" /> Add Variant Row
          </Button>
        </div>
      </div>

      {/* Dynamic Variant Rows List */}
      <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
        {variantRows.map((row, index) => {
          return (
            <div
              key={row.id}
              className="p-3 rounded-xl border border-indigo-100 bg-white shadow-2xs space-y-2 transition hover:border-indigo-300"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-900">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-black text-indigo-800">
                    #{index + 1}
                  </span>
                  <span>Variant Line</span>
                  {row.color && (
                    <span className="ml-1 text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                      {row.color}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {variantRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveRow(row.id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      title="Remove this variant row"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-start">
                {/* Color Selection & Typing */}
                <div
                  className={
                    (isLeavingPackaging || isPackagingStage) && (isLeavingPrinting || isPrintingStage || isFillingStage || isLeavingFilling)
                      ? 'sm:col-span-3'
                      : (isLeavingPackaging || isPackagingStage) || (isLeavingPrinting || isPrintingStage)
                      ? 'sm:col-span-4'
                      : 'sm:col-span-7'
                  }
                >
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">
                    🎨 Color / Finish
                  </label>
                  <ColorSelect
                    size="sm"
                    value={row.color}
                    colors={allColorSuggestions}
                    onChange={(val) => {
                      setVariantRows((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, color: val } : r))
                      );
                    }}
                    placeholder="Select Color / Finish…"
                    customPlaceholder="Type custom color…"
                  />
                </div>

                {/* Printing Design Specification */}
                {(isLeavingPrinting || isPrintingStage || isFillingStage || isLeavingFilling || isPackagingStage || isLeavingPackaging) && (
                  <div
                    className={
                      isLeavingPackaging || isPackagingStage
                        ? 'sm:col-span-3'
                        : 'sm:col-span-4'
                    }
                  >
                    <label className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 mb-1 block">
                      🖨️ Printing / Artwork
                    </label>
                    <PrintingSelect
                      size="sm"
                      value={row.printing_design}
                      designs={allPrintingSuggestions}
                      onChange={(val) => {
                        setVariantRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, printing_design: val } : r))
                        );
                      }}
                      placeholder="Select Artwork / Print…"
                      customPlaceholder="Type custom artwork…"
                    />
                  </div>
                )}

                {/* Box / Packaging Option */}
                {(isPackagingStage || isLeavingPackaging) && (
                  <div className="sm:col-span-3 space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1 block">
                      📦 Box / Packaging Option
                    </label>
                    <select
                      className={`${inputClass} text-xs font-bold border-amber-200 bg-amber-50/40`}
                      value={row.box_item_id || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const selectedBox = boxes.find((bx) => bx.id === val);
                        setVariantRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id
                              ? {
                                  ...r,
                                  box_item_id: val,
                                  box_name: selectedBox ? selectedBox.name : (val ? r.box_name : ''),
                                }
                              : r
                          )
                        );
                      }}
                    >
                      <option value="">Select Box from Stock…</option>
                      {boxes.map((bx) => {
                        const avail = stockSummaryMap.get(bx.id)?.availableStock ?? 0;
                        const isOutOfStock = avail <= 0;
                        return (
                          <option key={bx.id} value={bx.id}>
                            {bx.name} ({isOutOfStock ? '0 - OUT OF STOCK' : `${formatNumber(avail)} in stock`})
                          </option>
                        );
                      })}
                    </select>
                    {row.box_item_id && (() => {
                      const sum = stockSummaryMap.get(row.box_item_id);
                      const avail = sum?.availableStock ?? 0;
                      const rowQ = Number(row.qty) || 0;
                      if (avail <= 0) {
                        return (
                          <div className="text-[10px] font-bold text-red-600 flex items-center gap-0.5">
                            <span>⚠️ Out of stock (0 available)</span>
                          </div>
                        );
                      }
                      if (rowQ > avail) {
                        return (
                          <div className="text-[10px] font-bold text-amber-700 flex items-center gap-0.5">
                            <span>⚠️ Exceeds stock (only {formatNumber(avail)} available)</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <input
                      type="text"
                      value={row.box_name || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVariantRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, box_name: val } : r))
                        );
                      }}
                      placeholder="Or custom box name…"
                      className={`${inputClass} text-[11px] font-medium py-1 px-2`}
                    />
                  </div>
                )}

                {/* Quantity Input */}
                <div
                  className={
                    (isLeavingPackaging || isPackagingStage) && (isLeavingPrinting || isPrintingStage || isFillingStage || isLeavingFilling)
                      ? 'sm:col-span-3'
                      : (isLeavingPackaging || isPackagingStage) || (isLeavingPrinting || isPrintingStage)
                      ? 'sm:col-span-4'
                      : 'sm:col-span-5'
                  }
                >
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">
                    Quantity ({unitLabel})
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={activeSourceQty}
                      className={`${inputClass} font-black text-sm pr-12`}
                      value={row.qty}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVariantRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, qty: val } : r))
                        );
                      }}
                      placeholder="0"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">
                      {unitLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Allocation Summary & Progress */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-3 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-indigo-900">Total in Stage:</span>
          <span className="font-bold text-slate-900">{formatNumber(activeSourceQty)} {unitLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-indigo-900">Allocated Across Variants:</span>
          <span className={`font-black text-sm ${
            totalVariantQty === activeSourceQty
              ? 'text-emerald-700'
              : isVariantOverAllocated
              ? 'text-rose-600'
              : 'text-indigo-900'
          }`}>
            {formatNumber(totalVariantQty)} {unitLabel}
          </span>
        </div>
        <div className="flex items-center justify-between pt-1.5 border-t border-indigo-200">
          <span className="font-semibold text-indigo-900">Unallocated Balance:</span>
          <span className={`font-bold ${unallocatedVariantQty === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
            {formatNumber(unallocatedVariantQty)} {unitLabel}
          </span>
        </div>

        {isVariantOverAllocated && (
          <div className="flex items-center gap-1 text-xs font-bold text-rose-600 pt-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Allocated total ({formatNumber(totalVariantQty)}) exceeds available balance ({formatNumber(activeSourceQty)}).</span>
          </div>
        )}
      </div>

      {/* Operator & Remarks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <Field label="Operator / Done By (Optional)" htmlFor="done-by-multi">
          <input
            id="done-by-multi"
            className={inputClass}
            value={moveDoneBy}
            onChange={(e) => setMoveDoneBy(e.target.value)}
            placeholder="e.g. Ramesh / Shift A"
            disabled={submitting}
          />
        </Field>
        <Field label="Remarks (Optional)" htmlFor="remarks-multi">
          <input
            id="remarks-multi"
            className={inputClass}
            value={moveRemarks}
            onChange={(e) => setMoveRemarks(e.target.value)}
            placeholder="e.g. Multi-variant split allocation"
            disabled={submitting}
          />
        </Field>
      </div>

      {formError && <ErrorBanner message={formError} />}

      {/* Submit Button */}
      <div className="flex items-center gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={submitting}
          disabled={totalVariantQty <= 0 || isVariantOverAllocated || activeSourceQty === 0 || submitting}
          onClick={onSubmit}
          className="flex-1 font-bold"
        >
          <ArrowRight className="h-4 w-4" />
          <span>Move {formatNumber(totalVariantQty)} {unitLabel} across {variantRows.length} Variants Now</span>
          <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-300 rounded">Ctrl+Enter</kbd>
        </Button>
      </div>
    </div>
  );
}
