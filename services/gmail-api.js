/**
 * Gmail API Service for Q-Fill for Gmail
 * 
 * Handles OAuth authentication and Gmail API interactions.
 * Provides methods for token management and message retrieval.
 * 
 * @fileoverview Gmail API wrapper for Q-Fill
 * @version 1.0.0
 */

import { TIME, CODE_VALIDATION } from '../utils/constants.js';

/**
 * GmailAPI Class
 * Manages Gmail API authentication and message retrieval
 */
class GmailAPI {
  /**
   * Create a GmailAPI instance
   * @param {string} clientId - OAuth Client ID
   * @param {string[]} scopes - OAuth scopes
   */
  constructor(clientId, scopes) {
    this.clientId = clientId;
    this.scopes = scopes;
    this.tokenKey = 'gmail_access_token';
    this.lastCheckTime = Date.now() - TIME.INITIAL_CHECK_OFFSET_MS;
  }
  
  /**
   * Get or refresh OAuth token
   * @param {boolean} interactive - Whether to show interactive login
   * @returns {Promise<string>} Access token
   */
  async getToken(interactive = false) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          console.error('Token error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (!token) {
          reject(new Error('Failed to get token'));
          return;
        }
        
        console.log('Successfully obtained Gmail auth token');
        resolve(token);
      });
    });
  }
  
  /**
   * Ensure user is authenticated before making API calls
   * @param {boolean} interactive - Whether to show interactive login if needed
   * @returns {Promise<string>} Access token
   */
  async ensureAuthenticated(interactive = false) {
    try {
      return await this.getToken(interactive);
    } catch (error) {
      console.error('Authentication error:', error);
      
      if (!interactive) {
        console.log('Attempting interactive authentication...');
        return this.getToken(true);
      }
      
      throw error;
    }
  }
  
  /**
   * Remove the current OAuth token
   * @returns {Promise<void>}
   */
  async removeToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (!token) {
          resolve();
          return;
        }
        
        chrome.identity.removeCachedAuthToken({ token }, async () => {
          try {
            const response = await fetch(
              `https://accounts.google.com/o/oauth2/revoke?token=${token}`
            );
            
            if (response.ok) {
              console.log('Token revoked successfully');
            } else {
              console.warn('Token revocation returned status:', response.status);
            }
            
            resolve();
          } catch (error) {
            console.error('Failed to revoke token:', error);
            resolve(); // Still resolve since we removed from Chrome's cache
          }
        });
      });
    });
  }
  
  /**
   * Get recent Gmail messages
   * @returns {Promise<Array>} List of recent message objects
   */
  async getRecentMessages() {
    try {
      const token = await this.ensureAuthenticated(false);
      
      // Calculate time window - emails from last 5 minutes
      const currentTime = Date.now();
      const timeWindowSeconds = (TIME.EMAIL_FETCH_WINDOW_MINUTES * 60);
      const windowStart = new Date(currentTime - (timeWindowSeconds * 1000)).getTime() / 1000;
      
      // Gmail search query
      const query = `after:${Math.floor(windowStart)} OR (is:unread newer:1d)`;
      
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${CODE_VALIDATION.MAX_GMAIL_RESULTS}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gmail API error:', errorText);
        throw new Error(`Gmail API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      this.lastCheckTime = currentTime;
      
      if (!data.messages) {
        console.log('No messages in the response');
        return [];
      }
      
      console.log(`Found ${data.messages.length} recent Gmail messages`);
      
      // Verify newest first ordering
      if (data.messages.length > 0) {
        try {
          const mostRecentMessage = await this.getMessage(data.messages[0].id);
          const internalDate = parseInt(mostRecentMessage.internalDate, 10);
          const messageDate = new Date(internalDate);
          console.log(`Most recent message timestamp: ${messageDate.toISOString()}`);
        } catch (error) {
          console.warn('Error checking most recent message date:', error);
        }
      }
      
      return data.messages || [];
    } catch (error) {
      console.error('Error fetching Gmail messages:', error);
      throw error;
    }
  }
  
  /**
   * Get a specific Gmail message with full content
   * @param {string} messageId - Gmail message ID
   * @returns {Promise<Object>} Message object with details
   */
  async getMessage(messageId) {
    try {
      const token = await this.ensureAuthenticated(false);
      
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gmail API error when fetching message:', errorText);
        throw new Error(`Gmail API error: ${response.status} - ${errorText}`);
      }
      
      const message = await response.json();
      
      if (!message || !message.payload) {
        console.error('Invalid message format received from Gmail API');
        throw new Error('Invalid message format received');
      }
      
      return message;
    } catch (error) {
      console.error(`Error fetching Gmail message ${messageId}:`, error);
      throw error;
    }
  }
}

export { GmailAPI };
