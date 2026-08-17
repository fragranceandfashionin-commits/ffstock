export type View = 'dashboard' | 'inward' | 'outward' | 'suppliers' | 'items';

export type StageStock = {
  stage_id: string;
  stage_name: string;
  sequence_no: number;
  qty: number;
};

export type BatchStock = {
  batch_id: string;
  stage_id: string;
  stage_name: string;
  sequence_no: number;
  qty: number;
};

export type LocationStock = {
  location: string;
  qty: number;
};
