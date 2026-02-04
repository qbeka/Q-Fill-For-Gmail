# Q-Fill for Gmail - Privacy Policy

**Last Updated: February 4, 2026**

## Our Commitment

Q-Fill for Gmail is built with privacy as a core principle. We do not collect, store, or transmit your personal data. All email processing happens locally on your device.

## Information We Access

Q-Fill for Gmail accesses your Gmail account with **read-only** permissions to:

- Read recent email messages to detect verification codes
- Extract numeric or alphanumeric verification codes from email content

We use the Gmail API scope `gmail.readonly`, which provides read-only access. The extension cannot send, delete, or modify your emails in any way.

## Information We Do NOT Collect

Q-Fill for Gmail does **NOT**:

- Store your emails or their contents
- Store verification codes after they are filled
- Send any data to external servers
- Track your browsing activity
- Collect analytics or usage statistics
- Use cookies or tracking technologies
- Share any information with third parties

## Local Processing

All email processing happens entirely on your local device:

- Email content is fetched directly from Gmail's API to your browser
- Verification code extraction happens in your browser's memory
- No email content is ever transmitted to our servers (we don't have any)
- Once a code is filled, it is immediately discarded from memory

## Authentication

Q-Fill uses Google's OAuth 2.0 for authentication:

- We never see or store your Google password
- Authentication is handled entirely by Google
- You can revoke access at any time via your Google Account settings
- Access tokens are stored locally by Chrome and are not accessible to us

## Chrome Storage

The extension uses Chrome's local storage API to store:

- Your authentication state (connected/disconnected)
- No other data is stored

## Permissions Explained

The extension requests the following permissions:

| Permission | Purpose |
|------------|---------|
| `identity` | Required for Google OAuth authentication |
| `storage` | Store authentication state locally |
| `activeTab` | Access the current tab to fill verification codes |
| `scripting` | Inject the code-filling script into web pages |
| `tabs` | Find tabs with verification code input fields |
| `notifications` | Show desktop notifications about code detection |

## Data Security

We implement security best practices:

- All communication with Gmail uses HTTPS encryption
- No sensitive data is logged or stored
- Content scripts use safe DOM manipulation methods
- Input sanitization prevents code injection attacks

## Children's Privacy

Q-Fill for Gmail is not directed at children under 13. We do not knowingly collect information from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. We will notify users of any material changes by updating the "Last Updated" date at the top of this policy.

## Your Rights

You have the right to:

- Disconnect the extension from your Gmail at any time
- Revoke access via your Google Account settings
- Uninstall the extension to remove all local data
- Contact us with any privacy concerns

## Contact

If you have any questions about this Privacy Policy, please contact us at:

- **Email:** privacy@qfill.org
- **Website:** [qfill.org](https://qfill.org)

---

*This privacy policy is also available at [qfill.org/privacy](https://qfill.org/privacy)*
