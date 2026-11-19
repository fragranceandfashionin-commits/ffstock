import { ITEM_CATEGORIES } from '@/lib/constants';
import type { MaterialAllocation } from '@/lib/supabase';

/**
 * Intelligent category mapper to pre-select the appropriate inventory category
 * based on BOM component name (e.g. Bottles -> Bottle, Cap -> Cap, Box -> Packaging)
 */
export function getCategoryForComponent(componentName: string): string {
  const comp = (componentName || '').toLowerCase().trim();
  if (comp.includes('bottle') || comp.includes('flask') || comp.includes('vial')) return 'Bottle';
  if (comp.includes('cap') || comp.includes('closure') || comp.includes('lid') || comp.includes('collar')) return 'Cap';
  if (comp.includes('atomizer') || comp.includes('pump') || comp.includes('spray') || comp.includes('nozzle') || comp.includes('crimper')) return 'Atomizer';
  if (comp.includes('box') || comp.includes('pack') || comp.includes('inner outer') || comp.includes('cellophane') || comp.includes('carton')) return 'Packaging';
  if (comp.includes('sticker') || comp.includes('label') || comp.includes('tag')) return 'Label';
  if (comp.includes('fragrance') || comp.includes('perfume') || comp.includes('oil') || comp.includes('scent') || comp.includes('essence')) return 'Fragrance';
  if (comp.includes('raw') || comp.includes('alcohol') || comp.includes('ethanol') || comp.includes('chemical') || comp.includes('solvent')) return 'Raw Material';

  // Direct match with ITEM_CATEGORIES
  const matched = ITEM_CATEGORIES.find((c) => c.toLowerCase() === comp);
  if (matched) return matched;

  return 'Other';
}

/**
 * Retrieve current specification text for an allocation from DOM input or saved record
 */
export function getSpecificationText(alloc: MaterialAllocation): string {
  const inputEl = document.getElementById(`alloc-spec-${alloc.id}`) as HTMLInputElement | null;
  if (inputEl && inputEl.value !== undefined) {
    return inputEl.value.trim();
  }
  return (alloc.description || '').trim();
}
