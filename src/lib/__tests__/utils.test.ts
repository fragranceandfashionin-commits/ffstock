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
  normalizePhoneForWhatsApp,
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

  describe('normalizePhoneForWhatsApp', () => {
    it('normalizes standard 10-digit Indian mobile number', () => {
      expect(normalizePhoneForWhatsApp('9876543210')).toBe('919876543210');
      expect(normalizePhoneForWhatsApp(' 8765432109 ')).toBe('918765432109');
    });

    it('normalizes 11-digit Indian number with leading zero', () => {
      expect(normalizePhoneForWhatsApp('09876543210')).toBe('919876543210');
    });

    it('normalizes 12-digit Indian number with 91 prefix', () => {
      expect(normalizePhoneForWhatsApp('+91 9876543210')).toBe('919876543210');
      expect(normalizePhoneForWhatsApp('919876543210')).toBe('919876543210');
    });

    it('skips invalid Indian landline and picks valid mobile in delimiter string', () => {
      // 022-28475555 is an Indian landline starting with STD 022 (not a mobile 6-9).
      // The second segment 9820012345 is a valid mobile.
      expect(normalizePhoneForWhatsApp('022-28475555, 9820012345')).toBe('919820012345');
    });

    it('picks the first valid mobile in a delimiter string with slashes, pipes, or words', () => {
      expect(normalizePhoneForWhatsApp('9876543210 / 9876543211')).toBe('919876543210');
      expect(normalizePhoneForWhatsApp('02212345678 or 9876543210')).toBe('919876543210');
      expect(normalizePhoneForWhatsApp('invalid | 9876543210 and 9123456789')).toBe('919876543210');
    });

    it('normalizes valid international numbers without leading zero', () => {
      expect(normalizePhoneForWhatsApp('+1 (415) 555-2671')).toBe('14155552671');
      expect(normalizePhoneForWhatsApp('+44 7911 123456')).toBe('447911123456');
      expect(normalizePhoneForWhatsApp('+971 50 123 4567')).toBe('971501234567');
    });

    it('returns null for pure landlines or invalid numbers', () => {
      expect(normalizePhoneForWhatsApp('022-28475555')).toBeNull();
      expect(normalizePhoneForWhatsApp('011-23456789')).toBeNull();
      expect(normalizePhoneForWhatsApp('12345')).toBeNull();
      expect(normalizePhoneForWhatsApp('abcdefg')).toBeNull();
    });

    it('returns null for null, undefined, or empty string', () => {
      expect(normalizePhoneForWhatsApp(null)).toBeNull();
      expect(normalizePhoneForWhatsApp(undefined)).toBeNull();
      expect(normalizePhoneForWhatsApp('')).toBeNull();
      expect(normalizePhoneForWhatsApp('   ')).toBeNull();
    });
  });
});
