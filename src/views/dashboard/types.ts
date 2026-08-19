import type { BatchWithRelations, MovementWithRelations, Dispatch } from '@/lib/supabase';

export type DashboardTab = 'batch-matrix' | 'stages' | 'transitions' | 'dispatches' | 'locations' | 'components';

export type KpiFilter = 'ALL' | 'IN_FACTORY' | 'RAW' | 'IN_PRODUCTION' | 'READY' | 'DISPATCHED' | 'STALLED';

export type DynamicContextType =
  | 'ALL'
  | 'RAW'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'DISPATCHED'
  | 'IN_FACTORY'
  | 'STALLED'
  | 'BOTTLES'
  | 'CAPS'
  | 'ATOMIZERS'
  | 'BOXES'
  | 'STAGE';

export type DynamicContext = {
  key: DynamicContextType;
  title: string;
  subtitle: string;
  badgeLabel: string;
  color: 'slate' | 'amber' | 'sky' | 'violet' | 'emerald' | 'rose';
  stageId?: string;
};

export type InspectedBatchItem = {
  batch: BatchWithRelations;
  stageQuantities: Record<string, number>;
  activeStages: { stageId: string; stageName: string; sequenceNo: number; qty: number }[];
  dispatchedQty: number;
  inFactoryQty: number;
  dispatches: Dispatch[];
  movements: MovementWithRelations[];
  customerNames: string[];
  isRawOnly: boolean;
  isReadyOnly: boolean;
  isInProduction: boolean;
  ageInDays: number;
  isStalled: boolean;
  resolvedCapName: string | null;
  resolvedAtomizerName: string | null;
  resolvedBoxName: string | null;
};

export type BatchMatrixRow = InspectedBatchItem;
