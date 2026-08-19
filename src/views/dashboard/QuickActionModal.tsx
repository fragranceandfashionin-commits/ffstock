import React, { useState, useMemo, useEffect } from 'react';
import { Zap, Flame, Truck, CheckCircle2 } from 'lucide-react';
import { Modal, Field, Button, ErrorBanner, Badge, ColorChipsInput, PrintingChipsInput } from '@/components/ui';
import type { BatchWithRelations, Stage, Item } from '@/lib/supabase';
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
}: QuickActionModalProps) {
  const [tab, setTab] = useState<'move' | 'scrap' | 'dispatch'>(initialTab);
  const [batchId, setBatchId] = useState(initialBatchId || (batches[0]?.id ?? ''));
  const [fromStageId, setFromStageId] = useState('');
  const [toStageId, setToStageId] = useState('');
  const [qty, setQty] = useState('');
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

  const isColoringStage = useMemo(() => {
    const fromName = stages.find((s) => s.id === fromStageId)?.name?.toLowerCase();
    const toName = stages.find((s) => s.id === toStageId)?.name?.toLowerCase();
    return fromName === 'coloring' || toName === 'coloring';
  }, [stages, fromStageId, toStageId]);

  const isPrintingStage = useMemo(() => {
    const fromName = stages.find((s) => s.id === fromStageId)?.name?.toLowerCase();
    const toName = stages.find((s) => s.id === toStageId)?.name?.toLowerCase();
    return fromName === 'printing' || toName === 'printing';
  }, [stages, fromStageId, toStageId]);

  const isFillingStage = useMemo(() => {
    const fromName = stages.find((s) => s.id === fromStageId)?.name?.toLowerCase();
    const toName = stages.find((s) => s.id === toStageId)?.name?.toLowerCase();
    return fromName === 'filling' || toName === 'filling';
  }, [stages, fromStageId, toStageId]);

  const isPackagingStage = useMemo(() => {
    const fromName = stages.find((s) => s.id === fromStageId)?.name?.toLowerCase();
    const toName = stages.find((s) => s.id === toStageId)?.name?.toLowerCase();
    return fromName === 'packaging' || toName === 'packaging';
  }, [stages, fromStageId, toStageId]);

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

      setSubmitting(true);
      try {
        await insertStageMovement({
          batch_id: batchId,
          from_stage_id: fromStageId,
          to_stage_id: toStageId,
          qty_moved: qtyNum,
          moved_on: getTodayDateString(),
          color: color.trim() || null,
          printing_design: printingDesign.trim() || null,
          cap_item_id: capItemId || null,
          atomizer_item_id: atomizerItemId || null,
          box_item_id: boxItemId || null,
          cap_name: capName.trim() || null,
          atomizer_name: atomizerName.trim() || null,
          box_name: boxName.trim() || null,
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
        await insertScrapMovement({
          batch_id: batchId,
          from_stage_id: fromStageId,
          qty_scrapped: qtyNum,
          reason: scrapReason,
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
        await insertDispatch({
          batch_id: batchId,
          customer_name: customerName.trim(),
          invoice_no: invoiceNo.trim(),
          qty: qtyNum,
          dispatched_on: dispatchDate,
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
          <Field label="Select Batch / Party" required>
            <select
              value={batchId}
              onChange={(e) => {
                setBatchId(e.target.value);
                const bItem = calculations.batchMatrix.find((bm) => bm.batch.id === e.target.value);
                if (bItem && bItem.activeStages.length > 0) {
                  setFromStageId(bItem.activeStages[0].stageId);
                  const currentSeq = bItem.activeStages[0].sequenceNo;
                  const nextStage = processStages.find((s) => s.sequence_no > currentSeq);
                  if (nextStage) setToStageId(nextStage.id);
                }
              }}
              className={inputClass}
              required
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_no} — {b.item?.name ?? 'Item'} ({formatNumber(b.qty_received)} inward)
                </option>
              ))}
            </select>
          </Field>

          {/* Stage Move Fields */}
          {tab === 'move' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From Stage" required>
                  <select
                    value={fromStageId}
                    onChange={(e) => {
                      setFromStageId(e.target.value);
                      const cur = availableStagesForBatch.find((as) => as.stageId === e.target.value);
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
                      availableStagesForBatch.map((as) => (
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

              {/* Filling Stage */}
              {isFillingStage && (
                <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50/80 to-sky-50/80 p-3.5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-violet-900 flex items-center gap-1.5">
                      🧴 Caps & 💨 Atomizers Assembly (Filling Stage)
                    </span>
                    <Badge label="Filling BOM Stock" variant="violet" size="sm" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Cap / Closure (Warehouse Stock)">
                      <select
                        className={inputClass}
                        value={capItemId}
                        onChange={(e) => {
                          setCapItemId(e.target.value);
                          const selected = caps.find((c) => c.id === e.target.value);
                          if (selected) setCapName(selected.name);
                        }}
                      >
                        <option value="">Select cap…</option>
                        {caps.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.color ? ` (${c.color})` : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Atomizer / Pump (Warehouse Stock)">
                      <select
                        className={inputClass}
                        value={atomizerItemId}
                        onChange={(e) => {
                          setAtomizerItemId(e.target.value);
                          const selected = atomizers.find((a) => a.id === e.target.value);
                          if (selected) setAtomizerName(selected.name);
                        }}
                      >
                        <option value="">Select atomizer…</option>
                        {atomizers.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}{a.color ? ` (${a.color})` : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Cap Custom Name">
                      <input
                        type="text"
                        value={capName}
                        onChange={(e) => setCapName(e.target.value)}
                        placeholder="e.g. Gold Metal Cap 24mm"
                        className={`${inputClass} font-semibold`}
                      />
                    </Field>
                    <Field label="Atomizer Custom Name">
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
              )}

              {/* Packaging Stage */}
              {isPackagingStage && (
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

              <div className="grid grid-cols-2 gap-3">
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
                    availableStagesForBatch.map((as) => (
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

              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
