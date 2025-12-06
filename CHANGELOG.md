# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2025-12-06

### 🔒 Security

- **Fixed XSS vulnerability** in content script - removed unsafe `innerHTML` usage
- **Moved OAuth Client ID** to separate config file (not tracked in git)
- **Added config.js to .gitignore** to prevent sensitive data from being committed

### ✨ Improvements

- **Created manifest.json** from template with proper configuration
- **Reduced code duplication** - Consolidated tab messaging logic (~200 lines removed)
  - Created `utils/tab-messenger.js` utility
  - Unified `sendCodeToTabs()` and `sendNoCodeFoundToTabs()`
  - Removed redundant helper methods
- **Centralized constants** - Created `utils/constants.js` for magic numbers and strings
- **Better configuration management** - New config system with template file
  - `config/config.template.js` - Template for setup
  - `config/config.js` - Actual config (gitignored)
- **Improved error handling** - More consistent error handling throughout codebase
- **Performance optimization** - More efficient tab message broadcasting

### 📚 Documentation

- **Updated README.md** with comprehensive setup instructions
- **Added project structure** documentation
- **Added testing guidelines** for different code formats
- **Created CHANGELOG.md** to track changes

### 🏗️ Code Quality

- Fixed magic numbers throughout codebase
- Added JSDoc-style comments to new utilities
- Improved code organization and modularity
- Better separation of concerns

### 📁 File Structure Changes

```
New files:
├── config/config.js (gitignored)
├── config/config.template.js
├── utils/constants.js
├── utils/tab-messenger.js
├── manifest.json
└── CHANGELOG.md

Modified files:
├── background.js (reduced from 847 to ~680 lines)
├── content.js (XSS fix)
├── .gitignore (added config.js, .env files)
└── README.md (comprehensive update)
```

## [1.0.0] - 2025-12-05

### Initial Release

- Gmail API integration with read-only OAuth
- Automatic verification code extraction from emails
- Auto-fill codes into web forms
- Manual email check via popup
- Support for 4-8 digit codes (numeric and alphanumeric)
- Visual feedback and animations
- Local-only processing (no external servers)
