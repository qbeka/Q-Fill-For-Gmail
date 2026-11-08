# Contributing to Q-Fill

Thanks for helping. Bug reports, missed codes, small fixes and new features are all welcome.

## Report a missed code

The most useful report is an email Q-Fill got wrong. Use the [missed code template](https://github.com/qbeka/Q-Fill-For-Gmail/issues/new?template=missed_code.yml) and paste the subject and the few lines around the code. Replace the real code and anything personal with made-up values of the same shape, for example `482913` for a six-digit code.

## Set up

You need Node.js 20 or later.

```bash
git clone https://github.com/qbeka/Q-Fill-For-Gmail.git
cd Q-Fill-For-Gmail
npm install
npx playwright install chromium
```

Load the `extension/` folder at `chrome://extensions` with **Load unpacked**, and follow [docs/setup.md](docs/setup.md) to connect your own OAuth client. After you change a file, click the reload icon on Q-Fill's card.

## Before you open a pull request

```bash
npm run check
npm run test:e2e
```

`npm run check` runs ESLint, the unit tests and the static checks on `extension/`. CI runs the same commands plus the end-to-end tests.

If you change how codes are found, add a fixture to [test/fixtures/emails.js](test/fixtures/emails.js) that fails before your change and passes after it. Add a negative fixture too if your change could make Q-Fill fill something it should not. If you change how fields are chosen or filled, add or extend a page in [playground/](playground/) and a test in [test/e2e/](test/e2e/).

## Guidelines

- **Keep the extension dependency-free.** `extension/` ships as it is, with no build step and no runtime packages.
- **Ask for no new permissions** unless there is no other way, and explain why in the pull request. Q-Fill's promise is that it touches nothing until you ask.
- **Keep logic testable.** Code with no browser APIs goes in `extension/core/` and gets unit tests.
- **Put every user-facing string in** `extension/_locales/en/messages.json` and read it with `t()`.
- **Never log email content or codes.**

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) with a scope, and describe the behaviour, not the edit:

```
fix(extract): a phone number after the code no longer wins over the code
feat(autofill): fill split boxes inside an open shadow root
docs(setup): explain the redirect_uri_mismatch error
```

Common types are `feat`, `fix`, `docs`, `test`, `refactor`, `build`, `ci` and `chore`.

## Translations

The interface is English only for now. To add a language, copy `extension/_locales/en/messages.json` to `extension/_locales/<code>/messages.json` (for example `de` or `pt_BR`), translate the `message` values, leave the keys and placeholders as they are, and open a pull request.

## Releases

1. Update the version in `extension/manifest.json` and `package.json`.
2. Add a section to [CHANGELOG.md](CHANGELOG.md).
3. Run `npm run package` and attach `dist/q-fill-<version>.zip` to a GitHub release.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind.
