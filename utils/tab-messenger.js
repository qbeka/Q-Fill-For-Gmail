/**
 * Tab Messenger Utility
 * Handles sending messages to tabs with content script injection
 */

import * as CONSTANTS from './constants.js';

/**
 * Check if a URL is restricted (Chrome internal pages, etc.)
 * @param {string} url - The URL to check
 * @returns {boolean} True if restricted
 */
function isRestrictedUrl(url) {
  if (!url) return true;

  return CONSTANTS.RESTRICTED_URLS.some(pattern =>
    url.startsWith(pattern) || url.includes(pattern)
  );
}

/**
 * Try to send a message to a specific tab
 * @param {number} tabId - Tab ID
 * @param {object} message - Message to send
 * @returns {Promise<{success: boolean, needsInjection: boolean}>}
 */
async function sendMessageToTab(tabId, message) {
  return new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || '';
          console.log(`Error sending to tab ${tabId}: ${errorMsg}`);

          // Check if content script is not running (common error patterns)
          if (errorMsg.includes('receiving end does not exist') ||
              errorMsg.includes('Could not establish connection') ||
              errorMsg.includes('port closed') ||
              errorMsg.includes('disconnected')) {
            resolve({ success: false, needsInjection: true });
          } else {
            resolve({ success: false, needsInjection: false });
          }
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
 * Inject content script into a tab
 * @param {number} tabId - Tab ID
 * @returns {Promise<boolean>} Success status
 */
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });

    // Wait for script initialization
    await new Promise(r => setTimeout(r, CONSTANTS.TIMEOUTS.SCRIPT_INIT_DELAY));
    return true;
  } catch (error) {
    console.error(`Failed to inject content script: ${error}`);
    return false;
  }
}

/**
 * Send a message to all open tabs (with optional filtering)
 * @param {object} message - Message to send
 * @param {object} options - Options { onlyActive: boolean }
 * @returns {Promise<{successCount: number, failCount: number}>}
 */
async function sendMessageToAllTabs(message, options = {}) {
  const { onlyActive = false } = options;

  return new Promise((resolve) => {
    const queryOptions = onlyActive ? { active: true } : {};

    chrome.tabs.query(queryOptions, async (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.log('No open tabs found');
        resolve({ successCount: 0, failCount: 0 });
        return;
      }

      console.log(`Sending message to ${tabs.length} tabs`);
      let successCount = 0;
      let failCount = 0;
      let tabsProcessed = 0;

      const processTabResults = () => {
        if (tabsProcessed === tabs.length) {
          console.log(`Message send complete: ${successCount} successes, ${failCount} failures`);
          resolve({ successCount, failCount });
        }
      };

      for (const tab of tabs) {
        try {
          // Skip restricted URLs
          if (isRestrictedUrl(tab.url)) {
            console.log(`Skipping restricted URL: ${tab.url}`);
            tabsProcessed++;
            processTabResults();
            continue;
          }

          // Try to send the message directly
          const result = await sendMessageToTab(tab.id, message);

          if (result.success) {
            console.log(`Message successfully sent to tab: ${tab.id}`);
            successCount++;
            tabsProcessed++;
            processTabResults();
          } else if (result.needsInjection) {
            // If content script isn't running, inject it
            console.log(`Content script not found in tab ${tab.id}, injecting...`);

            // Double-check URL before injection
            if (isRestrictedUrl(tab.url)) {
              console.log(`Tab ${tab.id} is a restricted page, skipping injection`);
              failCount++;
              tabsProcessed++;
              processTabResults();
              continue;
            }

            // Inject and retry
            const injected = await injectContentScript(tab.id);

            if (injected) {
              const retryResult = await sendMessageToTab(tab.id, message);
              if (retryResult.success) {
                console.log(`Successfully injected and sent message to tab: ${tab.id}`);
                successCount++;
              } else {
                console.log(`Failed to send message after injection to tab: ${tab.id}`);
                failCount++;
              }
            } else {
              failCount++;
            }

            tabsProcessed++;
            processTabResults();
          } else {
            console.log(`Tab ${tab.id} failed to receive message`);
            failCount++;
            tabsProcessed++;
            processTabResults();
          }
        } catch (error) {
          console.error(`Error processing tab ${tab.id}:`, error);
          tabsProcessed++;
          failCount++;
          processTabResults();
        }
      }
    });
  });
}

export {
  isRestrictedUrl,
  sendMessageToTab,
  injectContentScript,
  sendMessageToAllTabs
};
