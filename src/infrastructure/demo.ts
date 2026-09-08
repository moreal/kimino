import type { TimelineGateway } from '../application/social-session';
import type { TimelineNote } from '../domain/social';
const base = 'https://demo.invalid';
const mina = `${base}/people/mina`,
  june = `${base}/people/june`,
  sol = `${base}/people/sol`;
const DEMO_PUBLISH = '미리보기에서는 게시할 수 없어요. 계정을 연결하면 서버로 전송됩니다.';
const DEMO_REACT =
  '미리보기에서는 좋아요·공유를 보낼 수 없어요. 계정을 연결하면 서버로 전송됩니다.';
const notes: TimelineNote[] = [
  {
    id: `${base}/notes/4`,
    author: mina,
    content:
      '<p>좋은 대화는 조금 느려도 괜찮지 않을까요?</p><p>오늘은 알림을 잠시 끄고, 친구들이 남긴 이야기를 천천히 읽고 있어요. 여러분은 어떤 하루를 보내고 있나요?</p>',
    published: '2026-09-08T09:10:00Z',
    announcedBy: [],
    likedBy: [],
    reactions: [],
    mentions: [],
  },
  {
    id: `${base}/notes/3`,
    author: sol,
    content:
      '<p><a href="https://demo.invalid/people/mina">@mina</a> 저도요. ☕ 창가에 앉아서 읽으니 같은 글도 다르게 다가오네요.</p>',
    inReplyTo: `${base}/notes/1`,
    published: '2026-09-08T08:40:00Z',
    announcedBy: [],
    likedBy: [mina],
    reactions: [{ kind: 'like', actor: mina, activity: `${mina}/likes/3` }],
    mentions: [mina],
  },
  {
    id: `${base}/notes/2`,
    author: june,
    content:
      '<p>이번 주말에는 동네 책방에 가려고요. 오래 머물 수 있는 작은 공간이 있다는 게 참 좋습니다.</p><p>최근에 읽고 오래 기억에 남은 책이 있나요?</p>',
    published: '2026-09-08T08:25:00Z',
    announcedBy: [mina],
    likedBy: [],
    reactions: [{ kind: 'share', actor: mina, activity: `${mina}/shares/2` }],
    mentions: [],
  },
  {
    id: `${base}/notes/1`,
    author: mina,
    content: '<p>커피 한 잔과 함께 시작하는 아침. 오늘 발견한 작은 기쁨을 하나씩 나눠봐요.</p>',
    published: '2026-09-08T08:00:00Z',
    announcedBy: [],
    likedBy: [june, sol],
    reactions: [
      { kind: 'like', actor: june, activity: `${june}/likes/1` },
      { kind: 'like', actor: sol, activity: `${sol}/likes/1` },
    ],
    mentions: [],
  },
];
/** Read-only sample content; every write fails with the same explanation. */
export const demoGateway: TimelineGateway = {
  demo: true,
  async loadTimeline() {
    return {
      actor: {
        id: mina,
        name: '미나',
        preferredUsername: 'mina',
        inbox: `${mina}/inbox`,
        outbox: `${mina}/outbox`,
      },
      notes,
      diagnostics: { ignored: 0, rejected: 0 },
      activities: [],
    };
  },
  async publishNote() {
    throw new Error(DEMO_PUBLISH);
  },
  async react() {
    throw new Error(DEMO_REACT);
  },
  async undoReaction() {
    throw new Error(DEMO_REACT);
  },
};
