import type { ReadOnlyAction, SessionFailure, WriteAction } from '../application/gateway-errors';
import { SessionError, type SessionNotice } from '../application/social-session';

/** What people read about a failure, plus the developer detail shown behind "자세히". */
export interface FailureMessage {
  text: string;
  detail: string;
}
export const failureDetailSummary = '자세히';

function httpText(status: number): string {
  if (status === 401 || status === 403)
    return `서버가 요청을 거부했어요 (${status}). 토큰이 만료되었거나 권한이 없을 수 있어요. 다시 연결해 주세요.`;
  if (status === 404 || status === 410)
    return `서버에서 요청한 주소를 찾지 못했어요 (${status}). 계정 주소를 확인해 주세요.`;
  if (status >= 500) return `서버가 요청을 거부했어요 (${status}). 잠시 후 다시 시도해 주세요.`;
  return `서버가 요청을 받아들이지 않았어요 (${status}). 내용을 확인하고 다시 시도해 주세요.`;
}

/**
 * A write the server accepted, followed by a read that failed. The words are those of the
 * write that went through: a withdrawn share is never reported as a published post.
 */
const reloadFailed: Record<WriteAction, string> = {
  publish: '글은 게시되었지만 타임라인을 다시 불러오지 못했어요. 새로고침을 눌러주세요.',
  reply: '답글은 게시되었지만 타임라인을 다시 불러오지 못했어요. 새로고침을 눌러주세요.',
  edit: '수정은 저장되었지만 타임라인을 다시 불러오지 못했어요. 새로고침을 눌러주세요.',
  delete: '글은 지워졌지만 타임라인을 다시 불러오지 못했어요. 새로고침을 눌러주세요.',
  like: '좋아요는 남겼지만 타임라인을 다시 불러오지 못했어요. 새로고침을 눌러주세요.',
  unlike: '좋아요는 취소되었지만 타임라인을 다시 불러오지 못했어요. 새로고침을 눌러주세요.',
  share: '공유는 되었지만 타임라인을 다시 불러오지 못했어요. 새로고침을 눌러주세요.',
  unshare: '공유는 취소되었지만 타임라인을 다시 불러오지 못했어요. 새로고침을 눌러주세요.',
};

/** The sample gateway refused a write: what it cannot do, and that a connected account can. */
const readOnly: Record<ReadOnlyAction, string> = {
  publish: '미리보기에서는 게시할 수 없어요. 계정을 연결하면 서버로 전송돼요.',
  react: '미리보기에서는 좋아요·공유를 보낼 수 없어요. 계정을 연결하면 서버로 전송돼요.',
  manage:
    '미리보기 글은 예시라서 수정하거나 삭제할 수 없어요. 계정을 연결하면 내 글을 고치고 지울 수 있어요.',
};

/** User-facing text for a typed session failure; the application never carries copy itself. */
export function failureMessage(failure?: SessionFailure): FailureMessage {
  if (!failure) return { text: '', detail: '' };
  const plain = (text: string): FailureMessage => ({ text, detail: '' });
  switch (failure.kind) {
    case 'not-connected':
      return plain('인스턴스에 먼저 연결해주세요.');
    case 'busy':
      return plain('진행 중인 요청이 끝나면 다시 게시해주세요.');
    case 'reload-failed':
      return plain(reloadFailed[failure.action]);
    case 'note-gone':
      // Nothing was sent: an Update against a note the server dropped would put it back up.
      return plain(
        '이 글은 서버에 더 이상 없어요. 다른 곳에서 이미 지운 것 같아요. 수정 내용은 보내지 않았고, 목록에서도 이 글을 내렸어요.',
      );
    case 'reaction-missing':
      // Withdrawing deletes the reaction activity, so it needs that activity's address.
      return plain(
        '취소할 좋아요/공유를 찾지 못했어요. 이 글을 불러올 때 활동 주소가 없어서 지울 대상을 특정할 수 없어요. 새로고침 후 다시 시도해주세요.',
      );
    case 'withdraw-rejected':
      return plain(
        `서버가 좋아요/공유 취소를 거절했어요 (${failure.code}). 잠시 후 다시 시도해주세요.`,
      );
    case 'delete-rejected':
      return plain(`서버가 삭제를 거절했어요 (${failure.code}). 잠시 후 다시 시도해주세요.`);
    case 'not-own-note':
      return plain('내가 쓴 글만 수정하거나 삭제할 수 있어요.');
    case 'http':
      return { text: httpText(failure.status), detail: failure.detail };
    case 'unreachable':
      return {
        text: '서버에 연결하지 못했어요. 인터넷 연결과 서버 주소를 확인하고 다시 시도해 주세요.',
        detail: failure.detail,
      };
    case 'protocol':
      return {
        text:
          failure.reason === 'unconfirmed-write'
            ? '게시됐을 수도 있어요. 서버가 결과를 확인해 주지 않았으니 다시 보내기 전에 새로고침해서 내 글을 확인해 주세요.'
            : '서버 응답이 ActivityPub 형식과 달라요. 서버 설정을 확인해 주세요.',
        detail: failure.detail,
      };
    case 'no-followers':
      // Reached by a post and by a like/share alike: neither is quietly widened instead.
      return plain(
        '이 서버는 팔로워 목록을 제공하지 않아서 이 공개 범위로는 보낼 수 없어요. 공개 또는 다이렉트 범위만 가능해요.',
      );
    case 'read-only':
      return plain(readOnly[failure.action]);
    case 'gateway':
      return plain(failure.message);
    case 'unknown':
      return plain('요청을 완료하지 못했어요. 다시 시도해주세요.');
  }
}
export function failureText(failure?: SessionFailure): string {
  return failureMessage(failure).text;
}

const noticeCopy: Record<SessionNotice, string> = {
  published: '게시됐어요.',
  liked: '좋아요를 남겼어요.',
  unliked: '좋아요를 취소했어요.',
  shared: '공유했어요.',
  unshared: '공유를 취소했어요.',
  edited: '글을 수정했어요.',
  // What deletion does here, said plainly: the note leaves this server. Copies other
  // servers already received are not recalled by it.
  deleted: '내 서버에서 글을 지웠어요. 이미 다른 서버로 전달된 사본까지 되돌리지는 못해요.',
  // Deleting something that was already gone is done, not failed: nothing was sent.
  'already-gone': '이미 지워진 글이라 다시 지울 것이 없었어요. 목록에서 내렸어요.',
};
export function noticeText(notice?: SessionNotice): string {
  return notice ? noticeCopy[notice] : '';
}

/** One message for anything a use case can reject with. */
export function describeFailure(error: unknown): FailureMessage {
  if (error instanceof SessionError) return failureMessage(error.failure);
  return error instanceof Error
    ? { text: error.message, detail: '' }
    : failureMessage({ kind: 'unknown' });
}
export function describeError(error: unknown): string {
  return describeFailure(error).text;
}
