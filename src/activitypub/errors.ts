import {
  GatewayHttpError,
  GatewayProtocolError,
  GatewayRejected,
} from '../application/gateway-errors';

/** Error text here is developer detail only; presentation owns the words people read. */
export class HttpStatusError extends GatewayHttpError {
  constructor(status: number) {
    super(
      status,
      `ActivityPub request failed (${status}). Check server access, CORS, and token permissions.`,
    );
  }
}
/** The outbox refused a Like/Announce/Delete/Update; the application classifies it by type, never by text. */
export class ActivityRejectedError extends GatewayRejected {
  constructor(status: number, type: string) {
    super(
      status,
      `Server rejected the ${type} activity (${status}). Check the outbox before retrying.`,
    );
  }
}
export const protocol = (reason: 'unconfirmed-write' | 'unexpected-response', detail: string) =>
  new GatewayProtocolError(reason, detail);
export const unexpected = (detail: string) => protocol('unexpected-response', detail);
