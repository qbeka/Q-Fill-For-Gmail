# Changelog

All notable changes to Q-Fill are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-11-07

A rewrite. The extension now lives in `extension/` and loads from a fresh clone with no files to copy or edit.

### Upgrading from 1.x

- Load the **`extension`** folder at `chrome://extensions` instead of the repository root. The extension ID changes.
- Create a new OAuth client of type **Web application** with the redirect URI the setup screen shows, and paste its client ID into the popup. The old "Chrome extension" client no longer works. See [docs/setup.md](docs/setup.md).
- `manifest.json` is tracked again, and `config/config.js` is gone. Delete your local copies of both.

### Added

- First-run setup screen that shows your redirect URI and takes the client ID, so you no longer edit `manifest.json`.
- Waits up to 90 seconds for the verification email when it has not arrived yet, and fills it the moment it lands, even if you close the popup.
- Keyboard shortcut <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> fills without opening the popup.
- The code is shown in the popup with a **Copy** button, for pages Q-Fill cannot fill.
- Fills fields inside open shadow roots and same-origin iframes, and transparent inputs laid over split boxes.
- Reads codes in common wording for Spanish, Portuguese, French, German, Italian, Polish, Russian, Japanese, Chinese and Korean emails, plus dashed letter codes such as `XKD-PTQ`.
- Settings for the look-back window (2, 5, 10 or 30 minutes), the shortcut, the client ID and disconnecting.
- Dark mode.
- 98 unit tests, 31 end-to-end tests in Chromium (13 that load the real extension and 18 for which fields autofill must and must not touch), a playground of form types, CI, and a reproducible ZIP packager.

### Changed

- Sign-in uses `chrome.identity.launchWebAuthFlow`, so any Google account works and the extension no longer depends on Chrome's own sign-in.
- Picks the **newest** email with a code. 1.x scanned 7 days of mail, including trash, and filled the highest-scoring code, which could be an old one.
- Searches only the look-back window (10 minutes by default) and never fills the same email twice in a session. A dropped connection or a busy Gmail no longer ends the wait, and a message that fails to load is retried before an older code is used.
- Code extraction was rewritten around scoring each token by its context. On the 71 test emails in `test/fixtures/emails.js`, 2.0 gets 71 right and 1.x got 44 right. 1.x filled years, follower counts and support ticket numbers from emails with no code.
- Field detection matches whole words, so "shipping" no longer counts as "pin" and "author" no longer counts as "auth". Promo, coupon, gift card, referral, ZIP, country code, search, card and CVV fields are never filled, and a password field only when it is marked as a one-time code.
- Each fill is verified by reading the value back. Q-Fill reports success only when the page holds the code.
- The popup was redesigned and bundles its fonts, so it no longer loads Google Fonts.
- Released under the MIT license. 1.x was "all rights reserved".

### Removed

- The content script that ran on every website, and the `<all_urls>`, `tabs` and `notifications` permissions. Q-Fill now touches a page only after you click it or press its shortcut.
- Partially translated locales. The interface is English until full translations are contributed.

### Fixed

- The extension failed to load its content script on every page, because Chrome does not support `"type": "module"` for manifest content scripts.
- A fresh clone did not load, because `manifest.json` and `config/config.js` were git-ignored but required.
- Codes split by zero-width characters, HTML entities or non-UTF-8 character sets were missed.
- Token revocation used Google's deprecated endpoint.

## [1.2.0] - 2026-05-19

- Split the code into modules and documented each permission.
- Added partial translations.

## [1.1.0] - 2026-02-04

- Rewrote code extraction and input detection with scoring.

## [1.0.0] - 2026-02-04

- Renamed from Gmail Code Autofill to Q-Fill for Gmail.
- Moved the OAuth client ID out of the source code.
- Replaced `innerHTML` with safe DOM methods in the content script.

[2.0.0]: https://github.com/qbeka/Q-Fill-For-Gmail/compare/fd6e7aa...v2.0.0
[1.2.0]: https://github.com/qbeka/Q-Fill-For-Gmail/commit/63e2edd
[1.1.0]: https://github.com/qbeka/Q-Fill-For-Gmail/commit/401f8a7
[1.0.0]: https://github.com/qbeka/Q-Fill-For-Gmail/commit/e5ad541
