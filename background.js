// background.js
import { GmailAPI } from './services/gmail-api.js';
import { StorageManager } from './services/storage-manager.js';
import { CONFIG } from './config/config.js';
import * as CONSTANTS from './utils/constants.js';
import * as TabMessenger from './utils/tab-messenger.js';

// Class to manage all background operations
class BackgroundManager {
  constructor() {
    this.gmailApi = new GmailAPI(CONFIG.CLIENT_ID, CONFIG.SCOPES);
    this.storage = new StorageManager();
    this.lastProcessedMessageIds = new Set();
    this.lastFoundCode = null;
    this.lastCodeTimestamp = 0;
    this.isCheckingEmails = false;

    // Initialize extension
    this.init();

    // Setup message listeners
    this.setupMessageListeners();
  }
  
  async init() {
    console.log('Initializing Auto Code Filler Extension');
    
    // Check if we're already authenticated
    const isAuthenticated = await this.storage.get('isAuthenticated');
    if (isAuthenticated) {
      console.log('Previously authenticated, retrieving token');
      try {
        await this.gmailApi.getToken(false);
        console.log('Token retrieved successfully - ready for manual checking');
      } catch (error) {
        console.error('Failed to retrieve token:', error);
        // Reset authentication state if token retrieval fails
        await this.storage.set('isAuthenticated', false);
      }
    } else {
      console.log('Not authenticated yet, waiting for user interaction');
    }
  }
  
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Background script received message:', request);
      
      if (request.action === 'getAuthStatus') {
        this.handleGetAuthStatus(sendResponse);
        return true; // Async response
      } else if (request.action === 'authenticate') {
        this.handleAuthenticate(sendResponse);
        return true; // Async response
      } else if (request.action === 'clearAuth') {
        this.handleClearAuth(sendResponse);
        return true; // Async response
      } else if (request.action === 'forceCheckEmails') {
        // Manual email check
        this.checkEmails();
        sendResponse({ success: true });
        return true;
      } else if (request.action === 'contentScriptReady') {
        // Content script is reporting it's ready
        console.log(`Content script ready in tab at URL: ${request.url}`);
        sendResponse({ success: true });
        return true;
      }
    });
  }
  
  // Authentication handlers
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
  
  async handleGetAuthStatus(sendResponse) {
    try {
      const isAuthenticated = await this.storage.get('isAuthenticated');
      sendResponse({ isAuthenticated });
    } catch (error) {
      console.error('Error checking auth status:', error);
      sendResponse({ isAuthenticated: false, error: error.message });
    }
  }
  
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
  
  // Manual check of Gmail messages
  async checkEmails() {
    // Prevent multiple simultaneous checks
    if (this.isCheckingEmails) {
      console.log('Already checking emails, skipping this request');
      return;
    }
    
    this.isCheckingEmails = true;
    
    try {
      console.log('Manually checking for new Gmail messages');
      
      // Notify popup that checking has started
      chrome.runtime.sendMessage({ 
        action: 'checkingStatus', 
        status: 'checking'
      });
      
      const messages = await this.gmailApi.getRecentMessages();
      
      if (!messages || messages.length === 0) {
        console.log('No new messages found');
        this.showNotification('No emails found', 'There are no recent emails in your inbox to check for codes.');
        
        // Notify popup that no emails were found
        chrome.runtime.sendMessage({ 
          action: 'checkingStatus', 
          status: 'noEmails'
        });
        
        // Send a notification to all open tabs to show the error visualization
        await this.sendNoCodeFoundToTabs();
        
        this.isCheckingEmails = false;
        return;
      }
      
      console.log(`Found ${messages.length} messages, checking only the most recent one`);
      
      // Get the most recent message (first in the list)
      const mostRecentMessage = messages[0];
      
      // Check if the most recent message is within last 10 minutes to ensure freshness
      try {
        // Get full message details
        const message = await this.gmailApi.getMessage(mostRecentMessage.id);
        const internalDate = parseInt(message.internalDate || Date.now(), 10);
        const messageDate = new Date(internalDate);
        const messageAgeMinutes = (Date.now() - internalDate) / (1000 * 60);
        
        console.log(`Most recent message is from ${messageDate.toISOString()} (${messageAgeMinutes.toFixed(1)} minutes old)`);
        
        // Log message subject for debugging
        const headers = message.payload?.headers || [];
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No subject';
        const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
        console.log(`Most recent email subject: "${subject}"`);
        console.log(`Email From: ${from}`);
      } catch (error) {
        console.warn('Error checking most recent message details:', error);
        // Continue processing anyway
      }
      
      // Process only the most recent message
      const extractedCode = await this.processMessage(mostRecentMessage.id);
      
      if (extractedCode) {
        console.log(`Found code in the most recent message, sending to tabs`);
        
        // Notify popup that code was found
        chrome.runtime.sendMessage({ 
          action: 'checkingStatus', 
          status: 'codeFound',
          code: extractedCode
        });
        
        await this.sendCodeToTabs(extractedCode);
      } else {
        console.log('No verification code found in the most recent email - SHOWING ERROR VISUALIZATION');
        
        // Show desktop notification
        this.showNotification('No verification code found', 'The most recent email does not contain a verification code.');
        
        // Notify popup that no code was found
        chrome.runtime.sendMessage({ 
          action: 'checkingStatus', 
          status: 'noCodeFound'
        });
        
        // ALWAYS trigger the error visualization when no code is found in the most recent email
        await this.sendNoCodeFoundToTabs();
      }
    } catch (error) {
      console.error('Error fetching Gmail messages:', error);
      
      // Notify popup about the error
      chrome.runtime.sendMessage({ 
        action: 'checkingStatus', 
        status: 'error',
        error: error.message
      });
      
      // Always show error visualization on failures
      await this.sendNoCodeFoundToTabs();
      
      // If token issue, try to refresh
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
  
  async processMessage(messageId) {
    try {
      console.log(`Processing message ${messageId}`);
      const message = await this.gmailApi.getMessage(messageId);
      
      if (!message || !message.payload) {
        console.log('Invalid message format, skipping');
        return null;
      }
      
      // Extract the full content including headers, subject, and body
      let fullContent = '';
      
      // Extract subject from headers
      const headers = message.payload.headers || [];
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
      const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      
      console.log(`Email From: ${from}`);
      console.log(`Email Subject: ${subject}`);
      
      // Add subject to full content
      fullContent += subject + ' ';
      
      // Extract body using recursive function
      const bodyContent = this.extractBodyContent(message.payload);
      fullContent += bodyContent;
      
      // Check if the email is very short - might not contain a code
      if (fullContent.length < 50) {
        console.log('Warning: Email content is very short, might not contain verification code');
      }
      
      // Log a reasonable portion of the email content for debugging
      const contentPreview = fullContent.substring(0, 300);
      console.log('Extracted email content (first 300 chars):', contentPreview + '...');
      
      // Check if email contains verification-related keywords
      const verificationKeywords = ['verification', 'code', 'auth', 'login', 'security', 'password', 'confirm'];
      const hasVerificationContext = verificationKeywords.some(word => 
        fullContent.toLowerCase().includes(word.toLowerCase())
      );
      
      if (!hasVerificationContext) {
        console.log('Warning: Email does not contain common verification keywords');
      } else {
        console.log('Email contains verification-related keywords, likely a verification email');
      }
      
      // Extract verification code from full content
      const code = this.extractCode(fullContent);
      
      if (code) {
        console.log(`Code extracted from email: ${code}`);
        
        // Store the code with a timestamp
        this.lastFoundCode = code;
        this.lastCodeTimestamp = Date.now();
        
        return code;
      } else {
        console.log('No verification code found in message - this will trigger error visualization');
        return null;
      }
    } catch (error) {
      console.error(`Error processing message ${messageId}:`, error);
      return null;
    }
  }
  
  // Recursively extract all text from message parts
  extractBodyContent(part) {
    let content = '';
    
    // If this part has a body with data
    if (part.body && part.body.data) {
      content += this.decodeBase64Url(part.body.data) + ' ';
    }
    
    // If this part has child parts, recursively extract from them
    if (part.parts && part.parts.length > 0) {
      for (const childPart of part.parts) {
        content += this.extractBodyContent(childPart) + ' ';
      }
    }
    
    return content;
  }
  
  // Decode Base64Url encoded string (used for email body)
  decodeBase64Url(data) {
    try {
      // Replace URL-safe characters back to normal base64
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed
      const paddedData = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)) % 4, '=');
      // Decode base64
      const rawData = atob(paddedData);
      // Convert to UTF-8 string
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
  
  // Send code to all open tabs
  async sendCodeToTabs(code) {
    console.log(`Sending code "${code}" to all tabs`);
    const message = { action: CONSTANTS.MESSAGE_ACTIONS.FILL_CODE, code };
    const result = await TabMessenger.sendMessageToAllTabs(message);
    console.log(`Code send complete: ${result.successCount} successes, ${result.failCount} failures`);
  }
  
  // Send notification to all tabs that no code was found
  async sendNoCodeFoundToTabs() {
    console.log('Sending no-code-found notification to all tabs');
    const message = { action: CONSTANTS.MESSAGE_ACTIONS.NO_CODE_FOUND };
    const result = await TabMessenger.sendMessageToAllTabs(message);
    console.log(`No-code notification complete: ${result.successCount} successes, ${result.failCount} failures`);
  }
  
  /**
   * Show a browser notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   */
  showNotification(title, message) {
    // Check if the browser supports notifications
    if ('Notification' in self) {
      try {
        // Create and show the notification
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
    } else {
      console.log(`Notification (not shown): ${title} - ${message}`);
    }
  }
  
  // Extract verification code from text using multiple patterns
  extractCode(text) {
    if (!text) return null;
    
    console.log('Extracting code from text');
    
    // Remove all HTML tags and normalize whitespace
    const cleanText = text.replace(/<\/?[^>]+(>|$)/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim();
    
    // Helper function to validate a code
    const isValidCode = (code) => {
      if (!code) return false;
      
      // Minimum length check (codes should be at least 4 digits)
      if (code.length < 4) return false;
      
      // Maximum length check - most verification codes are 8 digits or less
      if (code.length > 8) return false;
      
      // Check if the code is all numeric, which is most common
      const isNumeric = /^[0-9]+$/.test(code);
      
      // If it's alphanumeric, it needs to follow a certain pattern to be valid
      // Most alphanumeric codes are 6-8 characters with at least one letter and one number
      const isValidAlphanumeric = /^[A-Z0-9]{6,8}$/.test(code) && 
                                 /[A-Z]/.test(code) && 
                                 /[0-9]/.test(code) && 
                                 !/^[0]+$/.test(code);
      
      // Reject codes that appear to be dates (MM/DD/YYYY, MM-DD-YYYY, or YYYY-MM-DD format)
      if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(code) || 
          /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(code)) {
        return false;
      }
      
      // Reject codes that are all same digit (like 000000)
      if (/^(\d)\1+$/.test(code)) {
        return false;
      }
      
      // Reject codes that are sequential (like 123456 or 654321)
      if (/^(?:0?1?2?3?4?5?6?7?8?9?|9?8?7?6?5?4?3?2?1?0?)$/.test(code)) {
        return false;
      }
      
      // Reject if it looks like a year
      if (/^(19|20)\d{2}$/.test(code)) {
        return false;
      }
      
      // If we're looking at a numeric code, it's more likely to be a verification code 
      // if it doesn't look like other common numbers
      if (isNumeric) {
        // Common numeric codes are 4-8 digits
        return code.length >= 4 && code.length <= 8;
      }
      
      return isValidAlphanumeric;
    };
    
    // Helper function to get only the numeric part of a code and ensure proper length
    const processCode = (codeString) => {
      // Remove any non-alphanumeric characters
      const cleanCode = codeString.replace(/[^a-zA-Z0-9]/g, '');
      
      // Extract only the numeric digits if it's all numeric
      const numericOnly = codeString.replace(/[^0-9]/g, '');
      console.log(`Extracted part: ${cleanCode} (numeric: ${numericOnly}) from ${codeString}`);
      
      // If the code isn't valid, don't return it
      if (!isValidCode(numericOnly) && !isValidCode(cleanCode)) {
        console.log(`Rejected invalid code: ${cleanCode}`);
        return null;
      }
      
      // Determine most likely verification code format
      if (numericOnly.length >= 4 && numericOnly.length <= 8 && isValidCode(numericOnly)) {
        // Standard numeric code (4-8 digits)
        return numericOnly;
      } else if (cleanCode.length >= 6 && cleanCode.length <= 8 && isValidCode(cleanCode)) {
        // Alpha-numeric code (usually 6-8 chars with at least one letter)
        return cleanCode.toUpperCase();
      } else {
        // Not a valid code
        return null;
      }
    };
    
    // Context-aware code search - only look for codes near verification-related words
    const verificationContext = [
      'verification', 'verify', 'code', 'pin', 'otp', 'passcode', 
      'secure', 'security', 'authorization', 'authenticate', 'auth',
      'confirm', 'confirmation', 'login', 'sign-in', '2fa', 'two-factor',
      'one-time', 'password', 'token'
    ];
    
    // Check if the email has verification-related context
    const hasVerificationContext = verificationContext.some(word => 
      cleanText.toLowerCase().includes(word.toLowerCase())
    );
    
    // STRICT REQUIREMENT: If no verification context is found, return null immediately
    // This prevents extracting random numbers from unrelated emails
    if (!hasVerificationContext) {
      console.log('No verification context found in email, not extracting any codes');
      return null;
    }
    
    // Patterns ordered by priority (most specific first)
    const patterns = [
      // Very specific patterns for numeric codes with clear labeling
      /(?:verification|auth|security|confirmation|login|sign-in|2fa|authorization)\s+code(?:\s+is|\s*[:=]\s*)([0-9]{4,8})/i,
      /(?:your|the)\s+(?:code|otp|pin|passcode)(?:\s+is|\s*[:=]\s*)([0-9]{4,8})/i,
      /(?:code|pin|otp|passcode)\s*[:=]\s*([0-9]{4,8})/i,
      
      // Common formatted codes with spaces or dashes that are clearly codes
      /\b(?:code|pin|otp|passcode)\s*[:=]?\s*([0-9]{3}[\s\-][0-9]{3})\b/i,
      
      // Special formats with clear labeling
      /\b(?:code|pin|otp|passcode)\s*[:=]?\s*([A-Z0-9]{1,2}[\s\-]+[0-9]{3,6})\b/i,
      
      // Look for more general labeled codes
      /(?:code|pin|otp|token|passcode|password)\s*(?:is|:=|:|\s)\s*([a-zA-Z0-9]{4,8})/i,
      
      // Codes highlighted or emphasized in some way (in quotes, brackets, etc.)
      /"([0-9]{4,8})"/,
      /'([0-9]{4,8})'/,
      /\s\*\*([0-9]{4,8})\*\*/,
      /\(([0-9]{4,8})\)/,
      
      // Look for codes in a context that suggests they are verification codes
      /verification[\s\S]{1,50}?([0-9]{4,8})/i,
      /authentication[\s\S]{1,50}?([0-9]{4,8})/i,
      /one-time[\s\S]{1,50}?([0-9]{4,8})/i,
      /security[\s\S]{1,50}?([0-9]{4,8})/i,
      
      // Common numeric patterns, only when near context words
      /\b([0-9]{6})\b/, // 6-digit (most common)
      /\b([0-9]{5})\b/, // 5-digit
      /\b([0-9]{4})\b/, // 4-digit PIN
      /\b([0-9]{8})\b/, // 8-digit
      
      // Alphanumeric codes (less common)
      /\b([A-Za-z0-9]{6,8})\b/  // General 6-8 char alphanumeric
    ];
    
    // Extra regex for Gmail preview snippets that often show "Your verification code is 123456"
    if (text.includes('verification code') || text.includes('confirmation code')) {
      // Look for codes after confirmation/verification code phrases
      const snippetMatch = text.match(/(?:verification|confirmation)\s+code\s+(?:is|:)?\s+([0-9]{4,8})/i);
      
      if (snippetMatch && snippetMatch[1]) {
        const matchedCode = snippetMatch[1].replace(/\s+/g, '');
        console.log(`Found code from verification snippet: ${matchedCode}`);
        const processedCode = processCode(matchedCode);
        if (processedCode) return processedCode;
      }
    }
    
    // Try each pattern in order
    for (const regex of patterns) {
      const match = cleanText.match(regex);
      if (match && match[1]) {
        // Remove spaces first
        const matchedCode = match[1].replace(/\s+/g, '');
        console.log(`Found code: ${matchedCode} using pattern: ${regex}`);
        const processedCode = processCode(matchedCode);
        if (processedCode) return processedCode;
      }
    }
    
    // No code found - always return null rather than using last resort patterns
    // This ensures the error visualization plays when we can't find a clear verification code
    console.log('No verification code matched our patterns in this email');
    return null;
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

