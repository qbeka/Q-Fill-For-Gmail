# Manifest reference (`manifest_template.json`)

Copy `manifest_template.json` to `manifest.json` after setup. Every permission is required for the features below.

## Permissions

| Permission | Why it is needed |
|------------|------------------|
| `identity` | Google OAuth sign-in via `chrome.identity.getAuthToken` (Gmail read-only). |
| `storage` | Remember whether you are connected to Gmail (`isAuthenticated`). |
| `activeTab` | Access the tab you are on when filling a code (no broad background browsing). |
| `scripting` | Inject the content script on the form tab if it was not loaded yet. |
| `tabs` | Resolve the target tab when you click **Check Emails** from the popup. |
| `notifications` | Optional desktop alerts when no code or no emails are found. |

## Host permissions

| Host | Why it is needed |
|------|------------------|
| `https://www.googleapis.com/*` | Gmail REST API (`gmail.googleapis.com` is also listed). |
| `https://gmail.googleapis.com/*` | Fetch message list and bodies. |
| `https://accounts.google.com/*` | OAuth token revocation on disconnect. |
| `*://*/*` | Run the content script on any site where you enter a verification code. |

## OAuth2

- **Scope:** `https://www.googleapis.com/auth/gmail.readonly` only (cannot send or delete mail).
- **Chrome:** Create an OAuth client of type **Chrome extension** and paste your unpacked extension ID.
- **Microsoft Edge:** Load the same unpacked folder at `edge://extensions`, copy the **Edge** extension ID, and add a **second** Chrome-extension OAuth client in Google Cloud with that ID (or publish via Edge Add-ons and use the store ID).

## Browser support

- **Google Chrome** 88+ (Chromium Manifest V3).
- **Microsoft Edge** 88+ (same MV3 package; `browser_specific_settings.edge` is set in the template).

## Internationalization

- `default_locale` is `en`.
- UI strings live in `_locales/<lang>/messages.json`.
- Replace `YOUR_OAUTH_CLIENT_ID_HERE` in the template before loading the extension.
