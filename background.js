/**
 * Q-Fill for Gmail - Background Service Worker
 * 
 * Handles Gmail API communication, authentication, and code extraction.
 * Coordinates with content scripts to fill verification codes into web forms.
 * 
 * @fileoverview Main background script for the extension
 * @version 1.1.0
 */

import { GmailAPI } from './services/gmail-api.js';
import { StorageManager } from './services/storage-manager.js';
import { sendCodeToTabs, sendNoCodeFoundToTabs } from './utils/tab-messenger.js';
import { 
  TIME, 
  CODE_VALIDATION, 
  STRONG_VERIFICATION_KEYWORDS,
  WEAK_VERIFICATION_KEYWORDS,
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
    this.isCheckingEmails = false;
    
    this.init();
    this.setupMessageListeners();
  }
  
  /**
   * Initialize the extension
   */
  async init() {
    console.log('Initializing Q-Fill for Gmail v2.0');
    
    const isAuthenticated = await this.storage.get('isAuthenticated');
    if (isAuthenticated) {
      try {
        await this.gmailApi.getToken(false);
        console.log('Token retrieved - ready');
      } catch (error) {
        console.error('Failed to retrieve token:', error);
        await this.storage.set('isAuthenticated', false);
      }
    }
  }
  
  /**
   * Set up message listeners
   */
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (CONFIG.DEBUG_MODE) {
        console.log('Received message:', request.action);
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
      console.error('Authentication failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
  
  async handleGetAuthStatus(sendResponse) {
    try {
      const isAuthenticated = await this.storage.get('isAuthenticated');
      sendResponse({ isAuthenticated });
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
  
  /**
   * Check Gmail for verification codes - ONLY checks most recent email
   */
  async checkEmails() {
    if (this.isCheckingEmails) {
      console.log('Already checking, skipping');
      return;
    }
    
    this.isCheckingEmails = true;
    
    try {
      console.log('Checking most recent email for verification code');
      this.sendStatusUpdate(CHECKING_STATUS.CHECKING);
      
      const messages = await this.gmailApi.getRecentMessages();
      
      if (!messages || messages.length === 0) {
        console.log('No recent emails found');
        this.showNotification('No emails found', 'No recent emails to check.');
        this.sendStatusUpdate(CHECKING_STATUS.NO_EMAILS);
        await sendNoCodeFoundToTabs();
        return;
      }
      
      // ONLY process the single most recent email
      const messageId = messages[0].id;
      const extractedCode = await this.processMessage(messageId);
      
      if (extractedCode) {
        console.log(`Found code: ${extractedCode}`);
        this.sendStatusUpdate(CHECKING_STATUS.CODE_FOUND, { code: extractedCode });
        await sendCodeToTabs(extractedCode);
      } else {
        console.log('No code in most recent email');
        this.showNotification('No code found', 'Most recent email has no verification code.');
        this.sendStatusUpdate(CHECKING_STATUS.NO_CODE_FOUND);
        await sendNoCodeFoundToTabs();
      }
    } catch (error) {
      console.error('Error:', error);
      this.sendStatusUpdate(CHECKING_STATUS.ERROR, { error: error.message });
      await sendNoCodeFoundToTabs();
      
      if (error.message?.includes('401')) {
        try {
          await this.gmailApi.removeToken();
          await this.gmailApi.getToken(false);
        } catch (e) {}
      }
    } finally {
      this.isCheckingEmails = false;
    }
  }
  
  /**
   * Process a Gmail message and extract verification code
   */
  async processMessage(messageId) {
    try {
      const message = await this.gmailApi.getMessage(messageId);
      
      if (!message?.payload) return null;
      
      // Get subject and sender
      const headers = message.payload.headers || [];
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      
      console.log(`From: ${from}`);
      console.log(`Subject: ${subject}`);
      
      // Extract body content
      const body = this.extractBodyContent(message.payload);
      const fullContent = subject + ' ' + body;
      
      // Extract the code
      return this.extractCode(fullContent, subject);
    } catch (error) {
      console.error(`Error processing message:`, error);
      return null;
    }
  }
  
  /**
   * Recursively extract text content from message parts
   */
  extractBodyContent(part) {
    let content = '';
    
    if (part.body?.data) {
      content += this.decodeBase64Url(part.body.data) + ' ';
    }
    
    if (part.parts?.length > 0) {
      for (const childPart of part.parts) {
        content += this.extractBodyContent(childPart) + ' ';
      }
    }
    
    return content;
  }
  
  /**
   * Decode Base64Url encoded string
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
      return '';
    }
  }
  
  showNotification(title, message) {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title,
        message
      });
    } catch (e) {}
  }
  
  /**
   * IMPROVED: Extract verification code using smart pattern matching
   * @param {string} text - Full email text
   * @param {string} subject - Email subject
   * @returns {string|null} Extracted code or null
   */
  extractCode(text, subject) {
    if (!text) return null;
    
    // Clean HTML and normalize
    const cleanText = text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const lowerText = cleanText.toLowerCase();
    
    // Check if this looks like a verification email
    const hasStrongContext = STRONG_VERIFICATION_KEYWORDS.some(kw => lowerText.includes(kw));
    const hasWeakContext = WEAK_VERIFICATION_KEYWORDS.some(kw => lowerText.includes(kw));
    
    if (!hasStrongContext && !hasWeakContext) {
      console.log('Email does not appear to be verification-related');
      return null;
    }
    
    // Collect all candidate codes with scores
    const candidates = [];
    
    // === PATTERN 1: Explicit "code is X" or "code: X" patterns ===
    const explicitPatterns = [
      /(?:verification|security|confirmation|login|sign-?in|auth(?:entication)?|one-?time|otp|2fa)\s*code\s*(?:is|:|\s)\s*[:=]?\s*([0-9]{4,8})/gi,
      /(?:your|the)\s+(?:code|otp|pin|passcode)\s*(?:is|:)\s*[:=]?\s*([0-9]{4,8})/gi,
      /(?:code|pin|otp|passcode)\s*[:=]\s*([0-9]{4,8})/gi,
      /(?:enter|use|input)\s+(?:code|otp)?\s*[:=]?\s*([0-9]{4,8})/gi,
    ];
    
    for (const pattern of explicitPatterns) {
      let match;
      while ((match = pattern.exec(cleanText)) !== null) {
        const code = match[1].replace(/\s/g, '');
        if (this.isValidCode(code)) {
          candidates.push({ code, score: 100, source: 'explicit' });
        }
      }
    }
    
    // === PATTERN 2: Codes with spaces or dashes (123 456 or 123-456) ===
    const spacedPatterns = [
      /\b([0-9]{3})\s+([0-9]{3})\b/g,
      /\b([0-9]{3})-([0-9]{3})\b/g,
      /\b([0-9]{2})\s+([0-9]{2})\s+([0-9]{2})\b/g,
    ];
    
    for (const pattern of spacedPatterns) {
      let match;
      while ((match = pattern.exec(cleanText)) !== null) {
        const code = match.slice(1).join('');
        if (this.isValidCode(code)) {
          // Check if near verification keyword
          const nearbyText = cleanText.substring(Math.max(0, match.index - 50), match.index + 50).toLowerCase();
          const nearKeyword = STRONG_VERIFICATION_KEYWORDS.some(kw => nearbyText.includes(kw));
          candidates.push({ code, score: nearKeyword ? 90 : 60, source: 'spaced' });
        }
      }
    }
    
    // === PATTERN 3: Standalone codes near verification context ===
    // Look for codes within 100 chars of strong keywords
    for (const keyword of STRONG_VERIFICATION_KEYWORDS) {
      const keywordIndex = lowerText.indexOf(keyword);
      if (keywordIndex !== -1) {
        // Search around the keyword
        const start = Math.max(0, keywordIndex - 30);
        const end = Math.min(cleanText.length, keywordIndex + keyword.length + 100);
        const nearbyText = cleanText.substring(start, end);
        
        // Find standalone numbers
        const numPattern = /\b([0-9]{4,8})\b/g;
        let match;
        while ((match = numPattern.exec(nearbyText)) !== null) {
          const code = match[1];
          if (this.isValidCode(code)) {
            const distance = Math.abs(match.index - (keywordIndex - start));
            const score = 80 - Math.min(distance / 5, 30);
            candidates.push({ code, score, source: 'nearContext' });
          }
        }
      }
    }
    
    // === PATTERN 4: Highlighted/emphasized codes ===
    const highlightPatterns = [
      /["']([0-9]{4,8})["']/g,
      /\*\*([0-9]{4,8})\*\*/g,
      /\[([0-9]{4,8})\]/g,
      /\(([0-9]{4,8})\)/g,
      /<b>([0-9]{4,8})<\/b>/gi,
      /<strong>([0-9]{4,8})<\/strong>/gi,
    ];
    
    for (const pattern of highlightPatterns) {
      let match;
      const searchText = text; // Use original text for HTML patterns
      while ((match = pattern.exec(searchText)) !== null) {
        const code = match[1];
        if (this.isValidCode(code)) {
          candidates.push({ code, score: 75, source: 'highlighted' });
        }
      }
    }
    
    // === PATTERN 5: Subject line codes (high priority) ===
    const subjectCodes = subject.match(/\b([0-9]{4,8})\b/g);
    if (subjectCodes) {
      for (const code of subjectCodes) {
        if (this.isValidCode(code)) {
          candidates.push({ code, score: 95, source: 'subject' });
        }
      }
    }
    
    // === PATTERN 6: Fallback - any standalone 6-digit number (most common) ===
    if (candidates.length === 0 && hasStrongContext) {
      const fallbackPattern = /\b([0-9]{6})\b/g;
      let match;
      while ((match = fallbackPattern.exec(cleanText)) !== null) {
        const code = match[1];
        if (this.isValidCode(code)) {
          candidates.push({ code, score: 40, source: 'fallback6digit' });
        }
      }
    }
    
    // === Select the best code ===
    if (candidates.length === 0) {
      console.log('No verification codes found');
      return null;
    }
    
    // Sort by score (highest first), then prefer 6-digit codes
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Prefer 6-digit codes
      const aIs6 = a.code.length === 6 ? 1 : 0;
      const bIs6 = b.code.length === 6 ? 1 : 0;
      return bIs6 - aIs6;
    });
    
    // Remove duplicates and log
    const uniqueCodes = [...new Map(candidates.map(c => [c.code, c])).values()];
    console.log('Code candidates:', uniqueCodes.slice(0, 5).map(c => `${c.code} (${c.score}, ${c.source})`));
    
    const bestCode = uniqueCodes[0].code;
    console.log(`Selected code: ${bestCode} (score: ${uniqueCodes[0].score}, source: ${uniqueCodes[0].source})`);
    
    return bestCode;
  }
  
  /**
   * Validate a potential verification code
   */
  isValidCode(code) {
    if (!code) return false;
    
    const len = code.length;
    if (len < CODE_VALIDATION.MIN_LENGTH || len > CODE_VALIDATION.MAX_LENGTH) return false;
    
    // Must be numeric for standard codes
    if (!/^[0-9]+$/.test(code)) return false;
    
    // Reject all same digits (000000, 111111)
    if (/^(\d)\1+$/.test(code)) return false;
    
    // Reject sequential (123456, 654321)
    const isSequential = (s) => {
      for (let i = 1; i < s.length; i++) {
        if (parseInt(s[i]) !== parseInt(s[i-1]) + 1) return false;
      }
      return true;
    };
    const isReverseSequential = (s) => {
      for (let i = 1; i < s.length; i++) {
        if (parseInt(s[i]) !== parseInt(s[i-1]) - 1) return false;
      }
      return true;
    };
    if (isSequential(code) || isReverseSequential(code)) return false;
    
    // Reject year-like 4-digit patterns
    if (len === 4 && /^(19|20)\d{2}$/.test(code)) return false;
    
    // Reject date-like patterns
    if (/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(code)) return false; // MMDD
    if (/^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])$/.test(code)) return false; // DDMM
    
    return true;
  }
}

// Create instance
const backgroundManager = new BackgroundManager();

chrome.runtime.onInstalled.addListener(() => {
  console.log('Q-Fill installed');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Q-Fill started');
});
