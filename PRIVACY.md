# Privacy policy

Last updated: November 7, 2026. Applies to Q-Fill for Gmail 2.0.0 and later.

Q-Fill is a browser extension that reads your recent Gmail messages to find a verification code and types it into the page you are on. It has no server. Nothing it reads is sent anywhere except between your browser and Google.

## What Q-Fill reads

- **Your recent Gmail messages**, only when you press **Fill code** or the shortcut, and only messages received within your look-back window (10 minutes by default). It reads the subject, sender and body to find a code.
- **Your Gmail address**, once, when you connect, so the popup can show which account is connected.
- **The page you are on**, only after you click Q-Fill's icon or press its shortcut, and only to find the code field and type into it.

Q-Fill uses Google's `gmail.readonly` scope. It cannot send, change, label or delete mail.

## What Q-Fill stores

| Data | Where | How long |
| --- | --- | --- |
| Your OAuth client ID | Browser local storage | Until you change it or remove the extension |
| Your look-back setting | Browser local storage | Until you change it or remove the extension |
| Your Gmail address | Browser local storage | Until you disconnect |
| Google access token | Browser session storage (memory only) | Until it expires, you disconnect, or the browser closes |
| The last code found, its sender and subject | Browser session storage (memory only) | Until the next run, you disconnect, or the browser closes |
| IDs of emails whose code was filled | Browser session storage (memory only) | Until you disconnect or the browser closes |

Email bodies are never stored. They are held in memory only while a message is being scanned.

## What Q-Fill does not do

- It does not send your email, codes or browsing to the author or to anyone else. There is no server.
- It has no analytics, tracking, advertising or telemetry.
- It does not run on any page until you ask it to. There is no content script on every site.
- It does not load remote code. Everything it runs ships inside the extension.

## Google sign-in

You sign in through Google's own window with an OAuth client that you create and own. Q-Fill never sees your Google password. Google's token is kept in memory only and is revoked at Google when you disconnect.

Q-Fill's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Your controls

- **Disconnect:** Settings, then Disconnect Gmail. This revokes the token and clears session data.
- **Revoke at Google:** [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **Remove everything:** remove the extension at `chrome://extensions`.

## Changes

Changes to this policy are made in this file, and its history is public in the repository.

## Contact

Questions about privacy: [open an issue](https://github.com/qbeka/Q-Fill-For-Gmail/issues). For anything sensitive, use a [private security advisory](https://github.com/qbeka/Q-Fill-For-Gmail/security/advisories/new) instead.
