/** Common bottle categories */
export const ITEM_CATEGORIES = [
  'Bottle',
  'Cap',
  'Atomizer',
  'Packaging',
  'Label',
  'Fragrance',
  'Raw Material',
  'Other',
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number] | string;

/** Common bottle colors used in fragrance & fashion manufacturing. */
export const COMMON_COLORS = [
  'Clear',
  'Frosted',
  'Amber',
  'Cobalt Blue',
  'Frosted Blue',
  'Gloss Black',
  'Matte Black',
  'Matte White',
  'Emerald Green',
  'Rose Gold',
  'Electroplated Gold',
  'Electroplated Silver',
  'Smoke Grey',
  'Ruby Red',
] as const;

export type CommonColor = (typeof COMMON_COLORS)[number];

/** Common printing, artwork & screen print finishes used in bottle decorating. */
export const COMMON_PRINTING_DESIGNS = [
  'Gold Foil Stamping',
  'Silver Foil Stamping',
  'Silk Screen White Logo',
  'Silk Screen Black Logo',
  'Silk Screen Metallic Gold',
  'UV Spot Varnish Artwork',
  'Embossed Brand Text',
  'Gradient Mask Print',
  'Full Wrap Floral Screen Print',
  'Custom Customer Artwork',
] as const;

export type CommonPrintingDesign = (typeof COMMON_PRINTING_DESIGNS)[number];

/** Common production scrap & defect loss reasons */
export const SCRAP_REASONS = [
  'Glass Breakage / Cracking',
  'Screen Print / Foil Misalignment',
  'Color Coating Unevenness / Blemish',
  'Filling Leakage / Volume Defect',
  'Crimping / Atomizer Pump Failure',
  'Cap Fitting / Thread Defect',
  'Box / Packaging Scratch or Tear',
  'Quality Control (QC) Laboratory Rejection',
  'Machine Jam / Setup Waste',
  'Other / Unspecified Loss',
] as const;

export type ScrapReason = (typeof SCRAP_REASONS)[number];
