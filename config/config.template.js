/**
 * Configuration template — copy to config.js (never commit config.js).
 *
 * Chrome: Google Cloud → Credentials → OAuth client ID → Chrome extension
 * Edge:   Load unpacked at edge://extensions, copy that extension ID,
 *         create a second Chrome-extension OAuth client with the Edge ID.
 *
 * @see docs/MANIFEST.md
 */

const CONFIG = {
  OAUTH_CLIENT_ID: 'YOUR_OAUTH_CLIENT_ID_HERE.apps.googleusercontent.com',

  OAUTH_SCOPES: [
    'https://www.googleapis.com/auth/gmail.readonly'
  ],

  VERSION: '1.2.0',

  DEBUG_MODE: false
};

Object.freeze(CONFIG);
Object.freeze(CONFIG.OAUTH_SCOPES);

export { CONFIG };
