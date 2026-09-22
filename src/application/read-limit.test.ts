import { describe, expect, it } from 'vitest';
import { GatewayProtocolError, GatewayReadLimit, SessionError, toFailure } from './gateway-errors';

describe('typed client read limits', () => {
  it.each([
    ['pages', 8],
    ['objects', 1000],
  ] as const)('classifies %s by error type and carries only safe limit data', (reason, limit) => {
    const error = new GatewayReadLimit(reason, limit);
    expect(error.name).toBe('GatewayReadLimit');
    expect(error.reason).toBe(reason);
    expect(error.limit).toBe(limit);
    expect(toFailure(error)).toEqual({ kind: 'read-limit', reason, limit });
    expect(toFailure(new SessionError(toFailure(error)))).toEqual({
      kind: 'read-limit',
      reason,
      limit,
    });
  });
  it('does not infer a limit from matching arbitrary or protocol error text', () => {
    const message = new GatewayReadLimit('pages', 8).message;
    expect(toFailure(new Error(message))).toEqual({ kind: 'gateway', message });
    expect(toFailure(new GatewayProtocolError('unexpected-response', message))).toEqual({
      kind: 'protocol',
      reason: 'unexpected-response',
      detail: message,
    });
  });
});
