import { Zap, Truck, Flame, ArrowRight, Layers } from 'lucide-react';
import { Card } from '@/components/ui';

import type { Stage } from '@/lib/supabase';
import type { ActiveAction } from './types';
import { formatNumber } from '@/lib/utils';
import { useAuth } from '@/lib/auth';

export type PipelineVisualizerProps = {
  processStages: Stage[];
  qtyAt: (stageId: string) => number;
  activeAction: ActiveAction;
  onStartStageMove: (fromStageId: string, toStageId: string) => void;
  onStartDispatch: () => void;
  onStartScrap: (stageId: string) => void;
  unitLabel: string;
  dispatchedTotal?: number;
  dispatchesCount?: number;
  onViewDispatchLog?: () => void;
};

export function PipelineVisualizer({
  processStages,
  qtyAt,
  activeAction,
  onStartStageMove,
  onStartDispatch,
  onStartScrap,
  unitLabel,
  dispatchedTotal = 0,
  dispatchesCount = 0,
  onViewDispatchLog,
}: PipelineVisualizerProps) {
  const { role, roleDefinition, canPerform, canTransitionStage } = useAuth();
  const totalStockInPipeline = processStages.reduce((sum, s) => sum + qtyAt(s.id), 0);
  const activeStagesCount = processStages.filter((s) => qtyAt(s.id) > 0).length;

  return (
    <Card className="border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header & Situational Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white shadow-2xs">
              2
            </span>
            Live Stage Pipeline & Conveyor Flow
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Physical stock movement along the assembly line. Click <span className="font-semibold text-slate-800">⚡ Advance</span> to transition units forward.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {activeStagesCount} of {processStages.length} Stages Active
          </span>
        </div>
      </div>

      {/* Pipeline Throughput Progress Track */}
      {totalStockInPipeline > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-indigo-600" />
              Batch Pipeline Distribution ({formatNumber(totalStockInPipeline)} {unitLabel} total)
            </span>
            <span className="text-slate-400 font-medium">Stage 1 → Ready</span>
          </div>

          <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden flex shadow-inner">
            {processStages.map((stage, idx) => {
              const qty = qtyAt(stage.id);
              if (qty <= 0) return null;
              const pct = (qty / totalStockInPipeline) * 100;
              const colors = [
                'bg-slate-700',
                'bg-blue-600',
                'bg-indigo-600',
                'bg-violet-600',
                'bg-purple-600',
                'bg-emerald-600',
                'bg-teal-600',
              ];
              const colorClass = colors[idx % colors.length];

              return (
                <div
                  key={stage.id}
                  style={{ width: `${pct}%` }}
                  className={`${colorClass} h-full transition-all duration-300 relative group`}
                  title={`${stage.name}: ${formatNumber(qty)} ${unitLabel} (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Connected Responsive Conveyor Pipeline */}
      <div className="relative">
        <div className="flex md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-flow-col xl:auto-cols-fr gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-thin">
          {processStages.map((stage, idx) => {
            const qty = qtyAt(stage.id);
            const hasStock = qty > 0;
            const nextStage = processStages[idx + 1];
            const isLastStage = idx === processStages.length - 1 || stage.name === 'Ready';
            const otherStages = processStages.filter((s) => s.id !== stage.id);

            const isSourceOfActive = activeAction?.type === 'stage-move' && activeAction.fromStageId === stage.id;
            const isTargetOfActive = activeAction?.type === 'stage-move' && activeAction.toStageId === stage.id;

            const stagePct = totalStockInPipeline > 0 ? Math.round((qty / totalStockInPipeline) * 100) : 0;

            return (
              <div
                key={stage.id}
                className={`min-w-[250px] xl:min-w-0 flex-1 snap-start relative rounded-2xl p-4 transition-all duration-200 flex flex-col justify-between border ${
                  isSourceOfActive
                    ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-400 shadow-md scale-[1.01]'
                    : isTargetOfActive
                    ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-400 shadow-md scale-[1.01]'
                    : hasStock
                    ? 'border-emerald-200/90 bg-gradient-to-b from-white to-emerald-50/20 shadow-xs hover:border-emerald-300'
                    : 'border-slate-200/70 bg-slate-50/40 opacity-75 hover:opacity-100'
                }`}
              >
                <div>
                  {/* Stage Number & Status Pill */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      <span className="h-4 w-4 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      Stage
                    </span>

                    {isSourceOfActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-black text-white shadow-2xs">
                        Source
                      </span>
                    ) : isTargetOfActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white shadow-2xs">
                        Target Destination
                      </span>
                    ) : hasStock ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">Empty</span>
                    )}
                  </div>

                  {/* Stage Name */}
                  <h3 className="font-extrabold text-slate-900 text-sm tracking-tight flex items-center justify-between">
                    <span>{stage.name}</span>
                    {nextStage && (
                      <ArrowRight className="hidden xl:block h-3.5 w-3.5 text-slate-300 -mr-1" />
                    )}
                  </h3>

                  {/* Quantity Display */}
                  <div className="my-3">
                    <div className="flex items-baseline gap-1.5">
                      <p className={`text-2xl font-black ${hasStock ? 'text-slate-900' : 'text-slate-400'}`}>
                        {formatNumber(qty)}
                      </p>
                      <span className="text-xs font-bold text-slate-500">{unitLabel}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mt-0.5">
                      <span>{hasStock ? `${stagePct}% of stock` : 'No units here'}</span>
                    </div>
                  </div>
                </div>

                {/* Actions for this stage */}
                {(() => {
                  const canAdvance = !!nextStage && canPerform('stage_move') && canTransitionStage(stage.sequence_no, nextStage.sequence_no);
                  const canDispatch = isLastStage && canPerform('dispatch');
                  const allowedJumpStages = otherStages.filter((target) =>
                    canPerform('stage_move') && canTransitionStage(stage.sequence_no, target.sequence_no)
                  );
                  const canScrap = role === 'admin' || (canPerform('stage_move') && canTransitionStage(stage.sequence_no, 8));

                  return (
                    <div className="space-y-1.5 pt-2.5 border-t border-slate-100">
                      {hasStock ? (
                        <>
                          {/* 1-Click Advance */}
                          {nextStage && (
                            <button
                              type="button"
                              onClick={() => canAdvance && onStartStageMove(stage.id, nextStage.id)}
                              disabled={!canAdvance}
                              title={
                                canAdvance
                                  ? `Advance ${stage.name} to ${nextStage.name}`
                                  : role === 'viewer'
                                  ? 'Factory workstation is currently in read-only Auditor mode. Click "Station Sign In" in the top bar to authenticate as Admin or Operator.'
                                  : `Role (${roleDefinition.name}) not authorized to advance from ${stage.name} to ${nextStage.name}`
                              }
                              className={`w-full flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition min-w-0 ${
                                canAdvance
                                  ? 'bg-slate-900 text-white shadow-xs hover:bg-indigo-950 active:scale-[0.98] cursor-pointer'
                                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                              }`}
                            >
                              <Zap className={`h-3.5 w-3.5 shrink-0 ${canAdvance ? 'text-amber-400' : 'text-slate-400'}`} />
                              <span className="truncate">
                                {canAdvance
                                  ? `Advance → ${nextStage.name}`
                                  : role === 'viewer'
                                  ? 'Sign In to Advance'
                                  : `Advance → ${nextStage.name}`}
                              </span>
                            </button>
                          )}

                          {/* Ready -> Dispatch */}
                          {isLastStage && (
                            <button
                              type="button"
                              onClick={() => canDispatch && onStartDispatch()}
                              disabled={!canDispatch}
                              title={canDispatch ? 'Dispatch to Customer' : `Role (${roleDefinition.name}) requires Dispatch Manager or Admin`}
                              className={`w-full flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition min-w-0 ${
                                canDispatch
                                  ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 active:scale-[0.98] cursor-pointer'
                                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                              }`}
                            >
                              <Truck className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">Dispatch to Customer</span>
                            </button>
                          )}

                          {/* Jump menu */}
                          {allowedJumpStages.length > 0 && (
                            <div className="relative">
                              <select
                                className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer text-center"
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    onStartStageMove(stage.id, e.target.value);
                                  }
                                }}
                              >
                                <option value="">Jump / Transfer to ▾</option>
                                {allowedJumpStages.map((target) => (
                                  <option key={target.id} value={target.id}>
                                    → {target.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Record Scrap */}
                          <button
                            type="button"
                            onClick={() => canScrap && onStartScrap(stage.id)}
                            disabled={!canScrap}
                            title={canScrap ? 'Record Scrap Loss' : `Role (${roleDefinition.name}) not authorized for scrap recording at this stage`}
                            className={`w-full flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                              canScrap
                                ? 'border-rose-200 bg-rose-50/50 text-rose-700 hover:bg-rose-100 active:scale-[0.98] cursor-pointer'
                                : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-50'
                            }`}
                          >
                            <Flame className={`h-3 w-3 ${canScrap ? 'text-rose-600' : 'text-slate-400'}`} />
                            <span>Record Scrap Loss</span>
                          </button>
                        </>
                      ) : (
                        <div className="py-2 text-center text-[11px] font-medium text-slate-400 italic">
                          Stage is idle
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* Terminal Outward Dispatched Milestone Card */}
          <div
            className={`min-w-[250px] xl:min-w-0 flex-1 snap-start relative rounded-2xl p-4 transition-all duration-200 flex flex-col justify-between border ${
              dispatchedTotal > 0
                ? 'border-violet-200/90 bg-gradient-to-b from-white to-violet-50/30 shadow-xs hover:border-violet-300'
                : 'border-slate-200/70 bg-slate-50/40 opacity-75 hover:opacity-100'
            }`}
          >
            <div>
              {/* Milestone Badge & Status Pill */}
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-violet-700">
                  <span className="h-4 w-4 rounded-full bg-violet-100 text-violet-800 flex items-center justify-center text-[10px] font-bold">
                    ✓
                  </span>
                  Terminal Outward
                </span>

                {dispatchedTotal > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800 border border-violet-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                    Fulfilled
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400">Awaiting Orders</span>
                )}
              </div>

              {/* Card Title */}
              <h3 className="font-extrabold text-slate-900 text-sm tracking-tight flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Truck className="h-4 w-4 text-violet-600" />
                  Dispatched to Clients
                </span>
              </h3>

              {/* Quantity Display */}
              <div className="my-3">
                <div className="flex items-baseline gap-1.5">
                  <p className={`text-2xl font-black ${dispatchedTotal > 0 ? 'text-violet-950' : 'text-slate-400'}`}>
                    {formatNumber(dispatchedTotal)}
                  </p>
                  <span className="text-xs font-bold text-slate-500">{unitLabel}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mt-0.5">
                  <span>
                    {dispatchesCount > 0
                      ? `${dispatchesCount} shipment${dispatchesCount === 1 ? '' : 's'} fulfilled`
                      : '0 client shipments'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions for Dispatched Milestone */}
            <div className="space-y-1.5 pt-2.5 border-t border-slate-100">
              {dispatchedTotal > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (onViewDispatchLog) {
                      onViewDispatchLog();
                    } else {
                      const el = document.getElementById('movement-audit-trail');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50/70 hover:bg-violet-100 px-3 py-2 text-xs font-extrabold text-violet-800 transition active:scale-[0.98] cursor-pointer shadow-2xs"
                >
                  <Truck className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                  <span className="truncate">View Dispatch Log</span>
                </button>
              ) : (
                <div className="py-2 text-center text-[11px] font-medium text-slate-400 italic">
                  Awaiting dispatch orders
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
