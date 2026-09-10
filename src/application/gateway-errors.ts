import { AddressingError } from '../domain/note-content';

/**
 * Gateway errors carry a type and a code, never user-facing words: `message` is a
 * developer detail that presentation may show behind a disclosure.
 */
/** The server answered with an error status. */
export class GatewayHttpError extends Error {
  constructor(
    readonly status: number,
    message = `The server answered with HTTP ${status}.`,
  ) {
    super(message);
    this.name = 'GatewayHttpError';
  }
}
/**
 * Thrown by a gateway when the server refused a write outright. `code` is the HTTP status;
 * the application only branches on the error type.
 */
export class GatewayRejected extends GatewayHttpError {
  constructor(
    readonly code: number,
    message = `The server rejected the request (${code}).`,
  ) {
    super(code, message);
    this.name = 'GatewayRejected';
  }
}
/**
 * The server no longer holds the object a write was aimed at: an authenticated read of it
 * answered 404 or 410, or came back as a Tombstone. Thrown before the write is sent, so a
 * card that outlived its object cannot bring it back.
 */
export class GatewayGone extends Error {
  constructor(message = 'The server no longer holds this object.') {
    super(message);
    this.name = 'GatewayGone';
  }
}
/** No usable answer at all: offline, DNS, blocked by CORS or TLS, or timed out. */
export class GatewayUnreachable extends Error {
  constructor(message = 'The server could not be reached.') {
    super(message);
    this.name = 'GatewayUnreachable';
  }
}
/** What the read-only sample gateway was asked to do. */
export type ReadOnlyAction = 'publish' | 'react' | 'manage';
/**
 * Thrown by the sample gateway: nothing it shows can be written to, reacted on, edited or
 * deleted, because none of it lives on a server. Presentation says so in its own words.
 */
export class GatewayReadOnly extends Error {
  constructor(readonly action: ReadOnlyAction) {
    super(`The sample gateway is read-only; it cannot ${action}.`);
    this.name = 'GatewayReadOnly';
  }
}
export type ProtocolProblem =
  /** The server may have accepted a write but did not confirm it the ActivityPub way. */
  | 'unconfirmed-write'
  /** A response that does not follow ActivityPub (shape, IDs, pagination). */
  | 'unexpected-response';
/** The server answered, but not in a way ActivityPub allows. */
export class GatewayProtocolError extends Error {
  constructor(
    readonly reason: ProtocolProblem,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayProtocolError';
  }
}

/**
 * The write a failure or a reload belongs to. A confirmed write whose follow-up read fails
 * is reported in the words of what was written, never in publishing words for a deletion.
 */
export type WriteAction =
  | 'publish'
  | 'reply'
  | 'edit'
  | 'delete'
  | 'like'
  | 'unlike'
  | 'share'
  | 'unshare';

/** Why a use case failed. Presentation maps each kind to user-facing text. */
export type SessionFailure =
  | { kind: 'not-connected' }
  | { kind: 'busy' }
  /** The write went through; only the read after it failed. `action` says what was written. */
  | { kind: 'reload-failed'; action: WriteAction }
  /** The object a write was aimed at is gone from the server; nothing was sent. */
  | { kind: 'note-gone' }
  /** Nothing to withdraw: no own reaction, or none whose activity IRI the load carried. */
  | { kind: 'reaction-missing' }
  /** The server refused to delete the reaction activity; `code` is the HTTP status. */
  | { kind: 'withdraw-rejected'; code: number }
  /** The server refused to delete the note; `code` is the HTTP status. */
  | { kind: 'delete-rejected'; code: number }
  /** Editing and deleting are for the reader's own notes only. */
  | { kind: 'not-own-note' }
  /** The server answered `status`; `detail` is the transport's developer text. */
  | { kind: 'http'; status: number; detail: string }
  | { kind: 'unreachable'; detail: string }
  | { kind: 'protocol'; reason: ProtocolProblem; detail: string }
  /** The chosen visibility needs a followers collection this server does not expose. */
  | { kind: 'no-followers' }
  /** The sample gateway holds no server to write to; `action` is what was attempted. */
  | { kind: 'read-only'; action: ReadOnlyAction }
  /** An error no gateway class describes; `message` is developer detail, not copy. */
  | { kind: 'gateway'; message: string }
  | { kind: 'unknown' };

/** Classifies anything a gateway can throw into a typed failure; never user-facing text. */
export function toFailure(error: unknown): SessionFailure {
  if (error instanceof GatewayGone) return { kind: 'note-gone' };
  if (error instanceof GatewayHttpError)
    return { kind: 'http', status: error.status, detail: error.message };
  if (error instanceof GatewayUnreachable) return { kind: 'unreachable', detail: error.message };
  if (error instanceof GatewayProtocolError)
    return { kind: 'protocol', reason: error.reason, detail: error.message };
  if (error instanceof AddressingError) return { kind: 'no-followers' };
  if (error instanceof GatewayReadOnly) return { kind: 'read-only', action: error.action };
  return error instanceof Error ? { kind: 'gateway', message: error.message } : { kind: 'unknown' };
}

/** What a use case rejects with: a typed failure, never user-facing words. */
export class SessionError extends Error {
  constructor(readonly failure: SessionFailure) {
    super(failure.kind);
    this.name = 'SessionError';
  }
}
