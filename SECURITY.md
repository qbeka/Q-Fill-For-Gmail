# Security policy

Q-Fill reads your email, so security reports matter a lot here.

## Report a vulnerability

Please **do not open a public issue**. Report it privately through [GitHub's private vulnerability reporting](https://github.com/qbeka/Q-Fill-For-Gmail/security/advisories/new).

Include what an attacker could do, the steps to reproduce it, and the browser and Q-Fill version you used. You should get a first reply within a week. Once a fix ships, you will be credited in the release notes unless you prefer not to be.

## Supported versions

Only the latest release gets security fixes.

| Version | Supported |
| --- | --- |
| 2.x | Yes |
| 1.x | No |

## What is in scope

- Anything that lets a web page read data Q-Fill handles: codes, email content, tokens or your Gmail address.
- Anything that makes Q-Fill type a code into a page or frame other than the one you asked it to fill.
- Anything that sends data to a host other than Google's APIs.
- Token handling, storage and revocation.

Problems in Google's sign-in, in Gmail or in the browser itself are out of scope. Please report those to Google or the browser vendor.

## Design notes for reviewers

- The extension has no access to any site until you click its icon or press its shortcut (`activeTab`). There is no content script on every page and no `<all_urls>` permission.
- The autofill script runs in the extension's isolated world, and its in-page message uses a closed shadow root.
- Tokens live in `chrome.storage.session`, which content scripts cannot read and the browser clears on exit.
- The popup and service worker run under a Content Security Policy of `script-src 'self'`, and no remote code is loaded.
