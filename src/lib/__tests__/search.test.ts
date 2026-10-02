import { describe, it, expect } from 'vitest';
import {
  normalizeSearchText,
  toCompactString,
  getLevenshteinDistance,
  parseSearchQuery,
  matchToken,
  buildItemGroupIndex,
  searchAndScoreItemGroups,
  getMatchRanges,
} from '@/lib/search';
import type { ItemGroup } from '@/views/outward/types';

describe('Search Engine - Algorithms & Unit Tests', () => {
  describe('normalizeSearchText & toCompactString', () => {
    it('strips diacritics and accents', () => {
      expect(normalizeSearchText('Café Flambé')).toBe('cafe flambe');
      expect(toCompactString('Café Flambé')).toBe('cafeflambe');
    });

    it('separates unit glues and numbers', () => {
      expect(normalizeSearchText('100ml')).toBe('100 ml');
      expect(normalizeSearchText('500pcs')).toBe('500 pcs');
      expect(normalizeSearchText('bay2a')).toBe('bay 2 a');
    });

    it('compacts hyphenated and punctuated strings cleanly', () => {
      expect(toCompactString('FNF-2008-CPB')).toBe('fnf2008cpb');
      expect(toCompactString('Bay 2-A')).toBe('bay2a');
      expect(toCompactString('2026-09-16')).toBe('20260916');
    });
  });

  describe('getLevenshteinDistance', () => {
    it('calculates correct edit distances', () => {
      expect(getLevenshteinDistance('bottle', 'bottel')).toBe(2);
      expect(getLevenshteinDistance('perfume', 'perfum')).toBe(1);
      expect(getLevenshteinDistance('lobby', 'loby')).toBe(1);
      expect(getLevenshteinDistance('same', 'same')).toBe(0);
    });
  });

  describe('parseSearchQuery', () => {
    it('expands query into normalized and compact tokens', () => {
      const parsed = parseSearchQuery('100ml bay 2a');
      expect(parsed.tokens).toContain('100');
      expect(parsed.tokens).toContain('ml');
      expect(parsed.tokens).toContain('100ml');
      expect(parsed.tokens).toContain('bay');
      expect(parsed.tokens).toContain('2');
      expect(parsed.tokens).toContain('a');
      expect(parsed.compactQuery).toBe('100mlbay2a');
    });
  });

  describe('matchToken - Strict vs Fuzzy Behavior', () => {
    it('allows typo tolerance for words >= 4 chars', () => {
      const words = ['bottle', 'perfume', 'lobby'];
      expect(matchToken('bottel', words, 'bottleperfumelobby').matched).toBe(true);
      expect(matchToken('perfum', words, 'bottleperfumelobby').matched).toBe(true);
      expect(matchToken('loby', words, 'bottleperfumelobby').matched).toBe(true);
    });

    it('strictly disables typo tolerance for short codes (< 4 chars) and numbers', () => {
      const words = ['cu9', 'rd5', '1880'];
      const compact = 'cu9rd51880';
      // Exact match works
      expect(matchToken('cu9', words, compact).matched).toBe(true);
      // Typo does NOT match short code
      expect(matchToken('cu8', words, compact).matched).toBe(false);
      expect(matchToken('rd4', words, compact).matched).toBe(false);
      // Typo does NOT match number
      expect(matchToken('1881', words, compact).matched).toBe(false);
    });
  });

  describe('getMatchRanges - Highlighting Mathematics', () => {
    it('returns exact match ranges without crashing', () => {
      const text = '100 ml Jeans perfume bottle plain';
      const ranges = getMatchRanges(text, '100ml jeans');
      expect(ranges.length).toBeGreaterThanOrEqual(1);

      // Verify that every range slices valid text
      ranges.forEach((r) => {
        expect(r.start).toBeGreaterThanOrEqual(0);
        expect(r.end).toBeLessThanOrEqual(text.length);
        expect(r.end).toBeGreaterThan(r.start);
      });
    });

    it('merges overlapping ranges cleanly', () => {
      const text = '100 ml Jeans';
      const ranges = getMatchRanges(text, '100 100ml');
      // Overlapping ranges should be merged into a single continuous range
      expect(ranges.length).toBe(1);
      expect(ranges[0].start).toBe(0);
      expect(ranges[0].end).toBe(6); // "100 ml"
    });

    it('handles regex special characters safely', () => {
      const text = 'Bay (2-A)* [Special]';
      expect(() => getMatchRanges(text, 'bay (2-a)* [special]')).not.toThrow();
      const ranges = getMatchRanges(text, 'bay (2-a)* [special]');
      expect(ranges.length).toBeGreaterThan(0);
    });

    it('highlights compact hyphenated and unit-glued spans across delimiters', () => {
      const batchText = 'FNF-2008-CPB';
      const batchRanges = getMatchRanges(batchText, 'fnf2008');
      expect(batchRanges.length).toBe(1);
      expect(batchText.slice(batchRanges[0].start, batchRanges[0].end)).toBe('FNF-2008');

      const locText = 'Bay 2-A';
      const locRanges = getMatchRanges(locText, 'bay2a');
      expect(locRanges.length).toBe(1);
      expect(locText.slice(locRanges[0].start, locRanges[0].end)).toBe('Bay 2-A');
    });
  });

  describe('Full ItemGroup Search & Multi-Entity Matching Scenarios', () => {
    const mockGroups: ItemGroup[] = [
      {
        item_id: 'item-1',
        item: {
          id: 'item-1',
          name: '100 ml Jeans perfume bottle plain',
          category: 'Bottle',
          unit: 'pcs',
          color: 'Clear',
          created_at: '2026-01-01',
        },
        totalIntake: 1880,
        locations: ['Room 1', 'Bay 2-A'],
        supplierNames: ['Alpha Supplies'],
        batches: [
          {
            id: 'batch-101',
            batch_no: 'FNF-2008-CPB',
            item_id: 'item-1',
            supplier_id: 'sup-1',
            received_on: '2026-08-22',
            qty_received: 351,
            location: 'Room 1',
            image_url: null,
            brand_name: 'Jeans Brand',
            color: 'Clear',
            created_at: '2026-08-22',
            supplier: { id: 'sup-1', name: 'Alpha Supplies', contact: null, created_at: '2026-01-01' },
            item: null,
          },
          {
            id: 'batch-102',
            batch_no: 'FNF-2609-RD5',
            item_id: 'item-1',
            supplier_id: 'sup-1',
            received_on: '2026-09-16',
            qty_received: 1529,
            location: 'Bay 2-A',
            image_url: null,
            brand_name: 'Jeans Brand',
            color: 'Clear',
            created_at: '2026-09-16',
            supplier: { id: 'sup-1', name: 'Alpha Supplies', contact: null, created_at: '2026-01-01' },
            item: null,
          },
        ],
      },
      {
        item_id: 'item-2',
        item: {
          id: 'item-2',
          name: 'Golden Cap 18mm Luxury',
          category: 'Cap',
          unit: 'pcs',
          color: 'Gold',
          created_at: '2026-01-01',
        },
        totalIntake: 500,
        locations: ['Shelf C'],
        supplierNames: ['Beta Caps'],
        batches: [
          {
            id: 'batch-201',
            batch_no: 'CU9',
            item_id: 'item-2',
            supplier_id: 'sup-2',
            received_on: '2026-07-10',
            qty_received: 500,
            location: 'Shelf C',
            image_url: null,
            brand_name: 'Luxury Brand',
            color: 'Gold',
            created_at: '2026-07-10',
            supplier: { id: 'sup-2', name: 'Beta Caps', contact: null, created_at: '2026-01-01' },
            item: null,
          },
        ],
      },
    ];

    const indexes = mockGroups.map(buildItemGroupIndex);

    it('Scenario 1: Spacing & Unit Glues - "100ml" matches "100 ml Jeans perfume bottle plain"', () => {
      const results = searchAndScoreItemGroups(indexes, '100ml');
      expect(results.has('item-1')).toBe(true);
      expect(results.has('item-2')).toBe(false);
    });

    it('Scenario 2: Hyphen & Punctuation Insensitivity - "fnf 2008" and "fnf2008" match "FNF-2008-CPB"', () => {
      const resSpaced = searchAndScoreItemGroups(indexes, 'fnf 2008');
      expect(resSpaced.has('item-1')).toBe(true);
      expect(resSpaced.get('item-1')?.matchingBatchIds.has('batch-101')).toBe(true);

      const resCompact = searchAndScoreItemGroups(indexes, 'fnf2008');
      expect(resCompact.has('item-1')).toBe(true);
      expect(resCompact.get('item-1')?.matchingBatchIds.has('batch-101')).toBe(true);

      const resLoc = searchAndScoreItemGroups(indexes, 'bay 2a');
      expect(resLoc.has('item-1')).toBe(true);
      expect(resLoc.get('item-1')?.matchingBatchIds.has('batch-102')).toBe(true);
    });

    it('Scenario 3: Word Order Inversion & Incomplete Names - "plain bottle jeans 100ml"', () => {
      const results = searchAndScoreItemGroups(indexes, 'plain bottle jeans 100ml');
      expect(results.has('item-1')).toBe(true);
      expect(results.has('item-2')).toBe(false);
    });

    it('Scenario 4: Cross-Entity Multi-Attribute Queries - "jeans room 1" matches item and flags batch-101', () => {
      const results = searchAndScoreItemGroups(indexes, 'jeans room 1');
      expect(results.has('item-1')).toBe(true);
      const match = results.get('item-1');
      expect(match?.matchingBatchIds.has('batch-101')).toBe(true);
      expect(match?.topMatchingBatchId).toBe('batch-101');
    });

    it('Scenario 5: Date Phrasing - "16 sep", "sep 16", "16/09" match batch-102 received on 2026-09-16', () => {
      const res1 = searchAndScoreItemGroups(indexes, '16 sep');
      expect(res1.has('item-1')).toBe(true);
      expect(res1.get('item-1')?.matchingBatchIds.has('batch-102')).toBe(true);

      const res2 = searchAndScoreItemGroups(indexes, 'sep 16');
      expect(res2.has('item-1')).toBe(true);
      expect(res2.get('item-1')?.matchingBatchIds.has('batch-102')).toBe(true);

      const res3 = searchAndScoreItemGroups(indexes, '16/09');
      expect(res3.has('item-1')).toBe(true);
      expect(res3.get('item-1')?.matchingBatchIds.has('batch-102')).toBe(true);
    });

    it('Scenario 6: Typo Tolerance - "bottel", "perfum" match item-1', () => {
      const resTypo1 = searchAndScoreItemGroups(indexes, 'bottel');
      expect(resTypo1.has('item-1')).toBe(true);

      const resTypo2 = searchAndScoreItemGroups(indexes, 'perfum');
      expect(resTypo2.has('item-1')).toBe(true);
    });

    it('Scenario 7: Short Code Strictness - "CU9" matches item-2, but "CU8" returns nothing', () => {
      const resExact = searchAndScoreItemGroups(indexes, 'CU9');
      expect(resExact.has('item-2')).toBe(true);
      expect(resExact.get('item-2')?.topMatchingBatchId).toBe('batch-201');

      const resDiff = searchAndScoreItemGroups(indexes, 'CU8');
      expect(resDiff.has('item-2')).toBe(false);
    });

    it('Scenario 8: Quantity / Intake Number Search - "1880" matches item-1 total intake, "351" matches batch-101', () => {
      const resItemQty = searchAndScoreItemGroups(indexes, '1880');
      expect(resItemQty.has('item-1')).toBe(true);

      const resBatchQty = searchAndScoreItemGroups(indexes, '351');
      expect(resBatchQty.has('item-1')).toBe(true);
      expect(resBatchQty.get('item-1')?.matchingBatchIds.has('batch-101')).toBe(true);
    });

    it('Scenario 9: Regex / Special Characters execute cleanly without throwing', () => {
      expect(() => {
        searchAndScoreItemGroups(indexes, 'bay (2-a)*?');
      }).not.toThrow();

      const res = searchAndScoreItemGroups(indexes, 'bay (2-a)*?');
      expect(res.has('item-1')).toBe(true);
    });
  });
});
