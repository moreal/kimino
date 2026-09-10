import { describe, expect, it } from 'vitest';
import type { TimelineNote } from '../domain/social';
import { evaluateActivities } from '../domain/evaluate';
import type { SocialSessionSnapshot } from '../application/social-session';
import {
  PAGE_SIZE,
  currentNotice,
  deriveFeedState,
  feedFootLine,
  parentState,
  threadCue,
  initialLocalState,
  isSoloAuthor,
  pageNotes,
  parentOf,
  projectConversation,
  descendantCount,
  descendantCounts,
  repliesPeek,
  sortOldestFirst,
  threadPlacement,
  visualDepth,
  withConfirmedReactions,
  type FeedState,
} from './feed-selectors';
/** Direct replies to the focused note in reading order, as the view would draw them. */
const directReplies = (state: FeedState) =>
  (state.conversation?.descendants ?? [])
    .filter((node) => node.depth === 0)
    .map((node) => node.note);

const me = 'https://social.example/users/me';
const base = {
  visibility: 'public' as const,
  attachments: [],
  announcedBy: [],
  likedBy: [],
  reactions: [],
  mentions: [],
};
const notes: TimelineNote[] = [
  { ...base, id: 'n1', author: me, content: '<p>mine</p>' },
  {
    ...base,
    id: 'n2',
    author: 'https://social.example/users/bob',
    content: 'reply',
    inReplyTo: 'n1',
    published: '2026-09-02T00:00:00Z',
  },
  {
    ...base,
    id: 'n3',
    author: 'https://social.example/users/cy',
    content: 'orphan',
    inReplyTo: 'gone',
  },
  {
    ...base,
    id: 'n4',
    author: me,
    content: 'self',
    inReplyTo: 'n1',
    published: '2026-09-01T00:00:00Z',
  },
  { ...base, id: 'n5', author: me, content: 'undated', inReplyTo: 'n1' },
];
const remote = (patch: Partial<SocialSessionSnapshot> = {}): SocialSessionSnapshot => ({
  demo: false,
  connecting: false,
  refreshing: false,
  actor: { id: me, inbox: `${me}/inbox`, outbox: `${me}/outbox` },
  timeline: {
    actor: { id: me, inbox: '', outbox: '' },
    notes,
    diagnostics: { ignored: 0, rejected: 0 },
    activities: [],
    deleted: [],
  },
  ...patch,
});

describe('client-side paging over loaded notes', () => {
  const many = Array.from({ length: 122 }, (_, index) => ({
    ...base,
    id: `p${index}`,
    author: me,
    content: `note ${index}`,
  }));
  it('shows one page at a time and counts what is still behind it', () => {
    expect(PAGE_SIZE).toBe(50);
    const first = pageNotes(many, 1);
    expect(first.visible).toHaveLength(50);
    expect(first.remaining).toBe(72);
    expect(pageNotes(many, 2)).toMatchObject({ remaining: 22 });
    expect(pageNotes(many, 3).visible).toHaveLength(122);
    expect(pageNotes(many, 3).remaining).toBe(0);
    // Whether one more page is the last one is the list's to say, not the view's.
    expect(first.lastPage).toBe(false);
    expect(pageNotes(many, 2).lastPage).toBe(true);
    expect(pageNotes(many, 3).lastPage).toBe(true);
    expect(pageNotes(many.slice(0, 100), 1).lastPage).toBe(true);
    expect(pageNotes(many.slice(0, 101), 1).lastPage).toBe(false);
    // Asking beyond the end never wraps, drops or duplicates a note.
    expect(pageNotes(many, 9).visible.map((n) => n.id)).toEqual(many.map((n) => n.id));
  });
  it('never hides a note that no page can reach, and always shows at least one page', () => {
    expect(pageNotes(many, 0).visible).toHaveLength(50);
    expect(pageNotes(many, -3).visible).toHaveLength(50);
    expect(pageNotes([], 1)).toEqual({ visible: [], remaining: 0, lastPage: true });
    expect(pageNotes(many.slice(0, 10), 1)).toMatchObject({ remaining: 0 });
  });
  it('pages the filtered list the views render, leaving the full list intact', () => {
    const state = deriveFeedState(remote({ timeline: { ...remote().timeline!, notes: many } }), {
      ...initialLocalState(),
      pages: 2,
    });
    expect(state.notes).toHaveLength(122);
    expect(state.visibleNotes).toHaveLength(100);
    expect(state.remaining).toBe(22);
    const searched = deriveFeedState(remote({ timeline: { ...remote().timeline!, notes: many } }), {
      ...initialLocalState(),
      query: 'note 1',
    });
    // Search runs over every loaded note, then the result itself is paged.
    expect(searched.notes).toHaveLength(33);
    expect(searched.visibleNotes).toHaveLength(33);
    expect(searched.remaining).toBe(0);
    const wide = deriveFeedState(remote({ timeline: { ...remote().timeline!, notes: many } }), {
      ...initialLocalState(),
      query: 'note',
    });
    expect(wide.notes).toHaveLength(122);
    expect(wide.visibleNotes).toHaveLength(PAGE_SIZE);
    expect(wide.remaining).toBe(72);
  });
});

describe('feed selectors', () => {
  it('sorts replies oldest first and keeps undated notes in timeline position', () => {
    expect(sortOldestFirst([notes[1], notes[3]]).map((n) => n.id)).toEqual(['n4', 'n2']);
    expect(sortOldestFirst([notes[1], notes[4], notes[3]]).map((n) => n.id)).toEqual([
      'n2',
      'n5',
      'n4',
    ]);
  });

  it('counts every loaded descendant, not only direct replies, and finds loaded parents', () => {
    expect(descendantCount(notes, notes[0])).toBe(3);
    expect(descendantCount(notes, notes[1])).toBe(0);
    const deep = [
      ...notes,
      { ...notes[1], id: 'n6', inReplyTo: 'n2' },
      { ...notes[1], id: 'n7', inReplyTo: 'n6' },
    ];
    expect(descendantCount(deep, deep[0])).toBe(5);
    expect(descendantCount(deep, deep[1])).toBe(2);
    expect(parentOf(notes, notes[1])?.id).toBe('n1');
    expect(parentOf(notes, notes[2])).toBeUndefined();
    expect(parentOf(notes, notes[0])).toBeUndefined();
  });

  it("counts every note's loaded replies once per projection, the way each card used to", () => {
    const state = deriveFeedState(remote(), initialLocalState());
    expect(state.replyCounts.get('n1')).toBe(3);
    expect(state.replyCounts.get('n2')).toBeUndefined();
    expect(state.byId.get('n2')?.inReplyTo).toBe('n1');
    expect(state.byId.size).toBe(notes.length);
    // A note reported gone leaves the index and stops counting as a reply.
    const gone = deriveFeedState(remote(), { ...initialLocalState(), gone: ['n2'] });
    expect(gone.byId.has('n2')).toBe(false);
    expect(gone.replyCounts.get('n1')).toBe(2);
  });

  it('agrees with a full conversation projection for every note, cycles included', () => {
    const at = (n: number) => `2026-09-${String(n).padStart(2, '0')}T00:00:00Z`;
    const web: TimelineNote[] = [
      ...notes,
      { ...notes[1], id: 'n6', inReplyTo: 'n2', published: at(3) },
      { ...notes[1], id: 'n7', inReplyTo: 'n6', published: at(4) },
      { ...notes[1], id: 'n8', inReplyTo: 'n6', published: at(5) },
      // A loop: each is the other's parent, and a reply hangs off one of them.
      { ...notes[1], id: 'c1', inReplyTo: 'c2' },
      { ...notes[1], id: 'c2', inReplyTo: 'c1' },
      { ...notes[1], id: 'c3', inReplyTo: 'c2' },
      { ...notes[1], id: 'c4', inReplyTo: 'c3' },
      // A note answering itself.
      { ...notes[1], id: 'self', inReplyTo: 'self' },
      // The same id twice: counted once, like the projection's visited set does.
      { ...notes[1], id: 'n8', inReplyTo: 'n6' },
    ];
    const counts = descendantCounts(web);
    for (const note of web)
      expect([note.id, counts.get(note.id) ?? 0]).toEqual([
        note.id,
        projectConversation(web, note).descendants.length,
      ]);
    // c2 is c1's ancestor as much as its reply, so neither counts the other; c3 hangs off c2.
    expect(counts.get('c1')).toBeUndefined();
    expect(counts.get('c2')).toBe(2);
    expect(counts.get('c3')).toBe(1);
    expect(counts.get('self')).toBeUndefined();
    expect(descendantCount(web, web[0])).toBe(6);
  });

  it('projects a long, deep outbox in one pass rather than one walk per card', () => {
    // 4000 notes in one chain plus 4000 roots: a per-card projection would walk the
    // whole list for every card (tens of millions of steps); one pass is a few thousand.
    const many: TimelineNote[] = [];
    for (let i = 0; i < 4000; i++)
      many.push({
        ...base,
        id: `d${i}`,
        author: me,
        content: `deep ${i}`,
        ...(i > 0 ? { inReplyTo: `d${i - 1}` } : {}),
      });
    for (let i = 0; i < 4000; i++)
      many.push({ ...base, id: `r${i}`, author: me, content: `root ${i}` });
    const snapshot = remote({ timeline: { ...remote().timeline!, notes: many } });
    const started = performance.now();
    const state = deriveFeedState(snapshot, initialLocalState());
    const elapsed = performance.now() - started;
    expect(state.replyCounts.get('d0')).toBe(3999);
    expect(state.replyCounts.get('d3998')).toBe(1);
    expect(state.replyCounts.get('r7')).toBeUndefined();
    expect(state.byId.size).toBe(8000);
    // Generous: the point is the order of growth, not the machine. The old per-card walk
    // took well over a minute on this input.
    expect(elapsed).toBeLessThan(2000);
  });

  it('derives the thread, its ancestors, direct replies and the missing ancestor IRI', () => {
    const state = deriveFeedState(remote(), { ...initialLocalState(), focusedNoteId: 'n1' });
    expect(state.focusedNoteId).toBe('n1');
    expect(state.conversation?.focused.id).toBe('n1');
    expect(state.title).toBe('대화');
    expect(directReplies(state).map((n) => n.id)).toEqual(['n4', 'n2', 'n5']);
    const orphan = deriveFeedState(remote(), { ...initialLocalState(), focusedNoteId: 'n3' });
    expect(orphan.conversation?.missingAncestor).toBe('gone');
    expect(orphan.conversation?.ancestors).toEqual([]);
    const gone = deriveFeedState(remote(), { ...initialLocalState(), focusedNoteId: 'nope' });
    expect(gone).toMatchObject({ conversation: undefined, threadMissing: true, title: '대화' });
  });

  it('maps typed session failures and notices to copy and honours hidden errors', () => {
    const failed = remote({
      error: { kind: 'withdraw-rejected', code: 400 },
      notice: 'published',
    });
    const shown = deriveFeedState(failed, initialLocalState());
    expect(shown.error).toContain('좋아요/공유 취소를 거절했어요');
    expect(shown.error).toContain('(400)');
    expect(shown.notice).toBe('게시됐어요.');
    const hidden = deriveFeedState(failed, {
      ...initialLocalState(),
      hiddenError: shown.error,
      composeError: { key: 'n2', text: 'local', detail: 'why' },
      saveNotice: 'saved locally',
    });
    // No reply composer for n2 is open, so its failure falls back to the page alert.
    expect(hidden).toMatchObject({ error: 'local', errorDetail: 'why', composeError: undefined });
    expect(hidden.notice).toBe('saved locally');
    const owned = deriveFeedState(failed, {
      ...initialLocalState(),
      hiddenError: shown.error,
      reply: notes[1],
      composeError: { key: 'n2', text: 'local', detail: 'why' },
    });
    expect(owned.error).toBe('');
    expect(owned.composeError).toEqual({ key: 'n2', text: 'local', detail: 'why' });
  });

  it('reports loading only before the first timeline and lists saved links that are gone', () => {
    expect(
      deriveFeedState(remote({ connecting: true, timeline: undefined }), initialLocalState())
        .loading,
    ).toBe(true);
    expect(deriveFeedState(remote({ connecting: true }), initialLocalState()).loading).toBe(false);
    const state = deriveFeedState(remote(), { ...initialLocalState(), saved: ['old', 'n1'] });
    expect(state.missingSaved).toEqual(['old']);
  });

  describe('projectConversation', () => {
    const at = (n: number) => `2026-09-0${n}T00:00:00Z`;
    const chain: TimelineNote[] = [
      { ...base, id: 'root', author: 'a', content: 'root', inReplyTo: 'lost', published: at(1) },
      { ...base, id: 'mid', author: 'b', content: 'mid', inReplyTo: 'root', published: at(2) },
      { ...base, id: 'focus', author: 'c', content: 'focus', inReplyTo: 'mid', published: at(3) },
      { ...base, id: 'r2', author: 'd', content: 'later', inReplyTo: 'focus', published: at(5) },
      { ...base, id: 'r1', author: 'e', content: 'sooner', inReplyTo: 'focus', published: at(4) },
      { ...base, id: 'r1a', author: 'f', content: 'deep1', inReplyTo: 'r1', published: at(5) },
      { ...base, id: 'r1b', author: 'g', content: 'deep2', inReplyTo: 'r1a', published: at(6) },
      { ...base, id: 'r1c', author: 'h', content: 'deep3', inReplyTo: 'r1b', published: at(7) },
      { ...base, id: 'r1d', author: 'i', content: 'deep4', inReplyTo: 'r1c', published: at(8) },
      { ...base, id: 'r1e', author: 'j', content: 'deep5', inReplyTo: 'r1d', published: at(9) },
    ];
    const focus = chain[2];

    it('lists loaded ancestors oldest first and names the first unavailable one', () => {
      const conversation = projectConversation(chain, focus);
      expect(conversation.ancestors.map((n) => n.id)).toEqual(['root', 'mid']);
      expect(conversation.missingAncestor).toBe('lost');
      expect(conversation.focused).toBe(focus);
      const complete = projectConversation(
        chain.map((n) => (n.id === 'root' ? { ...n, inReplyTo: undefined } : n)),
        focus,
      );
      expect(complete.missingAncestor).toBeUndefined();
      expect(projectConversation(chain, chain[0]).ancestors).toEqual([]);
    });

    it('walks descendants depth-first, oldest first, with depth and parent author', () => {
      const conversation = projectConversation(chain, focus);
      expect(conversation.descendants.map((n) => [n.note.id, n.depth])).toEqual([
        ['r1', 0],
        ['r1a', 1],
        ['r1b', 2],
        ['r1c', 3],
        ['r1d', 4],
        ['r1e', 5],
        ['r2', 0],
      ]);
      const byId = Object.fromEntries(conversation.descendants.map((n) => [n.note.id, n]));
      expect(byId.r1.parentAuthor).toBeUndefined();
      expect(byId.r1a.parentAuthor).toBe('e');
      expect(byId.r1c.flattened).toBe(false);
      expect(byId.r1d.flattened).toBe(true);
      expect(byId.r1e).toMatchObject({ flattened: true, parentAuthor: 'i' });
    });

    it('never loops on cyclic inReplyTo data', () => {
      const cyclic: TimelineNote[] = [
        { ...base, id: 'x', author: 'a', content: 'x', inReplyTo: 'y' },
        { ...base, id: 'y', author: 'b', content: 'y', inReplyTo: 'x' },
      ];
      const conversation = projectConversation(cyclic, cyclic[0]);
      expect(conversation.ancestors.map((n) => n.id)).toEqual(['y']);
      expect(conversation.descendants).toEqual([]);
      expect(conversation.missingAncestor).toBeUndefined();
    });

    it('feeds the derived state: conversation, parents and direct replies agree', () => {
      const snapshot = remote({
        timeline: {
          actor: { id: me, inbox: '', outbox: '' },
          notes: chain,
          diagnostics: { ignored: 0, rejected: 0 },
          activities: [],
          deleted: [],
        },
      });
      const state = deriveFeedState(snapshot, { ...initialLocalState(), focusedNoteId: 'focus' });
      expect(state.conversation?.descendants).toHaveLength(7);
      expect(state.conversation?.ancestors.map((n) => n.id)).toEqual(['root', 'mid']);
      expect(state.conversation?.missingAncestor).toBe('lost');
      expect(directReplies(state).map((n) => n.id)).toEqual(['r1', 'r2']);
    });
  });
});

describe('thread placement', () => {
  it('opens the conversation aside only on wide screens and keeps the list heading there', () => {
    const list = deriveFeedState(remote(), initialLocalState());
    expect(threadPlacement(list, true)).toMatchObject({
      aside: false,
      listVisible: true,
      skipTarget: 'list',
      title: '타임라인',
    });
    expect(threadPlacement(list, true).inConversation.size).toBe(0);
    const open = deriveFeedState(remote(), {
      ...initialLocalState(),
      focusedNoteId: 'n1',
      view: 'mine',
    });
    const wide = threadPlacement(open, true);
    expect(wide).toMatchObject({ aside: true, listVisible: true, skipTarget: 'list' });
    expect(wide.title).toBe('내가 쓴 글');
    expect([...wide.inConversation].sort()).toEqual(['n1', 'n2', 'n4', 'n5']);
    const narrow = threadPlacement(open, false);
    expect(narrow).toMatchObject({
      aside: false,
      listVisible: false,
      skipTarget: 'main',
      title: '대화',
    });
    expect(narrow.inConversation.size).toBe(0);
    const missing = deriveFeedState(remote(), { ...initialLocalState(), focusedNoteId: 'nope' });
    expect(threadPlacement(missing, true).aside).toBe(true);
    expect(threadPlacement(missing, false).listVisible).toBe(false);
  });
  it('points the skip link at the main column before anything is loaded', () => {
    const empty = deriveFeedState(
      remote({ actor: undefined, timeline: undefined }),
      initialLocalState(),
    );
    expect(threadPlacement(empty, true).skipTarget).toBe('main');
  });
  it('peeks at replies to me without the open conversation', () => {
    const state = deriveFeedState(remote(), initialLocalState());
    expect(repliesPeek(state).map((note) => note.id)).toEqual(['n2']);
    const open = deriveFeedState(remote(), { ...initialLocalState(), focusedNoteId: 'n2' });
    expect(repliesPeek(open)).toEqual([]);
    expect(repliesPeek(state, 0)).toEqual([]);
  });
  it('caps the drawn indent at the last visual level', () => {
    expect(visualDepth({ depth: 0 })).toBe(0);
    expect(visualDepth({ depth: 3 })).toBe(3);
    expect(visualDepth({ depth: 9 })).toBe(3);
  });
});

describe('round 11: notes the server dropped, and reactions it confirmed', () => {
  const bob = 'https://social.example/users/bob';
  const reacted: TimelineNote[] = [
    { ...base, id: 'r1', author: me, content: 'a' },
    {
      ...base,
      id: 'r2',
      author: bob,
      content: 'b',
      likedBy: [me, bob],
      announcedBy: [],
      reactions: [
        { kind: 'like', actor: me, activity: 'https://social.example/likes/1' },
        { kind: 'like', actor: bob, activity: 'https://social.example/likes/2' },
      ],
    },
  ];

  it('leaves the notes alone when nothing was confirmed or nobody is reading', () => {
    expect(withConfirmedReactions(reacted, me, {})).toBe(reacted);
    expect(withConfirmedReactions(reacted, undefined, { r1: { like: true } })).toBe(reacted);
  });

  it('shows a confirmed like and drops a withdrawn one with its activity', () => {
    const liked = withConfirmedReactions(reacted, me, { r1: { like: true, share: true } });
    expect(liked[0].likedBy).toEqual([me]);
    expect(liked[0].announcedBy).toEqual([me]);
    // No activity IRI is invented: only a load can say what the server called it.
    expect(liked[0].reactions).toEqual([]);
    const withdrawn = withConfirmedReactions(reacted, me, { r2: { like: false } });
    expect(withdrawn[1].likedBy).toEqual([bob]);
    expect(withdrawn[1].reactions.map((r) => r.actor)).toEqual([bob]);
    // The loaded notes themselves are never mutated.
    expect(reacted[1].likedBy).toEqual([me, bob]);
  });

  it('is a no-op once a load already carries the confirmed state', () => {
    const same = withConfirmedReactions(reacted, me, { r2: { like: true } });
    expect(same[1]).toBe(reacted[1]);
  });

  it('takes a note the server reported gone out of every list at once', () => {
    const state = deriveFeedState(remote(), { ...initialLocalState(), gone: ['n1'] });
    expect(state.all.map((note) => note.id)).not.toContain('n1');
    expect(state.notes.map((note) => note.id)).not.toContain('n1');
    // A conversation open on the gone note reports it as missing rather than showing it.
    const open = deriveFeedState(remote(), {
      ...initialLocalState(),
      gone: ['n1'],
      focusedNoteId: 'n1',
    });
    expect(open.conversation).toBeUndefined();
    expect(open.threadMissing).toBe(true);
  });
});

describe('round 12: what the notice bar shows', () => {
  it('drops a session notice once a newer write has begun, and keeps a local one', () => {
    expect(currentNotice('', 'edited', false)).toBe('글을 수정했어요.');
    // The write that follows a confirmation takes the confirmation off screen with it.
    expect(currentNotice('', 'edited', true)).toBe('');
    expect(currentNotice('', undefined, false)).toBe('');
    // A local notice is produced by the action being reported, so it is always the current one.
    expect(currentNotice('저장했어요.', 'edited', true)).toBe('저장했어요.');
  });
  it('is what the feed state reports, so a superseded confirmation never renders', () => {
    const local = { ...initialLocalState(), noticeSuperseded: true };
    expect(deriveFeedState(remote({ notice: 'published' }), local).notice).toBe('');
    expect(deriveFeedState(remote({ notice: 'published' }), initialLocalState()).notice).not.toBe(
      '',
    );
  });
  it('offers the persistence reminder only while the view model says so', () => {
    expect(deriveFeedState(remote(), initialLocalState()).sessionHint).toBe(false);
    expect(
      deriveFeedState(remote(), { ...initialLocalState(), sessionHint: true }).sessionHint,
    ).toBe(true);
  });
});

describe('round 13: a read in flight disables nothing', () => {
  it('reports refreshing apart from connecting and never as the first load', () => {
    const state = deriveFeedState(remote({ refreshing: true }), initialLocalState());
    expect(state).toMatchObject({ connecting: false, refreshing: true, loading: false });
    expect('busy' in state).toBe(false);
    expect(deriveFeedState(remote(), initialLocalState()).refreshing).toBe(false);
  });
});

describe('round 16: a one-person timeline', () => {
  const me = 'https://social.example/users/me';
  it("is solo only while every loaded note is the reader's own", () => {
    expect(isSoloAuthor([{ author: me }, { author: me }], me)).toBe(true);
    expect(isSoloAuthor([{ author: me }, { author: 'https://social.example/users/bob' }], me)).toBe(
      false,
    );
    // Nothing loaded says nothing; nobody reading has no "own" notes.
    expect(isSoloAuthor([], me)).toBe(false);
    expect(isSoloAuthor([{ author: me }], '')).toBe(false);
  });
  it('reports it on the feed state from the loaded notes', () => {
    const state = deriveFeedState(
      remote({
        timeline: {
          ...remote().timeline!,
          notes: [{ ...base, id: 'n1', author: me, content: 'mine' }],
        },
      }),
      initialLocalState(),
    );
    expect(state.soloAuthor).toBe(true);
    expect(deriveFeedState(remote(), initialLocalState()).soloAuthor).toBe(false);
  });
});

describe('round 17: a parent that is gone, the foot under a search, and the depth cue', () => {
  const bob = 'https://social.example/users/bob';
  const tombstoned = [
    {
      id: 'https://social.example/activities/1',
      type: 'Create',
      actor: me,
      object: { id: 'n1', type: 'Tombstone', formerType: 'Note' },
    },
    // What the read-back of a deleted note becomes: this actor's Update carrying a Tombstone.
    {
      id: 'n9#read-back',
      type: 'Update',
      actor: me,
      object: { id: 'n9', type: 'Tombstone', formerType: 'Note' },
    },
    { id: 'n8', type: 'Tombstone', formerType: 'Note' },
    { id: 'https://social.example/activities/3', type: 'Create', actor: me, object: { id: 'n7' } },
  ];
  /** What the evaluator accepts as deletions from `tombstoned`: the domain's rule, not a second one here. */
  const deleted = evaluateActivities(tombstoned).deleted;
  it('takes the deletions the evaluator accepted, not every Delete the server relayed', () => {
    expect([...deleted].sort()).toEqual(['n1', 'n8', 'n9']);
    // An inbox Delete from another actor over my note is refused by the domain and must not
    // hide the note here either: it stays on my timeline and its reply keeps "원글 보기".
    const mine = 'https://social.example/notes/1';
    const relayed = evaluateActivities([
      {
        id: 'https://social.example/activities/c1',
        type: 'Create',
        actor: me,
        object: { id: mine, type: 'Note', attributedTo: me, content: '<p>mine</p>' },
      },
      { id: 'https://other.example/activities/d1', type: 'Delete', actor: bob, object: mine },
    ]);
    expect(relayed.notes.map((note) => note.id)).toEqual([mine]);
    expect(relayed.diagnostics.rejected).toBe(1);
    expect(relayed.deleted).toEqual([]);
    // Mastodon's real Delete carries a Tombstone rather than a bare IRI; relayed from bob it
    // is refused the same way, and the note stays on screen.
    const relayedTombstone = evaluateActivities([
      {
        id: 'https://social.example/activities/c1',
        type: 'Create',
        actor: me,
        object: { id: mine, type: 'Note', attributedTo: me, content: '<p>mine</p>' },
      },
      {
        id: 'https://other.example/activities/d2',
        type: 'Delete',
        actor: bob,
        object: { id: mine, type: 'Tombstone', formerType: 'Note' },
      },
    ]);
    expect(relayedTombstone.notes.map((note) => note.id)).toEqual([mine]);
    expect(relayedTombstone.diagnostics.rejected).toBe(1);
    expect(relayedTombstone.deleted).toEqual([]);
    const withTombstone = deriveFeedState(
      remote({
        timeline: {
          ...remote().timeline!,
          notes: relayedTombstone.notes,
          activities: [],
          deleted: relayedTombstone.deleted,
        },
      }),
      initialLocalState(),
    );
    expect(withTombstone.all.some((note) => note.id === mine)).toBe(true);
    expect(withTombstone.gone.has(mine)).toBe(false);
    const state = deriveFeedState(
      remote({
        timeline: { ...remote().timeline!, activities: [], deleted: relayed.deleted },
      }),
      initialLocalState(),
    );
    expect(state.all.some((note) => note.id === 'n1')).toBe(true);
    expect(state.gone.has('n1')).toBe(false);
    expect(parentState(state.all, notes[1], state.gone)).toBe('loaded');
  });
  it('tells a loaded parent from a gone one from one it never saw', () => {
    const gone = new Set(['gone']);
    expect(parentState(notes, notes[1], new Set())).toBe('loaded');
    // n3 answers 'gone', which the timeline never held: nothing is known about it.
    expect(parentState(notes, notes[2], new Set())).toBe('unknown');
    expect(parentState(notes, notes[2], gone)).toBe('gone');
    expect(parentState(notes, notes[0], gone)).toBe('unknown');
    // A loaded parent is loaded even if something also claims it is gone.
    expect(parentState(notes, notes[1], new Set(['n1']))).toBe('loaded');
  });
  it('folds deletes made here and tombstones the server sent into one gone set', () => {
    const state = deriveFeedState(remote({ timeline: { ...remote().timeline!, deleted } }), {
      ...initialLocalState(),
      gone: ['n2'],
    });
    expect([...state.gone].sort()).toEqual(['n1', 'n2', 'n8', 'n9']);
    // A reply to the deleted n1 now reports its parent gone, not as a link to open.
    expect(parentState(state.all, notes[3], state.gone)).toBe('gone');
    // After a re-read clears the local record the tombstone still says so.
    const reread = deriveFeedState(
      remote({ timeline: { ...remote().timeline!, deleted } }),
      initialLocalState(),
    );
    expect(reread.gone.has('n1')).toBe(true);
    expect(reread.gone.has('n2')).toBe(false);
  });
  it('says what the foot counts: matches under a search, saved notes in the saved list', () => {
    const loaded = Array.from({ length: 505 }, (_, index) => ({
      ...base,
      id: `s${index}`,
      author: me,
      content: index < 7 ? `찾는 글 ${index}` : `다른 글 ${index}`,
    }));
    const at = (patch: Partial<typeof local>) => {
      const state = deriveFeedState(
        remote({ timeline: { ...remote().timeline!, notes: loaded } }),
        { ...local, ...patch },
      );
      return feedFootLine(state);
    };
    const local = initialLocalState();
    expect(at({ query: '찾는' })).toBe('검색 결과 7개 · 불러온 글 505개');
    expect(at({ view: 'saved', saved: ['s3'] })).toBe('저장한 글 1개 · 불러온 글 505개');
    expect(at({})).toBe('불러온 글 505개 중 50개 표시');
    // A search wide enough to page says how many of its results are on screen.
    expect(at({ query: '글' })).toBe('검색 결과 505개 · 불러온 글 505개 · 50개 표시');
    expect(at({ query: '없는 말' })).toBe('');
    expect(at({ view: 'saved' })).toBe('');
  });
  it('counts a search inside a scoped view against that scope, not against everything loaded', () => {
    const loaded = Array.from({ length: 505 }, (_, index) => ({
      ...base,
      id: `s${index}`,
      author: index % 5 === 0 ? bob : me,
      content: index < 7 ? `찾는 글 ${index}` : `다른 글 ${index}`,
    }));
    const local = initialLocalState();
    const at = (patch: Partial<typeof local>) =>
      feedFootLine(
        deriveFeedState(remote({ timeline: { ...remote().timeline!, notes: loaded } }), {
          ...local,
          ...patch,
        }),
      );
    // Only the three saved notes were searched, and two of them matched.
    expect(at({ view: 'saved', saved: ['s1', 's2', 's9'], query: '찾는' })).toBe(
      '저장한 글 중 검색 결과 2개 · 저장한 글 3개',
    );
    // 'mine' holds the 404 notes by me; five of the seven matches are mine.
    expect(at({ view: 'mine', query: '찾는' })).toBe(
      '내가 쓴 글 중 검색 결과 5개 · 내가 쓴 글 404개',
    );
    // An author filter is a scope of its own: bob's 101 notes, two of which matched.
    expect(at({ authorFilter: bob, query: '찾는' })).toBe(
      'bob의 글 중 검색 결과 2개 · bob의 글 101개',
    );
    // A paged scoped search still says how much of it is on screen.
    expect(at({ authorFilter: bob, query: '글' })).toBe(
      'bob의 글 중 검색 결과 101개 · bob의 글 101개 · 50개 표시',
    );
    // Nothing matched: nothing to count.
    expect(at({ view: 'saved', saved: ['s9'], query: '찾는' })).toBe('');
    // Without a query the scoped views keep their own lines.
    expect(at({ view: 'saved', saved: ['s1'] })).toBe('저장한 글 1개 · 불러온 글 505개');
    expect(at({ view: 'mine' })).toBe('불러온 글 404개 중 50개 표시');
  });
  it('reads 이어서 over a nested reply that continues its own author, and "…에게" otherwise', () => {
    const self = { id: me, preferredUsername: 'me' };
    expect(threadCue({ parentAuthor: me, note: { author: me } }, self)).toBe('이어서');
    expect(threadCue({ parentAuthor: bob, note: { author: me } }, self)).toBe('bob에게');
    expect(threadCue({ parentAuthor: bob, note: { author: bob } }, self)).toBe('이어서');
    expect(threadCue({ parentAuthor: undefined, note: { author: me } }, self)).toBe('');
  });
});
