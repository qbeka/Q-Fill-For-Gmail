/**
 * Namespaced logging for extension scripts.
 * @module utils/logger
 */

const PREFIX = '[Q-Fill]';

/**
 * @param {boolean} debugEnabled
 * @returns {{ debug: Function, info: Function }}
 */
export function createLogger(debugEnabled = false) {
  return {
    debug: (...args) => debugEnabled && console.log(PREFIX, ...args),
    info: (...args) => console.log(PREFIX, ...args)
  };
}
