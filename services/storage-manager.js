/**
 * Storage Manager Service for Q-Fill for Gmail
 * 
 * Provides a clean abstraction over Chrome's storage API.
 * Handles persistent browser storage for extension state.
 * 
 * @fileoverview Chrome storage wrapper for Q-Fill
 * @version 1.0.0
 */

/**
 * StorageManager Class
 * Provides async/await interface for Chrome storage operations
 */
class StorageManager {
  /**
   * Create a StorageManager instance
   * Uses chrome.storage.local by default
   */
  constructor() {
    this.storage = chrome.storage.local;
  }
  
  /**
   * Get a value from storage
   * @param {string} key - The key to retrieve
   * @returns {Promise<any>} The stored value, or undefined if not found
   * @throws {Error} If Chrome runtime error occurs
   */
  get(key) {
    return new Promise((resolve, reject) => {
      this.storage.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result[key]);
      });
    });
  }
  
  /**
   * Set a value in storage
   * @param {string} key - The key to set
   * @param {any} value - The value to store (will be serialized)
   * @returns {Promise<void>}
   * @throws {Error} If Chrome runtime error occurs
   */
  set(key, value) {
    return new Promise((resolve, reject) => {
      this.storage.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }
  
  /**
   * Remove a value from storage
   * @param {string} key - The key to remove
   * @returns {Promise<void>}
   * @throws {Error} If Chrome runtime error occurs
   */
  remove(key) {
    return new Promise((resolve, reject) => {
      this.storage.remove(key, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }
  
  /**
   * Clear all stored data
   * @returns {Promise<void>}
   * @throws {Error} If Chrome runtime error occurs
   */
  clear() {
    return new Promise((resolve, reject) => {
      this.storage.clear(() => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }
  
  /**
   * Get multiple values from storage
   * @param {string[]} keys - Array of keys to retrieve
   * @returns {Promise<Object>} Object with key-value pairs
   * @throws {Error} If Chrome runtime error occurs
   */
  getMultiple(keys) {
    return new Promise((resolve, reject) => {
      this.storage.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result);
      });
    });
  }
  
  /**
   * Set multiple values in storage
   * @param {Object} items - Object with key-value pairs to store
   * @returns {Promise<void>}
   * @throws {Error} If Chrome runtime error occurs
   */
  setMultiple(items) {
    return new Promise((resolve, reject) => {
      this.storage.set(items, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }
}

export { StorageManager };
