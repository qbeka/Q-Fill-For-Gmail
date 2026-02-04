/**
 * Q-Fill for Gmail - Background Service Worker
 * 
 * Handles Gmail API communication, authentication, and code extraction.
 * Coordinates with content scripts to fill verification codes into web forms.
 * 
 * @fileoverview Main background script for the extension
 * @version 1.0.0
 */

import { GmailAPI } from './services/gmail-api.js';
import { StorageManager } from './services/storage-manager.js';
import { sendCodeToTabs, sendNoCodeFoundToTabs } from './utils/tab-messenger.js';
import { 
  TIME, 
  CODE_VALIDATION, 
  VERIFICATION_KEYWORDS, 
  CODE_PATTERNS,
  MESSAGE_ACTIONS,
  CHECKING_STATUS
} from './utils/constants.js';
import { CONFIG } from './config/config.js';

/**
 * BackgroundManager Class
 * Manages all background operations for the extension
 */
class BackgroundManager {
  constructor() {
    this.gmailApi = new GmailAPI(CONFIG.OAUTH_CLIENT_ID, CONFIG.OAUTH_SCOPES);
    this.storage = new StorageManager();
    this.lastProcessedMessageIds = new Set();
    this.lastFoundCode = null;
    this.lastCodeTimestamp = 0;
    this.isCheckingEmails = false;
    
    this.init();
    this.setupMessageListeners();
  }
  
  /**
   * Initialize the extension
   * Checks for existing authentication and retrieves token if available
   */
  async init() {
    console.log('Initializing Q-Fill for Gmail');
    
    const isAuthenticated = await this.storage.get('isAuthenticated');
    if (isAuthenticated) {
      console.log('Previously authenticated, retrieving token');
      try {
        await this.gmailApi.getToken(false);
        console.log('Token retrieved successfully - ready for manual checking');
      } catch (error) {
        console.error('Failed to retrieve token:', error);
        await this.storage.set('isAuthenticated', false);
      }
    } else {
      console.log('Not authenticated yet, waiting for user interaction');
    }
  }
  
  /**
   * Set up message listeners for communication with popup and content scripts
   */
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (CONFIG.DEBUG_MODE) {
        console.log('Background script received message:', request);
      }
      
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
          this.checkEmails();
          sendResponse({ success: true });
          return true;
          
        case MESSAGE_ACTIONS.CONTENT_SCRIPT_READY:
          console.log(`Content script ready in tab at URL: ${request.url}`);
          sendResponse({ success: true });
          return true;
          
        default:
          return false;
      }
    });
  }
  
  /**
   * Handle authentication request
   * @param {Function} sendResponse - Response callback
   */
  async handleAuthenticate(sendResponse) {
    try {
      await this.gmailApi.getToken(true);
      await this.storage.set('isAuthenticated', true);
      sendResponse({ success: true });
    } catch (error) {
      console.error('Authentication failed:', error);
      sendResponse({ 
        success: false, 
        error: error.message || 'Authentication failed' 
      });
    }
  }
  
  /**
   * Handle auth status check request
   * @param {Function} sendResponse - Response callback
   */
  async handleGetAuthStatus(sendResponse) {
    try {
      const isAuthenticated = await this.storage.get('isAuthenticated');
      sendResponse({ isAuthenticated });
    } catch (error) {
      console.error('Error checking auth status:', error);
      sendResponse({ isAuthenticated: false, error: error.message });
    }
  }
  
  /**
   * Handle clear authentication request
   * @param {Function} sendResponse - Response callback
   */
  async handleClearAuth(sendResponse) {
    try {
      await this.gmailApi.removeToken();
      await this.storage.set('isAuthenticated', false);
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error clearing authentication:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  /**
   * Send status update to popup
   * @param {string} status - Status identifier
   * @param {Object} extra - Additional data to include
   */
  sendStatusUpdate(status, extra = {}) {
    chrome.runtime.sendMessage({ 
      action: MESSAGE_ACTIONS.CHECKING_STATUS, 
      status,
      ...extra
    }).catch(() => {
      // Popup may be closed, ignore errors
    });
  }
  
  /**
   * Check Gmail for verification codes
   * Main email checking workflow
   */
  async checkEmails() {
    if (this.isCheckingEmails) {
      console.log('Already checking emails, skipping this request');
      return;
    }
    
    this.isCheckingEmails = true;
    
    try {
      console.log('Manually checking for new Gmail messages');
      this.sendStatusUpdate(CHECKING_STATUS.CHECKING);
      
      const messages = await this.gmailApi.getRecentMessages();
      
      if (!messages || messages.length === 0) {
        console.log('No new messages found');
        this.showNotification('No emails found', 'There are no recent emails in your inbox to check for codes.');
        this.sendStatusUpdate(CHECKING_STATUS.NO_EMAILS);
        await sendNoCodeFoundToTabs();
        return;
      }
      
      console.log(`Found ${messages.length} messages, checking the most recent one`);
      
      // Get the most recent message
      const mostRecentMessage = messages[0];
      
      // Log message info for debugging
      await this.logMessageInfo(mostRecentMessage.id);
      
      // Process the message
      const extractedCode = await this.processMessage(mostRecentMessage.id);
      
      if (extractedCode) {
        console.log(`Found code in the most recent message, sending to tabs`);
        this.sendStatusUpdate(CHECKING_STATUS.CODE_FOUND, { code: extractedCode });
        await sendCodeToTabs(extractedCode);
      } else {
        console.log('No verification code found in the most recent email');
        this.showNotification('No verification code found', 'The most recent email does not contain a verification code.');
        this.sendStatusUpdate(CHECKING_STATUS.NO_CODE_FOUND);
        await sendNoCodeFoundToTabs();
      }
    } catch (error) {
      console.error('Error fetching Gmail messages:', error);
      this.sendStatusUpdate(CHECKING_STATUS.ERROR, { error: error.message });
      await sendNoCodeFoundToTabs();
      
      // Handle token expiration
      if (error.message && error.message.includes('401')) {
        console.log('Token may have expired, attempting refresh');
        try {
          await this.gmailApi.removeToken();
          await this.gmailApi.getToken(false);
        } catch (refreshError) {
          console.error('Failed to refresh token:', refreshError);
        }
      }
    } finally {
      this.isCheckingEmails = false;
    }
  }
  
  /**
   * Log information about a message for debugging
   * @param {string} messageId - Gmail message ID
   */
  async logMessageInfo(messageId) {
    try {
      const message = await this.gmailApi.getMessage(messageId);
      const internalDate = parseInt(message.internalDate || Date.now(), 10);
      const messageDate = new Date(internalDate);
      const messageAgeMinutes = (Date.now() - internalDate) / (1000 * 60);
      
      console.log(`Most recent message is from ${messageDate.toISOString()} (${messageAgeMinutes.toFixed(1)} minutes old)`);
      
      const headers = message.payload?.headers || [];
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No subject';
      const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      console.log(`Most recent email subject: "${subject}"`);
      console.log(`Email From: ${from}`);
    } catch (error) {
      console.warn('Error checking message details:', error);
    }
  }
  
  /**
   * Process a Gmail message and extract verification code
   * @param {string} messageId - Gmail message ID
   * @returns {Promise<string|null>} Extracted code or null
   */
  async processMessage(messageId) {
    try {
      console.log(`Processing message ${messageId}`);
      const message = await this.gmailApi.getMessage(messageId);
      
      if (!message || !message.payload) {
        console.log('Invalid message format, skipping');
        return null;
      }
      
      // Extract full content
      let fullContent = '';
      
      // Extract subject from headers
      const headers = message.payload.headers || [];
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      
      console.log(`Email From: ${from}`);
      console.log(`Email Subject: ${subject}`);
      
      fullContent += subject + ' ';
      fullContent += this.extractBodyContent(message.payload);
      
      if (fullContent.length < CODE_VALIDATION.MIN_EMAIL_CONTENT_LENGTH) {
        console.log('Warning: Email content is very short, might not contain verification code');
      }
      
      if (CONFIG.DEBUG_MODE) {
        const contentPreview = fullContent.substring(0, 300);
        console.log('Extracted email content (first 300 chars):', contentPreview + '...');
      }
      
      // Check for verification context
      const hasVerificationContext = VERIFICATION_KEYWORDS.some(word => 
        fullContent.toLowerCase().includes(word.toLowerCase())
      );
      
      if (!hasVerificationContext) {
        console.log('Warning: Email does not contain common verification keywords');
      } else {
        console.log('Email contains verification-related keywords');
      }
      
      // Extract code
      const code = this.extractCode(fullContent);
      
      if (code) {
        console.log(`Code extracted from email: ${code}`);
        this.lastFoundCode = code;
        this.lastCodeTimestamp = Date.now();
        return code;
      }
      
      console.log('No verification code found in message');
      return null;
    } catch (error) {
      console.error(`Error processing message ${messageId}:`, error);
      return null;
    }
  }
  
  /**
   * Recursively extract text content from message parts
   * @param {Object} part - Message part object
   * @returns {string} Extracted text content
   */
  extractBodyContent(part) {
    let content = '';
    
    if (part.body && part.body.data) {
      content += this.decodeBase64Url(part.body.data) + ' ';
    }
    
    if (part.parts && part.parts.length > 0) {
      for (const childPart of part.parts) {
        content += this.extractBodyContent(childPart) + ' ';
      }
    }
    
    return content;
  }
  
  /**
   * Decode Base64Url encoded string
   * @param {string} data - Base64Url encoded data
   * @returns {string} Decoded UTF-8 string
   */
  decodeBase64Url(data) {
    try {
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      const paddedData = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)) % 4, '=');
      const rawData = atob(paddedData);
      return decodeURIComponent(
        Array.from(rawData)
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    } catch (error) {
      console.error('Error decoding base64:', error);
      return '';
    }
  }
  
  /**
   * Show a browser notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   */
  showNotification(title, message) {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: title,
        message: message
      });
      console.log(`Notification shown: ${title} - ${message}`);
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }
  
  /**
   * Extract verification code from text using pattern matching
   * @param {string} text - Text to extract code from
   * @returns {string|null} Extracted code or null
   */
  extractCode(text) {
    if (!text) return null;
    
    console.log('Extracting code from text');
    
    // Remove HTML tags and normalize whitespace
    const cleanText = text.replace(/<\/?[^>]+(>|$)/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim();
    
    // Check for verification context - REQUIRED
    const hasVerificationContext = VERIFICATION_KEYWORDS.some(word => 
      cleanText.toLowerCase().includes(word.toLowerCase())
    );
    
    if (!hasVerificationContext) {
      console.log('No verification context found in email, not extracting any codes');
      return null;
    }
    
    // Check for snippet pattern first
    if (text.includes('verification code') || text.includes('confirmation code')) {
      const snippetMatch = text.match(/(?:verification|confirmation)\s+code\s+(?:is|:)?\s+([0-9]{4,8})/i);
      if (snippetMatch && snippetMatch[1]) {
        const matchedCode = snippetMatch[1].replace(/\s+/g, '');
        console.log(`Found code from verification snippet: ${matchedCode}`);
        const processedCode = this.processCode(matchedCode);
        if (processedCode) return processedCode;
      }
    }
    
    // Try each pattern in order
    for (const regex of CODE_PATTERNS) {
      const match = cleanText.match(regex);
      if (match && match[1]) {
        const matchedCode = match[1].replace(/\s+/g, '');
        console.log(`Found code: ${matchedCode} using pattern: ${regex}`);
        const processedCode = this.processCode(matchedCode);
        if (processedCode) return processedCode;
      }
    }
    
    console.log('No verification code matched our patterns in this email');
    return null;
  }
  
  /**
   * Process and validate an extracted code
   * @param {string} codeString - Raw code string
   * @returns {string|null} Processed valid code or null
   */
  processCode(codeString) {
    const cleanCode = codeString.replace(/[^a-zA-Z0-9]/g, '');
    const numericOnly = codeString.replace(/[^0-9]/g, '');
    
    if (CONFIG.DEBUG_MODE) {
      console.log(`Extracted part: ${cleanCode} (numeric: ${numericOnly}) from ${codeString}`);
    }
    
    if (!this.isValidCode(numericOnly) && !this.isValidCode(cleanCode)) {
      console.log(`Rejected invalid code: ${cleanCode}`);
      return null;
    }
    
    // Standard numeric code
    if (numericOnly.length >= CODE_VALIDATION.MIN_LENGTH && 
        numericOnly.length <= CODE_VALIDATION.MAX_LENGTH && 
        this.isValidCode(numericOnly)) {
      return numericOnly;
    }
    
    // Alphanumeric code
    if (cleanCode.length >= 6 && cleanCode.length <= 8 && this.isValidCode(cleanCode)) {
      return cleanCode.toUpperCase();
    }
    
    return null;
  }
  
  /**
   * Validate a potential verification code
   * @param {string} code - Code to validate
   * @returns {boolean} Whether the code is valid
   */
  isValidCode(code) {
    if (!code) return false;
    
    // Length checks
    if (code.length < CODE_VALIDATION.MIN_LENGTH) return false;
    if (code.length > CODE_VALIDATION.MAX_LENGTH) return false;
    
    const isNumeric = /^[0-9]+$/.test(code);
    const isValidAlphanumeric = /^[A-Z0-9]{6,8}$/.test(code) && 
                                /[A-Z]/.test(code) && 
                                /[0-9]/.test(code) && 
                                !/^[0]+$/.test(code);
    
    // Reject date-like patterns
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(code) || 
        /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(code)) {
      return false;
    }
    
    // Reject repeated digits (000000)
    if (/^(\d)\1+$/.test(code)) return false;
    
    // Reject sequential digits (123456, 654321)
    if (/^(?:0?1?2?3?4?5?6?7?8?9?|9?8?7?6?5?4?3?2?1?0?)$/.test(code)) return false;
    
    // Reject year-like patterns
    if (/^(19|20)\d{2}$/.test(code)) return false;
    
    if (isNumeric) {
      return code.length >= CODE_VALIDATION.MIN_LENGTH && 
             code.length <= CODE_VALIDATION.MAX_LENGTH;
    }
    
    return isValidAlphanumeric;
  }
}

// Create background manager instance
const backgroundManager = new BackgroundManager();

// Handle installation and startup events
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
});
