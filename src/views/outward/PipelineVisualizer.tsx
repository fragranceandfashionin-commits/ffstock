import { Zap, Truck, Flame } from 'lucide-react';
import { Card } from '@/components/ui';
import type { Stage } from '@/lib/supabase';
import type { ActiveAction } from './types';
import { formatNumber } from '@/lib/utils';

export type PipelineVisualizerProps = {
  processStages: Stage[];
  qtyAt: (stageId: string) => number;
  activeAction: ActiveAction;
  onStartStageMove: (fromStageId: string, toStageId: string) => void;
  onStartDispatch: () => void;
  onStartScrap: (stageId: string) => void;
  unitLabel: string;
};

export function PipelineVisualizer({
  processStages,
  qtyAt,
  activeAction,
  onStartStageMove,
  onStartDispatch,
  onStartScrap,
  unitLabel,
}: PipelineVisualizerProps) {
  return (
    <Card className="border-slate-200/90 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white shadow-2xs">
              2
            </span>
            Live Stage Pipeline & Quick Action
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Click <span className="font-semibold text-slate-700">⚡ Advance</span> to move {unitLabel} to the next stage, or use the Jump menu for direct skips.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span> Stock Available
          <span className="inline-block h-2 w-2 rounded-full bg-slate-300 ml-2"></span> Empty Stage
        </div>
      </div>

      {/* Responsive Single-Row / Multi-Col Pipeline */}
      <div className="flex md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-flow-col xl:auto-cols-fr gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-thin">
        {processStages.map((stage, idx) => {
          const qty = qtyAt(stage.id);
          const hasStock = qty > 0;
          const nextStage = processStages[idx + 1];
          const isLastStage = idx === processStages.length - 1 || stage.name === 'Ready';
          const otherStages = processStages.filter((s) => s.id !== stage.id);

          const isSourceOfActive = activeAction?.type === 'stage-move' && activeAction.fromStageId === stage.id;
          const isTargetOfActive = activeAction?.type === 'stage-move' && activeAction.toStageId === stage.id;

          return (
            <div
              key={stage.id}
              className={`min-w-[240px] xl:min-w-0 flex-1 snap-start relative rounded-2xl p-4 transition-all flex flex-col justify-between border ${
                isSourceOfActive
                  ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-200 shadow-sm'
                  : isTargetOfActive
                  ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-200 shadow-sm'
                  : hasStock
                  ? 'border-emerald-200 bg-gradient-to-b from-white to-emerald-50/30 shadow-2xs'
                  : 'border-slate-200/80 bg-slate-50/50 opacity-80'
              }`}
            >
              <div>
                {/* Stage Number & Name */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                    Stage #{idx + 1}
                  </span>
                  {hasStock && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                      Active
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-sm">{stage.name}</h3>

                {/* Quantity Display */}
                <div className="my-3">
                  <p className="text-2xl font-black text-slate-900">
                    {formatNumber(qty)}
                  </p>
                  <p className="text-[11px] font-medium text-slate-500">{unitLabel} available</p>
                </div>
              </div>

              {/* Actions for this stage */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                {hasStock ? (
                  <>
                    {/* 1-Click Advance */}
                    {nextStage && (
                      <button
                        type="button"
                        onClick={() => onStartStageMove(stage.id, nextStage.id)}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-2xs hover:bg-slate-800 active:scale-[0.98] transition cursor-pointer min-w-0"
                      >
                        <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">Advance → {nextStage.name}</span>
                      </button>
                    )}

                    {/* Ready -> Dispatch */}
                    {isLastStage && (
                      <button
                        type="button"
                        onClick={onStartDispatch}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 active:scale-[0.98] transition cursor-pointer min-w-0"
                      >
                        <Truck className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Dispatch to Customer</span>
                      </button>
                    )}

                    {/* Jump menu */}
                    {otherStages.length > 0 && (
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
                          {otherStages.map((target) => (
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
                      onClick={() => onStartScrap(stage.id)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/50 px-2 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 active:scale-[0.98] transition cursor-pointer"
                    >
                      <Flame className="h-3 w-3 text-rose-600" />
                      <span>Record Scrap Loss</span>
                    </button>
                  </>
                ) : (
                  <div className="py-2 text-center text-[11px] font-semibold text-slate-400">
                    No stock in stage
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
