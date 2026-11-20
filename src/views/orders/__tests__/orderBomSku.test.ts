import { describe, it, expect } from 'vitest';
import { getCategoryForComponent, sortAllocations, isAllocationDeletable } from '../orderBomUtils';
import type { MaterialAllocation } from '@/lib/supabase';

describe('Orders BOM SKU Creation & Smart Pre-fill', () => {
  describe('getCategoryForComponent', () => {
    it('maps bottle component names to Bottle category', () => {
      expect(getCategoryForComponent('Bottles')).toBe('Bottle');
      expect(getCategoryForComponent('Bottle')).toBe('Bottle');
      expect(getCategoryForComponent('50ml Glass Bottle')).toBe('Bottle');
      expect(getCategoryForComponent('Perfume Vial')).toBe('Bottle');
    });

    it('maps cap and closure component names to Cap category', () => {
      expect(getCategoryForComponent('Cap')).toBe('Cap');
      expect(getCategoryForComponent('Caps')).toBe('Cap');
      expect(getCategoryForComponent('Magnetic Closure')).toBe('Cap');
      expect(getCategoryForComponent('Aluminium Collar')).toBe('Cap');
    });

    it('maps atomizer and pump component names to Atomizer category', () => {
      expect(getCategoryForComponent('Atomizer')).toBe('Atomizer');
      expect(getCategoryForComponent('Spray Pump')).toBe('Atomizer');
      expect(getCategoryForComponent('Mist Nozzle')).toBe('Atomizer');
      expect(getCategoryForComponent('Crimper')).toBe('Atomizer');
    });

    it('maps packaging, box, cellophane and carton components to Packaging category', () => {
      expect(getCategoryForComponent('Box')).toBe('Packaging');
      expect(getCategoryForComponent('Inner Outer')).toBe('Packaging');
      expect(getCategoryForComponent('Cellophane')).toBe('Packaging');
      expect(getCategoryForComponent('Mono Carton')).toBe('Packaging');
      expect(getCategoryForComponent('Packaging Box')).toBe('Packaging');
    });

    it('maps sticker and label components to Label category', () => {
      expect(getCategoryForComponent('Sticker')).toBe('Label');
      expect(getCategoryForComponent('Label')).toBe('Label');
      expect(getCategoryForComponent('Metallic Tag')).toBe('Label');
    });

    it('maps fragrance and oil components to Fragrance category', () => {
      expect(getCategoryForComponent('Fragrance')).toBe('Fragrance');
      expect(getCategoryForComponent('Perfume Oil')).toBe('Fragrance');
      expect(getCategoryForComponent('Scent Base')).toBe('Fragrance');
      expect(getCategoryForComponent('Essence')).toBe('Fragrance');
    });

    it('maps raw materials, solvents and alcohol to Raw Material category', () => {
      expect(getCategoryForComponent('Raw Material')).toBe('Raw Material');
      expect(getCategoryForComponent('Ethanol 99.9%')).toBe('Raw Material');
      expect(getCategoryForComponent('Chemical Solvent')).toBe('Raw Material');
    });

    it('defaults unknown components to Other', () => {
      expect(getCategoryForComponent('Random Accessory')).toBe('Other');
      expect(getCategoryForComponent('')).toBe('Other');
    });
  });

  describe('sortAllocations (Compound Deterministic BOM Ordering)', () => {
    const makeAlloc = (id: string, name: string, sortOrder: number, createdAt: string): MaterialAllocation => ({
      id,
      order_id: 'ord-1',
      component_name: name,
      sort_order: sortOrder,
      source: 'vendor',
      description: null,
      vendor_id: null,
      stock_item_id: null,
      timeline: null,
      status: 'pending',
      received_at: null,
      remarks: null,
      created_at: createdAt,
    });

    it('sorts canonical components by sort_order ascending', () => {
      const items: MaterialAllocation[] = [
        makeAlloc('3', 'Box', 4, '2026-11-20T10:00:00Z'),
        makeAlloc('1', 'Bottles', 1, '2026-11-20T10:00:00Z'),
        makeAlloc('2', 'Raw Material', 2, '2026-11-20T10:00:00Z'),
      ];

      const sorted = sortAllocations(items);
      expect(sorted.map((i) => i.component_name)).toEqual(['Bottles', 'Raw Material', 'Box']);
    });

    it('groups duplicated components contiguously in chronological order', () => {
      const items: MaterialAllocation[] = [
        makeAlloc('box', 'Box', 4, '2026-11-20T10:00:00Z'),
        makeAlloc('rm-1', 'Raw Material', 2, '2026-11-20T10:00:00Z'),
        makeAlloc('bot', 'Bottles', 1, '2026-11-20T10:00:00Z'),
        makeAlloc('rm-3', 'Raw Material', 2, '2026-11-20T10:02:00Z'),
        makeAlloc('stk', 'Sticker', 3, '2026-11-20T10:00:00Z'),
        makeAlloc('rm-2', 'Raw Material', 2, '2026-11-20T10:01:00Z'),
      ];

      const sorted = sortAllocations(items);
      expect(sorted.map((i) => i.id)).toEqual(['bot', 'rm-1', 'rm-2', 'rm-3', 'stk', 'box']);
    });

    it('places ad-hoc custom components at the end', () => {
      const items: MaterialAllocation[] = [
        makeAlloc('custom-1', 'Ribbon', 99, '2026-11-20T10:05:00Z'),
        makeAlloc('bot', 'Bottles', 1, '2026-11-20T10:00:00Z'),
        makeAlloc('custom-0', 'Custom Box', 99, '2026-11-20T10:01:00Z'),
      ];

      const sorted = sortAllocations(items);
      expect(sorted.map((i) => i.id)).toEqual(['bot', 'custom-0', 'custom-1']);
    });

    it('handles empty or single item arrays without mutating input', () => {
      expect(sortAllocations([])).toEqual([]);
      const single = [makeAlloc('1', 'Bottles', 1, '2026-11-20T10:00:00Z')];
      const result = sortAllocations(single);
      expect(result).toEqual(single);
      expect(result).not.toBe(single); // immutable copy
    });
  });

  describe('isAllocationDeletable', () => {
    const makeAlloc = (
      id: string,
      name: string,
      sortOrder: number,
      status: 'pending' | 'received' = 'pending'
    ): MaterialAllocation => ({
      id,
      order_id: 'ord-1',
      component_name: name,
      sort_order: sortOrder,
      source: 'vendor',
      description: null,
      vendor_id: null,
      stock_item_id: null,
      timeline: null,
      status,
      received_at: status === 'received' ? '2026-11-20T12:00:00Z' : null,
      remarks: null,
      created_at: '2026-11-20T10:00:00Z',
    });

    it('prevents deletion of solitary canonical base component', () => {
      const bot = makeAlloc('bot-1', 'Bottles', 1);
      const rm = makeAlloc('rm-1', 'Raw Material', 2);
      const all = [bot, rm];

      expect(isAllocationDeletable(bot, all)).toBe(false);
      expect(isAllocationDeletable(rm, all)).toBe(false);
    });

    it('allows deletion of duplicate component lines when count > 1 and pending', () => {
      const rm1 = makeAlloc('rm-1', 'Raw Material', 2, 'pending');
      const rm2 = makeAlloc('rm-2', 'Raw Material', 2, 'pending');
      const all = [rm1, rm2];

      expect(isAllocationDeletable(rm1, all)).toBe(true);
      expect(isAllocationDeletable(rm2, all)).toBe(true);
    });

    it('strictly forbids deletion of received duplicate lines', () => {
      const rm1 = makeAlloc('rm-1', 'Raw Material', 2, 'received');
      const rm2 = makeAlloc('rm-2', 'Raw Material', 2, 'pending');
      const all = [rm1, rm2];

      expect(isAllocationDeletable(rm1, all)).toBe(false);
      expect(isAllocationDeletable(rm2, all)).toBe(true);
    });

    it('allows deletion of custom component lines with sort_order > 10 when pending', () => {
      const custom = makeAlloc('custom-1', 'Special Pump', 99, 'pending');
      const bot = makeAlloc('bot-1', 'Bottles', 1, 'pending');
      const all = [bot, custom];

      expect(isAllocationDeletable(custom, all)).toBe(true);
    });

    it('forbids deletion of custom component lines if already received', () => {
      const custom = makeAlloc('custom-1', 'Special Pump', 99, 'received');
      const all = [custom];

      expect(isAllocationDeletable(custom, all)).toBe(false);
    });
  });
});
