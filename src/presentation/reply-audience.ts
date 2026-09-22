import type { ComposeVisibility, TimelineNote } from '../domain/social';
import { replyParticipants } from '../domain/note-content';
import { actorLabelOf } from './actor-name';
import { replyAudienceCopy, visibilityCopy } from './copy-content';

export interface ReplyAudience {
  available: boolean;
  recipients: readonly { id: string; label: string }[];
}

/** The same canonical recipient set the gateway addresses; no profile requests or guesses. */
export function replyAudience(
  parent: Pick<TimelineNote, 'author' | 'mentions'>,
  self?: string,
): ReplyAudience {
  if (!self) return { available: false, recipients: [] };
  try {
    return {
      available: true,
      recipients: replyParticipants(parent, self).map((id) => ({ id, label: actorLabelOf(id) })),
    };
  } catch {
    // An unsafe participant would also fail outgoing addressing. Never render a partial list.
    return { available: false, recipients: [] };
  }
}

/** Composer-specific wording; note badges and edit audience descriptions remain separate. */
export function composerAudienceDescription(
  visibility: ComposeVisibility,
  audience?: ReplyAudience,
): string {
  if (!audience) return visibilityCopy[visibility].description;
  if (!audience.available) return replyAudienceCopy.unavailable;
  if (audience.recipients.length === 0) {
    if (visibility === 'direct') return replyAudienceCopy.empty;
    if (visibility === 'followers') return replyAudienceCopy.followersWithoutParticipants;
  }
  return replyAudienceCopy.descriptions[visibility];
}
