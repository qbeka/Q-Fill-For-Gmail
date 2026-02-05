# Q-Fill for Gmail

A privacy-focused Chrome extension that extracts verification codes from Gmail and auto-fills them into web forms.

[Website](https://qfill.org) | [Privacy Policy](https://qfill.org/privacy) | [Terms of Service](https://qfill.org/terms)

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Development](#development)
- [Contributing](#contributing)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Links](#links)

---

## About

Q-Fill connects to your Gmail account with read-only access, scans recent emails for verification codes, and fills them into form fields on the active browser tab. All processing happens locally in your browser. No data is sent to external servers.

**Website repository:** [github.com/qbeka/qfill-website](https://github.com/qbeka/qfill-website) (source code, not open source)

---

## Features

| Feature | Description |
|---------|-------------|
| Code extraction | Detects 4-8 digit verification codes from email content |
| Auto-fill | Fills codes into the active tab's form fields |
| OTP support | Handles multi-input OTP fields (e.g., 6 separate boxes) |
| Read-only access | Uses `gmail.readonly` scope; cannot modify emails |
| Local processing | No servers, no data collection, no analytics |
| Manual trigger | User initiates code check via popup button |

---

## Prerequisites

- Google Chrome version 88 or later
- A Google account with Gmail
- A Google Cloud project (free tier is sufficient)

---

## Installation

### Step 1: Clone the repository

```bash
git clone https://github.com/qbeka/qfill-extension.git
cd qfill-extension
```

### Step 2: Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** > **New Project**
3. Enter a project name (e.g., "Q-Fill") and click **Create**
4. Wait for the project to be created, then select it

### Step 3: Enable the Gmail API

1. In Google Cloud Console, go to **APIs & Services** > **Library**
2. Search for "Gmail API"
3. Click **Gmail API** > **Enable**

### Step 4: Configure the OAuth consent screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** and click **Create**
3. Fill in required fields:
   - App name: `Q-Fill`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue**
5. On the Scopes page, click **Add or Remove Scopes**
6. Find and select `https://www.googleapis.com/auth/gmail.readonly`
7. Click **Update** > **Save and Continue**
8. On Test users page, add your Gmail address
9. Click **Save and Continue** > **Back to Dashboard**

### Step 5: Get your extension ID

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the cloned `qfill-extension` folder
5. Copy the **ID** displayed under "Q-Fill for Gmail"

### Step 6: Create OAuth credentials

1. In Google Cloud Console, go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Chrome Extension** as application type
4. Enter a name (e.g., "Q-Fill Extension")
5. Paste your extension ID from Step 5
6. Click **Create**
7. Copy the **Client ID** (format: `xxxx.apps.googleusercontent.com`)

### Step 7: Configure the extension

Create the configuration files:

```bash
cp config/config.template.js config/config.js
cp manifest_template.json manifest.json
```

Edit `config/config.js` and replace the placeholder:

```javascript
OAUTH_CLIENT_ID: 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com',
```

Edit `manifest.json` and replace the placeholder in the `oauth2` section:

```json
"oauth2": {
  "client_id": "YOUR_CLIENT_ID_HERE.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/gmail.readonly"
  ]
}
```

### Step 8: Reload and connect

1. Go to `chrome://extensions`
2. Click the refresh icon on Q-Fill for Gmail
3. Click the extension icon in the toolbar
4. Click **Connect to Gmail**
5. Complete the OAuth flow in the popup window

---

## Configuration

### Configuration files

| File | Purpose | Git status |
|------|---------|------------|
| `manifest.json` | Extension manifest with OAuth client ID | Ignored |
| `manifest_template.json` | Template for manifest.json | Tracked |
| `config/config.js` | Runtime configuration | Ignored |
| `config/config.template.js` | Template for config.js | Tracked |

### Configuration options

In `config/config.js`:

```javascript
const CONFIG = {
  OAUTH_CLIENT_ID: 'your-client-id.apps.googleusercontent.com',
  OAUTH_SCOPES: ['https://www.googleapis.com/auth/gmail.readonly'],
  VERSION: '1.1.0',
  DEBUG_MODE: false  // Set to true for verbose console logging
};
```

---

## Usage

1. Navigate to a webpage with a verification code input field
2. Trigger a verification email (e.g., login, sign up)
3. Click the Q-Fill extension icon
4. Click **Check Emails Now**
5. The code is extracted and filled automatically

### How it works

1. Q-Fill queries Gmail for emails from the last 5 minutes
2. It filters for emails containing verification keywords (code, verify, OTP, etc.)
3. It extracts numeric codes matching 4-8 digit patterns
4. It identifies the appropriate input field on the active tab
5. It fills the code and triggers input events for form validation

### Supported input types

- Standard text/number inputs
- Password inputs used for codes
- OTP-style multi-digit inputs (6 separate boxes)
- Contenteditable elements

---

## Project Structure

```
qfill-extension/
├── background.js              # Service worker: Gmail API, message handling
├── content.js                 # Content script: DOM scanning, form filling
├── popup.html                 # Extension popup markup
├── popup.js                   # Popup logic: auth state, user actions
├── manifest.json              # Chrome extension manifest (git-ignored)
├── manifest_template.json     # Manifest template (tracked)
├── config/
│   ├── config.js              # OAuth configuration (git-ignored)
│   └── config.template.js     # Config template (tracked)
├── services/
│   ├── gmail-api.js           # Gmail API client wrapper
│   └── storage-manager.js     # Chrome storage abstraction
├── utils/
│   ├── constants.js           # Shared constants and patterns
│   └── tab-messenger.js       # Tab communication utilities
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── website/                   # Website source (separate repository)
├── test-form.html             # Local testing page
├── privacy-policy.md          # Privacy policy (Markdown)
├── CHANGELOG.md               # Version history
└── README.md
```

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   popup.js      │────>│  background.js   │────>│  Gmail API      │
│   (User action) │     │  (Service worker)│     │  (Google)       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               v
                        ┌──────────────────┐
                        │   content.js     │
                        │   (DOM filling)  │
                        └──────────────────┘
```

---

## Development

### Local setup

1. Clone the repository
2. Complete the [Installation](#installation) steps
3. Make changes to source files
4. Reload the extension at `chrome://extensions`

### Testing

Open `test-form.html` in Chrome to test form filling without a real verification flow.

```bash
open test-form.html
# or
google-chrome test-form.html
```

### Debug mode

Enable verbose logging:

```javascript
// config/config.js
DEBUG_MODE: true
```

Then open Chrome DevTools:
- Background script: `chrome://extensions` > Q-Fill > "Inspect views: service worker"
- Content script: F12 on any webpage > Console

### Code style

- ES modules for service worker imports
- Vanilla JavaScript (no frameworks)
- JSDoc comments for public functions
- Consistent 2-space indentation

---

## Contributing

Contributions are welcome. Please follow these guidelines.

### Getting started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/qfill-extension.git
   ```
3. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. Make your changes
5. Test locally by loading the extension unpacked
6. Commit with a clear message:
   ```bash
   git commit -m "Add: description of feature"
   ```
7. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
8. Open a pull request against `main`

### Commit message format

```
Type: Short description

Longer description if needed.
```

Types: `Add`, `Fix`, `Update`, `Remove`, `Refactor`, `Docs`

### Pull request checklist

- [ ] Code follows existing style
- [ ] Changes tested locally
- [ ] No `config.js` or `manifest.json` committed
- [ ] Documentation updated if needed
- [ ] No console errors or warnings

### Issues

- Search existing issues before creating a new one
- Use a clear, descriptive title
- Include steps to reproduce for bugs
- Include Chrome version and OS

---

## Security

### Permissions

| Permission | Reason |
|------------|--------|
| `identity` | OAuth authentication with Google |
| `storage` | Persist connection state locally |
| `activeTab` | Access the current tab to fill codes |
| `scripting` | Inject content script for DOM access |
| `tabs` | Query which tab is active |
| `notifications` | Show success/error notifications |

### Host permissions

| Host | Reason |
|------|--------|
| `googleapis.com` | Gmail API requests |
| `accounts.google.com` | OAuth flow |
| `*://*/*` | Fill codes on any website |

### Data handling

- Gmail data is fetched directly from Google to your browser
- No email content is stored or logged
- Extracted codes are held in memory only until filled
- No data is transmitted to external servers
- No analytics, tracking, or telemetry

### Reporting vulnerabilities

If you discover a security issue, please open a GitHub issue with the label "security".

---

## Troubleshooting

### Authentication fails

**Symptom:** "Bad client id" or OAuth error

**Solutions:**
1. Verify the Client ID is identical in both `config/config.js` and `manifest.json`
2. Ensure the extension ID in Google Cloud matches your loaded extension
3. Confirm Gmail API is enabled in your Google Cloud project
4. Check that your email is added as a test user in OAuth consent screen

### No code found

**Symptom:** Extension says no verification code found

**Solutions:**
1. Email must have arrived within the last 5 minutes
2. Email subject or body must contain keywords: code, verify, verification, OTP, etc.
3. Code must be 4-8 digits
4. Check spam folder; Q-Fill only reads inbox

### Code not filling

**Symptom:** Code found but not inserted into field

**Solutions:**
1. Ensure the verification page is the active tab
2. Refresh the page before clicking "Check Emails Now"
3. Click inside the input field first
4. Check browser console (F12) for errors

### Extension not loading

**Symptom:** Extension fails to load or shows errors

**Solutions:**
1. Verify `manifest.json` exists (copy from `manifest_template.json`)
2. Check JSON syntax in `manifest.json` and `config/config.js`
3. Ensure all required files are present
4. Check `chrome://extensions` for error messages

---

## License

Copyright 2026 Qendrim Beka. All rights reserved.

This software is proprietary. Unauthorized copying, modification, distribution, or use is prohibited without explicit permission from the author.

---

## Links

| Resource | URL |
|----------|-----|
| Website | [qfill.org](https://qfill.org) |
| Privacy Policy | [qfill.org/privacy](https://qfill.org/privacy) |
| Terms of Service | [qfill.org/terms](https://qfill.org/terms) |
| Website Repository | [github.com/qbeka/qfill-website](https://github.com/qbeka/qfill-website) |
| Author | [github.com/qbeka](https://github.com/qbeka) |
| LinkedIn | [linkedin.com/in/qendrimbeka](https://linkedin.com/in/qendrimbeka) |

---

## Contact

For questions, bugs, or feature requests, [open an issue on GitHub](https://github.com/qbeka/qfill-extension/issues).

Author: Qendrim Beka
- [github.com/qbeka](https://github.com/qbeka)
- [linkedin.com/in/qendrimbeka](https://linkedin.com/in/qendrimbeka)
