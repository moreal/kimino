import type { ReadImage } from '../application/image-reader';
import { CollectionReadCancelled } from '../application/collection-read';
import {
  createAccountDiscovery,
  type AccountDiscoveryGateway,
} from '../application/account-discovery';
import { validateImages, IMAGE_LIMITS, type ImageDraft } from '../domain/images';
import { mutedAuthorIds } from './reading-controls';
import { readingCopy } from './copy-reading';
import type { NoteDraft, ReactionKind, TimelineNote } from '../domain/social';
import {
  DEMO_ACTOR,
  SessionError,
  type ConnectionCredentials,
  type SocialSessionSnapshot,
} from '../application/social-session';
import { createGuard } from '../application/guard';
import type { Density, Preferences } from './ports';
import { copy, notices } from './copy';
import { describeError, describeFailure, failureText, noticeText } from './copy-failures';
import { editDraftText, type FeedView } from './feed';
import {
  deriveFeedState,
  editKey,
  initialLocalState,
  type ComposeOptions,
  type FeedLocalState,
  type FeedState,
} from './feed-selectors';
import { replyLimit } from '../domain/note-content';
import { reactedBy } from './note-display';
import { saveLinks, toggleLink } from './saved-links';
import { shouldOfferSessionHint } from './session-restore';

export type { FeedState } from './feed-selectors';

/** The slice of the social session the feed depends on (structurally matches SocialSession). */
export interface FeedSession {
  getSnapshot(): SocialSessionSnapshot;
  subscribe(listener: (snapshot: SocialSessionSnapshot) => void): () => void;
  connect(credentials: ConnectionCredentials): Promise<void>;
  /** Resolves once the requested read settled, with whether one was started at all. */
  refresh(): Promise<boolean>;
  continueReading?(): boolean;
  cancelReading?(): void;
  continueRelationshipReading?(): boolean;
  cancelRelationshipReading?(): void;
  publish(draft: NoteDraft, replyTo?: TimelineNote): Promise<void>;
  react(note: TimelineNote, kind: ReactionKind, active: boolean): Promise<void>;
  /** Delete one of the reader's own notes. */
  deleteNote(note: TimelineNote): Promise<void>;
  /** Replace the content and content warning of one of the reader's own notes. */
  editNote(note: TimelineNote, draft: NoteDraft): Promise<void>;
  loadRelationships?(): Promise<void>;
  follow?(target: string): Promise<void>;
  unfollow?(target: string): Promise<void>;
  resolveImage?(id: string): Promise<void>;
  loadImage?(noteId: string, url: string, signal: AbortSignal): Promise<ReadImage>;
  discardImage?(id: string): void;
  disconnect(): void;
}

/** A refusal because the server no longer holds the note the write was aimed at. */
const isGone = (error: unknown): boolean =>
  error instanceof SessionError && error.failure.kind === 'note-gone';

/** DOM concerns the view model needs but must not touch itself; implemented by the app shell. */
export interface FocusPort {
  focusReplyComposer(noteId: string): void;
  /** After the edit composer opens on a note: into the text it was prefilled with. */
  focusEditComposer(noteId: string): void;
  /** Nothing to come back to (a deleted note): focus lands on the list itself. */
  focusList(): void;
  /** After a reply composer closes: back to the reply button of the note it belonged to. */
  focusReplyButton(noteId: string): void;
  focusMainComposer(): void;
  focusHeading(): void;
  /** Leaving a conversation: the 대화 button of the card it was opened from, plus its scroll. */
  restore(noteId: string | undefined, scrollY: number): void;
  /** Leaving a conversation by keyboard: the timeline card itself, so j/k continue from it. */
  focusCard(noteId: string | undefined, scrollY: number): void;
}

export function createFeedViewModel(
  session: FeedSession,
  preferences: Preferences,
  focus: FocusPort,
  discoveryGateway?: AccountDiscoveryGateway,
) {
  let local: FeedLocalState = {
    ...initialLocalState(),
    density: preferences.readDensity(),
    revealWarned: preferences.readRevealWarned(),
  };
  let remote = session.getSnapshot();
  const loadMuted = () =>
    remote.actor && !remote.demo
      ? mutedAuthorIds(preferences.readMuted(remote.actor.id), remote.actor.id)
      : [];
  local.muted = loadMuted();
  let returnId: string | undefined;
  let returnScroll = 0;
  let imageSequence = 0;
  /** Bumped by connect/explore/disconnect so a late POST rejection cannot mark a newer session. */
  const guard = createGuard();
  const listeners = new Set<(state: FeedState) => void>();

  const discovery = createAccountDiscovery(discoveryGateway, emit);
  local.discovery = discovery.getSnapshot();
  let state = deriveFeedState(remote, local);

  function emit() {
    local.discovery = discovery.getSnapshot();
    state = deriveFeedState(remote, local);
    for (const listener of listeners) listener(state);
  }
  function patch(next: Partial<FeedLocalState>) {
    local = { ...local, ...next };
    emit();
  }
  /** Everything view-local goes back to the start; the browser settings stay as they are. */
  const fresh = (): FeedLocalState => ({
    ...initialLocalState(),
    density: local.density,
    revealWarned: local.revealWarned,
  });
  const unsubscribe = session.subscribe((snapshot) => {
    const previous = remote;
    remote = snapshot;
    if (previous.actor?.id !== remote.actor?.id || previous.demo !== remote.demo) {
      local.muted = loadMuted();
      local.moderationOpen = false;
      local.peopleOpen = false;
      discovery.reset();
    }
    // A newer session notice or a fresh request supersedes an older local notice.
    if (snapshot.notice && snapshot.notice !== previous.notice) {
      local.saveNotice = '';
      local.noticeSuperseded = false;
      local.noticeId += 1;
    }
    // A successful read is newer than any write this client confirmed before it.
    if (snapshot.loadedAt && snapshot.loadedAt !== previous.loadedAt) local.confirmed = {};
    emit();
  });

  /** The session's current page error as text, for comparing against locally shown messages. */
  const sessionError = () => failureText(remote.error);
  /** A local notice: shown now, and re-announced even when the words are the same as before. */
  const notice = (saveNotice: string) => ({ saveNotice, noticeId: local.noticeId + 1 });
  /**
   * A new write is beginning - the POST itself, or the composer or confirmation that starts
   * one. Whatever the last write confirmed goes off screen now rather than sitting over the
   * action that replaces it, in either direction: a local notice and a session notice both.
   */
  const startingWrite = (): Partial<FeedLocalState> => ({
    saveNotice: '',
    noticeSuperseded: true,
  });
  /**
   * The POST itself is being sent: what an earlier request left on screen - a rejected
   * publish, a page alert already answered inline - is over, whatever this one does.
   */
  const sending = (): Partial<FeedLocalState> => ({
    ...startingWrite(),
    composeError: undefined,
    hiddenError: '',
  });
  /** Reactions out or waiting their turn, by note id: a second tap on one of them is nothing. */
  const reacting = new Set<string>();
  /**
   * The persistence reminder is offered at most once per page session, and only in memory:
   * declining it, like accepting it, writes nothing anywhere.
   */
  let hintOffered = false;
  function save(next: string[], adding: boolean) {
    const result = saveLinks(
      preferences,
      { actor: remote.actor?.id, demo: remote.demo },
      next,
      adding,
    );
    patch({ saved: result.saved, ...notice(result.saveNotice) });
  }
  /** Alerts are view-local: any navigation hides the current page alert. */
  const dismissed = () => ({ composeError: undefined, hiddenError: sessionError() });
  /** A rejected publish belongs to its composer; the session's copy of it stays quiet. */
  function fail(key: string, error: unknown, started: number) {
    if (!guard.isCurrent(started)) return;
    const message = describeFailure(error);
    patch({
      composeError: { key, ...message },
      hiddenError: sessionError() === message.text ? message.text : local.hiddenError,
    });
  }
  function withoutError(id: string): Record<string, string> {
    const { [id]: _dropped, ...rest } = local.actionError;
    return rest;
  }
  /**
   * A reaction or deletion the server refused, kept beside its note. The session records
   * the same failure globally; the page alert stays quiet about it while the note shows it.
   */
  const noteFailed = (id: string, error: unknown): Partial<FeedLocalState> => {
    const message = describeError(error);
    return {
      actionError: { ...local.actionError, [id]: message },
      hiddenError: sessionError() === message ? message : local.hiddenError,
    };
  };
  /** The edit form under `key` is over: its unsent words and choices go with it. */
  const dropEdit = (key: string): Partial<FeedLocalState> => {
    const { [key]: _text, ...drafts } = local.drafts;
    const { [key]: _options, ...composeOptions } = local.composeOptions;
    return { drafts, composeOptions };
  };
  /** The note is gone from the server: it leaves the list now, not at the next successful read. */
  const dropped = (id: string): Partial<FeedLocalState> => {
    const editing = editKey(id);
    for (const key of [id, editing])
      for (const image of local.draftImages[key] ?? []) session.discardImage?.(image.id);
    const { [id]: _replyImages, [editing]: _editImages, ...draftImages } = local.draftImages;
    const { [id]: _reply, [editing]: _edit, ...drafts } = local.drafts;
    const {
      [id]: _replyOptions,
      [editing]: _editOptions,
      ...composeOptions
    } = local.composeOptions;
    return {
      gone: local.gone.includes(id) ? local.gone : [...local.gone, id],
      draftImages,
      drafts,
      composeOptions,
    };
  };

  return {
    getSnapshot: () => state,
    subscribe(listener: (state: FeedState) => void) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    async loadImage(noteId: string, url: string, signal: AbortSignal): Promise<ReadImage> {
      if (!session.loadImage) throw new SessionError({ kind: 'media-unsupported' });
      return session.loadImage(noteId, url, signal);
    },
    continueReading: () => session.continueReading?.() ?? false,
    cancelReading: () => session.cancelReading?.(),
    continueRelationshipReading: () => session.continueRelationshipReading?.() ?? false,
    cancelRelationshipReading: () => session.cancelRelationshipReading?.(),
    /** Stops observing the session; the shell calls this when the view goes away. */
    dispose() {
      session.cancelReading?.();
      session.cancelRelationshipReading?.();
      discovery.dispose();
      unsubscribe();
      listeners.clear();
    },
    /**
     * `remember` is what the connect form's checkbox said. It is not stored here - the
     * persistence wrapper owns that - it only decides whether this session ends up offering
     * the reminder that, without it, a reload asks for the token again.
     */
    async connect(url: string, token: string, remember = false, mediaMode?: 'oni') {
      if (remote.connecting) return;
      guard.next();
      discovery.reset();
      patch({ ...fresh(), muted: loadMuted() });
      await session.connect({ actorUrl: url, token, ...(mediaMode ? { mediaMode } : {}) });
      const actor = remote.actor;
      if (actor) {
        // "demo" typed as the URL lands on the sample gateway; that is never a remembered account.
        if (!remote.demo) preferences.write('actor', actor.id);
        const hint = shouldOfferSessionHint({
          connected: true,
          demo: remote.demo,
          remembered: remember,
          offered: hintOffered,
        });
        if (hint) hintOffered = true;
        patch({ saved: preferences.readSaved(actor.id), sessionHint: hint });
      }
    },
    /** Closes the persistence reminder for good in this page session; nothing is written. */
    dismissSessionHint() {
      patch({ sessionHint: false });
    },
    async explore() {
      if (remote.connecting) return;
      guard.next();
      discovery.reset();
      patch(fresh());
      await session.connect({ actorUrl: DEMO_ACTOR, token: '' });
    },
    disconnect() {
      guard.next();
      discovery.reset();
      reacting.clear();
      session.disconnect();
      returnId = undefined;
      returnScroll = 0;
      patch(fresh());
    },
    /**
     * Switching lists closes the inline reply (its draft stays), drops per-note feedback and
     * the author filter, and hides the current page alert.
     */
    navigate(view: FeedView) {
      session.cancelRelationshipReading?.();
      patch({
        ...dismissed(),
        ...startingWrite(),
        view,
        focusedNoteId: undefined,
        reply: undefined,
        confirmDelete: undefined,
        editing: undefined,
        query: '',
        actionError: {},
        authorFilter: undefined,
        actorSheet: undefined,
        peopleOpen: false,
        pages: 1,
      });
    },
    /** Hides the current page-level alert until a new request reports something. */
    dismissError() {
      patch(dismissed());
    },
    setQuery(query: string) {
      patch({ query, pages: 1 });
    },
    /**
     * One more page of the notes this list already holds. Nothing is fetched: the server
     * pages the timeline once, at load, and this only decides how much of it is on screen.
     */
    showMore() {
      patch({ pages: local.pages + 1 });
    },
    /** Desktop reading density, remembered in this browser (never content). */
    setDensity(density: Density) {
      preferences.writeDensity(density);
      patch({ density });
    },
    /** Warned notes open by themselves, remembered in this browser like the density. */
    setRevealWarned(on: boolean) {
      preferences.writeRevealWarned(on);
      patch({ revealWarned: on });
    },
    toggleHelp() {
      patch({ helpOpen: !local.helpOpen });
    },
    closeHelp() {
      patch({ helpOpen: false });
    },
    /** Identity is loaded data; a real account also reads its own relationship evidence. */
    openActor(id: string) {
      if (id === remote.actor?.id) session.cancelRelationshipReading?.();
      patch({ actorSheet: id, peopleOpen: false });
      if (!remote.demo && id !== remote.actor?.id)
        void session.loadRelationships?.().catch(() => undefined);
    },
    closeActor() {
      session.cancelRelationshipReading?.();
      patch({ actorSheet: undefined });
    },
    openPeople() {
      if (!remote.actor || remote.connecting) return;
      patch({ peopleOpen: true, actorSheet: undefined, helpOpen: false, moderationOpen: false });
      if (!remote.demo) void session.loadRelationships?.().catch(() => undefined);
    },
    closePeople() {
      session.cancelRelationshipReading?.();
      patch({ peopleOpen: false });
    },
    setDiscoveryInput(input: string) {
      if (!remote.actor || remote.demo || remote.connecting) return;
      discovery.setInput(input);
    },
    async lookupAccount() {
      if (!remote.actor || remote.demo || remote.connecting) return;
      await discovery.lookup();
    },
    async loadRelationships() {
      if (!session.loadRelationships) throw new SessionError({ kind: 'relationship-unsupported' });
      await session.loadRelationships();
    },
    async follow(target: string) {
      if (!session.follow) throw new SessionError({ kind: 'relationship-unsupported' });
      try {
        await session.follow(target);
      } catch (error) {
        if (!(error instanceof CollectionReadCancelled)) throw error;
      }
    },
    async unfollow(target: string) {
      if (!session.unfollow) throw new SessionError({ kind: 'relationship-unsupported' });
      try {
        await session.unfollow(target);
      } catch (error) {
        if (!(error instanceof CollectionReadCancelled)) throw error;
      }
    },
    openModeration() {
      session.cancelRelationshipReading?.();
      patch({ moderationOpen: true, actorSheet: undefined, peopleOpen: false });
    },
    closeModeration() {
      patch({ moderationOpen: false });
    },
    hideAuthor(id: string) {
      if (!remote.actor || id === remote.actor.id || local.muted.includes(id)) return;
      const muted = mutedAuthorIds([...local.muted, id], remote.actor.id);
      if (!muted.includes(id)) return;
      const stored = !remote.demo && preferences.writeMuted(remote.actor.id, muted);
      session.cancelRelationshipReading?.();
      const hidden = (noteId: string | undefined) =>
        !!noteId && remote.timeline?.notes.some((note) => note.id === noteId && note.author === id);
      patch({
        muted,
        actorSheet: undefined,
        authorFilter: undefined,
        pages: 1,
        reply: local.reply?.author === id ? undefined : local.reply,
        editing: hidden(local.editing) ? undefined : local.editing,
        confirmDelete: hidden(local.confirmDelete) ? undefined : local.confirmDelete,
        focusedNoteId: hidden(local.focusedNoteId) ? undefined : local.focusedNoteId,
        ...notice(
          remote.demo ? readingCopy.demo : stored ? readingCopy.persisted : readingCopy.temporary,
        ),
      });
      focus.focusHeading();
    },
    unhideAuthor(id: string) {
      if (!remote.actor || !local.muted.includes(id)) return;
      const muted = local.muted.filter((author) => author !== id);
      const stored = !remote.demo && preferences.writeMuted(remote.actor.id, muted);
      patch({
        muted,
        pages: 1,
        ...notice(
          remote.demo
            ? readingCopy.restoredDemo
            : stored
              ? readingCopy.restored
              : readingCopy.temporary,
        ),
      });
    },
    /** "이 사람의 글만 보기": a client-side filter over loaded notes; the list comes back on screen. */
    filterAuthor(id: string) {
      session.cancelRelationshipReading?.();
      patch({
        authorFilter: id,
        actorSheet: undefined,
        focusedNoteId: undefined,
        query: '',
        pages: 1,
      });
    },
    clearAuthorFilter() {
      patch({ authorFilter: undefined, pages: 1 });
    },
    compose() {
      patch({ focusedNoteId: undefined });
      focus.focusMainComposer();
    },
    chooseReply(note: TimelineNote) {
      if (local.muted.includes(note.author) && note.author !== remote.actor?.id) return;
      patch({ ...startingWrite(), reply: note });
      focus.focusReplyComposer(note.id);
    },
    /**
     * Escape or 취소 in the reply composer: closes it, puts focus back on the note's reply
     * button and, when words were typed, says where they went (the draft stays with its
     * note). Returns whether a draft was kept.
     */
    dismissReply(): boolean {
      const reply = local.reply;
      const kept =
        !!reply &&
        ((local.drafts[reply.id] || '').trim().length > 0 || !!local.draftImages[reply.id]?.length);
      patch({ reply: undefined, ...(kept ? notice(notices.replyDraftKept) : {}) });
      if (reply) focus.focusReplyButton(reply.id);
      return kept;
    },
    /** Replaces the saved list without a notice: restoring a remembered preview tab. */
    setSaved(ids: string[]) {
      patch({ saved: [...ids] });
    },
    openThread(note: TimelineNote, scrollY = 0) {
      if (local.muted.includes(note.author) && note.author !== remote.actor?.id) return;
      if (!local.focusedNoteId) {
        returnId = note.id;
        returnScroll = scrollY;
      }
      patch({ ...dismissed(), focusedNoteId: note.id });
      focus.focusHeading();
    },
    closeThread() {
      patch({ ...dismissed(), focusedNoteId: undefined });
      focus.restore(returnId, returnScroll);
    },
    /** Escape on a conversation card: back to the timeline card the conversation came from. */
    leaveThread() {
      patch({ ...dismissed(), focusedNoteId: undefined });
      focus.focusCard(returnId, returnScroll);
    },
    toggleSave(note: TimelineNote) {
      const { next, adding } = toggleLink(local.saved, note.id);
      save(next, adding);
    },
    removeSaved(id: string) {
      save(
        local.saved.filter((savedId) => savedId !== id),
        false,
      );
    },
    /** Selected bytes and alt text stay here, never in browser preferences or tab restore. */
    addDraftImage(key: string, image: Omit<ImageDraft, 'id'>) {
      if (local.publishing.includes(key)) return;
      if (!remote.actor || remote.connecting || !state.imageUploadEnabled) return;
      const next = [
        ...(local.draftImages[key] ?? []),
        { ...image, id: `image-${++imageSequence}` },
      ];
      const reason = validateImages(next);
      if (reason) {
        fail(key, new SessionError({ kind: 'media-invalid', reason }), guard.current());
        return;
      }
      patch({ draftImages: { ...local.draftImages, [key]: next } });
    },
    removeDraftImage(key: string, id: string) {
      if (local.publishing.includes(key)) return;
      session.discardImage?.(id);
      patch({
        draftImages: {
          ...local.draftImages,
          [key]: (local.draftImages[key] ?? []).filter((image) => image.id !== id),
        },
      });
    },
    setImageAlt(key: string, id: string, alt: string) {
      if (local.publishing.includes(key)) return;
      patch({
        draftImages: {
          ...local.draftImages,
          [key]: (local.draftImages[key] ?? []).map((image) =>
            image.id === id ? { ...image, alt: alt.slice(0, IMAGE_LIMITS.alt) } : image,
          ),
        },
      });
    },
    async resolveImage(key: string, id: string) {
      const started = guard.current();
      try {
        if (!session.resolveImage) throw new SessionError({ kind: 'media-unsupported' });
        await session.resolveImage(id);
        if (guard.isCurrent(started))
          patch({ composeError: undefined, hiddenError: sessionError() });
      } catch (error) {
        fail(key, error, started);
        throw error;
      }
    },
    setDraft(key: string, value: string) {
      if (local.publishing.includes(key)) return;
      patch({ drafts: { ...local.drafts, [key]: value } });
    },
    setComposeOptions(key: string, value: ComposeOptions) {
      if (local.publishing.includes(key)) return;
      patch({ composeOptions: { ...local.composeOptions, [key]: value } });
    },
    /**
     * An explicit reload asks the server again about everything, including the notes this
     * client last saw reported as gone - but only once the server has actually been asked.
     * A request the session folds into a read already on its way clears nothing: a card
     * reported gone does not come back on the strength of a button press alone.
     */
    async refresh() {
      const started = guard.current();
      const before = remote.loadedAt;
      patch(startingWrite());
      const ran = await session.refresh();
      // Only a read that landed makes what is on screen older than the server: a read that
      // failed, or was superseded by a write's own read, leaves every inline message where
      // it is, including one a write put there while this read was out.
      if (!ran || !guard.isCurrent(started) || remote.loadedAt === before) return;
      patch({ composeError: undefined, actionError: {}, gone: [] });
    },
    toggleReveal(id: string) {
      patch({
        revealed: local.revealed.includes(id)
          ? local.revealed.filter((shown) => shown !== id)
          : [...local.revealed, id],
      });
    },
    /** Resolves when the server accepted the write; the reply composer closes even if re-load failed. */
    async publish(draft: NoteDraft, replyTo?: TimelineNote) {
      const key = replyTo?.id ?? 'new';
      if (local.publishing.includes(key)) throw new SessionError({ kind: 'busy' });
      const started = guard.current();
      patch({ ...sending(), publishing: [...local.publishing, key] });
      try {
        const images = local.draftImages[key];
        await session.publish(images?.length ? { ...draft, images } : draft, replyTo);
        if (!guard.isCurrent(started)) throw new SessionError({ kind: 'not-connected' });
        const { [key]: _sent, ...composeOptions } = local.composeOptions;
        const { [key]: _text, ...drafts } = local.drafts;
        const { [key]: _images, ...draftImages } = local.draftImages;
        patch({
          composeOptions,
          drafts,
          draftImages,
          ...(replyTo && local.reply?.id === replyTo.id ? { reply: undefined } : {}),
        });
      } catch (error) {
        fail(key, error, started);
        throw error;
      } finally {
        if (guard.isCurrent(started))
          patch({ publishing: local.publishing.filter((pending) => pending !== key) });
      }
    },
    /**
     * Opens the delete confirmation for one note. Nothing is sent here: the confirmation is
     * the only thing that can start a deletion, and it is never a key press away.
     */
    askDelete(note: TimelineNote) {
      patch({ ...startingWrite(), confirmDelete: note.id, actionError: withoutError(note.id) });
    },
    cancelDelete() {
      patch({ confirmDelete: undefined });
    },
    /**
     * The confirmed deletion. Once the server accepts it, the note leaves the list, its
     * unsent drafts go with it and an open conversation on it is closed with a reason.
     */
    async deleteNote(note: TimelineNote) {
      if (local.deleting.includes(note.id)) return;
      const started = guard.current();
      patch({
        ...sending(),
        actionError: withoutError(note.id),
        deleting: [...local.deleting, note.id],
      });
      // This note's deletion alone is answered; another note's stays out.
      const settled = () => ({ deleting: local.deleting.filter((id) => id !== note.id) });
      try {
        await session.deleteNote(note);
      } catch (error) {
        if (!guard.isCurrent(started)) return;
        patch({ ...noteFailed(note.id, error), ...settled() });
        return;
      }
      if (!guard.isCurrent(started)) return;
      patch(settled());
      const closed = local.focusedNoteId === note.id;
      patch({
        ...dropped(note.id),
        confirmDelete: undefined,
        editing: local.editing === note.id ? undefined : local.editing,
        reply: local.reply?.id === note.id ? undefined : local.reply,
        focusedNoteId: closed ? undefined : local.focusedNoteId,
        // The session says what actually happened - a deletion, or a note that was already
        // gone - and the local notice repeats that word rather than assuming one.
        ...(closed
          ? notice(`${noticeText(remote.notice ?? 'deleted')} ${copy.own.threadClosed}`)
          : {}),
      });
      // The card that had focus is gone; the list takes it rather than the document body.
      focus.focusList();
    },
    /**
     * Reopens the composer on one of my notes with what the server currently stores. An
     * edit that was started and left unsent keeps its own words instead of being reset.
     */
    startEdit(note: TimelineNote) {
      const key = editKey(note.id);
      patch({
        editing: note.id,
        confirmDelete: undefined,
        reply: local.reply?.id === note.id ? undefined : local.reply,
        ...startingWrite(),
        composeError: undefined,
        actionError: withoutError(note.id),
        drafts: { ...local.drafts, [key]: editDraftText(local.drafts[key], note.content) },
        composeOptions: {
          ...local.composeOptions,
          [key]: local.composeOptions[key] ?? {
            summary: note.summary ?? '',
            // Shown, never sent: an edit leaves the note's audience exactly as published. A
            // scope the server never revealed shows as the narrowest choice.
            visibility: replyLimit(note.visibility),
          },
        },
      });
      focus.focusEditComposer(note.id);
    },
    /** Closes the edit composer; the unsent text stays under this note's edit key. */
    cancelEdit() {
      patch({ editing: undefined });
    },
    /** Resolves when the server accepted the Update; only then is the edit draft dropped. */
    async submitEdit(note: TimelineNote, draft: NoteDraft) {
      const key = editKey(note.id);
      patch(sending());
      const started = guard.current();
      try {
        await session.editNote(note, draft);
      } catch (error) {
        // The server no longer holds this note, so nothing was sent and there is nothing
        // left to edit: the form closes, its words go with it, and the card leaves the list
        // instead of standing there as an invitation to republish a deleted note.
        if (isGone(error) && guard.isCurrent(started)) {
          patch({
            ...dropped(note.id),
            editing: local.editing === note.id ? undefined : local.editing,
            focusedNoteId: local.focusedNoteId === note.id ? undefined : local.focusedNoteId,
          });
        }
        fail(key, error, started);
        throw error;
      }
      if (!guard.isCurrent(started)) return;
      patch({ ...dropEdit(key), editing: undefined });
    },
    async react(note: TimelineNote, kind: ReactionKind) {
      if (reacting.has(note.id)) return;
      const active = !reactedBy(note, kind, remote.actor?.id);
      reacting.add(note.id);
      patch({
        ...sending(),
        actionError: withoutError(note.id),
        pending: { ...local.pending, [note.id]: kind },
      });
      const started = guard.current();
      try {
        await session.react(note, kind, active);
        // The server took the write. Whether or not the read after it arrived, the control
        // shows what was written until a newer load says otherwise.
        if (guard.isCurrent(started))
          patch({
            confirmed: {
              ...local.confirmed,
              [note.id]: { ...local.confirmed[note.id], [kind]: active },
            },
          });
      } catch (error) {
        if (!guard.isCurrent(started)) return;
        patch(noteFailed(note.id, error));
      } finally {
        reacting.delete(note.id);
        // This note's reaction alone is answered; one out on another note stays pending.
        if (guard.isCurrent(started) && note.id in local.pending) {
          const { [note.id]: _answered, ...pending } = local.pending;
          patch({ pending });
        }
      }
    },
  };
}

export type FeedViewModel = ReturnType<typeof createFeedViewModel>;
