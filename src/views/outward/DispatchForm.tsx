import React from 'react';
import { Zap, Split, Sparkles, Plus, Trash2, Truck, AlertCircle } from 'lucide-react';
import { Field, inputClass, Button, ErrorBanner, ColorSelect, PrintingSelect } from '@/components/ui';
import type { Item, ComponentStockSummary } from '@/lib/supabase';
import type { VariantRow } from './types';
import { formatNumber } from '@/lib/utils';

export type DispatchFormProps = {
  dispatchMode: 'single' | 'multi-split';
  setDispatchMode: (mode: 'single' | 'multi-split') => void;
  readyQty: number;
  unitLabel: string;
  customerName: string;
  setCustomerName: (val: string) => void;
  invoiceNo: string;
  setInvoiceNo: (val: string) => void;
  dispatchDate: string;
  setDispatchDate: (val: string) => void;
  dispatchQty: string;
  setDispatchQty: (val: string) => void;
  dispatchColor: string;
  setDispatchColor: (val: string) => void;
  dispatchCapName: string;
  setDispatchCapName: (val: string) => void;
  dispatchAtomizerName: string;
  setDispatchAtomizerName: (val: string) => void;
  dispatchBoxName: string;
  setDispatchBoxName: (val: string) => void;
  dispatchProductSpecs: string;
  setDispatchProductSpecs: (val: string) => void;
  variantRows: VariantRow[];
  setVariantRows: React.Dispatch<React.SetStateAction<VariantRow[]>>;
  allColorSuggestions: string[];
  allPrintingSuggestions: string[];
  caps: Item[];
  atomizers: Item[];
  boxes: Item[];
  stockSummaryMap: Map<string, ComponentStockSummary>;
  onAddVariantRow: () => void;
  onRemoveVariantRow: (id: string) => void;
  onDistributeEvenly: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  formError: string | null;
};

export function DispatchForm({
  dispatchMode,
  setDispatchMode,
  readyQty,
  unitLabel,
  customerName,
  setCustomerName,
  invoiceNo,
  setInvoiceNo,
  dispatchDate,
  setDispatchDate,
  dispatchQty,
  setDispatchQty,
  dispatchColor,
  setDispatchColor,
  dispatchCapName,
  setDispatchCapName,
  dispatchAtomizerName,
  setDispatchAtomizerName,
  dispatchBoxName,
  setDispatchBoxName,
  dispatchProductSpecs,
  setDispatchProductSpecs,
  variantRows,
  setVariantRows,
  allColorSuggestions,
  allPrintingSuggestions,
  caps,
  atomizers,
  boxes,
  stockSummaryMap,
  onAddVariantRow,
  onRemoveVariantRow,
  onDistributeEvenly,
  onCancel,
  onSubmit,
  submitting,
  formError,
}: DispatchFormProps) {
  const numericQty = Number(dispatchQty) || 0;
  const isOverQty = numericQty > readyQty;
  const totalVariantQty = variantRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  const unallocatedVariantQty = Math.max(0, readyQty - totalVariantQty);
  const isVariantOverAllocated = totalVariantQty > readyQty;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!submitting && customerName.trim() && invoiceNo.trim()) {
        if (dispatchMode === 'single' && !isOverQty && numericQty > 0) {
          onSubmit();
        } else if (dispatchMode === 'multi-split' && !isVariantOverAllocated && totalVariantQty > 0) {
          onSubmit();
        }
      }
    }
  };

  return (
    <div onKeyDown={handleKeyDown} className="space-y-4">
      {/* Ready Stock Indicator */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Finished Ready Stock Available</p>
        <p className="text-2xl font-black text-emerald-800 mt-1">
          {formatNumber(readyQty)} <span className="text-xs font-semibold text-emerald-600">{unitLabel}</span>
        </p>
      </div>

      {/* Mode Switcher */}
      <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
        <button
          type="button"
          onClick={() => setDispatchMode('single')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            dispatchMode === 'single'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Zap className="h-3.5 w-3.5 text-emerald-600" />
          <span>⚡ Full / Single Dispatch</span>
        </button>
        <button
          type="button"
          onClick={() => setDispatchMode('multi-split')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            dispatchMode === 'multi-split'
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Split className="h-3.5 w-3.5" />
          <span>🎨 Multi-Variant Dispatch (Variants Wise)</span>
        </button>
      </div>

      {/* Customer Name & Invoice Info */}
      <Field label="Customer / Client Name" htmlFor="cust-name" required>
        <input
          id="cust-name"
          className={inputClass}
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="e.g. Acme Beverage Corp, Luxury Scents Inc"
          disabled={submitting}
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Invoice / Delivery Challan #" htmlFor="inv-no" required>
          <input
            id="inv-no"
            className={inputClass}
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="INV-2026-001"
            disabled={submitting}
          />
        </Field>
        <Field label="Dispatch Date" htmlFor="disp-date" required>
          <input
            id="disp-date"
            type="date"
            className={inputClass}
            value={dispatchDate}
            onChange={(e) => setDispatchDate(e.target.value)}
            disabled={submitting}
          />
        </Field>
      </div>

      {/* OPTION 1: MULTI-VARIANT DISPATCH MATRIX */}
      {dispatchMode === 'multi-split' ? (
        <div className="space-y-3.5 rounded-2xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50/40 via-white to-slate-50 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-2 border-b border-emerald-100">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                Variant Dispatch Matrix ({variantRows.length} Variants)
              </h4>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Select the exact quantities of each finished variant to ship to the client.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDistributeEvenly}
                className="text-[10px] font-bold text-emerald-700 bg-white border-emerald-200 hover:bg-emerald-50 py-1 px-2 h-auto cursor-pointer"
              >
                ⚡ Distribute Evenly
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={onAddVariantRow}
                className="text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white py-1 px-2.5 h-auto shadow-xs cursor-pointer"
              >
                <Plus className="h-3 w-3 mr-0.5" /> Add Variant Line
              </Button>
            </div>
          </div>

          {/* Dynamic Variant Rows List for Dispatch */}
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {variantRows.map((row, index) => {
              return (
                <div
                  key={row.id}
                  className="p-3 rounded-xl border border-emerald-100 bg-white shadow-2xs space-y-2 transition hover:border-emerald-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-800">
                        #{index + 1}
                      </span>
                      <span>Dispatch Variant</span>
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
                          onClick={() => onRemoveVariantRow(row.id)}
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
                    <div className="sm:col-span-3">
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
                    <div className="sm:col-span-3">
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

                    {/* Box / Packaging Option */}
                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1 block">
                        📦 Box / Packaging
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

                    {/* Quantity Input */}
                    <div className="sm:col-span-3">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 mb-1 block">
                        Dispatch Qty ({unitLabel})
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={readyQty}
                          className={`${inputClass} font-black text-sm pr-12 border-emerald-300 focus:border-emerald-500`}
                          value={row.qty}
                          onChange={(e) => {
                            const val = e.target.value;
                            setVariantRows((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, qty: val } : r))
                            );
                          }}
                          placeholder="0"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600 pointer-events-none">
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
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-900">Finished Ready Stock:</span>
              <span className="font-bold text-slate-900">{formatNumber(readyQty)} {unitLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-900">Total Dispatching Across Variants:</span>
              <span className={`font-black text-sm ${
                totalVariantQty === readyQty
                  ? 'text-emerald-700'
                  : isVariantOverAllocated
                  ? 'text-rose-600'
                  : 'text-emerald-900'
              }`}>
                {formatNumber(totalVariantQty)} {unitLabel}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-emerald-200">
              <span className="font-semibold text-emerald-900">Remaining in Ready Stage:</span>
              <span className={`font-bold ${unallocatedVariantQty === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {formatNumber(unallocatedVariantQty)} {unitLabel}
              </span>
            </div>

            {isVariantOverAllocated && (
              <div className="flex items-center gap-1 text-xs font-bold text-rose-600 pt-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Total dispatch ({formatNumber(totalVariantQty)}) exceeds available ready stock ({formatNumber(readyQty)}).</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* OPTION 2: SINGLE / FULL BATCH DISPATCH */
        <div className="space-y-4">
          <Field label={`Dispatch Quantity (${unitLabel})`} htmlFor="disp-qty" required>
            <div className="relative">
              <input
                id="disp-qty"
                type="number"
                inputMode="numeric"
                min={1}
                max={readyQty}
                className={`${inputClass} text-base font-black pr-24 ${isOverQty ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/40' : ''}`}
                value={dispatchQty}
                onChange={(e) => setDispatchQty(e.target.value)}
                placeholder={`1 to ${formatNumber(readyQty)}`}
                disabled={readyQty === 0 || submitting}
              />
              {readyQty > 0 && (
                <button
                  type="button"
                  onClick={() => setDispatchQty(String(readyQty))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <Zap className="h-3 w-3 text-amber-300" /> All ({formatNumber(readyQty)})
                </button>
              )}
            </div>
            {isOverQty && (
              <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Only {formatNumber(readyQty)} {unitLabel} ready for dispatch.
              </div>
            )}
          </Field>

          {/* Product Specification for Dispatch */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3.5 space-y-3">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-900">
              📦 Final Product Specification (Optional)
            </span>
            <p className="text-[11px] text-emerald-700 font-medium">
              Record the exact assembled product details being shipped to the customer.
            </p>
            <Field label="Color / Finish" htmlFor="disp-color">
              <ColorSelect
                value={dispatchColor}
                colors={allColorSuggestions}
                onChange={setDispatchColor}
                placeholder="Select or type color…"
                disabled={submitting}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Field label="Cap / Closure" htmlFor="disp-cap">
                  <select
                    id="disp-cap-select"
                    className={inputClass}
                    value={caps.find((c) => c.name === dispatchCapName)?.id || ''}
                    onChange={(e) => {
                      const selected = caps.find((c) => c.id === e.target.value);
                      if (selected) setDispatchCapName(selected.name);
                    }}
                    disabled={submitting}
                  >
                    <option value="">Select cap…</option>
                    {caps.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.color ? ` (${c.color})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <input
                  id="disp-cap"
                  className={`${inputClass} text-xs`}
                  value={dispatchCapName}
                  onChange={(e) => setDispatchCapName(e.target.value)}
                  placeholder="Or custom cap spec…"
                  disabled={submitting}
                />
              </div>

              <div className="space-y-1.5">
                <Field label="Atomizer / Pump" htmlFor="disp-atomizer">
                  <select
                    id="disp-atomizer-select"
                    className={inputClass}
                    value={atomizers.find((a) => a.name === dispatchAtomizerName)?.id || ''}
                    onChange={(e) => {
                      const selected = atomizers.find((a) => a.id === e.target.value);
                      if (selected) setDispatchAtomizerName(selected.name);
                    }}
                    disabled={submitting}
                  >
                    <option value="">Select atomizer…</option>
                    {atomizers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}{a.color ? ` (${a.color})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <input
                  id="disp-atomizer"
                  className={`${inputClass} text-xs`}
                  value={dispatchAtomizerName}
                  onChange={(e) => setDispatchAtomizerName(e.target.value)}
                  placeholder="Or custom pump spec…"
                  disabled={submitting}
                />
              </div>

              <div className="space-y-1.5">
                <Field label="Box / Outer Packaging" htmlFor="disp-box">
                  <select
                    id="disp-box-select"
                    className={inputClass}
                    value={boxes.find((b) => b.name === dispatchBoxName)?.id || ''}
                    onChange={(e) => {
                      const selected = boxes.find((b) => b.id === e.target.value);
                      if (selected) setDispatchBoxName(selected.name);
                    }}
                    disabled={submitting}
                  >
                    <option value="">Select box…</option>
                    {boxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <input
                  id="disp-box"
                  className={`${inputClass} text-xs`}
                  value={dispatchBoxName}
                  onChange={(e) => setDispatchBoxName(e.target.value)}
                  placeholder="Or custom box spec…"
                  disabled={submitting}
                />
              </div>
            </div>
            <Field label="Additional Specs / Notes" htmlFor="disp-specs">
              <input
                id="disp-specs"
                className={inputClass}
                value={dispatchProductSpecs}
                onChange={(e) => setDispatchProductSpecs(e.target.value)}
                placeholder="e.g. With neck tag, master carton of 50pcs"
                disabled={submitting}
              />
            </Field>
          </div>
        </div>
      )}

      {formError && <ErrorBanner message={formError} />}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={submitting}
          disabled={
            readyQty <= 0 ||
            !customerName.trim() ||
            !invoiceNo.trim() ||
            submitting ||
            (dispatchMode === 'multi-split'
              ? totalVariantQty <= 0 || isVariantOverAllocated
              : !dispatchQty || isOverQty)
          }
          onClick={onSubmit}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 shadow-xs font-bold"
        >
          <Truck className="h-4 w-4" />
          <span>
            {dispatchMode === 'multi-split'
              ? `Dispatch ${formatNumber(totalVariantQty)} ${unitLabel} across ${variantRows.length} Variants Now`
              : numericQty > 0 && !isOverQty
              ? `Dispatch ${formatNumber(numericQty)} ${unitLabel} to ${customerName || 'Customer'}`
              : 'Confirm Customer Dispatch'}
          </span>
          <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-emerald-800 text-emerald-200 rounded">Ctrl+Enter</kbd>
        </Button>
      </div>
    </div>
  );
}
