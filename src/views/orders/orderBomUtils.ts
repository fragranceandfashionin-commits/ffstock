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

/**
 * Deterministic compound comparator for Bill of Materials (BOM) allocations.
 * Groups duplicate component lines contiguously under their parent component
 * by sort_order ascending, breaking ties deterministically with created_at ascending.
 */
export function sortAllocations(allocations: MaterialAllocation[]): MaterialAllocation[] {
  return [...allocations].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeA - timeB;
  });
}

/**
 * Evaluates whether a BOM component line is eligible for deletion.
 * - Received allocations cannot be deleted (must revert to pending first).
 * - Ad-hoc custom components (sort_order > 10) can be deleted if pending.
 * - Duplicated canonical components (count > 1 for same component_name) can be deleted if pending.
 * - Solitary base canonical components (count === 1) are protected from accidental deletion.
 */
export function isAllocationDeletable(
  alloc: MaterialAllocation,
  allAllocations: MaterialAllocation[]
): boolean {
  if (alloc.status === 'received') return false;

  // Custom rows (sort_order > 10) are always deletable when pending
  if (alloc.sort_order > 10) return true;

  // For canonical rows, allow deletion only if there is more than one row with this component_name
  const duplicateCount = allAllocations.filter(
    (a) => a.component_name.toLowerCase().trim() === alloc.component_name.toLowerCase().trim()
  ).length;

  return duplicateCount > 1;
}
