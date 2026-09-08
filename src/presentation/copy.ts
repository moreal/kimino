import type { FeedView } from './feed';
import { relativeTime } from './time';

export type NavIcon = 'home' | 'reply' | 'person' | 'bookmark';

/** One vocabulary: sample mode is "미리보기"; "원문 보기" only ever means the server permalink. */
export const DEMO_MODE = '미리보기';

export const viewTitles: Record<FeedView, string> = {
  all: '타임라인',
  replies: '나에게 온 답글',
  mine: '내가 쓴 글',
  saved: '저장한 글',
};
export const navItems: { id: FeedView; icon: NavIcon; label: string }[] = [
  { id: 'all', icon: 'home', label: viewTitles.all },
  { id: 'replies', icon: 'reply', label: viewTitles.replies },
  { id: 'mine', icon: 'person', label: viewTitles.mine },
  { id: 'saved', icon: 'bookmark', label: viewTitles.saved },
];

export function pageTitle(view: FeedView, thread: boolean): string {
  return thread ? '대화' : viewTitles[view];
}

export function emptyState(view: FeedView, query: string): { heading: string; body: string } {
  if (query)
    return {
      heading: '일치하는 글이 없어요',
      body: '현재 불러온 글에서 검색합니다. 다른 검색어를 입력해보세요.',
    };
  switch (view) {
    case 'saved':
      return {
        heading: '다시 읽고 싶은 글을 모아보세요',
        body: '게시글의 저장 버튼을 누르면 여기서 다시 찾을 수 있어요.',
      };
    case 'replies':
      return {
        heading: '아직 나에게 온 답글이 없어요',
        body: '내 글에 달린 답글과 나를 언급한 글이 여기에 모입니다.',
      };
    case 'mine':
      return { heading: '아직 쓴 글이 없어요', body: '위 작성창에서 오늘의 생각을 나눠보세요.' };
    default:
      return {
        heading: '첫 이야기를 기다리고 있어요',
        body: '위 작성창에서 오늘의 생각을 나눠보세요.',
      };
  }
}

export const notices = {
  demoSave: `${DEMO_MODE}에서 저장을 체험했어요. ${DEMO_MODE}를 종료하면 초기화됩니다.`,
  saved: '글 링크를 이 브라우저에 저장했습니다. 본문은 보관하지 않습니다.',
  unsaved: '저장을 해제했습니다.',
  storageUnavailable: '브라우저 저장소를 사용할 수 없어 변경 사항은 이 탭에서만 유지됩니다.',
};

export const copy = {
  demoBanner: `${DEMO_MODE} · 예시 글이에요. 게시·답글은 계정 연결 후 가능해요.`,
  demoBannerAction: '계정 연결 →',
  demoAccount: `${DEMO_MODE} 계정`,
  connectedAccount: '연결된 계정',
  demoStatus: DEMO_MODE,
  connectedStatus: '연결됨',
  demoEyebrow: `KIMINO ${DEMO_MODE}`,
  eyebrow: '나의 작은 소셜 공간',
  exitDemo: '둘러보기 종료',
  disconnect: '연결 해제',
  back: '목록으로 돌아가기',
  missingSelection:
    '선택한 글은 현재 타임라인에 없습니다. 삭제되었거나 더 이상 제공되지 않을 수 있어요.',
  missingParent: '현재 불러온 글에 원문이 없습니다.',
  missingParentLink: '서버에서 원문 보기 ↗',
  savedScope: '글 링크만 이 브라우저에 저장합니다. 서버나 다른 기기에는 동기화되지 않습니다.',
  noReplies: '아직 불러온 답글이 없습니다.',
};

export function disconnectLabel(demo: boolean): string {
  return demo ? copy.exitDemo : copy.disconnect;
}

/** Profile card one-liner replacing the diagnostics disclosure. */
export function syncSummary(loadedAt?: string, ignored = 0, now?: Date | number): string {
  const checked = loadedAt ? `마지막 확인 ${relativeTime(loadedAt, now)}` : '아직 확인 전';
  return `${checked} · 미지원 활동 ${ignored}개`;
}
