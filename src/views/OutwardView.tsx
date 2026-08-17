import { useEffect, useState, useCallback } from 'react';
import {
  ArrowRight, ArrowLeftRight, Truck, Image as ImageIcon, Zap, AlertCircle,
  Save, CheckCircle2, X, Boxes,
} from 'lucide-react';
import { Card, PageHeader, Spinner, ErrorBanner, EmptyState, Field, inputClass, Button, Badge } from '@/components/ui';
import { fetchBatches, fetchBatchStock, fetchDispatches, fetchMovements, fetchStages } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { BatchWithRelations, Dispatch, MovementWithRelations, Stage } from '@/lib/supabase';
import type { BatchStock } from '@/lib/types';
import { formatNumber, formatDate, getErrorMessage, getTodayDateString } from '@/lib/utils';

type ActiveAction =
  | { type: 'stage-move'; fromStageId: string; toStageId: string }
  | { type: 'dispatch' }
  | null;

export function OutwardView() {
  // Master data
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [batches, setBatches] = useState<BatchWithRelations[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Batch
  const [batchId, setBatchId] = useState('');

  // Stock data for selected batch
  const [stock, setStock] = useState<BatchStock[]>([]);
  const [movements, setMovements] = useState<MovementWithRelations[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);

  // Active Action state (Replaces the clunky dropdown)
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  // Form states
  const [moveQty, setMoveQty] = useState('');
  const [capName, setCapName] = useState('');
  const [atomizerName, setAtomizerName] = useState('');
  const [moveRemarks, setMoveRemarks] = useState('');
  const [moveDoneBy, setMoveDoneBy] = useState('');
  const [dispatchQty, setDispatchQty] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [dispatchDate, setDispatchDate] = useState(getTodayDateString());

  // Feedback states
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // -- Load master data --
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, b] = await Promise.all([fetchStages(), fetchBatches()]);
        if (!active) return;
        setStages(s);
        setBatches(b);
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, 'Failed to load data'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // -- Load batch-specific data when batchId changes --
  useEffect(() => {
    setFormError(null);
    setSuccess(null);
    setActiveAction(null);
    resetForm();
    if (!batchId) {
      setStock([]);
      setMovements([]);
      setDispatches([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        const [s, m, d] = await Promise.all([
          fetchBatchStock(batchId),
          fetchMovements(batchId),
          fetchDispatches(batchId),
        ]);
        if (!active) return;
        setStock(s);
        setMovements(m);
        setDispatches(d);
      } catch (err) {
        if (!active) return;
        setFormError(getErrorMessage(err, 'Failed to load batch details'));
      }
    })();
    return () => { active = false; };
  }, [batchId]);

  const refreshBatchData = useCallback(async () => {
    if (!batchId) return;
    try {
      const [s, m, d] = await Promise.all([
        fetchBatchStock(batchId),
        fetchMovements(batchId),
        fetchDispatches(batchId),
      ]);
      setStock(s);
      setMovements(m);
      setDispatches(d);
    } catch {
      // Silently ignore background refresh errors
    }
  }, [batchId]);

  // -- Realtime live syncing across multi-user terminals --
  useEffect(() => {
    const channel = supabase
      .channel('outward-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_movements' },
        () => {
          if (batchId) {
            refreshBatchData();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dispatches' },
        () => {
          if (batchId) {
            refreshBatchData();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inward_batches' },
        async () => {
          try {
            const b = await fetchBatches();
            setBatches(b);
          } catch {
            // Silently ignore background refresh errors
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId, refreshBatchData]);

  const resetForm = () => {
    setMoveQty('');
    setCapName('');
    setAtomizerName('');
    setMoveRemarks('');
    setMoveDoneBy('');
    setDispatchQty('');
    setCustomerName('');
    setInvoiceNo('');
    setDispatchDate(getTodayDateString());
  };

  // Helpers
  const selectedBatch = batches?.find((b) => b.id === batchId);
  const processStages = (stages ?? []).filter((s) => s.name !== 'Dispatched');
  const qtyAt = (stageId: string) => stock.find((s) => s.stage_id === stageId)?.qty ?? 0;
  const dispatchedTotal = dispatches.reduce((sum, d) => sum + d.qty, 0);
  const inFactory = selectedBatch ? Math.max(0, selectedBatch.qty_received - dispatchedTotal) : 0;
  const readyStage = stages?.find((s) => s.name === 'Ready');
  const readyQty = readyStage ? qtyAt(readyStage.id) : 0;

  // Source quantity for current active action
  const activeSourceQty = activeAction?.type === 'dispatch'
    ? readyQty
    : activeAction?.type === 'stage-move'
    ? qtyAt(activeAction.fromStageId)
    : 0;

  const isFromFilling = activeAction?.type === 'stage-move'
    && stages?.find((s) => s.id === activeAction.fromStageId)?.name?.toLowerCase() === 'filling';

  const currentQtyInput = activeAction?.type === 'dispatch' ? dispatchQty : moveQty;
  const numericQty = Number(currentQtyInput);
  const isOverQty = numericQty > activeSourceQty;

  // -- Trigger stage move --
  const startStageMove = (fromStageId: string, toStageId: string) => {
    setFormError(null);
    setSuccess(null);
    resetForm();
    setActiveAction({ type: 'stage-move', fromStageId, toStageId });
  };

  // -- Trigger dispatch --
  const startDispatch = () => {
    setFormError(null);
    setSuccess(null);
    resetForm();
    setActiveAction({ type: 'dispatch' });
  };

  // -- Submit stage movement --
  const handleMoveSubmit = async () => {
    setFormError(null);
    setSuccess(null);

    if (!activeAction || activeAction.type !== 'stage-move') return;
    const { fromStageId: fId, toStageId: tId } = activeAction;
    if (!fId || !tId) return;

    const raw = moveQty.trim();
    const qtyNum = Number(raw);
    if (!raw || !Number.isInteger(qtyNum) || qtyNum <= 0) {
      setFormError('Enter a valid whole number above 0.');
      return;
    }

    const available = qtyAt(fId);
    const fromName = stages?.find((s) => s.id === fId)?.name ?? '';
    const toName = stages?.find((s) => s.id === tId)?.name ?? '';

    if (qtyNum > available) {
      setFormError(`Only ${formatNumber(available)} bottles available in ${fromName}. Cannot move ${formatNumber(qtyNum)}.`);
      return;
    }

    if (isFromFilling) {
      if (!capName.trim() || !atomizerName.trim()) {
        setFormError('Cap Name and Atomizer Name are mandatory when moving bottles from the Filling stage.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const insertPayload: Record<string, unknown> = {
        batch_id: batchId,
        from_stage_id: fId,
        to_stage_id: tId,
        qty_moved: qtyNum,
        moved_on: getTodayDateString(),
        remarks: moveRemarks.trim() || null,
        done_by: moveDoneBy.trim() || null,
      };

      if (isFromFilling || capName.trim()) {
        insertPayload.cap_name = capName.trim();
      }
      if (isFromFilling || atomizerName.trim()) {
        insertPayload.atomizer_name = atomizerName.trim();
      }

      const { error: insertError } = await supabase.from('stage_movements').insert(insertPayload);
      if (insertError) throw insertError;

      setSuccess(`Moved ${formatNumber(qtyNum)} bottles: ${fromName} → ${toName}${isFromFilling ? ` (Cap: ${capName.trim()}, Atomizer: ${atomizerName.trim()})` : ''}`);
      resetForm();
      setActiveAction(null);
      await refreshBatchData();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not move bottles'));
    } finally {
      setSubmitting(false);
    }
  };

  // -- Submit dispatch --
  const handleDispatchSubmit = async () => {
    setFormError(null);
    setSuccess(null);

    if (!dispatchQty || !customerName.trim() || !invoiceNo.trim()) {
      setFormError('Please fill all required fields.');
      return;
    }
    const qtyNum = Number(dispatchQty);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      setFormError('Quantity must be a positive whole number.');
      return;
    }
    if (qtyNum > readyQty) {
      setFormError(`Only ${formatNumber(readyQty)} units are Ready. Cannot ship ${formatNumber(qtyNum)}.`);
      return;
    }

    setSubmitting(true);
    try {
      const { error: insertError } = await supabase.from('dispatches').insert({
        batch_id: batchId,
        qty: qtyNum,
        customer_name: customerName.trim(),
        invoice_no: invoiceNo.trim(),
        dispatched_on: dispatchDate,
      });
      if (insertError) throw insertError;

      setSuccess(`Dispatched ${formatNumber(qtyNum)} units to ${customerName.trim()} (Inv #${invoiceNo.trim()})`);
      resetForm();
      setActiveAction(null);
      await refreshBatchData();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to record dispatch'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner label="Loading outward journey…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!stages || !batches) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outward Journey"
        subtitle="Live production pipeline. Click to advance bottles directly between stages with zero clutter and raw exact quantities."
      />

      {batches.length === 0 ? (
        <EmptyState title="No batches yet" description="Record an inward entry first to start moving stock." />
      ) : (
        <>
          {/* ─── Step 1: Choose Batch ─── */}
          <Card className="border-slate-200/80 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <label htmlFor="batch" className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <span>Step 1 — Pick Batch / Brand / Supplier</span>
                <Badge label="Required" variant="amber" size="sm" />
              </label>
              {selectedBatch && (
                <span className="text-xs text-slate-500 font-medium">
                  Received on {formatDate(selectedBatch.received_on)} • Storage: <strong className="text-slate-700">{selectedBatch.location}</strong>
                </span>
              )}
            </div>

            <select
              id="batch"
              className={`${inputClass} font-semibold`}
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
            >
              <option value="">Select Brand / Party / Batch…</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_no} — {b.item?.name ?? 'Unknown'} (Supplier: {b.supplier?.name ?? 'Unknown'} • {formatNumber(b.qty_received)} bottles received)
                </option>
              ))}
            </select>
          </Card>

          {!batchId ? (
            <Card className="text-center py-12 border-dashed">
              <Boxes className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">Select a batch above to view its live pipeline</p>
              <p className="text-xs text-slate-400 mt-1">You will see each stage balance and 1-click advance buttons.</p>
            </Card>
          ) : selectedBatch && (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Card className="border-slate-200/80">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Received</p>
                  <p className="mt-1.5 text-2xl font-black text-slate-900">{formatNumber(selectedBatch.qty_received)}</p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">bottles recorded</p>
                </Card>
                <Card className="border-emerald-200/80 bg-emerald-50/30">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">In Factory</p>
                  <p className="mt-1.5 text-2xl font-black text-emerald-700">{formatNumber(inFactory)}</p>
                  <p className="text-[11px] text-emerald-600 font-medium mt-0.5">received − dispatched</p>
                </Card>
                <Card className="border-sky-200/80 bg-sky-50/30">
                  <p className="text-xs font-bold uppercase tracking-wider text-sky-800">Ready</p>
                  <p className="mt-1.5 text-2xl font-black text-sky-700">{formatNumber(readyQty)}</p>
                  <p className="text-[11px] text-sky-600 font-medium mt-0.5">finished goods</p>
                </Card>
                <Card className="border-violet-200/80 bg-violet-50/30">
                  <p className="text-xs font-bold uppercase tracking-wider text-violet-800">Dispatched</p>
                  <p className="mt-1.5 text-2xl font-black text-violet-700">{formatNumber(dispatchedTotal)}</p>
                  <p className="text-[11px] text-violet-600 font-medium mt-0.5">shipped to customers</p>
                </Card>
              </div>

              {/* Feedback Alert if present */}
              {success && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-800 flex items-center gap-2 shadow-xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {/* ─── Step 2: Interactive Production Flow Pipeline ─── */}
              <Card className="border-slate-200/80 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-4 pb-3 border-b border-slate-100">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">2</span>
                      Live Stage Pipeline & Quick Action
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Click <span className="font-semibold text-slate-700">⚡ Advance</span> to move bottles to the next stage, or use the Jump menu for direct skips.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span> Stock Available
                    <span className="inline-block h-2 w-2 rounded-full bg-slate-300 ml-2"></span> Empty Stage
                  </div>
                </div>

                {/* Pipeline Stage Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
                  {processStages.map((stage, idx) => {
                    const qty = qtyAt(stage.id);
                    const hasStock = qty > 0;
                    const nextStage = processStages[idx + 1];
                    const isLastStage = idx === processStages.length - 1 || stage.name === 'Ready';

                    // Other stages for Jump menu (exclude current stage)
                    const otherStages = processStages.filter((s) => s.id !== stage.id);

                    const isSourceOfActive = activeAction?.type === 'stage-move' && activeAction.fromStageId === stage.id;
                    const isTargetOfActive = activeAction?.type === 'stage-move' && activeAction.toStageId === stage.id;

                    return (
                      <div
                        key={stage.id}
                        className={`relative rounded-2xl p-4 transition-all flex flex-col justify-between border ${
                          isSourceOfActive
                            ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-200 shadow-sm'
                            : isTargetOfActive
                            ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-200 shadow-sm'
                            : hasStock
                            ? 'border-emerald-200 bg-gradient-to-b from-white to-emerald-50/30 shadow-xs'
                            : 'border-slate-200/80 bg-slate-50/50 opacity-80'
                        }`}
                      >
                        <div>
                          {/* Stage Number & Name */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                              #{idx + 1}
                            </span>
                            {hasStock && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                Active
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-slate-900 text-sm">{stage.name}</h3>

                          {/* Raw Quantity Display */}
                          <div className="my-3">
                            <p className="text-2xl font-black text-slate-900">
                              {formatNumber(qty)}
                            </p>
                            <p className="text-[11px] font-medium text-slate-500">bottles available</p>
                          </div>
                        </div>

                        {/* Actions for this stage */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-100">
                          {hasStock ? (
                            <>
                              {/* If stage has stock and next stage exists: 1-Click Advance */}
                              {nextStage && (
                                <button
                                  type="button"
                                  onClick={() => startStageMove(stage.id, nextStage.id)}
                                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 active:scale-[0.98] transition"
                                >
                                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                                  <span>Advance → {nextStage.name}</span>
                                </button>
                              )}

                              {/* If stage is Ready: 1-Click Dispatch */}
                              {isLastStage && (
                                <button
                                  type="button"
                                  onClick={startDispatch}
                                  className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-[0.98] transition"
                                >
                                  <Truck className="h-3.5 w-3.5" />
                                  <span>Dispatch to Customer</span>
                                </button>
                              )}

                              {/* Jump to any other stage menu */}
                              {otherStages.length > 0 && (
                                <div className="relative">
                                  <select
                                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer text-center"
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        startStageMove(stage.id, e.target.value);
                                      }
                                    }}
                                  >
                                    <option value="">Jump / Transfer to ▾</option>
                                    {otherStages.map((target) => (
                                      <option key={target.id} value={target.id}>
                                        → {target.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="py-2 text-center text-[11px] font-semibold text-slate-400">
                              No stock to move
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* ─── Step 3: Active Transfer Action Panel ─── */}
              {activeAction && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Left: Transfer Card */}
                  <Card className="lg:col-span-6 border-indigo-200 bg-white shadow-md">
                    {/* Stage Movement Action */}
                    {activeAction.type === 'stage-move' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">3</span>
                            <h3 className="font-extrabold text-slate-900 text-sm">Confirm Stage Movement</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAction(null);
                              resetForm();
                              setFormError(null);
                            }}
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Visual Source -> Destination Banner */}
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">From Stage</p>
                              <p className="text-sm font-black text-indigo-950">
                                {stages?.find((s) => s.id === activeAction.fromStageId)?.name}
                              </p>
                              <p className="text-xs font-extrabold text-indigo-700 mt-0.5">
                                {formatNumber(activeSourceQty)} bottles available
                              </p>
                            </div>
                            <ArrowRight className="h-5 w-5 text-indigo-400 shrink-0 mx-2" />
                            <div className="flex-1 text-right">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">To Destination</p>
                              <p className="text-sm font-black text-indigo-950">
                                {stages?.find((s) => s.id === activeAction.toStageId)?.name}
                              </p>
                              <p className="text-xs font-semibold text-indigo-600 mt-0.5">
                                will receive stock
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Exact Raw Quantity Input */}
                        <Field label="How many bottles to move?" htmlFor="move-qty" required>
                          <div className="relative">
                            <input
                              id="move-qty"
                              type="number"
                              min={1}
                              max={activeSourceQty}
                              className={`${inputClass} text-base font-black pr-24 ${isOverQty ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/40' : ''}`}
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
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition flex items-center gap-1 shadow-xs"
                              >
                                <Zap className="h-3 w-3 text-amber-400" /> All ({formatNumber(activeSourceQty)})
                              </button>
                            )}
                          </div>
                          {isOverQty && (
                            <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-600">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              Exceeds available: Only {formatNumber(activeSourceQty)} bottles in source stage.
                            </div>
                          )}
                        </Field>

                        {/* Mandatory Filling Specifications (Cap Name & Atomizer Name) */}
                        {isFromFilling && (
                          <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50/80 via-indigo-50/50 to-sky-50/80 p-3.5 space-y-3 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black uppercase tracking-wider text-violet-900 flex items-center gap-1.5">
                                🧴 Mandatory Filling Specifications
                              </span>
                              <Badge label="Required for Filling" variant="violet" size="sm" />
                            </div>
                            <p className="text-[11px] text-violet-700 font-medium leading-relaxed">
                              Bottles completing the Filling stage must have both the cap and atomizer specifications registered before advancing.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <Field label="Cap Name / Model" htmlFor="cap-name" required>
                                <input
                                  id="cap-name"
                                  className={`${inputClass} font-semibold`}
                                  value={capName}
                                  onChange={(e) => setCapName(e.target.value)}
                                  placeholder="e.g. Gold Metal Screw Cap 24mm"
                                  disabled={submitting}
                                  required
                                />
                              </Field>
                              <Field label="Atomizer Name / Model" htmlFor="atomizer-name" required>
                                <input
                                  id="atomizer-name"
                                  className={`${inputClass} font-semibold`}
                                  value={atomizerName}
                                  onChange={(e) => setAtomizerName(e.target.value)}
                                  placeholder="e.g. Fine Mist Spray Pump 24/410"
                                  disabled={submitting}
                                  required
                                />
                              </Field>
                            </div>
                          </div>
                        )}

                        {/* Optional Operator & Remarks */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <Field label="Operator / Done By (Optional)" htmlFor="done-by">
                            <input
                              id="done-by"
                              className={inputClass}
                              value={moveDoneBy}
                              onChange={(e) => setMoveDoneBy(e.target.value)}
                              placeholder="e.g. Ramesh / Shift A"
                              disabled={submitting}
                            />
                          </Field>
                          <Field label="Remarks (Optional)" htmlFor="remarks">
                            <input
                              id="remarks"
                              className={inputClass}
                              value={moveRemarks}
                              onChange={(e) => setMoveRemarks(e.target.value)}
                              placeholder="e.g. Machine #2"
                              disabled={submitting}
                            />
                          </Field>
                        </div>

                        {formError && <ErrorBanner message={formError} />}

                        {/* Submit Button */}
                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setActiveAction(null);
                              resetForm();
                            }}
                            disabled={submitting}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            loading={submitting}
                            disabled={!moveQty || isOverQty || activeSourceQty === 0 || (isFromFilling && (!capName.trim() || !atomizerName.trim())) || submitting}
                            onClick={handleMoveSubmit}
                            className="flex-1"
                          >
                            <ArrowRight className="h-4 w-4" />
                            {numericQty > 0 && !isOverQty
                              ? `Move ${formatNumber(numericQty)} Bottles Now`
                              : 'Confirm Stage Movement'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Customer Dispatch Action */}
                    {activeAction.type === 'dispatch' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">3</span>
                            <h3 className="font-extrabold text-slate-900 text-sm">Record Customer Dispatch</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAction(null);
                              resetForm();
                              setFormError(null);
                            }}
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Ready Stock Indicator */}
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Finished Ready Stock Available</p>
                          <p className="text-2xl font-black text-emerald-800 mt-1">
                            {formatNumber(readyQty)} <span className="text-xs font-semibold text-emerald-600">bottles</span>
                          </p>
                        </div>

                        {/* Dispatch Quantity */}
                        <Field label="Dispatch Quantity (Bottles)" htmlFor="disp-qty" required>
                          <div className="relative">
                            <input
                              id="disp-qty"
                              type="number"
                              min={1}
                              max={readyQty}
                              className={`${inputClass} text-base font-black pr-24 ${isOverQty ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/40' : ''}`}
                              value={dispatchQty}
                              onChange={(e) => setDispatchQty(e.target.value)}
                              placeholder={`1 to ${formatNumber(readyQty)}`}
                              disabled={readyQty === 0 || submitting}
                              autoFocus
                            />
                            {readyQty > 0 && (
                              <button
                                type="button"
                                onClick={() => setDispatchQty(String(readyQty))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition flex items-center gap-1 shadow-xs"
                              >
                                <Zap className="h-3 w-3 text-amber-300" /> All ({formatNumber(readyQty)})
                              </button>
                            )}
                          </div>
                          {isOverQty && (
                            <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-rose-600">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              Only {formatNumber(readyQty)} bottles ready for dispatch.
                            </div>
                          )}
                        </Field>

                        {/* Customer Name */}
                        <Field label="Customer / Client Name" htmlFor="cust-name" required>
                          <input
                            id="cust-name"
                            className={inputClass}
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="e.g. Acme Beverage Corp"
                            disabled={submitting}
                          />
                        </Field>

                        {/* Invoice & Date */}
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

                        {formError && <ErrorBanner message={formError} />}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setActiveAction(null);
                              resetForm();
                            }}
                            disabled={submitting}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            loading={submitting}
                            disabled={readyQty <= 0 || isOverQty || !dispatchQty || !customerName.trim() || !invoiceNo.trim() || submitting}
                            onClick={handleDispatchSubmit}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                          >
                            <Save className="h-4 w-4" />
                            {numericQty > 0 && !isOverQty
                              ? `Dispatch ${formatNumber(numericQty)} Bottles`
                              : 'Record Dispatch'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>

                  {/* Right: Selected Batch Reference */}
                  <div className="lg:col-span-6 space-y-4">
                    {selectedBatch.image_url && (
                      <Card className="p-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                          <ImageIcon className="h-4 w-4" /> Batch Reference Photo
                        </h4>
                        <a href={selectedBatch.image_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200">
                          <img
                            src={selectedBatch.image_url}
                            alt={selectedBatch.batch_no}
                            className="h-32 w-full object-cover hover:scale-105 transition duration-300"
                          />
                        </a>
                      </Card>
                    )}

                    <Card className="p-4 bg-slate-50/50 border-slate-200/80">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Movement Rules & Validation
                      </h4>
                      <ul className="text-xs text-slate-600 space-y-1.5 leading-relaxed">
                        <li>• Stock deductions and additions occur atomically in the ledger.</li>
                        <li>• You cannot move more bottles than are physically present at the source stage.</li>
                        <li>• Use <strong className="text-slate-800">⚡ Advance</strong> for normal sequence or <strong className="text-slate-800">Jump ▾</strong> for skipping stages or rework transfers.</li>
                      </ul>
                    </Card>
                  </div>
                </div>
              )}

              {/* ─── Step 4: Audit Trails (Movements & Dispatches) ─── */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Movement History */}
                <Card className="lg:col-span-6">
                  <h3 className="mb-3 flex items-center justify-between text-sm font-extrabold text-slate-900">
                    <span className="flex items-center gap-2">
                      <ArrowLeftRight className="h-4 w-4 text-slate-500" />
                      Stage Movement Timeline
                    </span>
                    <Badge label={`${movements.length} logged`} variant="default" size="sm" />
                  </h3>

                  {movements.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center border border-dashed rounded-xl">
                      No stage movements recorded for this batch yet.
                    </p>
                  ) : (
                    <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5 my-2">
                      {movements.map((m) => (
                        <li key={m.id} className="relative">
                          <span className="absolute -left-[27px] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-900 ring-4 ring-white" />
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200/70">
                            <span className="font-bold text-slate-900">
                              {m.from_stage?.name ?? '—'}{' '}
                              <ArrowRight className="mx-1 inline h-3 w-3 text-slate-400" />{' '}
                              {m.to_stage?.name ?? '—'}
                            </span>
                            <Badge label={`${formatNumber(m.qty_moved)} bottles`} variant="emerald" />
                          </div>
                          {(m.cap_name || m.atomizer_name) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
                              {m.cap_name && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-violet-100/80 px-2 py-0.5 text-[10px] font-bold text-violet-800 border border-violet-200">
                                  🧴 Cap: {m.cap_name}
                                </span>
                              )}
                              {m.atomizer_name && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-sky-100/80 px-2 py-0.5 text-[10px] font-bold text-sky-800 border border-sky-200">
                                  💨 Atomizer: {m.atomizer_name}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-medium px-1">
                            <span>{formatDate(m.moved_on)}</span>
                            {m.done_by && <span>Operator: {m.done_by}</span>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>

                {/* Dispatch History */}
                <Card className="lg:col-span-6">
                  <h3 className="mb-3 flex items-center justify-between text-sm font-extrabold text-slate-900">
                    <span className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-slate-500" />
                      Customer Dispatch Log
                    </span>
                    <Badge label={`${dispatches.length} shipments`} variant="default" size="sm" />
                  </h3>

                  {dispatches.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center border border-dashed rounded-xl">
                      No customer dispatches recorded for this batch yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Customer</th>
                            <th className="px-3 py-2">Invoice #</th>
                            <th className="px-3 py-2 text-right">Quantity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {dispatches.map((d) => (
                            <tr key={d.id} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2.5 text-slate-500">{formatDate(d.dispatched_on)}</td>
                              <td className="px-3 py-2.5 font-bold text-slate-800">{d.customer_name}</td>
                              <td className="px-3 py-2.5 text-slate-600">{d.invoice_no}</td>
                              <td className="px-3 py-2.5 text-right font-black text-slate-900">
                                {formatNumber(d.qty)} bottles
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
