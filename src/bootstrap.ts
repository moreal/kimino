import { DEMO_ACTOR, createSocialSession } from './application/social-session';
import { ActivityPubClient } from './activitypub/client';
import { demoGateway } from './infrastructure/demo';
export const createSession = () =>
  createSocialSession(
    (options) => (options.actorUrl === DEMO_ACTOR ? demoGateway : new ActivityPubClient(options)),
    { now: () => new Date().toISOString() },
  );

import {
  readPreference,
  writePreference,
  readSaved,
  writeSaved,
  readDensity,
  writeDensity,
  readRevealWarned,
  writeRevealWarned,
} from './infrastructure/preferences';
import type { Preferences } from './presentation/ports';
export const browserPreferences: Preferences = {
  read: readPreference,
  write: writePreference,
  readSaved,
  writeSaved,
  readDensity,
  writeDensity,
  readRevealWarned,
  writeRevealWarned,
};

import {
  readSessionRecord,
  writeSessionRecord,
  clearSessionRecord,
} from './infrastructure/session-store';
import { parseStoredSession, type SessionStore } from './presentation/session-restore';
/** Tab-scoped (sessionStorage) session restore; only written after an explicit opt-in. */
export const browserSessionStore: SessionStore = {
  read: () => parseStoredSession(readSessionRecord()),
  write: writeSessionRecord,
  clear: clearSessionRecord,
};
