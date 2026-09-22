import { describe, expect, it } from 'vitest';
import { GatewayReadLimit, SessionError, toFailure } from '../application/gateway-errors';
import { describeFailure, failureMessage } from './copy-failures';

describe('client read limit copy', () => {
  it.each([
    ['pages', 8, '8페이지'],
    ['objects', 1000, '항목 1000개'],
  ] as const)(
    'explains the %s bound without blaming server format or credentials',
    (reason, limit, label) => {
      const failure = toFailure(new GatewayReadLimit(reason, limit));
      const message = failureMessage(failure);
      expect(message.text).toContain('클라이언트');
      expect(message.text).toContain('안전');
      expect(message.text).toContain(label);
      expect(message.text).toContain('불완전한 조회 결과는 반영하지 않아요');
      expect(message.text).not.toMatch(/형식|토큰|권한|서버 설정|새로고침|다시 시도/);
      expect(message.detail).toBe('');
      expect(describeFailure(new SessionError(failure))).toEqual(message);
    },
  );
});
