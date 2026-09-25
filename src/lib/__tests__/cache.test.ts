import { describe, it, expect, beforeEach } from 'vitest';
import { fetchWithCache, invalidateCache, setCacheData } from '../cache';

describe('cache.ts', () => {
  beforeEach(() => {
    invalidateCache();
  });

  it('deduplicates concurrent in-flight requests', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { id: 1, name: 'Stages' };
    };

    const [res1, res2, res3] = await Promise.all([
      fetchWithCache('test-key', fetcher),
      fetchWithCache('test-key', fetcher),
      fetchWithCache('test-key', fetcher),
    ]);

    expect(callCount).toBe(1);
    expect(res1).toEqual({ id: 1, name: 'Stages' });
    expect(res2).toEqual({ id: 1, name: 'Stages' });
    expect(res3).toEqual({ id: 1, name: 'Stages' });
  });

  it('caches data when ttlMs > 0 and returns cached value on subsequent calls', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return `result-${callCount}`;
    };

    const first = await fetchWithCache('cached-key', fetcher, 5000);
    const second = await fetchWithCache('cached-key', fetcher, 5000);

    expect(first).toBe('result-1');
    expect(second).toBe('result-1');
    expect(callCount).toBe(1);
  });

  it('invalidates cache when invalidateCache is called without arguments', async () => {
    setCacheData('k1', 'val1', 5000);
    setCacheData('k2', 'val2', 5000);

    invalidateCache();

    let called = false;
    await fetchWithCache('k1', async () => {
      called = true;
      return 'new-val';
    });

    expect(called).toBe(true);
  });

  it('invalidates cache by prefix matching', async () => {
    setCacheData('items', 'items-data', 5000);
    setCacheData('items_caps', 'caps-data', 5000);
    setCacheData('stages', 'stages-data', 5000);

    invalidateCache('items');

    let itemsCalled = false;
    await fetchWithCache('items', async () => {
      itemsCalled = true;
      return 'new-items';
    }, 5000);

    let stagesCalled = false;
    const stageResult = await fetchWithCache('stages', async () => {
      stagesCalled = true;
      return 'new-stages';
    }, 5000);

    expect(itemsCalled).toBe(true);
    expect(stagesCalled).toBe(false);
    expect(stageResult).toBe('stages-data');
  });
});
