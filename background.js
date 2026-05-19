/**
 * Background service worker — auth, Gmail, and fill orchestration.
 * @module background
 */

import { GmailAPI } from './services/gmail-api.js';
import { StorageManager } from './services/storage-manager.js';
import { sendCodeToTabs, sendFillFailedToTab } from './utils/tab-messenger.js';
import { toPlainText } from './services/gmail-message.js';
import { extractVerificationCode } from './services/code-extractor.js';
import {
  MESSAGE_ACTIONS,
  CHECKING_STATUS
} from './utils/constants.js';
import { t } from './utils/i18n.js';
import { CONFIG } from './config/config.js';

class BackgroundManager {
  constructor() {
    this.gmailApi = new GmailAPI(CONFIG.OAUTH_CLIENT_ID, CONFIG.OAUTH_SCOPES);
    this.storage = new StorageManager();
    this.isCheckingEmails = false;
    this.init();
    this.setupMessageListeners();
  }

  async init() {
    const isAuthenticated = await this.storage.get('isAuthenticated');
    if (!isAuthenticated) return;

    try {
      await this.gmailApi.getToken(false);
    } catch (error) {
      console.error('[Q-Fill] Token refresh failed:', error);
      await this.storage.set('isAuthenticated', false);
    }
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (CONFIG.DEBUG_MODE) console.log('[Q-Fill] message:', request.action);

      switch (request.action) {
        case MESSAGE_ACTIONS.GET_AUTH_STATUS:
          this.handleGetAuthStatus(sendResponse);
          return true;
        case MESSAGE_ACTIONS.AUTHENTICATE:
          this.handleAuthenticate(sendResponse);
          return true;
        case MESSAGE_ACTIONS.CLEAR_AUTH:
          this.handleClearAuth(sendResponse);
          return true;
        case MESSAGE_ACTIONS.FORCE_CHECK_EMAILS:
          this.checkEmails(request.tabId ?? null);
          sendResponse({ success: true });
          return true;
        case MESSAGE_ACTIONS.CONTENT_SCRIPT_READY:
          sendResponse({ success: true });
          return true;
        default:
          return false;
      }
    });
  }

  async handleAuthenticate(sendResponse) {
    try {
      await this.gmailApi.getToken(true);
      await this.storage.set('isAuthenticated', true);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleGetAuthStatus(sendResponse) {
    try {
      const isAuthenticated = await this.storage.get('isAuthenticated');
      sendResponse({ isAuthenticated: !!isAuthenticated });
    } catch (error) {
      sendResponse({ isAuthenticated: false, error: error.message });
    }
  }

  async handleClearAuth(sendResponse) {
    try {
      await this.gmailApi.removeToken();
      await this.storage.set('isAuthenticated', false);
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  sendStatusUpdate(status, extra = {}) {
    chrome.runtime.sendMessage({
      action: MESSAGE_ACTIONS.CHECKING_STATUS,
      status,
      ...extra
    }).catch(() => {});
  }

  async checkEmails(targetTabId = null) {
    if (this.isCheckingEmails) return;
    this.isCheckingEmails = true;

    try {
      if (!(await this.storage.get('isAuthenticated'))) {
        this.sendStatusUpdate(CHECKING_STATUS.ERROR, {
          error: t('errorNotConnected')
        });
        return;
      }

      this.sendStatusUpdate(CHECKING_STATUS.CHECKING);
      const messages = await this.gmailApi.getVerificationMessages();

      if (!messages?.length) {
        this.notify('notificationNoEmailsTitle', 'notificationNoEmails');
        this.sendStatusUpdate(CHECKING_STATUS.NO_EMAILS);
        return;
      }

      let extractedCode = null;
      for (const { id } of messages) {
        extractedCode = await this.extractFromMessage(id);
        if (extractedCode) break;
      }

      if (!extractedCode) {
        this.notify('notificationNoCodeTitle', 'notificationNoCode');
        this.sendStatusUpdate(CHECKING_STATUS.NO_CODE_FOUND);
        return;
      }

      const fillResult = await sendCodeToTabs(extractedCode, targetTabId);

      if (fillResult.success) {
        this.sendStatusUpdate(CHECKING_STATUS.CODE_FOUND, {
          code: extractedCode,
          filled: true
        });
      } else {
        const fillMessage = fillResult.message || t('fillFailedDefault');
        this.sendStatusUpdate(CHECKING_STATUS.FILL_FAILED, {
          code: extractedCode,
          filled: false,
          error: fillMessage
        });
        await sendFillFailedToTab(targetTabId, fillMessage);
      }
    } catch (error) {
      console.error('[Q-Fill] checkEmails:', error);
      this.sendStatusUpdate(CHECKING_STATUS.ERROR, { error: error.message });

      if (String(error.message).includes('401')) {
        await this.gmailApi.removeToken().catch(() => {});
        await this.storage.set('isAuthenticated', false);
      }
    } finally {
      this.isCheckingEmails = false;
    }
  }

  async extractFromMessage(messageId) {
    try {
      const message = await this.gmailApi.getMessage(messageId);
      if (!message?.payload) return null;

      const { subject, from, text } = toPlainText(message);
      console.log('[Q-Fill] From:', from, '| Subject:', subject);
      return extractVerificationCode(text, subject);
    } catch (error) {
      console.error('[Q-Fill] process message:', error);
      return null;
    }
  }

  notify(titleKey, messageKey) {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: t(titleKey),
        message: t(messageKey)
      });
    } catch {
      /* notifications optional */
    }
  }
}

new BackgroundManager();

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Q-Fill] installed');
});
