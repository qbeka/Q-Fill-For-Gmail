# Gmail Code Autofill Extension

🇬🇧 English | [🇯🇵 日本語](README_JP.md)

A Chrome extension that automatically reads verification codes from your Gmail inbox and fills them into website forms. Uses the Gmail API with read-only OAuth, processes everything locally, and never stores or transmits data.

---

## Features

- 🔐 Automatically extracts 4-8 digit codes from recent Gmail messages
- ⚡ Autofills code fields on any active tab instantly
- 🖱️ Manual check via popup interface
- 🔒 Local-only processing (no servers or external storage)
- 🛡️ Uses Gmail API with read-only OAuth permissions
- 🎨 Beautiful, modern UI with visual feedback

---

## Security & Privacy

- ✅ Gmail is accessed via OAuth using the `gmail.readonly` scope
- ✅ The extension never stores, sends, or logs your emails or codes
- ✅ Code extraction and form autofill happen entirely on your local machine
- ✅ No external services or telemetry
- ✅ Client ID is stored locally and not committed to version control

This extension is **not** a data collection tool. It simply automates a common task, with user privacy as a priority.

---

## Setup & Installation

### Prerequisites

1. **Google Cloud Project** - You'll need to create a Google Cloud project and get OAuth credentials
2. **Chrome Browser** - This extension works with Google Chrome (v88+)

### Step 1: Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Gmail API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Chrome Extension" as application type
   - Add your extension ID (you'll get this after loading the extension)
   - Copy the **Client ID**

### Step 2: Extension Setup

1. **Clone or download this repository**:
   ```bash
   git clone https://github.com/qbeka/Code_Autofill_Extension_KANA.git
   cd Code_Autofill_Extension_KANA
   ```

2. **Configure the extension**:
   ```bash
   # Create config.js from template
   cp config/config.template.js config/config.js
   ```

3. **Edit `config/config.js`** and replace `YOUR_CLIENT_ID_HERE` with your actual Google OAuth Client ID:
   ```javascript
   const CONFIG = {
     CLIENT_ID: 'your-actual-client-id.apps.googleusercontent.com',
     // ... rest of config
   };
   ```

4. **Update `manifest.json`** with your Client ID:
   - Open `manifest.json`
   - Find the `oauth2.client_id` field
   - Replace with your Client ID

### Step 3: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the extension directory
5. Copy the **Extension ID** shown
6. Go back to Google Cloud Console > Credentials
7. Edit your OAuth client and add the Extension ID

### Step 4: Test the Extension

1. Click the extension icon in Chrome
2. Click "Connect to Gmail"
3. Authorize the extension
4. Open `test-form.html` in a new tab
5. Send a test email to your Gmail:
   ```
   Subject: Test Verification Code
   Body: Your verification code is: 123456
   ```
6. Click "Check Emails Now" in the extension popup
7. The code should automatically fill in the test form!

---

## Development

### Project Structure

```
Code_Autofill_Extension_KANA/
├── background.js          # Service worker (main logic)
├── content.js            # Content script (form filling)
├── popup.html/js         # Extension popup UI
├── manifest.json         # Extension manifest
├── config/
│   ├── config.js         # Your configuration (gitignored)
│   └── config.template.js # Configuration template
├── utils/
│   ├── constants.js      # Application constants
│   └── tab-messenger.js  # Tab messaging utility
├── services/
│   ├── gmail-api.js      # Gmail API wrapper
│   └── storage-manager.js # Storage utilities
└── icons/                # Extension icons
```

### Key Improvements (v1.0.1)

- ✅ Fixed XSS vulnerability in content script
- ✅ Moved sensitive config to separate file
- ✅ Reduced code duplication (~200 lines removed)
- ✅ Centralized constants and magic numbers
- ✅ Improved tab messaging performance
- ✅ Better error handling

---

## Testing

**Manual Testing:**
- Open `test-form.html` in a browser tab
- Send a test email with a verification code
- Click "Check Emails Now" in the popup
- Verify the code is auto-filled

**Testing Different Code Formats:**
- 4-digit: `1234`
- 6-digit: `123456`
- 8-digit: `12345678`
- Alphanumeric: `ABC123`

---

## Download from Chrome Web Store

To install the stable release directly from the Chrome Web Store:  
👉 [**Download Auto Code Filler**](https://chrome.google.com/webstore/detail/auto-code-filler/your-extension-id-here)

(will replace placeholder link once it goes live)

---

## License

**All rights reserved.**  
You may not copy, distribute, modify, or reuse this code without written permission from the author.

---

## Contact

Built by Qendrim Beka  
[LinkedIn](https://www.linkedin.com/in/qendrimbeka)
[Personal Website](https://www.qendrimbeka.com)



