/**
 * Environment-aware logger utility.
 * In development mode, logs all messages with clear prefixing.
 * In production mode, suppresses debug and info statements while preserving warnings and errors.
 */

const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.debug('[DEBUG]', ...args);
    }
  },
  info: (...args: unknown[]) => {
    if (isDev) {
      console.info('[INFO]', ...args);
    }
  },
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },
};
