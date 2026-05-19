/**
 * Tab Messenger Module for Q-Fill for Gmail
 *
 * Sends messages to a specific tab (the page the user was on when they
 * clicked "Check Emails"), with injection fallback when needed.
 *
 * @fileoverview Unified tab messaging utilities
 */

import {
  RESTRICTED_URLS,
  INJECTION_ERROR_PATTERNS,
  TIME,
  MESSAGE_ACTIONS
} from './constants.js';

/**
 * Check if a URL is restricted (cannot inject content scripts)
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL is restricted
 */
function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_URLS.some(pattern => url.includes(pattern));
}

/**
 * Check if an error message indicates the content script needs injection
 * @param {string} errorMsg - The error message to check
 * @returns {boolean} True if injection is needed
 */
function needsScriptInjection(errorMsg) {
  if (!errorMsg) return false;
  return INJECTION_ERROR_PATTERNS.some(pattern => errorMsg.includes(pattern));
}

/**
 * Send a message to a specific tab with error handling
 * @param {number} tabId - The tab ID to send the message to
 * @param {Object} message - The message object to send
 * @returns {Promise<{success: boolean, needsInjection: boolean, response?: Object}>}
 */
async function sendMessageToTab(tabId, message) {
  return new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || '';
          console.log(`Error sending to tab ${tabId}: ${errorMsg}`);

          resolve({
            success: false,
            needsInjection: needsScriptInjection(errorMsg),
            response: null
          });
        } else if (response?.success) {
          resolve({ success: true, needsInjection: false, response });
        } else {
          resolve({
            success: false,
            needsInjection: false,
            response: response || null
          });
        }
      });
    } catch (error) {
      console.error(`Error in sendMessageToTab: ${error}`);
      resolve({ success: false, needsInjection: false, response: null });
    }
  });
}

/**
 * Inject content script into a tab if needed
 * @param {number} tabId - The tab ID to inject into
 * @returns {Promise<boolean>} True if injection was successful
 */
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/inject-loader.js']
    });

    await new Promise(r => setTimeout(r, TIME.INJECTION_RETRY_DELAY_MS));
    return true;
  } catch (error) {
    console.error(`Failed to inject content script: ${error}`);
    return false;
  }
}

/**
 * Resolve which tab to target
 * @param {number|null|undefined} tabId - Explicit tab from popup click
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function resolveTargetTab(tabId) {
  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab?.id) return tab;
    } catch (error) {
      console.log(`Tab ${tabId} unavailable, falling back to active tab`);
    }
  }

  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs?.length > 0) {
        resolve(tabs[0]);
        return;
      }

      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (fallbackTabs) => {
        resolve(fallbackTabs?.[0] || null);
      });
    });
  });
}

/**
 * Process a single tab - send message, inject if needed, retry
 * @param {chrome.tabs.Tab} tab - The tab object
 * @param {Object} message - The message to send
 * @param {string} successLog - Log message on success
 * @returns {Promise<{success: boolean, tabId: number, response?: Object, message?: string}>}
 */
async function processTab(tab, message, successLog) {
  if (isRestrictedUrl(tab.url)) {
    console.log(`Skipping restricted URL: ${tab.url}`);
    return {
      success: false,
      tabId: tab.id,
      message: 'Cannot fill codes on browser system pages. Open the site with your verification form first.'
    };
  }

  try {
    let result = await sendMessageToTab(tab.id, message);

    if (result.success) {
      console.log(`${successLog} in tab: ${tab.id}`);
      return { success: true, tabId: tab.id, response: result.response };
    }

    if (result.needsInjection) {
      console.log(`Content script not found in tab ${tab.id}, injecting...`);

      if (isRestrictedUrl(tab.url)) {
        return {
          success: false,
          tabId: tab.id,
          message: 'Cannot inject on this page type.'
        };
      }

      const injected = await injectContentScript(tab.id);
      if (injected) {
        result = await sendMessageToTab(tab.id, message);
        if (result.success) {
          console.log(`Successfully injected and ${successLog.toLowerCase()} in tab: ${tab.id}`);
          return { success: true, tabId: tab.id, response: result.response };
        }
      }
    }

    const fillMessage = result.response?.message;
    console.log(`Tab ${tab.id} failed to process message`);
    return {
      success: false,
      tabId: tab.id,
      message: fillMessage || 'Could not reach the page. Refresh the form page and try again.'
    };
  } catch (error) {
    console.error(`Error processing tab ${tab.id}:`, error);
    return {
      success: false,
      tabId: tab.id,
      message: error.message || 'Unexpected error filling the form'
    };
  }
}

/**
 * Send a verification code to the target tab
 * @param {string} code - The verification code to send
 * @param {number|null|undefined} tabId - Tab captured when user started the check
 * @returns {Promise<{success: boolean, tabId: number|null, message?: string}>}
 */
export async function sendCodeToTabs(code, tabId = null) {
  const targetTab = await resolveTargetTab(tabId);

  if (!targetTab) {
    console.log('No target tab found');
    return {
      success: false,
      tabId: null,
      message: 'No browser tab found. Open the page with your verification form first.'
    };
  }

  console.log(`Sending code to tab ${targetTab.id} (${targetTab.url})`);

  const message = {
    action: MESSAGE_ACTIONS.FILL_CODE,
    code
  };

  const result = await processTab(targetTab, message, 'Code successfully filled');

  if (!result.success) {
    console.log(`Failed to send code to tab ${targetTab.id}`);
  }

  return {
    success: result.success,
    tabId: result.tabId,
    message: result.message || result.response?.message
  };
}

/**
 * Notify the target tab that filling failed (form not found on page)
 * @param {number|null|undefined} tabId
 * @param {string} message
 * @returns {Promise<{success: boolean, tabId: number|null}>}
 */
export async function sendFillFailedToTab(tabId, message) {
  const targetTab = await resolveTargetTab(tabId);

  if (!targetTab || isRestrictedUrl(targetTab.url)) {
    return { success: false, tabId: targetTab?.id || null };
  }

  const payload = {
    action: MESSAGE_ACTIONS.FILL_FAILED,
    message: message || 'Could not find a verification input on this page'
  };

  return processTab(targetTab, payload, 'Fill-failed notification shown');
}
