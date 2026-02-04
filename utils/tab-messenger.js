/**
 * Tab Messenger Module for Q-Fill for Gmail
 * 
 * Provides unified tab messaging functionality for the extension.
 * IMPORTANT: Only sends to the ACTIVE tab, not all tabs.
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
 * @returns {Promise<{success: boolean, needsInjection: boolean}>}
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
            needsInjection: needsScriptInjection(errorMsg)
          });
        } else if (response && response.success) {
          resolve({ success: true, needsInjection: false });
        } else {
          resolve({ success: false, needsInjection: false });
        }
      });
    } catch (error) {
      console.error(`Error in sendMessageToTab: ${error}`);
      resolve({ success: false, needsInjection: false });
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
      files: ['content.js']
    });
    
    // Wait for script to initialize
    await new Promise(r => setTimeout(r, TIME.INJECTION_RETRY_DELAY_MS));
    return true;
  } catch (error) {
    console.error(`Failed to inject content script: ${error}`);
    return false;
  }
}

/**
 * Process a single tab - send message, inject if needed, retry
 * @param {chrome.tabs.Tab} tab - The tab object
 * @param {Object} message - The message to send
 * @param {string} successLog - Log message on success
 * @returns {Promise<{success: boolean, tabId: number}>}
 */
async function processTab(tab, message, successLog) {
  // Skip restricted URLs
  if (isRestrictedUrl(tab.url)) {
    console.log(`Skipping restricted URL: ${tab.url}`);
    return { success: false, tabId: tab.id };
  }
  
  try {
    // First attempt to send message
    let result = await sendMessageToTab(tab.id, message);
    
    if (result.success) {
      console.log(`${successLog} in tab: ${tab.id}`);
      return { success: true, tabId: tab.id };
    }
    
    // If content script needs injection
    if (result.needsInjection) {
      console.log(`Content script not found in tab ${tab.id}, injecting...`);
      
      // Double-check URL is not restricted
      if (isRestrictedUrl(tab.url)) {
        console.log(`Tab ${tab.id} is a restricted page, skipping injection`);
        return { success: false, tabId: tab.id };
      }
      
      // Inject and retry
      const injected = await injectContentScript(tab.id);
      if (injected) {
        result = await sendMessageToTab(tab.id, message);
        if (result.success) {
          console.log(`Successfully injected and ${successLog.toLowerCase()} in tab: ${tab.id}`);
          return { success: true, tabId: tab.id };
        }
      }
    }
    
    console.log(`Tab ${tab.id} failed to process message`);
    return { success: false, tabId: tab.id };
  } catch (error) {
    console.error(`Error processing tab ${tab.id}:`, error);
    return { success: false, tabId: tab.id };
  }
}

/**
 * Get the currently active tab
 * @returns {Promise<chrome.tabs.Tab|null>} The active tab or null
 */
async function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        resolve(tabs[0]);
      } else {
        // Fallback: try to get any active tab
        chrome.tabs.query({ active: true }, (allActiveTabs) => {
          if (allActiveTabs && allActiveTabs.length > 0) {
            resolve(allActiveTabs[0]);
          } else {
            resolve(null);
          }
        });
      }
    });
  });
}

/**
 * Send a verification code to the ACTIVE tab only
 * @param {string} code - The verification code to send
 * @returns {Promise<{success: boolean, tabId: number|null}>}
 */
export async function sendCodeToTabs(code) {
  const activeTab = await getActiveTab();
  
  if (!activeTab) {
    console.log('No active tab found');
    return { success: false, tabId: null };
  }
  
  console.log(`Sending code "${code}" to active tab: ${activeTab.id} (${activeTab.url})`);
  
  const message = { 
    action: MESSAGE_ACTIONS.FILL_CODE, 
    code 
  };
  
  const result = await processTab(activeTab, message, 'Code successfully filled');
  
  if (result.success) {
    console.log(`Code successfully sent to active tab ${activeTab.id}`);
  } else {
    console.log(`Failed to send code to active tab ${activeTab.id}`);
  }
  
  return result;
}

/**
 * Send a "no code found" notification to the ACTIVE tab only
 * @returns {Promise<{success: boolean, tabId: number|null}>}
 */
export async function sendNoCodeFoundToTabs() {
  const activeTab = await getActiveTab();
  
  if (!activeTab) {
    console.log('No active tab found for no-code notification');
    return { success: false, tabId: null };
  }
  
  console.log(`Sending no-code-found notification to active tab: ${activeTab.id}`);
  
  const message = { action: MESSAGE_ACTIONS.NO_CODE_FOUND };
  
  const result = await processTab(activeTab, message, 'No-code notification shown');
  
  return result;
}
