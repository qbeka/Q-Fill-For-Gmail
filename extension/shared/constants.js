/**
 * Values shared by the service worker and the popup.
 */

/** Read-only Gmail access. Q-Fill cannot send, change or delete mail. */
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/** A Google OAuth client ID, e.g. 1234567890-abc123.apps.googleusercontent.com */
export const CLIENT_ID_PATTERN = /^\d{6,}-[a-z0-9]{8,}\.apps\.googleusercontent\.com$/;

/** How far back to look for a code when you press Fill, in minutes. */
export const LOOKBACK_CHOICES = Object.freeze([2, 5, 10, 30]);
export const DEFAULT_LOOKBACK_MINUTES = 10;

/** How long to keep checking for a new email when none is there yet. */
export const WAIT_FOR_EMAIL_MS = 90_000;

/** Time between Gmail checks while waiting. */
export const POLL_INTERVAL_MS = 3_000;

/** Most recent messages fetched per check. */
export const MAX_MESSAGES_PER_CHECK = 8;

/** Name of the long-lived connection between the popup and the service worker. */
export const PORT_NAME = 'qfill-popup';

/** Messages the popup sends to the service worker. */
export const REQUEST = Object.freeze({
  SAVE_CLIENT_ID: 'saveClientId',
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  FIND: 'find',
  CANCEL: 'cancel',
  SET_LOOKBACK: 'setLookback',
  OPEN_SHORTCUTS: 'openShortcuts'
});

/** The one message the service worker sends back: a full state snapshot. */
export const STATE = 'state';

/** Phases of a find run, shown in the popup. */
export const PHASE = Object.freeze({
  SIGNING_IN: 'signingIn',
  CHECKING: 'checking',
  WAITING: 'waiting',
  FILLING: 'filling'
});
