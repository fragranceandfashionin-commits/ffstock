import { describe, it, expect } from 'vitest';
import {
  classNames,
  formatDate,
  formatNumber,
  getTodayDateString,
  getErrorMessage,
  escapeCSVField,
  normalizeItemName,
  levenshteinDistance,
  findSimilarItems,
} from '../utils';

describe('utils.ts', () => {
  describe('classNames', () => {
    it('joins truthy class names and filters falsy ones', () => {
      expect(classNames('btn', false, 'btn-primary', null, undefined, 'active')).toBe(
        'btn btn-primary active'
      );
    });
  });

  describe('formatDate', () => {
    it('handles empty or null values', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
      expect(formatDate('')).toBe('—');
    });

    it('formats valid ISO dates', () => {
      const formatted = formatDate('2026-09-21');
      expect(formatted).not.toBe('—');
      expect(formatted).toContain('2026');
    });
  });

  describe('formatNumber', () => {
    it('formats numbers with thousand separators', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(0)).toBe('0');
      expect(formatNumber(null)).toBe('0');
      expect(formatNumber(undefined)).toBe('0');
    });
  });

  describe('getTodayDateString', () => {
    it('returns a valid YYYY-MM-DD date string', () => {
      const today = getTodayDateString();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getErrorMessage', () => {
    it('translates PGRST205 missing table errors', () => {
      const err = { code: 'PGRST205', message: 'relation does not exist' };
      expect(getErrorMessage(err)).toContain('The database tables are not set up yet');
    });

    it('translates PGRST204 cap/atomizer migration error', () => {
      const err = { code: 'PGRST204', message: "Could not find the 'cap_name' column" };
      expect(getErrorMessage(err)).toContain('Cap & Atomizer tracking');
    });

    it('translates 23503 foreign key constraint error', () => {
      const err = { code: '23503', message: 'foreign key constraint' };
      expect(getErrorMessage(err)).toContain('still referenced by existing batches');
    });

    it('falls back to string or default message', () => {
      expect(getErrorMessage(new Error('Custom error'))).toBe('Custom error');
      expect(getErrorMessage(null, 'Default fallback')).toBe('Default fallback');
    });
  });

  describe('escapeCSVField', () => {
    it('leaves simple values untouched', () => {
      expect(escapeCSVField('hello')).toBe('hello');
      expect(escapeCSVField(123)).toBe('123');
      expect(escapeCSVField(null)).toBe('');
    });

    it('wraps fields containing commas, quotes, or newlines in quotes', () => {
      expect(escapeCSVField('hello, world')).toBe('"hello, world"');
      expect(escapeCSVField('hello "world"')).toBe('"hello ""world"""');
      expect(escapeCSVField("line 1\nline 2")).toBe('"line 1\nline 2"');
    });
  });

  describe('normalizeItemName', () => {
    it('collapses spaces around unit suffixes and lowercases', () => {
      expect(normalizeItemName('20 ml Square Bottle')).toBe('20mlsquarebottle');
      expect(normalizeItemName('50 ML Frosted')).toBe('50mlfrosted');
      expect(normalizeItemName('100  gm Jar')).toBe('100gmjar');
    });

    it('removes punctuation and special characters', () => {
      expect(normalizeItemName('Channel-No. 5 (50ml)')).toBe('channelno550ml');
    });
  });

  describe('levenshteinDistance', () => {
    it('returns correct edit distance', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('bottle', 'bottle')).toBe(0);
      expect(levenshteinDistance('', 'test')).toBe(4);
    });
  });

  describe('findSimilarItems', () => {
    const existing = [
      { id: '1', name: '20ml Square Bottle', category: 'Bottle' },
      { id: '2', name: '50ml Amber Glass', category: 'Bottle' },
      { id: '3', name: 'Gold Dropper Cap', category: 'Cap' },
    ];

    it('finds exact match with highest confidence', () => {
      const matches = findSimilarItems('20ml Square Bottle', 'Bottle', existing);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matchType).toBe('exact');
      expect(matches[0].confidence).toBe(1.0);
    });

    it('finds normalized match (space variation)', () => {
      const matches = findSimilarItems('20 ml Square Bottle', 'Bottle', existing);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matchType).toBe('normalized');
      expect(matches[0].confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('returns empty when input is too short', () => {
      expect(findSimilarItems('a', 'Bottle', existing)).toEqual([]);
    });
  });
});
