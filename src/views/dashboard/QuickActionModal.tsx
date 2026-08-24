import React, { useState, useMemo, useEffect } from 'react';
import { Zap, Flame, Truck, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { Modal, Field, Button, ErrorBanner, Badge, ColorChipsInput, PrintingChipsInput } from '@/components/ui';
import { BatchSearchSelect } from '@/components/BatchSearchSelect';
import type { BatchWithRelations, Stage, Item, ComponentStockSummary } from '@/lib/supabase';
import { SCRAP_REASONS, COMMON_COLORS, COMMON_PRINTING_DESIGNS } from '@/lib/supabase';
import { insertStageMovement, insertScrapMovement, insertDispatch } from '@/lib/queries';
import { formatNumber, getErrorMessage, getTodayDateString } from '@/lib/utils';
import type { DashboardCalculations } from './dashboardCalculations';

export type QuickActionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialBatchId?: string;
  initialTab?: 'move' | 'scrap' | 'dispatch';
  batches: BatchWithRelations[];
  stages: Stage[];
  caps: Item[];
  atomizers: Item[];
  boxes: Item[];
  calculations: DashboardCalculations;
  onSuccess: () => Promise<void>;
  onNavigateToOutward?: (batchId: string) => void;
};

export function QuickActionModal({
  isOpen,
  onClose,
  initialBatchId,
  initialTab = 'move',
  batches,
  stages,
  caps,
  atomizers,
  boxes,
  calculations,
  onSuccess,
  onNavigateToOutward,
}: QuickActionModalProps) {
  const [tab, setTab] = useState<'move' | 'scrap' | 'dispatch'>(initialTab);
  const [batchId, setBatchId] = useState(initialBatchId || (batches[0]?.id ?? ''));
  const [fromStageId, setFromStageId] = useState('');
  const [toStageId, setToStageId] = useState('');
  const [qty, setQty] = useState('');
  const [variantName, setVariantName] = useState('');
  const [scrapReason, setScrapReason] = useState<string>(SCRAP_REASONS[0]);
  const [color, setColor] = useState('');
  const [printingDesign, setPrintingDesign] = useState('');
  const [capItemId, setCapItemId] = useState('');
  const [atomizerItemId, setAtomizerItemId] = useState('');
  const [boxItemId, setBoxItemId] = useState('');
  const [capName, setCapName] = useState('');
  const [atomizerName, setAtomizerName] = useState('');
  const [boxName, setBoxName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [doneBy, setDoneBy] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [dispatchDate, setDispatchDate] = useState(getTodayDateString());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const processStages = useMemo(() => stages.filter((s) => s.name !== 'Dispatched'), [stages]);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      const targetBatchId = initialBatchId || (batches[0]?.id ?? '');
      setBatchId(targetBatchId);
      setQty('');
      setVariantName('');
      setScrapReason(SCRAP_REASONS[0]);
      setColor('');
      setPrintingDesign('');
      setCapItemId('');
      setAtomizerItemId('');
      setBoxItemId('');
      setCapName('');
      setAtomizerName('');
      setBoxName('');
      setRemarks('');
      setDoneBy('');
      setCustomerName('');
      setInvoiceNo('');
      setDispatchDate(getTodayDateString());
      setError(null);
      setSuccess(null);

      if (targetBatchId && calculations) {
        const bItem = calculations.batchMatrix.find((bm) => bm.batch.id === targetBatchId);
        if (bItem && bItem.activeStages.length > 0) {
          setFromStageId(bItem.activeStages[0].stageId);
          const currentSeq = bItem.activeStages[0].sequenceNo;
          const nextStage = processStages.find((s) => s.sequence_no > currentSeq);
          if (nextStage) setToStageId(nextStage.id);
          else setToStageId('');
        }
      }
    }
  }, [isOpen, initialBatchId, initialTab, batches, calculations, processStages]);

  const selectedBatchItem = useMemo(() => {
    if (!calculations || !batchId) return null;
    return calculations.batchMatrix.find((bm) => bm.batch.id === batchId);
  }, [calculations, batchId]);

  const availableStagesForBatch = useMemo(() => {
    if (!selectedBatchItem) return [];
    return selectedBatchItem.activeStages;
  }, [selectedBatchItem]);

  const maxQtyAvailable = useMemo(() => {
    if (!selectedBatchItem || !fromStageId) return 0;
    return selectedBatchItem.stageQuantities[fromStageId] ?? 0;
  }, [selectedBatchItem, fromStageId]);

  const maxReadyQtyForDispatch = useMemo(() => {
    if (!selectedBatchItem || !stages) return 0;
    const readyStage = stages.find((s) => s.name === 'Ready');
    if (!readyStage) return 0;
    return selectedBatchItem.stageQuantities[readyStage.id] ?? 0;
  }, [selectedBatchItem, stages]);

  const stockSummaryMap = useMemo(() => {
    const map = new Map<string, ComponentStockSummary>();
    if (calculations?.componentStocks) {
      for (const cs of calculations.componentStocks) {
        map.set(cs.item.id, cs);
      }
    }
    return map;
  }, [calculations]);

  const isColoringStage = useMemo(() => {
    const fromName = stages.find((s) => s.id === fromStageId)?.name?.toLowerCase() || '';
    const toName = stages.find((s) => s.id === toStageId)?.name?.toLowerCase() || '';
    return fromName.includes('color') || toName.includes('color');
  }, [stages, fromStageId, toStageId]);

  const isPrintingStage = useMemo(() => {
    const fromName = stages.find((s) => s.id === fromStageId)?.name?.toLowerCase() || '';
    const toName = stages.find((s) => s.id === toStageId)?.name?.toLowerCase() || '';
    return fromName.includes('print') || toName.includes('print');
  }, [stages, fromStageId, toStageId]);

  const isLeavingFilling = useMemo(() => {
    const fromName = stages.find((s) => s.id === fromStageId)?.name?.toLowerCase() || '';
    return fromName.includes('fill') || fromName.includes('assembly');
  }, [stages, fromStageId]);

  const isLeavingPackaging = useMemo(() => {
    const fromName = stages.find((s) => s.id === fromStageId)?.name?.toLowerCase() || '';
    return fromName.includes('pack') || fromName.includes('box') || fromName.includes('monocarton');
  }, [stages, fromStageId]);

  const isFillingStage = useMemo(() => {
    const fromName = stages.find((s) => s.id === fromStageId)?.name?.toLowerCase() || '';
    const toName = stages.find((s) => s.id === toStageId)?.name?.toLowerCase() || '';
    return fromName.includes('fill') || toName.includes('fill') || fromName.includes('assembly') || toName.includes('assembly');
  }, [stages, fromStageId, toStageId]);

  const isPackagingStage = useMemo(() => {
    const fromName = stages.find((s) => s.id === fromStageId)?.name?.toLowerCase() || '';
    const toName = stages.find((s) => s.id === toStageId)?.name?.toLowerCase() || '';
    return fromName.includes('pack') || toName.includes('pack');
  }, [stages, fromStageId, toStageId]);

  // Auto-populate variant and specifications from stage-specific or historical batch movements
  useEffect(() => {
    if (selectedBatchItem) {
      const stageInboundMoves = fromStageId
        ? selectedBatchItem.movements?.filter((m) => m.to_stage_id === fromStageId)
        : [];
      const latestStageMove =
        stageInboundMoves && stageInboundMoves.length > 0
          ? stageInboundMoves.slice().reverse().find((m) => m.variant_name?.trim() || m.color)
          : null;

      const fallbackMove = selectedBatchItem.movements
        ?.slice()
        .reverse()
        .find((m) => m.variant_name?.trim() || m.color || m.printing_design);

      const targetM = latestStageMove || fallbackMove;

      const brand = selectedBatchItem.batch.brand_name?.trim() || selectedBatchItem.batch.item?.name?.trim() || 'Variant';
      const defaultColor = targetM?.color || selectedBatchItem.batch.color || '';
      const defaultVariant =
        targetM?.variant_name?.trim() ||
        (defaultColor && defaultColor.toLowerCase() !== 'clear' ? `${brand} - ${defaultColor}` : brand);
      const defaultPrint = targetM?.printing_design || '';

      setVariantName(defaultVariant);
      if (defaultColor) setColor(defaultColor);
      if (defaultPrint) setPrintingDesign(defaultPrint);
      if (selectedBatchItem.resolvedCapName) setCapName(selectedBatchItem.resolvedCapName);
      if (selectedBatchItem.resolvedAtomizerName) setAtomizerName(selectedBatchItem.resolvedAtomizerName);
      if (selectedBatchItem.resolvedBoxName) setBoxName(selectedBatchItem.resolvedBoxName);
    }
  }, [selectedBatchItem, fromStageId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!batchId) {
      setError('Please select a batch.');
      return;
    }

    if (tab === 'move') {
      if (!fromStageId || !toStageId) {
        setError('Please choose origin and destination stages.');
        return;
      }
      if (fromStageId === toStageId) {
        setError('Destination stage must be different from origin stage.');
        return;
      }
      const qtyNum = Number(qty);
      if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
        setError('Quantity must be a positive whole number.');
        return;
      }
      if (qtyNum > maxQtyAvailable) {
        setError(`Cannot move ${formatNumber(qtyNum)} units. Only ${formatNumber(maxQtyAvailable)} available in selected stage.`);
        return;
      }

      if (isLeavingFilling) {
        const resolvedCap = capItemId || capName.trim();
        if (!resolvedCap) {
          setError('Cap closure specification or warehouse item selection is mandatory when advancing from the Filling stage. Bottles cannot move without caps.');
          return;
        }

        const resolvedAtomizer = atomizerItemId || atomizerName.trim();
        if (!resolvedAtomizer) {
          setError('Atomizer / pump specification or warehouse item selection is mandatory when advancing from the Filling stage. Bottles cannot move without atomizers.');
          return;
        }

        if (capItemId) {
          const capSum = stockSummaryMap.get(capItemId);
          const capAvail = capSum?.availableStock ?? 0;
          if (capAvail < qtyNum) {
            setError(`Insufficient Cap Stock: "${capSum?.item.name || capName || 'Selected Cap'}" has only ${formatNumber(capAvail)} units available in warehouse, but requires ${formatNumber(qtyNum)}.`);
            return;
          }
        }

        if (atomizerItemId) {
          const atomSum = stockSummaryMap.get(atomizerItemId);
          const atomAvail = atomSum?.availableStock ?? 0;
          if (atomAvail < qtyNum) {
            setError(`Insufficient Atomizer Stock: "${atomSum?.item.name || atomizerName || 'Selected Atomizer'}" has only ${formatNumber(atomAvail)} units available in warehouse, but requires ${formatNumber(qtyNum)}.`);
            return;
          }
        }
      }

      setSubmitting(true);
      try {
        const latestM = selectedBatchItem?.movements?.slice().reverse().find((m) => m.variant_name?.trim());
        const resolvedVariantName = variantName.trim() || latestM?.variant_name?.trim() || null;

        await insertStageMovement({
          batch_id: batchId,
          from_stage_id: fromStageId,
          to_stage_id: toStageId,
          qty_moved: qtyNum,
          moved_on: getTodayDateString(),
          variant_name: resolvedVariantName,
          color: color.trim() || null,
          printing_design: printingDesign.trim() || null,
          cap_item_id: capItemId || null,
          atomizer_item_id: atomizerItemId || null,
          box_item_id: boxItemId || null,
          cap_name: capName.trim() || null,
          atomizer_name: atomizerName.trim() || null,
          box_name: boxName.trim() || null,
          cap_qty_used: capItemId ? qtyNum : null,
          atomizer_qty_used: atomizerItemId ? qtyNum : null,
          box_qty_used: boxItemId ? qtyNum : null,
          remarks: remarks.trim() || null,
          done_by: doneBy.trim() || null,
        });
        setSuccess(`Successfully transferred ${formatNumber(qtyNum)} units.`);
        await onSuccess();
        setTimeout(() => onClose(), 800);
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to record stage transition'));
      } finally {
        setSubmitting(false);
      }
    } else if (tab === 'scrap') {
      if (!fromStageId) {
        setError('Please select the origin stage where scrap occurred.');
        return;
      }
      const qtyNum = Number(qty);
      if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
        setError('Quantity must be a positive whole number.');
        return;
      }
      if (qtyNum > maxQtyAvailable) {
        setError(`Cannot scrap ${formatNumber(qtyNum)} units. Only ${formatNumber(maxQtyAvailable)} available in selected stage.`);
        return;
      }

      setSubmitting(true);
      try {
        const latestM = selectedBatchItem?.movements?.slice().reverse().find((m) => m.variant_name?.trim());
        const resolvedVariantName = variantName.trim() || latestM?.variant_name?.trim() || null;

        await insertScrapMovement({
          batch_id: batchId,
          from_stage_id: fromStageId,
          qty_scrapped: qtyNum,
          reason: scrapReason,
          variant_name: resolvedVariantName,
          color: color.trim() || null,
          printing_design: printingDesign.trim() || null,
          remarks: remarks.trim() || null,
          done_by: doneBy.trim() || null,
          stages,
        });
        setSuccess(`Successfully recorded defect write-off of ${formatNumber(qtyNum)} units.`);
        await onSuccess();
        setTimeout(() => onClose(), 800);
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to record defect loss'));
      } finally {
        setSubmitting(false);
      }
    } else if (tab === 'dispatch') {
      if (!customerName.trim() || !invoiceNo.trim()) {
        setError('Please provide customer name and invoice number.');
        return;
      }
      const qtyNum = Number(qty);
      if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
        setError('Quantity must be a positive whole number.');
        return;
      }
      if (qtyNum > maxReadyQtyForDispatch) {
        setError(`Cannot dispatch ${formatNumber(qtyNum)} units. Only ${formatNumber(maxReadyQtyForDispatch)} available in Ready stage.`);
        return;
      }

      setSubmitting(true);
      try {
        const latestM = selectedBatchItem?.movements?.slice().reverse().find((m) => m.variant_name?.trim());
        const resolvedVariantName = variantName.trim() || latestM?.variant_name?.trim() || null;

        await insertDispatch({
          batch_id: batchId,
          customer_name: customerName.trim(),
          invoice_no: invoiceNo.trim(),
          qty: qtyNum,
          dispatched_on: dispatchDate,
          variant_name: resolvedVariantName,
          product_specs: remarks.trim() || null,
        });
        setSuccess(`Successfully recorded shipment of ${formatNumber(qtyNum)} units.`);
        await onSuccess();
        setTimeout(() => onClose(), 800);
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to record customer dispatch'));
      } finally {
        setSubmitting(false);
      }
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="⚡ Quick Factory Operation"
    >
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}
        {success && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {success}
          </div>
        )}

        {/* Modal Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setTab('move')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
              tab === 'move'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Zap className="inline h-3.5 w-3.5 mr-1 text-amber-500" />
            Stage Transfer
          </button>
          <button
            type="button"
            onClick={() => setTab('scrap')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
              tab === 'scrap'
                ? 'bg-white text-rose-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Flame className="inline h-3.5 w-3.5 mr-1 text-rose-600" />
            Scrap / Defect
          </button>
          <button
            type="button"
            onClick={() => setTab('dispatch')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
              tab === 'dispatch'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="inline h-3.5 w-3.5 mr-1 text-violet-600" />
            Dispatch
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Batch Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Select Batch / Party <span className="text-rose-500 font-bold">*</span>
            </label>
            <BatchSearchSelect
              batches={batches}
              selectedBatchId={batchId}
              onSelectBatch={(newBatchId) => {
                setBatchId(newBatchId);
                const bItem = calculations.batchMatrix.find((bm) => bm.batch.id === newBatchId);
                if (bItem && bItem.activeStages.length > 0) {
                  setFromStageId(bItem.activeStages[0].stageId);
                  const currentSeq = bItem.activeStages[0].sequenceNo;
                  const nextStage = processStages.find((s) => s.sequence_no > currentSeq);
                  if (nextStage) setToStageId(nextStage.id);
                }
              }}
              placeholder="Search or pick batch..."
              compact={false}
            />
          </div>

          {/* Stage Move Fields */}
          {tab === 'move' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="From Stage" required>
                  <select
                    value={fromStageId}
                    onChange={(e) => {
                      setFromStageId(e.target.value);
                      const cur = availableStagesForBatch.find((as: { stageId: string; stageName: string; sequenceNo: number; qty: number }) => as.stageId === e.target.value);
                      if (cur) {
                        const nextStage = processStages.find((s) => s.sequence_no > cur.sequenceNo);
                        if (nextStage) setToStageId(nextStage.id);
                      }
                    }}
                    className={inputClass}
                    required
                  >
                    {availableStagesForBatch.length === 0 ? (
                      <option value="">No stock in stages</option>
                    ) : (
                      availableStagesForBatch.map((as: { stageId: string; stageName: string; sequenceNo: number; qty: number }) => (
                        <option key={as.stageId} value={as.stageId}>
                          {as.stageName} ({formatNumber(as.qty)} available)
                        </option>
                      ))
                    )}
                  </select>
                </Field>

                <Field label="To Stage" required>
                  <select
                    value={toStageId}
                    onChange={(e) => setToStageId(e.target.value)}
                    className={inputClass}
                    required
                  >
                    <option value="">Select destination…</option>
                    {processStages
                      .filter((s) => s.id !== fromStageId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>

              <Field
                label="Quantity to Move"
                required
                hint={maxQtyAvailable > 0 ? `Max available in this stage: ${formatNumber(maxQtyAvailable)} units` : undefined}
              >
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max={maxQtyAvailable}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="Enter quantity"
                    className={inputClass}
                    required
                  />
                  {maxQtyAvailable > 0 && (
                    <button
                      type="button"
                      onClick={() => setQty(String(maxQtyAvailable))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px] font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer"
                    >
                      MAX
                    </button>
                  )}
                </div>
              </Field>

              <Field label="Variant Name (Optional)">
                <input
                  type="text"
                  value={variantName}
                  onChange={(e) => setVariantName(e.target.value)}
                  placeholder="e.g. Velvet Night 50ml, SKU-101…"
                  className={inputClass}
                />
              </Field>

              {onNavigateToOutward && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200">
                  <div className="text-xs text-indigo-950">
                    <span className="font-extrabold flex items-center gap-1">🎨 Multi-Variant Split & Matrix</span>
                    <p className="text-[11px] text-indigo-700">Split into multiple colors, prints or variant rows simultaneously.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToOutward(batchId);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0 shadow-2xs cursor-pointer"
                  >
                    Open Matrix ➔
                  </button>
                </div>
              )}

              {/* Coloring Stage */}
              {(isColoringStage || (!isPrintingStage && !isFillingStage && !isPackagingStage)) && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/30 p-3.5 space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-sky-900 flex items-center gap-1.5">
                    🎨 Color / Finish Applied (Coloring Stage)
                  </span>
                  <ColorChipsInput
                    value={color}
                    onChange={setColor}
                    colors={COMMON_COLORS}
                    placeholder="e.g. Frosted Blue, Matte Black…"
                  />
                </div>
              )}

              {/* Printing Stage */}
              {isPrintingStage && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5 space-y-2.5">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                    🖨️ Printing & Screen Print / Artwork (Printing Stage)
                  </span>
                  <PrintingChipsInput
                    value={printingDesign}
                    onChange={setPrintingDesign}
                    designs={COMMON_PRINTING_DESIGNS}
                    placeholder="e.g. Gold Foil Stamping, Silk Screen Black Logo…"
                  />
                </div>
              )}

              {/* Filling Stage (Caps & Atomizers Assembly) */}
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
                    ⚠️ Bottles cannot move from the Filling stage without assembling an Atomizer pump and Cap closure.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Cap / Closure (Warehouse Stock) *" required>
                      <select
                        className={`${inputClass} ${
                          !capItemId && !capName.trim() ? 'border-amber-300 bg-amber-50/30' : ''
                        }`}
                        value={capItemId}
                        onChange={(e) => {
                          setCapItemId(e.target.value);
                          const selected = caps.find((c) => c.id === e.target.value);
                          if (selected) setCapName(selected.name);
                        }}
                      >
                        <option value="">Select cap…</option>
                        {caps.map((c) => {
                          const avail = stockSummaryMap.get(c.id)?.availableStock ?? 0;
                          const isOutOfStock = avail <= 0;
                          return (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.color ? ` (${c.color})` : ''} — {isOutOfStock ? '0 available [OUT OF STOCK]' : `${formatNumber(avail)} available`}
                            </option>
                          );
                        })}
                      </select>
                      {capItemId && (() => {
                        const capSum = stockSummaryMap.get(capItemId);
                        const capAvail = capSum?.availableStock ?? 0;
                        const qtyNum = Number(qty) || 0;
                        if (capAvail <= 0) {
                          return (
                            <div className="mt-1 text-[11px] font-bold text-red-600 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                              <span>Out of stock (0 available in warehouse)</span>
                            </div>
                          );
                        }
                        if (qtyNum > capAvail) {
                          return (
                            <div className="mt-1 text-[11px] font-bold text-amber-700 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                              <span>Insufficient stock: requires {formatNumber(qtyNum)}, only {formatNumber(capAvail)} available.</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {!capItemId && !capName.trim() && (
                        <div className="mt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Cap closure is required.</span>
                        </div>
                      )}
                    </Field>
                    <Field label="Atomizer / Pump (Warehouse Stock) *" required>
                      <select
                        className={`${inputClass} ${
                          !atomizerItemId && !atomizerName.trim() ? 'border-amber-300 bg-amber-50/30' : ''
                        }`}
                        value={atomizerItemId}
                        onChange={(e) => {
                          setAtomizerItemId(e.target.value);
                          const selected = atomizers.find((a) => a.id === e.target.value);
                          if (selected) setAtomizerName(selected.name);
                        }}
                      >
                        <option value="">Select atomizer…</option>
                        {atomizers.map((a) => {
                          const avail = stockSummaryMap.get(a.id)?.availableStock ?? 0;
                          const isOutOfStock = avail <= 0;
                          return (
                            <option key={a.id} value={a.id}>
                              {a.name}{a.color ? ` (${a.color})` : ''} — {isOutOfStock ? '0 available [OUT OF STOCK]' : `${formatNumber(avail)} available`}
                            </option>
                          );
                        })}
                      </select>
                      {atomizerItemId && (() => {
                        const atomSum = stockSummaryMap.get(atomizerItemId);
                        const atomAvail = atomSum?.availableStock ?? 0;
                        const qtyNum = Number(qty) || 0;
                        if (atomAvail <= 0) {
                          return (
                            <div className="mt-1 text-[11px] font-bold text-red-600 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                              <span>Out of stock (0 available in warehouse)</span>
                            </div>
                          );
                        }
                        if (qtyNum > atomAvail) {
                          return (
                            <div className="mt-1 text-[11px] font-bold text-amber-700 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                              <span>Insufficient stock: requires {formatNumber(qtyNum)}, only {formatNumber(atomAvail)} available.</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {!atomizerItemId && !atomizerName.trim() && (
                        <div className="mt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Atomizer pump is required.</span>
                        </div>
                      )}
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Cap Custom Specification (If Not from Warehouse)">
                      <input
                        type="text"
                        value={capName}
                        onChange={(e) => setCapName(e.target.value)}
                        placeholder="e.g. Gold Metal Cap 24mm"
                        className={`${inputClass} font-semibold`}
                      />
                    </Field>
                    <Field label="Atomizer Custom Specification (If Not from Warehouse)">
                      <input
                        type="text"
                        value={atomizerName}
                        onChange={(e) => setAtomizerName(e.target.value)}
                        placeholder="e.g. Fine Mist Silver 24/410"
                        className={`${inputClass} font-semibold`}
                      />
                    </Field>
                  </div>
                </div>
              ) : (capName || atomizerName) ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-violet-950">
                    <span>🧴 Assembled:</span>
                    {capName && <span className="bg-white px-2 py-0.5 rounded border border-violet-200">Cap: {capName}</span>}
                    {atomizerName && <span className="bg-white px-2 py-0.5 rounded border border-sky-200 text-sky-900">Pump: {atomizerName}</span>}
                  </div>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                    ✓ Assembled at Filling
                  </span>
                </div>
              ) : null}

              {/* Packaging Stage (Box / Monocarton Packaging) */}
              {(isLeavingPackaging || (isLeavingFilling && stages.find((s) => s.id === toStageId)?.name?.toLowerCase().includes('ready'))) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                      📦 Box / Monocarton Packaging (Packaging Stage)
                    </span>
                    <Badge label="Packaging BOM" variant="amber" size="sm" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Box (Warehouse Stock)">
                      <select
                        className={inputClass}
                        value={boxItemId}
                        onChange={(e) => {
                          setBoxItemId(e.target.value);
                          const selected = boxes.find((bx) => bx.id === e.target.value);
                          if (selected) setBoxName(selected.name);
                        }}
                      >
                        <option value="">Select box…</option>
                        {boxes.map((bx) => (
                          <option key={bx.id} value={bx.id}>
                            {bx.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Box Custom Name">
                      <input
                        type="text"
                        value={boxName}
                        onChange={(e) => setBoxName(e.target.value)}
                        placeholder="e.g. Luxury Monocarton"
                        className={`${inputClass} font-semibold`}
                      />
                    </Field>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Remarks">
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Color batch #2"
                    className={inputClass}
                  />
                </Field>
                <Field label="Operator Name">
                  <input
                    type="text"
                    value={doneBy}
                    onChange={(e) => setDoneBy(e.target.value)}
                    placeholder="e.g. John"
                    className={inputClass}
                  />
                </Field>
              </div>
            </>
          ) : tab === 'scrap' ? (
            /* Scrap Loss */
            <>
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 space-y-1.5">
                <div className="flex items-center gap-2 text-rose-900 text-xs font-bold">
                  <Flame className="h-4 w-4 text-rose-600" />
                  Record Production Scrap & Defect Loss
                </div>
                <p className="text-xs text-rose-700">
                  Units will be written off from the stage and logged in the append-only ledger with an audit defect reason.
                </p>
              </div>

              <Field label="Scrapped From Stage" required>
                <select
                  value={fromStageId}
                  onChange={(e) => setFromStageId(e.target.value)}
                  className={inputClass}
                  required
                >
                  {availableStagesForBatch.length === 0 ? (
                    <option value="">No stock in stages</option>
                  ) : (
                    availableStagesForBatch.map((as: { stageId: string; stageName: string; sequenceNo: number; qty: number }) => (
                      <option key={as.stageId} value={as.stageId}>
                        {as.stageName} ({formatNumber(as.qty)} available)
                      </option>
                    ))
                  )}
                </select>
              </Field>

              <Field
                label="Defect Quantity"
                required
                hint={maxQtyAvailable > 0 ? `Max available: ${formatNumber(maxQtyAvailable)} units` : undefined}
              >
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max={maxQtyAvailable}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="Enter scrap quantity"
                    className={inputClass}
                    required
                  />
                  {maxQtyAvailable > 0 && (
                    <button
                      type="button"
                      onClick={() => setQty(String(maxQtyAvailable))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px] font-extrabold bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-md cursor-pointer"
                    >
                      MAX
                    </button>
                  )}
                </div>
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
                <Field label="Operator / QC Inspector">
                  <input
                    type="text"
                    value={doneBy}
                    onChange={(e) => setDoneBy(e.target.value)}
                    placeholder="e.g. Line Inspector"
                    className={inputClass}
                  />
                </Field>
                <Field label="Incident Notes (optional)">
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Broken during uncasing"
                    className={inputClass}
                  />
                </Field>
              </div>
            </>
          ) : (
            /* Customer Dispatch */
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Customer Name" required>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. ACME Corp"
                    className={inputClass}
                    required
                  />
                </Field>

                <Field label="Invoice / Challan #" required>
                  <input
                    type="text"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    placeholder="e.g. INV-2026-001"
                    className={inputClass}
                    required
                  />
                </Field>
              </div>

              <Field label="Variant Name (Optional)">
                <input
                  type="text"
                  value={variantName}
                  onChange={(e) => setVariantName(e.target.value)}
                  placeholder="e.g. Velvet Night 50ml, SKU-101…"
                  className={inputClass}
                />
              </Field>

              <Field
                label="Dispatch Quantity (from Ready stage)"
                required
                hint={maxReadyQtyForDispatch > 0 ? `Max ready for dispatch: ${formatNumber(maxReadyQtyForDispatch)} units` : 'No finished stock in Ready stage'}
              >
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max={maxReadyQtyForDispatch}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="Enter quantity"
                    className={inputClass}
                    required
                  />
                  {maxReadyQtyForDispatch > 0 && (
                    <button
                      type="button"
                      onClick={() => setQty(String(maxReadyQtyForDispatch))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px] font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer"
                    >
                      MAX
                    </button>
                  )}
                </div>
              </Field>

              <Field label="Dispatch Date" required>
                <input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className={inputClass}
                  required
                />
              </Field>
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" type="button" onClick={onClose} className="cursor-pointer">
              Cancel
            </Button>
            <Button
              variant={tab === 'scrap' ? 'danger' : 'primary'}
              type="submit"
              loading={submitting}
              disabled={!qty || Number(qty) <= 0 || submitting}
              className="cursor-pointer"
            >
              {tab === 'move' ? 'Confirm Stage Transfer' : tab === 'scrap' ? 'Confirm Defect Write-Off' : 'Confirm Dispatch'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
