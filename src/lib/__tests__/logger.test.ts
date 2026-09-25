import { describe, it, expect, vi } from 'vitest';
import { logger } from '../logger';

describe('logger.ts', () => {
  it('calls console.warn on logger.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('Test warning');
    expect(spy).toHaveBeenCalledWith('[WARN]', 'Test warning');
    spy.mockRestore();
  });

  it('calls console.error on logger.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('Test error');
    expect(spy).toHaveBeenCalledWith('[ERROR]', 'Test error');
    spy.mockRestore();
  });
});
