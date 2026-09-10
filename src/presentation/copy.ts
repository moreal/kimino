import type { FeedView } from './feed';
import { relativeTime } from './time';

export type NavIcon = 'home' | 'reply' | 'person' | 'bookmark';

/**
 * One word per concept: "답글" is only the write action, "원글 보기" marks a card as a reply,
 * "대화" is the thread and its count, "받은 답글" is the list of replies and mentions to me.
 */

/** One vocabulary: sample mode is "미리보기"; "서버에서 보기" only ever means the server permalink. */
const DEMO_MODE = '미리보기';

export const viewTitles: Record<FeedView, string> = {
  all: '타임라인',
  replies: '받은 답글',
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

export function emptyState(
  view: FeedView,
  query: string,
  authorFilter = false,
): { heading: string; body: string } {
  if (query)
    return {
      heading: '일치하는 글이 없어요',
      body: '현재 불러온 글에서 검색해요. 다른 검색어를 입력해보세요.',
    };
  if (authorFilter)
    return {
      heading: '이 목록에는 이 사람의 글이 없어요',
      body: '불러온 글에서만 걸러요. 필터를 해제하면 전체 목록으로 돌아가요.',
    };
  switch (view) {
    case 'saved':
      return {
        heading: '다시 읽고 싶은 글을 모아보세요',
        body: '게시글의 저장 버튼을 누르면 여기서 다시 찾을 수 있어요.',
      };
    case 'replies':
      return {
        heading: '아직 받은 답글이 없어요',
        body: '내 글에 달린 답글과 나를 언급한 글이 여기에 모여요.',
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
  demoSave: `${DEMO_MODE}에서 저장했어요. 새로고침해도 남지만 이 탭을 닫으면 초기화돼요.`,
  /** Escape in a reply composer with text in it: the composer closes, the words stay. */
  replyDraftKept: '답글창을 닫았어요. 쓴 내용은 답글 버튼의 초안으로 남아 있어요.',
  saved: '글 링크를 이 브라우저에 저장했어요. 본문은 보관하지 않아요.',
  unsaved: '저장을 해제했어요.',
  storageUnavailable: '브라우저 저장소를 사용할 수 없어 변경 사항은 이 탭에서만 유지돼요.',
};

/** Under a reply nested deeper than the view indents, and on a card whose parent is loaded. */
const replyCue = (author: string) => `${author}에게`;
/** The same slot when the reply continues its author's own note: a continuation, not an answer. */
const REPLY_CUE_SELF = '이어서';
/** Card marker for a reply whose original is loaded, linkable, or neither. */
const OPEN_PARENT = '원글 보기';
/** Opening a conversation: the 대화 control without a count, and the right column's peek. */
const THREAD_OPEN = '대화 열기';

/** The one tagline: under the wordmark in the sidebar, and at the foot of the right column. */
const SIDEBAR_CAPTION = '조금 더 가까운 대화';

/**
 * One quiet line out of several short facts, in the order given: the middle dot is the one
 * separator this client uses between them, and an empty part leaves no dot behind.
 */
export const joinLine = (...parts: readonly (string | false | undefined | null)[]): string =>
  parts.filter(Boolean).join(' · ');

/**
 * The local ONI fixture's actor: the developer steps type it, and the empty Actor URL field
 * shows it as its placeholder.
 */
export const DEV_SERVER_URL = 'https://localhost:8443/';

export const copy = {
  /** The first Tab stop: straight to the column the reader came for. */
  skipLink: '본문으로 건너뛰기',
  /** The list of cards, as the landmark it is. */
  listLabel: '게시글 목록',
  /** The conversation region beside or instead of the list. */
  conversationRegion: '대화 내용',
  /** A card's accessible name: whose note it is. */
  noteBy: (author: string) => `${author}의 글`,
  demoBanner: `${DEMO_MODE} · 예시 글이에요. 게시·답글·좋아요는 계정 연결 후 가능해요.`,
  demoBannerAction: '계정 연결',
  exitDemo: '둘러보기 종료',
  exploreLabel: '먼저 둘러보기',
  disconnect: '연결 해제',
  compose: '새 글 쓰기',
  back: '목록으로 돌아가기',
  refreshLabel: '타임라인 새로고침',
  search: '불러온 글 검색',
  searchPlaceholder: '글 내용이나 작성자 검색',
  clearSearch: '검색 지우기',
  /** The field's description: the key that empties it, said once for keyboard readers. */
  searchHelp: 'Esc 키로 검색어를 지울 수 있어요.',
  dismiss: '알림 닫기',
  alertHeading: '확인이 필요해요',
  publishFailed: '게시하지 못했어요',
  draftKept: '쓴 내용은 그대로 남아 있어요.',
  missingSelection:
    '선택한 글은 현재 타임라인에 없어요. 삭제되었거나 더 이상 제공되지 않을 수 있어요.',
  missingParent: '원글을 아직 불러오지 않았어요.',
  missingParentLink: '서버에서 원글 보기',
  /** The parent is not loaded and its IRI is not a link either: nothing to open. */
  missingParentNoLink: '원글 주소를 열 수 없어요.',
  savedScope: '글 링크만 이 브라우저에 저장해요. 서버나 다른 기기에는 동기화되지 않아요.',
  conversationLabel: '이어지는 대화',
  ancestorsLabel: '이 글이 답한 대화',
  noReplies: '아직 이어지는 대화가 없어요.',
  replyCue,
  replyCueSelf: REPLY_CUE_SELF,
  /** Desktop right column while no conversation is open. */
  repliesPeek: '받은 답글',
  repliesPeekEmpty: '아직 받은 답글이 없어요.',
  repliesPeekOpen: THREAD_OPEN,
  /** A peek item's accessible name: whose reply it is, and what pressing it does. */
  repliesPeekItem: (author: string) => `${author}: ${THREAD_OPEN}`,
  openParent: OPEN_PARENT,
  /**
   * The same marker with the parent's author and its first words in front, once the parent
   * is loaded: four replies that all read "Oni에게" tell the reader nothing about which note
   * each one answers. A warned parent lends its warning, never the words behind it.
   */
  openParentOf: (author: string, excerpt: string) => `${author}: ${excerpt} · ${OPEN_PARENT}`,
  /** A reply to my own note: a continuation, not an answer to someone. */
  openParentSelf: `${REPLY_CUE_SELF} · ${OPEN_PARENT}`,
  parentUnavailable: '원글을 불러오지 않았어요',
  /**
   * The parent is known to be gone - deleted from here, or replaced by a tombstone the
   * server sent - so the card says so instead of offering a link to a 410.
   */
  parentDeleted: '원글이 삭제됐어요',
  /** Opened from 받은 답글 on a note that only mentions me: the thread is not under my note. */
  mentionThread:
    '이 글은 나를 언급한 글이에요. 내 글에 단 답글이 아니라서 이어지는 대화는 원래 글 아래에 있어요.',
  thread: '대화',
  /** The 대화 control's accessible name while it carries no count: what pressing it does. */
  threadOpen: THREAD_OPEN,
  /** What the "대화 N" count is: every reply loaded below the note, not the server's total. */
  threadScope: '불러온 답글 기준',
  /**
   * Reaction controls name their state, not only their colour: the word changes with
   * `aria-pressed` the way 저장 / 저장됨 already does, so the state survives a screenshot in
   * greyscale and a reader who never sees the accent.
   */
  reactions: {
    like: '좋아요',
    liked: '좋아함',
    share: '공유',
    shared: '공유함',
    save: '저장',
    saved: '저장됨',
  },
  sharedBy: (names: string) => `${names}님이 공유`,
  /** The write action on a card: the word, its accessible name, and the unsent-draft badge. */
  reply: {
    action: '답글',
    label: (author: string) => `${author}에게 답글 달기`,
    draft: '초안 있음',
  },
  /** The composer's own words: labels, placeholders, the submit control, the key hints. */
  composer: {
    self: '나',
    newLabel: '새 글',
    newPlaceholder: '지금, 어떤 생각을 하고 있나요?',
    replyLabel: '답글 내용',
    replyPlaceholder: '대화를 이어가 보세요.',
    replyHeading: (author: string) => `${author}님에게 답글`,
    publish: '게시하기',
    publishReply: '답글 게시하기',
    publishing: '게시 중…',
    cancel: '취소',
    editFailed: '수정하지 못했어요',
    draftKeptHere: '이 탭 안에서 초안 유지',
    submitKey: 'Ctrl / ⌘ + Enter로 게시',
    /** The same key in the edit composer, where the button says 수정하기. */
    submitKeyEdit: 'Ctrl / ⌘ + Enter로 수정',
    escapeCloses: 'Esc로 닫기',
  },
  /** The sidebar's brand row and navigation landmark. */
  sidebar: {
    home: 'Kimino 홈',
    caption: SIDEBAR_CAPTION,
    nav: '메인 메뉴',
    foot: '시간 순서대로, 광고 없이',
  },
  /** The foot of the desktop right column: the wordmark and the sidebar's tagline, once. */
  siteFooter: `Kimino · ${SIDEBAR_CAPTION}`,
  /** Saved links the current timeline no longer carries. */
  unavailableSaved: {
    heading: (count: number) => `불러오지 못한 저장 링크 · ${count}`,
    body: '글 본문은 보관하지 않아요. 아직 불러오지 않았거나, 삭제되었거나, 현재 계정에서 볼 수 없는 글일 수 있어요.',
    open: '저장한 원문 열기',
    remove: '저장 해제',
  },
  /** The edit marker with when the edit happened, so "수정됨" is not a timeless label. */
  editedAt: (when: string) => `수정됨 · ${when}`,
  /**
   * Managing my own note. Deletion is described by what it actually does on this server -
   * the note leaves it - without claiming anything about copies other servers already hold.
   */
  own: {
    /**
     * On a one-person server every author shares the same host, so the handle alone does
     * not say whose note this is. The card carries the word, not only a colour.
     */
    badge: '내 글',
    badgeLabel: '내가 쓴 글',
    edit: '수정',
    editLabel: '내 글 수정하기',
    delete: '삭제',
    deleteLabel: '내 글 삭제하기',
    confirmHeading: '이 글을 삭제할까요?',
    confirmBody:
      '내 서버에서 글이 지워지고 타임라인에서 사라져요. 이미 다른 서버로 전달된 사본까지 되돌리지는 못하고, 되돌리기도 없어요.',
    confirm: '삭제하기',
    cancel: '삭제 취소',
    /** Narrow columns fold 수정 and 삭제 behind this one control at the end of the row. */
    manage: '관리',
    manageLabel: '내 글 관리: 수정, 삭제',
    /** After deleting the note whose conversation was open. */
    threadClosed: '삭제한 글의 대화를 닫았어요.',
  },
  /** The composer reopened on one of my notes: what it changes, and what it leaves alone. */
  editComposer: {
    heading: '글 수정',
    submit: '수정하기',
    pending: '수정 중…',
    cancel: '수정 취소',
    /**
     * Editing rewrites the text and the warning only. This server does accept a new audience
     * in an Update, but the original recipients of a published note cannot be reproduced
     * faithfully from what the client loaded, so the scope is left exactly as it was sent.
     */
    scopeFixed: (scope: string) => `${scope} 그대로 · 본문과 경고 문구만 바꿔요`,
    /**
     * No promise of a marker: "수정됨" is drawn only when the server records a later
     * edit time, and servers that leave it at the publication time (this one included)
     * show nothing. Saying otherwise would promise a badge that never appears.
     */
    hint: '"수정됨" 표시는 서버가 수정 시각을 기록할 때만 붙어요. 기록하지 않는 서버에서는 표시 없이 본문만 바뀌어요.',
    /** The disclosure the hint waits behind, so it is read once and not on every edit. */
    hintSummary: '수정 표시에 대해',
  },
  /** The note's own address on its server; "원글" is reserved for the parent of a reply. */
  permalink: '서버에서 보기',
  /** A render halt at the entry point: plain words instead of a blank page, detail on request. */
  renderFailure: '화면을 그리는 중 문제가 생겼어요. 새로고침해 주세요.',
  renderFailureDetail: '자세한 내용',
  /** Right-column account line: the account, its sync state as a tooltip, one exit control. */
  accountLine: (handle: string) => `${handle}로 연결됨`,
  /** The same line while a remembered tab reconnects an account whose name is not yet known. */
  accountConnecting: '연결 중…',
  /** Below the desktop width: the header control that opens the connected account's sheet. */
  accountButton: (name: string) => `${name} 계정`,
  /** Desktop reading density toggle in the sidebar. */
  density: {
    compact: '촘촘하게',
    hint: '넓은 화면에서 여백을 줄여 한 화면에 더 많은 글을 보여줘요. 이 브라우저에 기억해요.',
    /** Sidebar switch: every content-warned note opens by itself; the per-note 접기 still closes one. */
    revealWarned: '경고 글 항상 펼치기',
    revealWarnedHint:
      '경고 문구가 붙은 글의 본문을 처음부터 펼쳐서 보여줘요. 글마다 접기는 그대로 되고, 이 브라우저에 기억해요.',
  },
  /** In-app actor sheet: only what the loaded timeline can say, and a client-side filter. */
  actor: {
    heading: '작성자',
    server: '서버',
    loaded: (count: number) => `이 세션에서 불러온 글 ${count}개`,
    viewOnServer: '서버에서 프로필 보기',
    filter: '이 사람의 글만 보기',
    filterScope: '지금 불러온 글에서만 걸러요.',
    filtering: (handle: string) => `${handle}의 글만 (불러온 글 기준)`,
    clearFilter: '필터 해제',
    close: '닫기',
    open: (handle: string) => `${handle} 정보 보기`,
  },
  shortcuts: {
    button: '단축키',
    heading: '키보드 단축키',
    hint: '입력창 밖에서 누르세요. 목록의 글 위에서 화살표 키도 같은 일을 해요.',
    threadHint:
      '대화 열에서는 j / k가 대화의 글(윗글, 선택한 글, 답글) 사이를 오가고, Esc는 대화를 연 타임라인 글로 돌아가요.',
    close: '닫기',
    actions: {
      next: '다음 / 이전 글로 이동',
      open: '선택한 글의 대화 열기',
      reply: '선택한 글에 답글',
      save: '선택한 글 저장 / 해제',
      like: '선택한 글 좋아요',
      share: '선택한 글 공유',
      leave: '글 선택 해제 (목록으로 초점 이동)',
      help: '이 안내 열기 / 닫기',
    },
  },
};

/** Connection screen: plain-language guidance first, developer steps behind a disclosure. */
/** The words on the opt-in checkbox, repeated verbatim by the reminder that points at it. */
const REMEMBER_LABEL = '새로고침해도 이 탭에서 유지';

export const connectionCopy = {
  needsC2s: 'ActivityPub C2S 계정이 필요해요',
  whatIsC2s:
    'Kimino는 서버의 API가 아니라 ActivityPub 표준의 클라이언트-서버(C2S) 방식으로 내 outbox에 직접 글을 쓰는 클라이언트예요.',
  mastodon:
    'Mastodon과 대부분의 대형 서버는 C2S를 제공하지 않아서, 지금은 Mastodon 계정으로 로그인할 수 없어요.',
  whereLead: 'C2S를 지원하는 서버의 예:',
  specLink: 'ActivityPub 명세의 C2S 절',
  specUrl: 'https://www.w3.org/TR/activitypub/#client-to-server-interactions',
  oniLink: 'go-ap/oni (오픈소스 1인 서버)',
  oniUrl: 'https://github.com/go-ap/oni',
  /** One line under the Actor URL label; the full note explains why. */
  actorUrlHelp:
    'ActivityPub C2S를 지원하는 서버의 계정 주소. Mastodon 계정은 아직 연결할 수 없어요.',
  tokenMemory: '토큰은 기본적으로 이 탭의 메모리에만 보관돼요. 새로고침하면 다시 연결해주세요.',
  remember: `${REMEMBER_LABEL} (sessionStorage)`,
  rememberHelp:
    '체크하면 Actor URL과 액세스 토큰을 이 탭의 sessionStorage에 저장해요. 탭을 닫으면 지워지고 다른 탭이나 기기에는 공유되지 않아요.',
  developerSummary: '개발자용: 로컬 ONI 서버 연결',
  exploreHelp: `가입 없이 예시 글로 화면을 둘러볼 수 있어요. 이 탭에는 ${DEMO_MODE} 표시, 목록 이름, 저장한 글 링크만 남고 탭을 닫으면 지워져요.`,
  tagline: '소음은 줄이고, 대화는 가까이.',
  taglineHelp: '시간 순서대로 읽고, 한 사람의 이야기에 집중하는 ActivityPub 클라이언트예요.',
  accountHeading: '내 계정으로 시작하기',
  actorUrlLabel: 'Actor URL',
  /** The empty field shows the local fixture's address; a first visit types its own. */
  actorUrlPlaceholder: DEV_SERVER_URL,
  tokenLabel: '액세스 토큰',
  tokenPlaceholder: '서버에서 발급한 Bearer 토큰',
  connect: '연결하기',
  connecting: '연결 중…',
  /**
   * The developer steps behind the disclosure, as segments: plain words, `code` for what
   * is typed, `link` for the local server. The view lays them out; the words live here.
   */
  developerSteps: [
    ['터미널에서 ', { code: 'npm run c2s:up' }, ', ', { code: 'npm run c2s:seed' }, '를 실행해요.'],
    [
      { link: '로컬 서버 열기' },
      '에서 인증서를 확인하거나 ',
      { code: '.local/c2s-root.crt' },
      '를 신뢰해요.',
    ],
    [
      'Actor URL은 ',
      { code: DEV_SERVER_URL },
      ', 토큰은 ',
      { code: '.local/c2s-credentials.json' },
      '의 token이에요.',
    ],
  ] as readonly (readonly (string | { code: string } | { link: string })[])[],
  connectFailed: '연결하지 못했어요',
  connectFailedHelp:
    '주소와 토큰을 확인하세요. 로컬 서버라면 개발자용 안내에서 인증서 설정을 확인할 수 있어요.',
  /**
   * Offered once, right after a connect that did not opt in: the token is in memory only, so
   * a reload ends this session. Saying it here does not change the default and stores
   * nothing; the checkbox on the connect form is still the only way to opt in.
   */
  sessionHint: `지금 연결은 이 탭의 메모리에만 있어요. 새로고침하면 토큰을 다시 입력해야 하고, 연결 화면에서 "${REMEMBER_LABEL}"를 켜면 이 탭에서는 유지할 수 있어요.`,
  sessionHintDismiss: '안내 닫기',
  /** Phone only: the clipped line opens to the whole sentence, and folds back. */
  sessionHintMore: '자세히',
  sessionHintLess: '접기',
};

export function disconnectLabel(demo: boolean): string {
  return demo ? copy.exitDemo : copy.disconnect;
}

/**
 * When the timeline was last read, in the same words wherever that is reported. A read
 * after a write is partial - it re-reads what a write could have changed, not the whole
 * server - and the line says so rather than passing it off as a full check.
 */
export function lastChecked(loadedAt?: string, now?: Date | number, partial = false): string {
  if (!loadedAt) return '아직 확인 전';
  return `마지막 ${partial ? '부분 확인' : '확인'} ${relativeTime(loadedAt, now)}`;
}
/**
 * Activities this client does not understand and therefore did not show. It is the one place
 * the client admits it dropped something, so it is printed, not hidden in a tooltip - and it
 * stays quiet when there is nothing to admit.
 */
export function unsupportedActivities(ignored = 0): string {
  return ignored > 0 ? `미지원 활동 ${ignored}개는 표시하지 못했어요` : '';
}
/**
 * Activities the client understood and refused: the server holds them, but their author does
 * not match the activity that carries them, so showing them would put someone else's name on
 * a post. Said apart from the unsupported ones, because "거절" and "미지원" are not the same
 * admission - and, like them, printed rather than hidden, and silent when there is nothing.
 */
export function refusedActivities(rejected = 0): string {
  return rejected > 0
    ? `안전을 위해 거절한 활동 ${rejected}개는 표시하지 않았어요 (미지원이 아니라, 작성자 정보가 맞지 않아 거절한 활동이에요)`
    : '';
}
/**
 * Everything the client read and did not show, as one count: the reasons (unsupported,
 * refused for safety) stay in the words above, behind the foot's disclosure. Silent at zero.
 */
export function hiddenActivities(ignored = 0, rejected = 0): string {
  const total = ignored + rejected;
  return total > 0 ? `표시하지 않은 활동 ${total}개` : '';
}
/** Profile card one-liner replacing the diagnostics disclosure. */
export function syncSummary(
  loadedAt?: string,
  ignored = 0,
  now?: Date | number,
  partial = false,
): string {
  return `${lastChecked(loadedAt, now, partial)} · 미지원 활동 ${ignored}개`;
}

/**
 * The foot of the list: how much of what is loaded is on screen, and how to read the rest.
 * Paging is client-side over notes that are already loaded; nothing is fetched by it.
 */
export const feedFoot = {
  more: '더 보기',
  /** On the "더 보기" control: how many loaded notes are still not on screen. */
  remaining: (count: number) => `남은 글 ${count}개`,
  shown: (shown: number, total: number) => `불러온 글 ${total}개 중 ${shown}개 표시`,
  /** While a search is on: how many of the loaded notes matched, against how many are loaded. */
  searched: (matched: number, loaded: number) => `검색 결과 ${matched}개 · 불러온 글 ${loaded}개`,
  /** The saved list: how many saved notes are loaded, against how many notes are loaded. */
  savedShown: (saved: number, loaded: number) => `저장한 글 ${saved}개 · 불러온 글 ${loaded}개`,
  /**
   * A search inside a scoped list (a view other than the timeline, or one person's notes):
   * how many of that scope matched, against how big the scope is - not against everything
   * loaded, which the search never looked at.
   */
  searchedIn: (scope: string, matched: number, size: number) =>
    `${scope} 중 검색 결과 ${matched}개 · ${scope} ${size}개`,
  /** The scope label of an author filter, for `searchedIn`. */
  authorScope: (name: string) => `${name}의 글`,
  /** Appended to either of those once the list is paged: how many of them are on screen. */
  onScreen: (shown: number) => `${shown}개 표시`,
  toTop: '맨 위로',
  toTopLabel: '목록 맨 위로 이동',
  /** The disclosure in the foot that opens the per-reason sentences. */
  details: '자세히',
  /** What the client actually read from the server, said as a count and not as "전부". */
  fetched: (count: number) => `서버에서 읽은 활동 ${count}개`,
  /**
   * The server declared more than the client received. It is not paged over: this client
   * follows the collection's own `next` links to their end, so what it did not get has no
   * further page to ask for, and saying "더 보기" here would be a promise it cannot keep.
   */
  unreached: (count: number) => `서버에 ${count}개가 더 있지만 아직 불러오지 못했어요`,
  unreachedHelp: '이전(오래된) 글 일부는 지금 이 화면에서 볼 수 없어요.',
};

/**
 * The foot line about the server's collections: how much this client read, and - only when
 * the server declared more than it delivered - that older activities were not reached.
 * Nothing is claimed when the server declared no total.
 */
export function reachLine(reach?: { fetched: number; missing: number }): string {
  if (!reach) return '';
  return reach.missing > 0
    ? `${feedFoot.fetched(reach.fetched)} · ${feedFoot.unreached(reach.missing)} · ${feedFoot.unreachedHelp}`
    : feedFoot.fetched(reach.fetched);
}

/** Note body: content warnings, attachments that load on demand, visibility. */
export const contentCopy = {
  showContent: '내용 보기',
  hideContent: '접기',
  loadImage: '이미지 불러오기',
  /** The attachment list's accessible name, with its counts. */
  attachmentsLabel: (summary: string) => `첨부 ${summary}`,
  addWarning: '경고 문구 추가',
  removeWarning: '경고 문구 제거',
  warningLabel: '경고 문구',
  warningPlaceholder: '예: 스포일러, 식사 중 주의',
  visibilityLegend: '공개 범위',
  /** What this composer cannot do yet: there is no file input, so there is no alt text either. */
  noAttachments: '이미지 첨부는 아직 지원하지 않아요. 대체 텍스트도 여기서는 쓸 수 없어요.',
  /** Shown beside the character count once the draft is past the ceiling. */
  overLimit: '너무 길어요',
  /** Announced once when the draft crosses the ceiling; the count itself stays quiet. */
  overLimitHelp: '5,000자를 넘어서 지금은 게시할 수 없어요. 줄이면 다시 게시할 수 있어요.',
};
