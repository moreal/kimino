import { describe, expect, it } from 'vitest';
import { SessionError, type WriteAction } from '../application/social-session';
import { describeFailure, failureMessage, failureText, noticeText } from './copy-failures';

describe('failure copy', () => {
  it('speaks plain Korean for each HTTP class and keeps the status number', () => {
    const at = (status: number) =>
      failureMessage({ kind: 'http', status, detail: `HTTP ${status}` });
    expect(at(500).text).toBe('서버가 요청을 거부했어요 (500). 잠시 후 다시 시도해 주세요.');
    expect(at(503).text).toContain('(503)');
    expect(at(401).text).toMatch(/\(401\)/);
    expect(at(401).text).toMatch(/토큰|권한/);
    expect(at(403).text).toMatch(/토큰|권한/);
    expect(at(404).text).toMatch(/\(404\)/);
    expect(at(404).text).toMatch(/찾지 못했/);
    expect(at(400).text).toMatch(/\(400\)/);
    for (const status of [400, 401, 404, 500]) {
      expect(at(status).text).not.toMatch(/[A-Za-z]{4,}/);
      expect(at(status).detail).toBe(`HTTP ${status}`);
    }
  });
  it('distinguishes an unreachable server and protocol problems', () => {
    const offline = failureMessage({ kind: 'unreachable', detail: 'TypeError: Failed to fetch' });
    expect(offline.text).toMatch(/연결하지 못했/);
    expect(offline.text).not.toMatch(/[A-Za-z]{4,}/);
    expect(offline.detail).toBe('TypeError: Failed to fetch');
    const unconfirmed = failureMessage({
      kind: 'protocol',
      reason: 'unconfirmed-write',
      detail: 'No Location header',
    });
    expect(unconfirmed.text).toMatch(/게시됐을 수도/);
    expect(unconfirmed.detail).toBe('No Location header');
    expect(
      failureMessage({ kind: 'protocol', reason: 'unexpected-response', detail: 'x' }).text,
    ).toMatch(/ActivityPub/);
    expect(failureMessage({ kind: 'no-followers' }).text).toMatch(/팔로워/);
  });
  it('reports a collection past the page ceiling as a protocol problem, detail kept', () => {
    // The adapter refuses to truncate a timeline that runs past `maxPages`; that surfaces
    // as an unexpected response, and the developer detail names the limit behind "자세히".
    const detail = 'Collection page limit exceeded; timeline would be truncated.';
    const over = failureMessage({ kind: 'protocol', reason: 'unexpected-response', detail });
    expect(over.text).toBe('서버 응답이 ActivityPub 형식과 달라요. 서버 설정을 확인해 주세요.');
    expect(over.detail).toBe(detail);
    expect(over.text).not.toMatch(/게시됐을 수도/);
  });
  it('tells a sample-mode refusal apart by what was attempted', () => {
    const at = (action: 'publish' | 'react' | 'manage') =>
      failureMessage({ kind: 'read-only', action });
    expect(at('publish').text).toBe(
      '미리보기에서는 게시할 수 없어요. 계정을 연결하면 서버로 전송돼요.',
    );
    expect(at('react').text).toMatch(/좋아요·공유/);
    expect(at('manage').text).toMatch(/수정하거나 삭제/);
    for (const action of ['publish', 'react', 'manage'] as const) {
      expect(at(action).text).toMatch(/미리보기/);
      expect(at(action).text).toMatch(/계정을 연결/);
      expect(at(action).detail).toBe('');
    }
  });
  it('keeps failureText and describeFailure consistent for session errors', () => {
    const failure = { kind: 'http', status: 500, detail: 'd' } as const;
    expect(failureText(failure)).toBe(failureMessage(failure).text);
    expect(describeFailure(new SessionError(failure))).toEqual(failureMessage(failure));
    expect(describeFailure(new Error('plain'))).toEqual({ text: 'plain', detail: '' });
    expect(failureMessage(undefined)).toEqual({ text: '', detail: '' });
  });
});

describe('round 11: the words for a write the server took', () => {
  it('names the write a failed reload followed instead of always saying 게시', () => {
    const after = (action: WriteAction) => failureMessage({ kind: 'reload-failed', action }).text;
    const every: WriteAction[] = [
      'publish',
      'reply',
      'edit',
      'delete',
      'like',
      'unlike',
      'share',
      'unshare',
    ];
    expect(after('publish')).toContain('게시되었지만');
    expect(after('reply')).toContain('답글은 게시되었지만');
    expect(after('edit')).toContain('수정은 저장되었지만');
    expect(after('delete')).toContain('글은 지워졌지만');
    expect(after('like')).toContain('좋아요는 남겼지만');
    expect(after('unlike')).toContain('좋아요는 취소되었지만');
    expect(after('share')).toContain('공유는 되었지만');
    expect(after('unshare')).toContain('공유는 취소되었지만');
    // A withdrawal never borrows publishing words.
    for (const action of ['unshare', 'unlike', 'delete'] as WriteAction[])
      expect(after(action)).not.toContain('게시');
    for (const action of every) expect(after(action)).toContain('새로고침');
  });
  it('says, for every write, that the write itself went through before the reload failed', () => {
    const after = (action: WriteAction) => failureMessage({ kind: 'reload-failed', action }).text;
    // The failure stands alone after a reload fails - the confirmation is dropped - so its
    // words must carry the confirmation: "…지만" (went through, but) before the reload part.
    const every: WriteAction[] = [
      'publish',
      'reply',
      'edit',
      'delete',
      'like',
      'unlike',
      'share',
      'unshare',
    ];
    for (const action of every) {
      const [done, reload] = after(action).split('지만 ');
      expect(done).toMatch(/(게시|저장|지워|남겼|취소|되었)/);
      expect(reload).toContain('다시 불러오지 못했어요');
    }
  });
  it('explains a note the server no longer holds, and that nothing was sent', () => {
    const gone = failureMessage({ kind: 'note-gone' });
    expect(gone.text).toContain('서버에 더 이상 없어요');
    expect(gone.text).toContain('수정 내용은 보내지 않았고');
    expect(gone.detail).toBe('');
  });
  it('reports an already deleted note as done, not as a failure', () => {
    expect(noticeText('already-gone')).toContain('이미 지워진 글');
    expect(noticeText('already-gone')).not.toContain('못');
  });
});
