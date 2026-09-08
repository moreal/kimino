import { createSocialSession } from './application/social-session';
import { ActivityPubClient } from './activitypub/client';
import { demoGateway } from './infrastructure/demo';
export const createSession = () =>
  createSocialSession((options) =>
    options.actorUrl === 'demo' ? demoGateway : new ActivityPubClient(options),
  );

import { readPreference, writePreference, readSaved } from './infrastructure/preferences';
import type { Preferences } from './presentation/ports';
export const browserPreferences: Preferences = {
  read: readPreference,
  write: writePreference,
  saved: readSaved,
};
