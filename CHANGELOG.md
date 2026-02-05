# Changelog

All notable changes to Q-Fill for Gmail will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-04

### Improved
- **Rewrote code extraction engine** - Multi-pattern scoring system with 6 detection strategies
  - Explicit patterns (verification code is X) - highest confidence
  - Spaced/dashed codes (123 456, 123-456)
  - Context-aware search near verification keywords
  - Highlighted codes in quotes, bold, brackets
  - Subject line codes
  - Fallback patterns for common 6-digit codes
- **Rewrote input detection engine** - Advanced scoring system for finding the correct field
  - autocomplete="one-time-code" detection (+200 score)
  - Strong/medium keyword matching in attributes and context
  - maxLength analysis (1 for OTP digits, 4-8 for codes)
  - inputmode and pattern attribute detection
  - Focus state, viewport position, modal context
  - Negative signal penalties (search, email, username fields)
- **Only checks most recent email** - Faster and more accurate
- **Single input fill only** - Fills exactly one input (the best match) to prevent errors
- **Better OTP group detection** - Validates inputs are visually aligned in a row

### Fixed
- Fixed issue where code could fill into wrong input fields
- Fixed issue where multiple inputs could be filled simultaneously
- Improved React/Angular/Vue compatibility with proper event dispatching

### Changed
- Simplified Gmail API call to fetch only 1 message
- Reduced API request size and response time
- Updated version to 1.1.0 across all files

---

## [1.0.0] - 2026-02-04

### Branding
- **Renamed extension** from "Gmail Code Autofill" to "Q-Fill for Gmail"
- **Created website** at qfill.org with landing page, privacy policy, and terms of service
- Updated all references throughout codebase

### Security Improvements
- **Fixed XSS vulnerability** in content.js by removing unsafe `innerHTML` usage
  - Replaced `innerHTML` with `textContent` for user-facing content
  - Added input sanitization for verification codes
  - Toast notifications now use safe DOM methods
- **Moved OAuth Client ID** to separate config file (`config/config.js`)
  - Credentials are no longer hardcoded in source files
  - Added `config.js` to `.gitignore` to prevent accidental commits
- **Added Content Security Policy** in manifest for extension pages

### Code Quality
- **Reduced code duplication** (~200 lines removed)
  - Consolidated `sendCodeToTabs()` and `sendNoCodeFoundToTabs()` into unified module
  - Created shared utilities for tab messaging
- **Created `utils/tab-messenger.js`** for unified tab messaging
  - Single `processTab()` function handles all tab communication
  - Automatic content script injection when needed
  - Consistent error handling across all tab operations
- **Centralized constants** in `utils/constants.js`
  - All magic numbers replaced with named constants
  - Message actions, status codes, and patterns in one place
  - Easier maintenance and updates
- **Improved code organization**
  - Clear separation between modules
  - Better JSDoc documentation
  - Consistent coding style

### Configuration
- **Added config system** with template file
  - `config/config.template.js` with setup instructions
  - Users copy template and add their OAuth credentials
  - Sensitive data separated from codebase
- **Updated `.gitignore`** to exclude sensitive files
  - `config/config.js` (contains OAuth Client ID)
  - `manifest.json` (contains OAuth Client ID)
  - Better organization with clear sections

### Documentation
- **Updated README.md** with comprehensive setup instructions
  - Step-by-step Google Cloud Console setup
  - Clear explanation of OAuth configuration
  - New project structure documentation
  - Testing guidelines
- **Added CHANGELOG.md** to track changes
- **Documented new project structure**
- **Created website** with privacy and terms pages

### Files Changed
- **Modified:**
  - `background.js` - Refactored to use new modules and config
  - `content.js` - Fixed XSS vulnerability, improved code organization
  - `.gitignore` - Added sensitive files, better organization
  - `README.md` - Comprehensive documentation
  - `popup.html` - Updated branding to Q-Fill
  - `manifest.json` - Updated name and title
  - `manifest_template.json` - Updated name and title

- **Added:**
  - `CHANGELOG.md` - This file
  - `config/config.template.js` - OAuth configuration template
  - `utils/constants.js` - Centralized constants
  - `utils/tab-messenger.js` - Unified tab messaging
  - `website/index.html` - Landing page
  - `website/privacy.html` - Privacy policy
  - `website/terms.html` - Terms of service

### Breaking Changes
- **Requires manual setup of `config/config.js`** from template
  - Copy `config/config.template.js` to `config/config.js`
  - Add your OAuth Client ID
- **OAuth Client ID must be configured** before use
  - Extension will not work without proper configuration
- **Updated manifest.json handling**
  - Copy `manifest_template.json` to `manifest.json`
  - Add your OAuth Client ID in the `oauth2` section

### Permissions Explained
The extension requires these permissions (all necessary for core functionality):

| Permission | Purpose |
|------------|---------|
| `identity` | OAuth authentication with Google |
| `storage` | Store authentication state locally |
| `activeTab` | Access current tab for code filling |
| `scripting` | Inject content script when needed |
| `tabs` | Query tabs to find form fields |
| `notifications` | Show desktop notifications |

### Host Permissions Explained
| Host | Purpose |
|------|---------|
| `googleapis.com` | Gmail API access |
| `gmail.googleapis.com` | Gmail message retrieval |
| `accounts.google.com` | OAuth token revocation |
| `*://*/*` | Fill codes on any website |

---

## [0.9.0] - Initial Development

### Added
- Initial extension implementation
- Gmail OAuth authentication
- Verification code extraction from emails
- Automatic form filling
- Popup UI with connection status
- Visual feedback for code detection

---

## Notes for Contributors

When making changes, please:
1. Update this CHANGELOG under the "Unreleased" section
2. Follow the existing format
3. Include the issue/PR number if applicable
4. Categorize changes appropriately (Added, Changed, Deprecated, Removed, Fixed, Security)
