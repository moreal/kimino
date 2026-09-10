import type { Actor } from '../domain/social';
import type { ActorProfile } from './note-display';

/** The part of the feed state the connection indicators read. */
export interface ConnectionState {
  readonly actor?: Pick<Actor, 'id'>;
  readonly demo: boolean;
}

/**
 * The connection dot is lit only for a real, loaded account: the landing page, the
 * preview's sample account and a remembered tab still reconnecting (its account line says
 * 연결 중… and the actor is not in yet) all stay grey.
 */
export const connectionLit = (state: ConnectionState): boolean => !!state.actor && !state.demo;

/** The class of the dot, in the sidebar and in the right column's account line. */
export const connectionDotClass = (state: ConnectionState): string =>
  connectionLit(state) ? 'connection-dot' : 'connection-dot connection-dot--pending';

/**
 * The open author sheet is about the connected account itself: only then does it carry
 * the disconnect control, since that is where a real account leaves.
 */
export const actorSheetIsSelf = (state: {
  readonly actor?: Pick<Actor, 'id'>;
  readonly actorSheet?: Pick<ActorProfile, 'id'>;
}): boolean => !!state.actorSheet && !!state.actor && state.actorSheet.id === state.actor.id;

/** The one letter an avatar shows for a name: its first character, upper-cased. */
export const avatarInitial = (name: string): string => {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '';
};
