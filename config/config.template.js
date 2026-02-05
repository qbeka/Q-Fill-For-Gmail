/**
 * Configuration Template for Q-Fill for Gmail
 * 
 * SETUP INSTRUCTIONS:
 * 1. Copy this file and rename it to 'config.js' in the same directory
 * 2. Go to Google Cloud Console: https://console.cloud.google.com/
 * 3. Create a new project or select an existing one
 * 4. Enable the Gmail API:
 *    - Go to APIs & Services > Library
 *    - Search for "Gmail API" and enable it
 * 5. Create OAuth 2.0 credentials:
 *    - Go to APIs & Services > Credentials
 *    - Click "Create Credentials" > "OAuth client ID"
 *    - Select "Chrome Extension" as the application type
 *    - Enter your extension's ID (found at chrome://extensions when loaded unpacked)
 * 6. Copy your Client ID and paste it below
 * 7. IMPORTANT: Never commit config.js to version control!
 * 
 * @fileoverview Configuration file template for OAuth credentials
 */

const CONFIG = {
  /**
   * Google OAuth 2.0 Client ID
   * Get this from Google Cloud Console > APIs & Services > Credentials
   * Format: "xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
   */
  OAUTH_CLIENT_ID: 'YOUR_OAUTH_CLIENT_ID_HERE',

  /**
   * OAuth Scopes required by the extension
   * gmail.readonly - Allows reading email messages (required for code extraction)
   * DO NOT add additional scopes unless absolutely necessary
   */
  OAUTH_SCOPES: [
    'https://www.googleapis.com/auth/gmail.readonly'
  ],

  /**
   * Extension version
   * Keep in sync with manifest.json
   */
  VERSION: '1.1.0',

  /**
   * Debug mode - set to true for verbose logging
   * IMPORTANT: Set to false before publishing
   */
  DEBUG_MODE: false
};

// Freeze config to prevent accidental modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.OAUTH_SCOPES);

export { CONFIG };
