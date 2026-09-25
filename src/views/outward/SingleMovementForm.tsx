import { Zap, ArrowRight, AlertTriangle, AlertCircle } from 'lucide-react';
import { Field, inputClass, Button, ErrorBanner, Badge, ColorChipsInput, PrintingChipsInput } from '@/components/ui';
import { COMMON_COLORS, COMMON_PRINTING_DESIGNS, SCRAP_REASONS } from '@/lib/supabase';
import type { Item, ComponentStockSummary } from '@/lib/supabase';
import type { BatchSplit } from './types';
import { formatNumber } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import {
  BatchLocationAllocationGrid,
  type BatchAllocationItem,
} from './BatchLocationAllocationGrid';

export type SingleMovementFormProps = {
  activeSourceQty: number;
  fromStageName: string;
  toStageName: string;
  isColoringStage: boolean;
  isLeavingColoring: boolean;
  isPrintingStage: boolean;
  isLeavingPrinting: boolean;
  isFillingStage: boolean;
  isLeavingFilling: boolean;
  isPackagingStage: boolean;
  isLeavingPackaging: boolean;
  moveQty: string;
  setMoveQty: (val: string) => void;
  allocationItems?: BatchAllocationItem[];
  onAllocationChange?: (batchId: string, val: string) => void;
  moveVariantName?: string;
  setMoveVariantName?: (val: string) => void;
  moveColor: string;
  setMoveColor: (val: string) => void;
  movePrintingDesign: string;
  setMovePrintingDesign: (val: string) => void;
  moveCapItemId: string;
  setMoveCapItemId: (val: string) => void;
  capName: string;
  setCapName: (val: string) => void;
  moveAtomizerItemId: string;
  setMoveAtomizerItemId: (val: string) => void;
  atomizerName: string;
  setAtomizerName: (val: string) => void;
  moveBoxItemId: string;
  setMoveBoxItemId: (val: string) => void;
  moveBoxName: string;
  setMoveBoxName: (val: string) => void;
  splitScrapEnabled: boolean;
  setSplitScrapEnabled: (val: boolean) => void;
  splitScrapReason: string;
  setSplitScrapReason: (val: string) => void;
  moveDoneBy: string;
  setMoveDoneBy: (val: string) => void;
  moveRemarks: string;
  setMoveRemarks: (val: string) => void;
  caps: Item[];
  atomizers: Item[];
  boxes: Item[];
  stockSummaryMap: Map<string, ComponentStockSummary>;
  submitting: boolean;
  unitLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
  formError: string | null;
  fifoSplits?: BatchSplit[];
};

export function SingleMovementForm({
  activeSourceQty,
  fromStageName,
  toStageName,
  isColoringStage,
  isLeavingColoring,
  isPrintingStage,
  isLeavingPrinting,
  isLeavingFilling,
  isLeavingPackaging,
  moveQty,
  setMoveQty,
  allocationItems = [],
  onAllocationChange,
  moveVariantName = '',
  setMoveVariantName,
  moveColor,
  setMoveColor,
  movePrintingDesign,
  setMovePrintingDesign,
  moveCapItemId,
  setMoveCapItemId,
  capName,
  setCapName,
  moveAtomizerItemId,
  setMoveAtomizerItemId,
  atomizerName,
  setAtomizerName,
  moveBoxItemId,
  setMoveBoxItemId,
  moveBoxName,
  setMoveBoxName,
  splitScrapEnabled,
  setSplitScrapEnabled,
  splitScrapReason,
  setSplitScrapReason,
  moveDoneBy,
  setMoveDoneBy,
  moveRemarks,
  setMoveRemarks,
  caps,
  atomizers,
  boxes,
  stockSummaryMap,
  submitting,
  unitLabel,
  onCancel,
  onSubmit,
  formError,
  fifoSplits,
}: SingleMovementFormProps) {
  const { profile, isAuthenticated, roleDefinition } = useAuth();
  const numericQty = Number(moveQty) || 0;
  const hasCardOverAllocation = allocationItems && allocationItems.length > 0
    ? allocationItems.some((item) => item.allocatedQty > item.availableQty)
    : false;
  const isOverQty = numericQty > activeSourceQty || hasCardOverAllocation;
  const remainingStageQty = Math.max(0, activeSourceQty - numericQty);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isOverQty && numericQty > 0 && !submitting) {
        onSubmit();
      }
    }
  };

  const halfQty = Math.floor(activeSourceQty / 2);
  const quarterQty = Math.floor(activeSourceQty / 4);

  return (
    <div onKeyDown={handleKeyDown} className="space-y-4">
      {/* Allocation Section: Rectangle Cards Grid or Fallback Scalar */}
      {allocationItems && allocationItems.length > 0 && onAllocationChange ? (
        <BatchLocationAllocationGrid
          items={allocationItems}
          onAllocationChange={onAllocationChange}
          unitLabel={unitLabel}
          stageName={fromStageName}
          theme="indigo"
          disabled={submitting}
        />
      ) : (
        <>
          {/* Exact Raw Quantity Input */}
          <Field label={`How many ${unitLabel} to move?`} htmlFor="move-qty" required>
            <div className="space-y-2">
              <div className="relative">
                <input
                  id="move-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={activeSourceQty}
                  className={`${inputClass} text-base font-black pr-28 ${isOverQty ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/40' : ''}`}
                  value={moveQty}
                  onChange={(e) => setMoveQty(e.target.value)}
                  placeholder={`1 to ${formatNumber(activeSourceQty)}`}
                  disabled={activeSourceQty === 0 || submitting}
                  autoFocus
                />
                {activeSourceQty > 0 && (
                  <button
                    type="button"
                    onClick={() => setMoveQty(String(activeSourceQty))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Zap className="h-3 w-3 text-amber-400" /> All ({formatNumber(activeSourceQty)})
                  </button>
                )}
              </div>

              {/* Quick Quantity Preset Chips */}
              {activeSourceQty > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-400 mr-1">Quick presets:</span>
                  <button
                    type="button"
                    onClick={() => setMoveQty(String(activeSourceQty))}
                    className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 cursor-pointer transition"
                  >
                    100% ({formatNumber(activeSourceQty)})
                  </button>
                  {halfQty > 0 && (
                    <button
                      type="button"
                      onClick={() => setMoveQty(String(halfQty))}
                      className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 cursor-pointer transition"
                    >
                      50% ({formatNumber(halfQty)})
                    </button>
                  )}
                  {quarterQty > 0 && (
                    <button
                      type="button"
                      onClick={() => setMoveQty(String(quarterQty))}
                      className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 cursor-pointer transition"
                    >
                      25% ({formatNumber(quarterQty)})
                    </button>
                  )}
                </div>
              )}
            </div>
            {isOverQty && (
              <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-600">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Exceeds available: Only {formatNumber(activeSourceQty)} {unitLabel} in source stage.
              </div>
            )}
          </Field>

          {/* FIFO Split Preview Badge Strip */}
          {fifoSplits && fifoSplits.length > 1 && !isOverQty && (
            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/90 text-xs text-amber-950 flex flex-col gap-1.5 animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wider text-amber-800">
                <Zap className="h-3.5 w-3.5 text-amber-600 fill-amber-500" />
                <span>Auto-FIFO Multi-Batch Deduction ({fifoSplits.length} batches)</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {fifoSplits.map((split, sIdx) => (
                  <span
                    key={split.batch_id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-[11px] font-semibold text-slate-800 shadow-2xs"
                  >
                    <span className="font-mono font-black text-indigo-700">
                      {formatNumber(split.qty)} {unitLabel}
                    </span>
                    <span className="text-slate-400">from</span>
                    <strong className="font-mono text-slate-900">#{split.batch_no}</strong>
                    {split.location && (
                      <span className="text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                        📍 {split.location}
                      </span>
                    )}
                    {sIdx < fifoSplits.length - 1 && (
                      <span className="text-amber-500 font-black ml-1">+</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}


      {/* VARIANT NAME SECTION */}
      {setMoveVariantName && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="move-variant-name" className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
              🏷️ Variant Specification
            </label>
            {moveVariantName?.trim() ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-100/90 border border-indigo-200 px-2 py-0.5 rounded-md">
                ✓ Preserved from previous stage
              </span>
            ) : (
              <span className="text-[10px] text-indigo-600 font-medium">Optional</span>
            )}
          </div>
          <input
            id="move-variant-name"
            type="text"
            className={`${inputClass} text-xs font-bold ${moveVariantName?.trim() ? 'border-indigo-300 bg-white' : ''}`}
            value={moveVariantName}
            onChange={(e) => setMoveVariantName(e.target.value)}
            placeholder="e.g. Velvet Night 50ml, SKU-101, Edition A…"
            disabled={submitting}
          />
        </div>
      )}

      {/* COLOR SECTION */}
      {(isColoringStage || isLeavingColoring) && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/30 p-3.5 space-y-2">
          <span className="text-xs font-black uppercase tracking-wider text-sky-900 flex items-center gap-1.5">
            🎨 Color / Finish Applied {isLeavingColoring && <span className="text-rose-600">*</span>}
          </span>
          <ColorChipsInput
            value={moveColor}
            onChange={setMoveColor}
            colors={COMMON_COLORS}
            placeholder="e.g. Frosted Blue, Matte Black, Custom…"
          />
        </div>
      )}

      {/* PRINTING SECTION */}
      {(isPrintingStage || isLeavingPrinting) && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
              🖨️ Printing & Screen Print / Artwork Specification
              {isLeavingPrinting && <Badge label="Mandatory" variant="rose" size="sm" />}
            </span>
          </div>
          <p className="text-[11px] text-indigo-700">
            Specify the exact artwork, hot foil stamping, screen print, or label applied to this batch.
          </p>
          <PrintingChipsInput
            value={movePrintingDesign}
            onChange={setMovePrintingDesign}
            designs={COMMON_PRINTING_DESIGNS}
            placeholder="e.g. Gold Foil Stamping, Silk Screen Black Logo, Floral Artwork…"
          />
        </div>
      )}

      {/* CAPS & ATOMIZERS ASSEMBLY SECTION (ONLY AT FILLING STAGE EXIT) */}
      {isLeavingFilling ? (
        <div className="rounded-xl border p-3.5 space-y-3 shadow-2xs border-violet-300 bg-gradient-to-r from-violet-50/90 to-sky-50/70 ring-1 ring-violet-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-violet-900 flex items-center gap-1.5">
              🧴 Caps & 💨 Atomizers Assembly (Filling Stage)
              <span className="text-rose-600 font-extrabold text-sm">*</span>
            </span>
            <Badge label="Mandatory for Advance" variant="rose" size="sm" />
          </div>
          <p className="text-[11px] text-violet-900 font-semibold leading-relaxed">
            ⚠️ Perfume bottles <strong className="underline decoration-rose-400 font-black">cannot advance from the Filling stage</strong> without assembling an Atomizer pump and Cap closure. Select from warehouse inventory or specify custom components.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Cap / Closure (Warehouse Stock) *"
              htmlFor="cap-item-select"
              required
            >
              <select
                id="cap-item-select"
                className={`${inputClass} ${
                  !moveCapItemId && !capName.trim()
                    ? 'border-amber-300 bg-amber-50/30'
                    : ''
                }`}
                value={moveCapItemId}
                onChange={(e) => {
                  setMoveCapItemId(e.target.value);
                  const selected = caps.find((c) => c.id === e.target.value);
                  if (selected) setCapName(selected.name);
                }}
                disabled={submitting}
              >
                <option value="">Select cap…</option>
                {caps.map((c) => {
                  const avail = stockSummaryMap.get(c.id)?.availableStock ?? 0;
                  const isOutOfStock = avail <= 0;
                  const remaining = avail - numericQty;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.color ? ` (${c.color})` : ''} — {
                        isOutOfStock
                          ? '0 in stock [OUT OF STOCK]'
                          : numericQty > 0
                          ? `Stock: ${formatNumber(avail)} → ${remaining >= 0 ? `${formatNumber(remaining)} left after move` : `SHORT BY ${formatNumber(Math.abs(remaining))}`}`
                          : `${formatNumber(avail)} available`
                      }
                    </option>
                  );
                })}
              </select>
              {moveCapItemId && (() => {
                const capSum = stockSummaryMap.get(moveCapItemId);
                const capAvail = capSum?.availableStock ?? 0;
                const capRemaining = capAvail - numericQty;
                if (capAvail <= 0) {
                  return (
                    <div className="mt-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>Out of stock: 0 available in warehouse. Intake stock before proceeding.</span>
                    </div>
                  );
                }
                if (numericQty > capAvail) {
                  return (
                    <div className="mt-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>Insufficient stock: requires {formatNumber(numericQty)}, but only {formatNumber(capAvail)} in warehouse (Short by {formatNumber(numericQty - capAvail)}).</span>
                    </div>
                  );
                }
                if (numericQty > 0) {
                  return (
                    <div className="mt-1.5 p-2 rounded-lg bg-emerald-50/90 border border-emerald-200 text-[11px] font-bold text-emerald-900 flex items-center justify-between gap-2 shadow-2xs">
                      <span>✓ In Warehouse: <strong>{formatNumber(capAvail)}</strong></span>
                      <span>Used: <strong>{formatNumber(numericQty)}</strong></span>
                      <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                        Remaining: <strong>{formatNumber(capRemaining)}</strong> left
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="mt-1 text-[11px] font-medium text-slate-500">
                    Warehouse balance: {formatNumber(capAvail)} available.
                  </div>
                );
              })()}
              {!moveCapItemId && !capName.trim() && (
                <div className="mt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Cap closure required to advance from Filling.</span>
                </div>
              )}
            </Field>
            <Field
              label="Atomizer / Pump (Warehouse Stock) *"
              htmlFor="atomizer-item-select"
              required
            >
              <select
                id="atomizer-item-select"
                className={`${inputClass} ${
                  !moveAtomizerItemId && !atomizerName.trim()
                    ? 'border-amber-300 bg-amber-50/30'
                    : ''
                }`}
                value={moveAtomizerItemId}
                onChange={(e) => {
                  setMoveAtomizerItemId(e.target.value);
                  const selected = atomizers.find((a) => a.id === e.target.value);
                  if (selected) setAtomizerName(selected.name);
                }}
                disabled={submitting}
              >
                <option value="">Select atomizer…</option>
                {atomizers.map((a) => {
                  const avail = stockSummaryMap.get(a.id)?.availableStock ?? 0;
                  const isOutOfStock = avail <= 0;
                  const remaining = avail - numericQty;
                  return (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.color ? ` (${a.color})` : ''} — {
                        isOutOfStock
                          ? '0 in stock [OUT OF STOCK]'
                          : numericQty > 0
                          ? `Stock: ${formatNumber(avail)} → ${remaining >= 0 ? `${formatNumber(remaining)} left after move` : `SHORT BY ${formatNumber(Math.abs(remaining))}`}`
                          : `${formatNumber(avail)} available`
                      }
                    </option>
                  );
                })}
              </select>
              {moveAtomizerItemId && (() => {
                const atomSum = stockSummaryMap.get(moveAtomizerItemId);
                const atomAvail = atomSum?.availableStock ?? 0;
                const atomRemaining = atomAvail - numericQty;
                if (atomAvail <= 0) {
                  return (
                    <div className="mt-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>Out of stock: 0 available in warehouse. Intake stock before proceeding.</span>
                    </div>
                  );
                }
                if (numericQty > atomAvail) {
                  return (
                    <div className="mt-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>Insufficient stock: requires {formatNumber(numericQty)}, but only {formatNumber(atomAvail)} in warehouse (Short by {formatNumber(numericQty - atomAvail)}).</span>
                    </div>
                  );
                }
                if (numericQty > 0) {
                  return (
                    <div className="mt-1.5 p-2 rounded-lg bg-emerald-50/90 border border-emerald-200 text-[11px] font-bold text-emerald-900 flex items-center justify-between gap-2 shadow-2xs">
                      <span>✓ In Warehouse: <strong>{formatNumber(atomAvail)}</strong></span>
                      <span>Used: <strong>{formatNumber(numericQty)}</strong></span>
                      <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                        Remaining: <strong>{formatNumber(atomRemaining)}</strong> left
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="mt-1 text-[11px] font-medium text-slate-500">
                    Warehouse balance: {formatNumber(atomAvail)} available.
                  </div>
                );
              })()}
              {!moveAtomizerItemId && !atomizerName.trim() && (
                <div className="mt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Atomizer pump required to advance from Filling.</span>
                </div>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Cap Custom Specification (If Not from Warehouse)" htmlFor="cap-name">
              <input
                id="cap-name"
                className={`${inputClass} font-semibold`}
                value={capName}
                onChange={(e) => setCapName(e.target.value)}
                placeholder="e.g. Gold Metal Heavy Cap"
                disabled={submitting}
              />
            </Field>
            <Field label="Atomizer Custom Specification (If Not from Warehouse)" htmlFor="atomizer-name">
              <input
                id="atomizer-name"
                className={`${inputClass} font-semibold`}
                value={atomizerName}
                onChange={(e) => setAtomizerName(e.target.value)}
                placeholder="e.g. Fine Mist Crimped Pump"
                disabled={submitting}
              />
            </Field>
          </div>
        </div>
      ) : (capName || atomizerName || moveCapItemId || moveAtomizerItemId) ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-violet-950">🧴 Assembled Components:</span>
            {capName && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-900 bg-white px-2.5 py-1 rounded-lg border border-violet-200 shadow-2xs">
                Cap: <strong>{capName}</strong>
              </span>
            )}
            {atomizerName && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-sky-900 bg-white px-2.5 py-1 rounded-lg border border-sky-200 shadow-2xs">
                Pump: <strong>{atomizerName}</strong>
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-md border border-emerald-200 self-start sm:self-auto">
            ✓ Assembled in Filling Stage
          </span>
        </div>
      ) : null}

      {/* BOX & PACKAGING SECTION (ONLY AT PACKAGING STAGE EXIT OR DIRECT TO READY) */}
      {(isLeavingPackaging || (isLeavingFilling && toStageName.toLowerCase().includes('ready'))) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              📦 Box / Monocarton Packaging (Packaging Stage)
            </span>
            <Badge label="Packaging BOM" variant="amber" size="sm" />
          </div>
          <p className="text-[11px] text-amber-800 font-medium">
            Select outer packaging or cartons from live warehouse inventory.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Box / Packaging (Warehouse Stock)" htmlFor="box-item-select">
              <select
                id="box-item-select"
                className={inputClass}
                value={moveBoxItemId}
                onChange={(e) => {
                  setMoveBoxItemId(e.target.value);
                  const selected = boxes.find((bx) => bx.id === e.target.value);
                  if (selected) setMoveBoxName(selected.name);
                }}
                disabled={submitting}
              >
                <option value="">Select box…</option>
                {boxes.map((bx) => {
                  const avail = stockSummaryMap.get(bx.id)?.availableStock ?? 0;
                  const isOutOfStock = avail <= 0;
                  const remaining = avail - numericQty;
                  return (
                    <option key={bx.id} value={bx.id}>
                      {bx.name} — {
                        isOutOfStock
                          ? '0 in stock [OUT OF STOCK]'
                          : numericQty > 0
                          ? `Stock: ${formatNumber(avail)} → ${remaining >= 0 ? `${formatNumber(remaining)} left after move` : `SHORT BY ${formatNumber(Math.abs(remaining))}`}`
                          : `${formatNumber(avail)} available`
                      }
                    </option>
                  );
                })}
              </select>
              {moveBoxItemId && (() => {
                const boxSum = stockSummaryMap.get(moveBoxItemId);
                const boxAvail = boxSum?.availableStock ?? 0;
                const boxRemaining = boxAvail - numericQty;
                if (boxAvail <= 0) {
                  return (
                    <div className="mt-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>Out of stock: 0 available in warehouse. Intake stock before proceeding.</span>
                    </div>
                  );
                }
                if (numericQty > boxAvail) {
                  return (
                    <div className="mt-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>Insufficient stock: requires {formatNumber(numericQty)}, but only {formatNumber(boxAvail)} in warehouse (Short by {formatNumber(numericQty - boxAvail)}).</span>
                    </div>
                  );
                }
                if (numericQty > 0) {
                  return (
                    <div className="mt-1.5 p-2 rounded-lg bg-emerald-50/90 border border-emerald-200 text-[11px] font-bold text-emerald-900 flex items-center justify-between gap-2 shadow-2xs">
                      <span>✓ In Warehouse: <strong>{formatNumber(boxAvail)}</strong></span>
                      <span>Used: <strong>{formatNumber(numericQty)}</strong></span>
                      <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                        Remaining: <strong>{formatNumber(boxRemaining)}</strong> left
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="mt-1 text-[11px] font-medium text-slate-500">
                    Warehouse balance: {formatNumber(boxAvail)} available.
                  </div>
                );
              })()}
            </Field>
            <Field label="Box Custom Specification" htmlFor="box-name">
              <input
                id="box-name"
                className={`${inputClass} font-semibold`}
                value={moveBoxName}
                onChange={(e) => setMoveBoxName(e.target.value)}
                placeholder="e.g. Luxury Velvet Rigid Monocarton"
                disabled={submitting}
              />
            </Field>
          </div>
        </div>
      )}

      {/* ZERO GHOST STOCK: Inline Defect Loss Detection */}
      {numericQty > 0 && remainingStageQty > 0 && (
        <div className="rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-3.5 space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
              ⚠️ Partial Transfer: {formatNumber(remainingStageQty)} {unitLabel} Remaining
            </span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              Floor Reconcile
            </span>
          </div>
          <p className="text-[11px] text-amber-800 font-medium">
            You are advancing <strong>{formatNumber(numericQty)} {unitLabel}</strong> out of {formatNumber(activeSourceQty)}. What should happen to the remaining <strong>{formatNumber(remainingStageQty)} {unitLabel}</strong>?
          </p>
          <label className="flex items-start gap-2.5 cursor-pointer bg-white/80 p-2.5 rounded-lg border border-amber-200 hover:bg-white transition">
            <input
              type="checkbox"
              checked={splitScrapEnabled}
              onChange={(e) => setSplitScrapEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900">Record remaining {formatNumber(remainingStageQty)} {unitLabel} as Scrap / Defect Loss</span>
              <p className="text-[11px] text-slate-500 font-normal">
                Prevents ghost stock from sitting on the line. Automatically moves remaining units into Scrap / Defect stage.
              </p>
            </div>
          </label>

          {splitScrapEnabled && (
            <div className="pt-1.5 border-t border-amber-200/60">
              <Field label="Defect Reason / Scrap Cause" required>
                <select
                  value={splitScrapReason}
                  onChange={(e) => setSplitScrapReason(e.target.value)}
                  className={`${inputClass} font-semibold bg-white`}
                >
                  {SCRAP_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>
      )}

      {/* Operator & Remarks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <Field label={isAuthenticated ? 'Verified Operator' : 'Operator / Done By (Optional)'} htmlFor="done-by">
          <input
            id="done-by"
            className={`${inputClass} ${isAuthenticated ? 'bg-slate-100 font-bold text-slate-800 cursor-not-allowed border-slate-300' : ''}`}
            value={isAuthenticated ? (profile?.display_name || profile?.email || roleDefinition.name) : moveDoneBy}
            onChange={(e) => !isAuthenticated && setMoveDoneBy(e.target.value)}
            placeholder="e.g. Ramesh / Shift A"
            disabled={submitting || isAuthenticated}
          />
        </Field>
        <Field label="Remarks (Optional)" htmlFor="remarks">
          <input
            id="remarks"
            className={inputClass}
            value={moveRemarks}
            onChange={(e) => setMoveRemarks(e.target.value)}
            placeholder="e.g. Line #2 / Batch check"
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
          disabled={!moveQty || numericQty <= 0 || isOverQty || activeSourceQty === 0 || submitting}
          onClick={onSubmit}
          className="flex-1 font-bold"
        >
          <ArrowRight className="h-4 w-4" />
          <span>
            {numericQty > 0 && !isOverQty
              ? splitScrapEnabled && remainingStageQty > 0
                ? `Move ${formatNumber(numericQty)} & Scrap ${formatNumber(remainingStageQty)} ${unitLabel}`
                : `Move ${formatNumber(numericQty)} ${unitLabel} Now`
              : 'Confirm Stage Movement'}
          </span>
          <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-300 rounded">Ctrl+Enter</kbd>
        </Button>
      </div>
    </div>
  );
}
