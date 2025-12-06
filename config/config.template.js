/**
 * Configuration Template
 *
 * SETUP INSTRUCTIONS:
 * 1. Copy this file to config.js: cp config.template.js config.js
 * 2. Replace YOUR_CLIENT_ID_HERE with your actual Google OAuth Client ID
 * 3. Never commit config.js to version control
 */

const CONFIG = {
  // OAuth Configuration
  CLIENT_ID: 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com',
  SCOPES: ['https://www.googleapis.com/auth/gmail.readonly'],

  // Extension Settings
  EXTENSION_NAME: 'Gmail Code Autofill',
  VERSION: '1.0.0',

  // Feature Flags
  DEBUG_MODE: false,
  ENABLE_NOTIFICATIONS: true,

  // Environment
  ENVIRONMENT: 'production' // 'development' or 'production'
};

export { CONFIG };
