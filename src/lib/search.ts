import type { ItemGroup } from '@/views/outward/types';
import { formatDate } from '@/lib/utils';

export interface BatchSearchIndex {
  batchId: string;
  batchNo: string;
  location: string;
  formattedDate: string;
  rawDate: string;
  dateTokens: string[];
  supplierName: string;
  brandName: string;
  color: string;
  intakeQtyText: string;
  words: string[];
  compact: string;
}

export interface ItemGroupSearchIndex {
  groupId: string;
  itemName: string;
  category: string;
  color: string;
  unit: string;
  totalIntakeText: string;
  itemWords: string[];
  itemCompact: string;
  batches: BatchSearchIndex[];
  allWords: string[];
  allCompact: string;
}

export interface ScoredItemGroupResult {
  groupId: string;
  score: number;
  matchingBatchIds: Set<string>;
  topMatchingBatchId?: string;
}

export interface MatchRange {
  start: number;
  end: number;
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const MONTH_ABBR = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
];

/**
 * Normalizes search text:
 * - strips diacritics / accents (NFKD)
 * - separates numbers and letters/units (e.g. "100ml" -> "100 ml", "bay2a" -> "bay 2 a")
 * - replaces punctuation and delimiters with spaces
 * - lowercases and collapses consecutive whitespace
 */
export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d+)\s*([a-z]+)/gi, '$1 $2')
    .replace(/([a-z]+)\s*(\d+)/gi, '$1 $2')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Strips all non-alphanumeric characters and lowercases.
 * E.g. "FNF-2008-CPB" -> "fnf2008cpb", "Bay 2-A" -> "bay2a".
 */
export function toCompactString(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '');
}

/**
 * Computes Levenshtein edit distance between two strings.
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;

  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      if (b[j - 1] === a[i - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1,
          matrix[j][i - 1] + 1,
          matrix[j - 1][i - 1] + 1
        );
      }
    }
  }
  return matrix[bn][an];
}

/**
 * Generates expanded date tokens for date matching.
 * E.g. for "2026-09-16" and formatted "16 Sep 2026":
 * -> ["16", "sep", "sept", "september", "09", "9", "2026", "26", "16sep", "sep16", "16/09", "16-09", "09-16", "09/16", "2026-09-16"]
 */
export function generateDateTokens(rawDate: string | null | undefined, formattedDate: string): string[] {
  const tokens = new Set<string>();
  if (!rawDate && !formattedDate) return [];

  if (rawDate) {
    tokens.add(rawDate.toLowerCase());
    tokens.add(toCompactString(rawDate));
  }
  if (formattedDate) {
    tokens.add(formattedDate.toLowerCase());
    tokens.add(toCompactString(formattedDate));
  }

  const d = rawDate ? new Date(rawDate) : new Date(formattedDate);
  if (!Number.isNaN(d.getTime())) {
    const day = d.getDate();
    const dayStr = String(day);
    const day2 = dayStr.padStart(2, '0');
    const month = d.getMonth(); // 0-indexed
    const monthNum = String(month + 1);
    const monthNum2 = monthNum.padStart(2, '0');
    const year = d.getFullYear();
    const yearStr = String(year);
    const year2 = yearStr.slice(-2);

    const mName = MONTH_NAMES[month];
    const mAbbr = MONTH_ABBR[month];

    tokens.add(dayStr);
    tokens.add(day2);
    tokens.add(monthNum);
    tokens.add(monthNum2);
    tokens.add(yearStr);
    tokens.add(year2);
    tokens.add(mName);
    tokens.add(mAbbr);
    if (mAbbr === 'sep') {
      tokens.add('sept');
    }

    // Combined day & month formats
    tokens.add(`${dayStr}${mAbbr}`);
    tokens.add(`${day2}${mAbbr}`);
    tokens.add(`${mAbbr}${dayStr}`);
    tokens.add(`${mAbbr}${day2}`);
    tokens.add(`${day2}/${monthNum2}`);
    tokens.add(`${day2}-${monthNum2}`);
    tokens.add(`${monthNum2}/${day2}`);
    tokens.add(`${monthNum2}-${day2}`);
    tokens.add(`${dayStr}/${monthNum}`);
    tokens.add(`${dayStr}-${monthNum}`);
    tokens.add(`${day2}${monthNum2}`);
  }

  return Array.from(tokens).filter(Boolean);
}

/**
 * Parses user search query into distinct search tokens and compact query string.
 */
export function parseSearchQuery(query: string): {
  tokens: string[];
  compactQuery: string;
} {
  const normalized = normalizeSearchText(query);
  const compactQuery = toCompactString(query);

  if (!normalized) {
    return { tokens: [], compactQuery: '' };
  }

  const tokenSet = new Set<string>();

  // Normalized tokens (separated by spaces)
  normalized.split(' ').forEach((t) => {
    if (t) tokenSet.add(t);
  });

  // Also include original non-spaced token if user typed something like "100ml" or "bay2a"
  // so exact matching can match both compact and separated parts.
  const rawParts = query.toLowerCase().trim().split(/[\s,+/]+/);
  rawParts.forEach((part) => {
    const clean = part.replace(/[^a-z0-9]/gi, '');
    if (clean && clean.length >= 2) {
      tokenSet.add(clean);
    }
  });

  return {
    tokens: Array.from(tokenSet),
    compactQuery,
  };
}

/**
 * Evaluates whether a query token matches target words or compact string.
 * Returns match score and whether match was fuzzy.
 */
export function matchToken(
  token: string,
  targetWords: string[],
  targetCompact: string
): { matched: boolean; score: number; isFuzzy: boolean } {
  if (!token) return { matched: false, score: 0, isFuzzy: false };

  const tokenLen = token.length;
  const isPureNumber = /^\d+$/.test(token);
  const isShortCode = tokenLen < 4 || isPureNumber;

  // 1. Exact Word Match
  for (const word of targetWords) {
    if (word === token) {
      return { matched: true, score: 100, isFuzzy: false };
    }
  }

  // 2. Prefix Match on any target word
  for (const word of targetWords) {
    if (word.startsWith(token)) {
      return { matched: true, score: 80, isFuzzy: false };
    }
  }

  // 3. Substring Match on any target word
  for (const word of targetWords) {
    if (word.includes(token)) {
      return { matched: true, score: 60, isFuzzy: false };
    }
  }

  // 4. Compact string substring match (handles unit merges e.g. "100ml", hyphen glues "fnf2008cpb")
  if (targetCompact && targetCompact.includes(token)) {
    return { matched: true, score: 50, isFuzzy: false };
  }

  // 5. Typo / Fuzzy Match (Levenshtein)
  // Strictly disabled for short codes (< 4 chars) and pure numeric values (e.g. "CU9", "1880")
  if (!isShortCode) {
    const maxDistance = tokenLen >= 6 ? 2 : 1;

    for (const word of targetWords) {
      // Skip numeric or short target words for fuzzy matching
      if (word.length < 4 || /^\d+$/.test(word)) continue;
      if (Math.abs(word.length - tokenLen) > maxDistance) continue;

      const dist = getLevenshteinDistance(token, word);
      if (dist <= maxDistance) {
        const score = 35 - dist * 10;
        return { matched: true, score, isFuzzy: true };
      }
    }
  }

  return { matched: false, score: 0, isFuzzy: false };
}

/**
 * Builds a precomputed search index for an ItemGroup and all its child batches.
 */
export function buildItemGroupIndex(grp: ItemGroup): ItemGroupSearchIndex {
  const itemWords = new Set<string>();

  const itemNameNorm = normalizeSearchText(grp.item.name);
  itemNameNorm.split(' ').forEach((w) => w && itemWords.add(w));

  const itemCatNorm = normalizeSearchText(grp.item.category);
  itemCatNorm.split(' ').forEach((w) => w && itemWords.add(w));

  const itemColorNorm = normalizeSearchText(grp.item.color);
  itemColorNorm.split(' ').forEach((w) => w && itemWords.add(w));

  const itemUnitNorm = normalizeSearchText(grp.item.unit);
  itemUnitNorm.split(' ').forEach((w) => w && itemWords.add(w));

  const totalIntakeText = String(grp.totalIntake ?? 0);
  itemWords.add(totalIntakeText);

  const itemCompact = toCompactString(
    `${grp.item.name} ${grp.item.category ?? ''} ${grp.item.color ?? ''} ${grp.item.unit ?? ''} ${totalIntakeText}`
  );

  const allWords = new Set<string>(itemWords);
  let allCompactAccumulator = itemCompact;

  const batches: BatchSearchIndex[] = grp.batches.map((b) => {
    const bWords = new Set<string>();

    const bNoNorm = normalizeSearchText(b.batch_no);
    bNoNorm.split(' ').forEach((w) => w && bWords.add(w));

    const locNorm = normalizeSearchText(b.location);
    locNorm.split(' ').forEach((w) => w && bWords.add(w));

    const formattedDate = formatDate(b.received_on);
    const dateTokens = generateDateTokens(b.received_on, formattedDate);
    dateTokens.forEach((dt) => {
      normalizeSearchText(dt).split(' ').forEach((w) => w && bWords.add(w));
      const compactDt = toCompactString(dt);
      if (compactDt) bWords.add(compactDt);
    });

    const supNorm = normalizeSearchText(b.supplier?.name);
    supNorm.split(' ').forEach((w) => w && bWords.add(w));

    const brandNorm = normalizeSearchText(b.brand_name);
    brandNorm.split(' ').forEach((w) => w && bWords.add(w));

    const colorNorm = normalizeSearchText(b.color);
    colorNorm.split(' ').forEach((w) => w && bWords.add(w));

    const intakeQtyText = String(b.qty_received ?? 0);
    bWords.add(intakeQtyText);

    const bWordsArray = Array.from(bWords);
    bWordsArray.forEach((w) => allWords.add(w));

    const bCompact = toCompactString(
      `${b.batch_no} ${b.location ?? ''} ${b.received_on ?? ''} ${formattedDate} ${b.supplier?.name ?? ''} ${b.brand_name ?? ''} ${b.color ?? ''} ${intakeQtyText}`
    );
    allCompactAccumulator += bCompact;

    return {
      batchId: b.id,
      batchNo: b.batch_no,
      location: b.location ?? '',
      formattedDate,
      rawDate: b.received_on ?? '',
      dateTokens,
      supplierName: b.supplier?.name ?? '',
      brandName: b.brand_name ?? '',
      color: b.color ?? '',
      intakeQtyText,
      words: bWordsArray,
      compact: bCompact,
    };
  });

  return {
    groupId: grp.item_id,
    itemName: grp.item.name,
    category: grp.item.category ?? '',
    color: grp.item.color ?? '',
    unit: grp.item.unit ?? '',
    totalIntakeText,
    itemWords: Array.from(itemWords),
    itemCompact,
    batches,
    allWords: Array.from(allWords),
    allCompact: allCompactAccumulator,
  };
}

/**
 * Searches and scores an array of ItemGroupSearchIndex objects against a query.
 * Multi-token query uses AND semantics: all query tokens must be satisfied
 * across the composite item group (Item attributes or child batch attributes).
 * Returns a Map of groupId -> ScoredItemGroupResult.
 */
export function searchAndScoreItemGroups(
  indexes: ItemGroupSearchIndex[],
  query: string
): Map<string, ScoredItemGroupResult> {
  const results = new Map<string, ScoredItemGroupResult>();
  const parsed = parseSearchQuery(query);

  if (!parsed.tokens.length) {
    return results;
  }

  const { tokens, compactQuery } = parsed;

  for (const grp of indexes) {
    let groupScore = 0;
    let allTokensSatisfied = true;

    // Track which batch IDs matched which query tokens
    const batchTokenMatchCounts = new Map<string, number>();
    const matchingBatchIds = new Set<string>();

    for (const token of tokens) {
      // 1. Check parent Item match
      const itemMatch = matchToken(token, grp.itemWords, grp.itemCompact);

      // 2. Check each child batch match
      let tokenMatchedInAnyBatch = false;

      for (const b of grp.batches) {
        const bMatch = matchToken(token, b.words, b.compact);
        if (bMatch.matched) {
          tokenMatchedInAnyBatch = true;
          matchingBatchIds.add(b.batchId);
          batchTokenMatchCounts.set(
            b.batchId,
            (batchTokenMatchCounts.get(b.batchId) || 0) + 1
          );
          groupScore += bMatch.score;
        }
      }

      if (itemMatch.matched) {
        groupScore += itemMatch.score * 1.2; // slight weight to item-level match
      }

      // If token not matched in item AND not matched in any child batch, this group fails AND condition
      if (!itemMatch.matched && !tokenMatchedInAnyBatch) {
        allTokensSatisfied = false;
        break;
      }
    }

    if (!allTokensSatisfied) {
      continue;
    }

    // Bonuses
    // Exact item name bonus
    if (toCompactString(grp.itemName) === compactQuery) {
      groupScore += 100;
    } else if (toCompactString(grp.itemName).startsWith(compactQuery)) {
      groupScore += 50;
    }

    // Check if any batch number exactly matches compact query
    for (const b of grp.batches) {
      if (toCompactString(b.batchNo) === compactQuery) {
        groupScore += 80;
        matchingBatchIds.add(b.batchId);
        batchTokenMatchCounts.set(b.batchId, (batchTokenMatchCounts.get(b.batchId) || 0) + 5);
      }
    }

    // Determine top matching child batch ID
    let topMatchingBatchId: string | undefined;
    let maxBatchMatches = -1;

    for (const b of grp.batches) {
      const matchCount = batchTokenMatchCounts.get(b.batchId) || 0;
      if (matchCount > maxBatchMatches) {
        maxBatchMatches = matchCount;
        topMatchingBatchId = b.batchId;
      }
    }

    // If no batch specifically matched tokens (e.g. query only matched item attributes),
    // default to the first batch (FIFO)
    if (!topMatchingBatchId && grp.batches.length > 0) {
      topMatchingBatchId = grp.batches[0].batchId;
    }

    results.set(grp.groupId, {
      groupId: grp.groupId,
      score: Math.round(groupScore),
      matchingBatchIds,
      topMatchingBatchId,
    });
  }

  return results;
}

/**
 * Extracts non-overlapping character index ranges [start, end] for highlighting.
 * Handles:
 * - multi-token matching
 * - case-insensitivity
 * - unit glues (e.g. query "100ml" highlights "100 ml")
 * - typo matches (e.g. query "bottel" highlights "bottle")
 */
export function getMatchRanges(text: string | null | undefined, query: string): MatchRange[] {
  if (!text || !query || !query.trim()) return [];

  const parsed = parseSearchQuery(query);
  if (!parsed.tokens.length) return [];

  const rawRanges: MatchRange[] = [];
  const lowerText = text.toLowerCase();
  const textLen = text.length;

  // Split text into words and record their boundary positions in original text
  const wordSpans: { word: string; start: number; end: number }[] = [];
  const wordRegex = /[a-z0-9]+/gi;
  let wordMatch: RegExpExecArray | null;
  while ((wordMatch = wordRegex.exec(text)) !== null) {
    wordSpans.push({
      word: wordMatch[0].toLowerCase(),
      start: wordMatch.index,
      end: wordMatch.index + wordMatch[0].length,
    });
  }

  for (const token of parsed.tokens) {
    if (!token) continue;
    const tokenLower = token.toLowerCase();

    // 1. Direct substring match in text
    let searchPos = 0;
    while (searchPos < textLen) {
      const idx = lowerText.indexOf(tokenLower, searchPos);
      if (idx === -1) break;
      rawRanges.push({ start: idx, end: idx + tokenLower.length });
      searchPos = idx + Math.max(1, tokenLower.length);
    }

    // 2. Unit glue and delimiter-insensitive compact span match
    // E.g. "fnf2008" against "FNF-2008-CPB", "100ml" against "100 ml", "bay2a" against "Bay 2-A"
    if (tokenLower.length >= 3) {
      const cleanToken = toCompactString(tokenLower);
      if (cleanToken.length >= 3) {
        for (let i = 0; i < textLen; i++) {
          if (lowerText[i] === cleanToken[0]) {
            let tIdx = 0;
            let j = i;
            while (j < textLen && tIdx < cleanToken.length) {
              const ch = lowerText[j];
              if (/[^a-z0-9]/.test(ch)) {
                j++;
                continue;
              }
              if (ch === cleanToken[tIdx]) {
                tIdx++;
                j++;
              } else {
                break;
              }
            }
            if (tIdx === cleanToken.length) {
              rawRanges.push({ start: i, end: j });
              i = j - 1;
            }
          }
        }
      }
    }

    // 3. Typo match on individual words (Levenshtein)
    // Only if token >= 4 chars and not pure numeric
    if (tokenLower.length >= 4 && !/^\d+$/.test(tokenLower)) {
      const maxDistance = tokenLower.length >= 6 ? 2 : 1;
      for (const span of wordSpans) {
        if (span.word.length < 4 || /^\d+$/.test(span.word)) continue;
        if (Math.abs(span.word.length - tokenLower.length) > maxDistance) continue;
        if (getLevenshteinDistance(tokenLower, span.word) <= maxDistance) {
          rawRanges.push({ start: span.start, end: span.end });
        }
      }
    }
  }

  if (!rawRanges.length) return [];

  // Sort ranges by start index ascending, then by end index descending
  rawRanges.sort((a, b) => a.start - b.start || b.end - a.end);

  // Merge overlapping and contiguous ranges
  const merged: MatchRange[] = [];
  for (const range of rawRanges) {
    if (!merged.length) {
      merged.push({ ...range });
    } else {
      const current = merged[merged.length - 1];
      if (range.start <= current.end) {
        current.end = Math.max(current.end, range.end);
      } else {
        merged.push({ ...range });
      }
    }
  }

  return merged;
}
