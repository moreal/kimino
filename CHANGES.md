# Changelog

Version 0.1.0
-------------

To be released.

 -  A Delete relayed from someone who is not the note's author no longer hides
    that note or marks its replies "원글이 삭제됐어요": only deletions the
    evaluator accepts (the author's own Delete, a tombstone) take a note out.
 -  A search inside 저장한 글, 내가 쓴 글, 받은 답글 or one person's notes
    counts against that list ("저장한 글 중 검색 결과 2개 · 저장한 글 3개")
    instead of against everything loaded, which the search never looked through.
 -  A remembered tab can call its account by a username that opens with a
    digit, as Mastodon allows; only all-digit and Misskey-style ids are still
    left unnamed until the profile loads.
 -  A Delete that carries a tombstone, the way Mastodon sends one, is now
    refused like a bare one when it comes from someone who is not the note's
    author: a relayed Delete over your note no longer takes it off the
    timeline, and it counts among the activities refused for safety. The
    server's own tombstones, and your own deletions read back after the fact,
    still take a note out.
 -  Pressing Escape on 삭제 while its confirmation is open now closes the
    confirmation and keeps you on 삭제, instead of moving to the list with the
    question still open.
 -  A remembered tab no longer withholds a ten-letter username such as
    `alexanders` as if it were a Misskey account id; only ids that mix digits
    and letters are left unnamed until the profile loads.
 -  A conversation now shows every loaded post above the one you opened, joined
    by a connector, and the replies below it as a nested tree; deeper replies
    sit flat under the last level with a "↳ …에게" cue. On screens 1100px and
    wider the conversation opens in the right column beside the timeline, and
    that column shows replies addressed to you while nothing is open.
 -  Keyboard: j/k (or the arrow keys on a card) move between posts, Enter or o
    opens the conversation, r replies, s saves, l likes, b shares, Escape
    leaves the card, and ? lists the shortcuts (also under "단축키" in the
    sidebar). Escape in a reply box closes it and keeps what you typed as a
    draft. The skip link now lands on the post list.
 -  Preview saves survive a reload in the same tab and clear when the tab
    closes; the notice says so. The landing page leads with the connect form
    and the preview button, and desktop controls are 36px tall while touch
    screens keep 44px targets.
 -  A new post, reply or edit now appears within a moment of being accepted.
    The read that follows a write used to walk the whole outbox and inbox
    again - dozens of requests and a few seconds on a long feed - before the
    card could show. It now asks each collection for its first page only and
    lays that over what is already loaded, so nothing already on screen is
    lost and the server's later edits and deletions still win. On the tested
    server that is three requests instead of forty-odd, and the card is on
    screen in about a quarter of a second instead of three.
 -  Such a partial read does not claim to have reached more of the server's
    collections than the last full read did; the timeline keeps reporting
    that reach. Connecting and pressing 새로고침 still read everything. If the
    partial read fails, one full read is tried before the failure is reported.
 -  Each note's 수정/삭제 and 좋아요/공유 controls now wait only on their own
    request: confirming a deletion on a second note no longer re-enables the
    first one's button, and a failed reaction clears only its own pending
    state. A 새로고침 that did not actually land (a write's own read replaced
    it) no longer wipes the inline messages a write had just put beside a note.
 -  A write that was still waiting its turn when the connection was closed or
    replaced is now reported as not sent, so its composer keeps the draft
    instead of clearing as if it had been posted.
 -  A reply to a direct message now stays direct: it starts as direct, cannot
    be widened, and is addressed to the people in that conversation rather than
    to followers. Replies to posts whose audience the server does not reveal
    start direct as well and can be widened to followers only.
 -  Failures speak plain Korean with the server's status number (token or
    permission problems, missing addresses, server errors, and an unreachable
    server are told apart); the technical detail sits behind a disclosure. A
    failed post or reply is explained right under the composer that sent it,
    and the draft stays.
 -  The content-warning field shows a visible label, the preview mode survives
    a reload (this tab stores only a preview marker and the list name), and the
    mobile "remember in this tab" checkbox is one tappable row.
 -  A reply to a post whose audience the server does not reveal is now direct
    only: it goes to that post's author and the people it mentions, and the
    composer can no longer widen it to followers. The composer and the sending
    rule share one definition, so what the picker shows is what is sent.
 -  The "대화 N" count on a card now counts every loaded reply below the post,
    not only the direct ones, and its tooltip says it is based on loaded
    replies.
 -  Desktop: the layout uses the spare width from 1280px so the thread column
    keeps a post's action row on one line; between 1100px and 1279px the
    labels fold behind their icons (each keeps a tooltip). A "촘촘하게" switch
    in the sidebar sets tighter type and spacing on wide screens with a mouse
    or trackpad, remembered in this browser; the right column's account card is
    one line with the exit control.
 -  Keyboard: inside an open conversation j/k move between its posts (the
    posts above, the selected one, the replies) and Escape returns to the
    timeline post it was opened from; the "?" dialog says so.
 -  Tapping an author's name opens a small sheet built only from what is
    loaded: handle, server, how many of their posts are loaded in this
    session, a link to the profile on its server, and "이 사람의 글만 보기",
    which filters the current list on this device. On a phone the Actor URL
    field says under its label that Mastodon accounts cannot connect yet.
 -  A reply's cue now quotes the note it answers: the author and its first
    words ("alice: 오늘 읽은 책 이야기 · 원글 보기", cut at forty characters),
    so several replies no longer share one identical "…에게" line. A warned
    note lends its warning, never the hidden text; a reply to your own note
    reads "이어서 · 원글 보기".
 -  In the desktop conversation panel your own posts fold 수정 and 삭제 behind
    관리, as on a phone, so each card is one row of actions tall and a short
    thread needs far less scrolling. On a phone, a like or share that carries a
    count keeps its icon and number and folds its word, so six controls still
    share one line with two-digit counts.
 -  When every loaded post is your own, cards leave out the "내 글" label and
    the repeated @user@host handle; both return as soon as someone else's post
    is loaded.
 -  In a conversation the keyboard focus ring is the only "current" mark: the
    post the thread was opened from keeps its larger type but no longer carries
    a green bar beside the moving ring.
 -  A tab that remembers its session also remembers the open conversation, and
    a reload brings it back while its post is still loaded.
 -  The 촘촘하게 and 경고 글 항상 펼치기 settings are drawn as switches with a
    track and a knob instead of the filled pill that marks the current list.
 -  The confirmation toast shows once per action when the window crosses the
    desktop width; on the desktop it sits after the end of a long thread rather
    than over it; on a phone it takes the tab bar's band for its three seconds
    (tap anywhere on it to dismiss) and never covers a post's controls.
 -  After disconnecting and connecting another account in a remembered tab, the
    previous account's name no longer appears while the new timeline loads, and
    an account that lives at its server root shows "연결 중…" rather than its
    host while reconnecting.
 -  Escape no longer folds 관리 away while the delete confirmation it opened is
    still on screen.
 -  Editing a post that no longer exists on the server no longer brings it
    back. Before an edit is sent the client asks the server whether it still
    holds the post; when it does not - because another tab or another client
    deleted it - the edit is refused with the reason and the stale card leaves
    the list, so a deleted post can never be republished from an old screen.
    Deleting a post that is already gone says so plainly instead of reporting a
    fresh deletion.
 -  The edit form reopens with the post's current text every time. After a
    saved edit it used to come back empty with the save button disabled until
    the page was reloaded.
 -  When a post is written but the timeline cannot be re-read afterwards, the
    message now names what was written - a post, a reply, an edit, a deletion,
    a like, a share, or taking one of those back - instead of always saying it
    was published. A like or share the server accepted also shows its new
    state on its own button even when that re-read fails.
 -  On a phone the 수정 and 삭제 controls no longer sit off the edge of the
    action row: the row wraps, so every control keeps its word, its 44px target
    and a place on screen.
 -  Your own posts carry a "내 글" label, so they can be told apart on a server
    where every post shares one address.
 -  The composer no longer promises a "수정됨" marker. It now says the marker
    only appears when the server records an edit time, which servers such as
    ONI do not; posts from servers that do record one are still marked.
 -  The foot of the list says how many activities the client actually read from
    the server, and - when the server declares more than it handed over - that
    older posts could not be reached.
 -  Every toast and line now speaks in one register (해요체): "게시됐어요.",
    "저장했어요.", "글을 지웠어요." and the rest, with a test that keeps 습니다
    endings out of the copy files.
 -  A reply whose parent was deleted - from here, or replaced by a tombstone on
    the server - says "원글이 삭제됐어요" instead of offering "원글 보기" to an
    address that answers 410. Parents the client has never seen keep the link.
 -  Under a search the foot says "검색 결과 N개 · 불러온 글 M개"; the saved list
    says "저장한 글 N개 · 불러온 글 M개".
 -  The edit composer's key hint says "Enter로 수정", and the note about the
    "수정됨" marker waits behind "수정 표시에 대해" instead of repeating on
    every edit. A nested reply that continues its own author reads "이어서" in
    the conversation as it does on the card.
 -  The shortcut list says "다음 / 이전" for j / k, the right column's foot
    repeats the sidebar tagline in Korean, and the connection dot lights only
    once the account has loaded.
 -  A note card folds its action row by its own width, so nested replies fold
    like the narrower cards they are; "대화 N" folds its word behind the icon on
    the narrowest cards, the same way a counted 좋아요 does.
 -  On a phone the toast is a strip directly above the tab bar, lets every tap
    through and has no close control; on the desktop it sticks to the bottom
    of the right column so a long thread never pushes it out of view.
 -  Find replies and mentions addressed to you under "나에게 온 답글", read
    relative times, open a reply's original conversation in place, and use one
    clearly labeled preview mode with a single exit control.
 -  Like and share results now appear right under the post you tapped, the
    tapped button shows it is working, and page-level alerts stay at the top of
    the screen with a close button. Switching lists closes the inline reply but
    keeps the draft and marks the post with "초안 있음". Preview mode explains
    per action what needs an account; the header drops the update stamp, the
    preview line is thinner, and a render failure shows a readable message
    instead of a blank page.
 -  Follow conversations inside Kimino, read the original while replying, and
    keep unfinished drafts when moving between views within the same tab.
 -  Explore a clearly labeled example timeline before connecting an account.
    Connection guidance now explains which accounts are supported.
 -  Search loaded posts and save their links in this browser. Saved links remain
    accessible even when their posts are absent from the current timeline.
 -  Read and use timeline actions more comfortably with larger type, clearer
    contrast, and improved mobile spacing.
 -  In the conversation column beside the timeline, 삭제 and the other controls
    on your own post are no longer cut off by the edge of the panel. The row
    wraps there the way it already does on a phone, so every control - and the
    delete confirmation with its two buttons - stays inside the panel and can
    be clicked at every desktop width.
 -  The foot of the list now also counts the activities the client refused. A
    post the server holds can be refused here for safety - when the activity
    and the post inside it disagree about who wrote it - and that is now said
    in the page, in different words from the ones used for activities this
    client does not support. It stays quiet when there is nothing to report.
 -  A confirmation from the last write no longer sits on screen while the next
    one is under way: it goes as soon as a new post, reply, edit, deletion or
    reaction begins, instead of waiting out its four seconds.
 -  After connecting without ticking "새로고침해도 이 탭에서 유지", one
    dismissible line says that this session ends on reload and that the option
    exists. Nothing is stored unless you tick the box, and the reminder is
    offered at most once per tab session.
 -  Internal only; nothing visible changed. The write ordering and the reads
    that follow writes moved out of the session into their own module
    (`application/write-queue.ts`), the collection walker out of the HTTP
    client (`activitypub/collection-reader.ts`), draft ceilings and the
    plain-text escaping into `domain/note-content.ts`, and the session now
    takes its clock from the composition root so every timestamp in tests is
    fixed. The real-server suite shares its helpers from `tests/helpers/c2s.ts`
    and asserts only what the server stored.
 -  Internal: the feed state now carries every note by id and every note's
    loaded reply count, computed once per change instead of once per card,
    so a long outbox no longer re-walks the whole list for each card it
    draws. The list scope behind a search is counted in the same pass as the
    search. The skip link's target is named symbolically by the selectors.
    Note copy moved out of `note-body.ts` into `copy-content.ts`; no words
    on screen changed.
 -  Keyboard shortcuts stay quiet while a sheet is open: with the author or
    account sheet up, `r` no longer opens a reply composer behind the backdrop
    and `?` no longer stacks the shortcut list on top of it. `?` still closes
    the shortcut list it opened.
 -  On a phone the 맨 위로 control sits above the tab bar instead of on the
    새 글 쓰기 tab, and the reminder that a connection ends on reload is one
    compact line under the composer, in the column's flow, rather than a strip
    fixed over whichever card was behind it. 자세히 opens the whole sentence;
    안내 닫기 still ends it for good.
 -  A confirmation toast is now a narrow pill at the bottom of the viewport,
    above the phone tab bar. It moves nothing - the composer and the first card
    stay exactly where they were, so a second tap at the top lands on the
    control it was aimed at - and taps pass through it; only its own close
    control takes the pointer. Still announced politely and still four seconds.
    A reply composer scrolled to the very bottom can be overlapped by it while
    it stands, but never blocked.
 -  One naming rule everywhere: the author sheet's heading is the name the card
    shows and the line under it is the same `@user@host` address, the desktop
    account line carries that address as a muted second line, and Takahe-style
    addresses (`/@alice`, `/@alice@remote.host/`) are read as a name and one
    address, never `@@alice@host`.
 -  A reply whose original is loaded says whom it answers in its cue -
    "Oni에게 · 원글 보기" - so a reply to a warned post is no longer three
    identical warning boxes; an original that is not loaded keeps "원글 보기"
    alone.
 -  When the shortcut list closes and the control that opened it has left the
    page, focus goes to the page heading rather than being lost.
 -  Like and share posts with your connected account and see who reacted to each
    post. Servers that refuse to withdraw a reaction are reported plainly
    instead of failing silently.
 -  Liking or sharing a post is now addressed exactly as widely as that post,
    never wider: a followers-only post is shared to your followers only, a
    quiet post stays off the public timeline, a direct one stays in its
    conversation, and a post whose audience the server does not reveal reaches
    its author alone. Before you use it, the share control on a non-public
    post says what it will do, and a scope this server cannot address is
    refused with a reason instead of being widened.
 -  Replying to a post that is still behind its content warning no longer
    shows that post's text in the composer: the warning and its "내용 보기"
    control stand there too. A reply now starts with the parent's warning
    already filled in, which you can edit or remove before sending.
 -  The number of activities this client could not show is printed at the foot
    of the timeline, next to when the list was last read, instead of living in
    a tooltip that a phone cannot reach. It stays quiet when nothing was
    dropped.
 -  Long lists are read 50 posts at a time with a "더 보기" control that says
    how many loaded posts are left, and a "맨 위로" control appears once you
    have scrolled a couple of screens and takes you - and the keyboard focus -
    back to the top of the list.
 -  Nothing on the page is disabled while a like, share, reply, edit or
    deletion is being sent. A second action asked for while one is still on
    its way used to be refused ("진행 중인 요청이 끝나면…") or, for a moment,
    greyed out every button on the page; now it waits its turn behind the one
    before it and goes out in order, and only the control that was pressed
    shows that it is waiting. The connect form still waits for its connection.
 -  When a write went through but the timeline could not be read again, one
    message says so ("좋아요는 남겼지만 타임라인을 다시 불러오지 못했어요…")
    instead of a confirmation and a warning stacked on top of each other.
 -  A write that was accepted no longer loses its re-read when the next write
    fails: the timeline is read again anyway, with the failure shown over it.
 -  The refresh button clears a note reported deleted from the "gone" list only
    when the server was actually asked again, not when the request was folded
    into a read already on its way.
 -  A content warning that was opened stays open through a re-read of the
    timeline - after an edit, the new words show right away instead of the
    card closing again. Disconnecting closes all of them.
 -  Searching by author now matches the name shown on the card and the
    `@user@host` handle (for a search that includes "@"), not the raw address:
    "localhost" no longer matches everyone on the server.
 -  On a laptop-width window (1100 to 1280px) my own notes keep one row of
    actions: 수정 and 삭제 fold behind 관리 as they do on a phone, instead of
    wrapping onto a second line. In a conversation a reply drawn right under
    the note it answers no longer repeats "원글 보기"; the 받은 답글 list no
    longer shows its empty state twice; the foot's 자세히 follows its sentence;
    a reply or edit composer opened low in the window brings its 게시하기 row
    into view. The composer prompt reads at the same size as a note, the
    navigation uses the brand green, the connect form starts empty with the
    local server address as its placeholder, and the phone preview banner wraps
    instead of clipping.
 -  One visual system across the app: a single spacing, type, weight and radius
    scale, a handle that no longer looks louder than the post it belongs to,
    and icons at one size per context. The composer's buttons no longer break
    mid-word on a phone and its audience picker is an even grid; action labels
    fold behind their icons by the same rule in every column. Confirmations
    appear under the header instead of over the composer's buttons, the
    connect screen is one centred column with an untruncated form, and Escape
    closes a reply from any field in it.
 -  People are called by their name. The connected account shows its display
    name or username - "Oni", not "localhost:8443" - on every card, in the
    "님이 공유" line, on the reply target and in the account line, with the
    @user@host address as a quieter second label; an account that lives at its
    server's root is no longer named after the server alone.
 -  Escape leaves a conversation from anywhere in it - the heading it opens on,
    a card, a button - and puts focus back on the timeline card it was opened
    from, beside the list on a wide window and on one column on a phone. Inside
    a text field or an open composer Escape keeps closing the composer.
 -  On a phone the fifth tab of the bottom bar is 새 글 쓰기: it brings the
    composer back on screen however far the list has been scrolled.
    Disconnecting moved into the account sheet, opened from the header's
    account control; the preview keeps 둘러보기 종료 in the bar, since it has
    nothing to write.
 -  The foot of the list now says, in one quiet line, how many activities it
    read and did not show and when it last checked. The reasons - unsupported,
    refused for safety, and how far the read got through the server - wait
    behind 자세히, and the line stays silent when nothing was withheld.
 -  The reminder that a connection ends on reload no longer pushes the first
    post down: on a wide window it sits under the account line in the right
    column, on a phone it is a strip above the tab bar, and in between it
    follows the composer. It is still dismissed for good with one tap.
 -  삭제 is no longer the only coloured word in an own post's action row: it
    turns red when pointed at, focused, or while its confirmation is open. The
    permalink under the time is "서버에서 보기", so "원글 보기" alone marks a
    reply.
 -  A pressed 좋아함 / 공유함 / 저장됨 keeps its tint, filled icon and outline
    but no extra weight, so a shared post with two reactions has one loud line,
    not three.
 -  The right column no longer explains what 받은 답글 is for: it lists replies
    to me when there are any and otherwise says so in one muted line.
 -  Posts with a content warning show the warning first and open only on
    request; attachments are listed with their alt text and images load only
    when tapped, other media open as external links. Non-public posts carry a
    visibility indicator.
 -  Write posts with a warning line and choose who sees them: public, quiet
    (unlisted), followers only, or direct. Replies start at the original post's
    visibility and can never reach wider than it.
 -  Pressing a like or share that is already in effect now takes it back. The
    reaction's own activity is deleted, which is how these servers let a
    reaction be withdrawn; the earlier Undo they refuse is no longer sent. If
    the timeline was loaded without that activity's address the withdrawal is
    refused with the reason instead of guessing what to delete.
 -  Your own posts can be deleted. The control asks first and says what will
    happen: the post is removed from your server and leaves the timeline, it
    cannot be undone, and copies other servers already received are not
    recalled. The confirmation opens on its cancel button and there is no
    keyboard shortcut for it, so no stray key press can delete a post. A post
    the server has since replaced with a tombstone stays gone on the next load
    instead of reappearing.
 -  Your own posts can be edited. The composer reopens with the current text
    and content warning, and sending rewrites both. The audience is shown but
    not editable: a published post keeps exactly the people it was sent to.
    A post the server reports as updated after publication is marked "수정됨"
    with the time of the edit.
 -  Read your ActivityPub timeline, publish public posts, and reply to
    conversations by connecting a C2S-compatible account. Kimino keeps your
    access token only in the current tab and filters unsafe content before
    displaying posts.
 -  Run the included local ONI instance with Docker Compose to try the client
    without a hosted account.
 -  Replies in a conversation now read oldest-first, relative timestamps keep
    ticking while the page stays open, and a rejected post can no longer show an
    error after you have already switched accounts or left the session.
 -  The card shortcuts (j/k, the arrows, Escape, r, s, l, b) now work from any
    control inside a card, not only from the card itself: after closing a reply
    box with Escape, j moves on from the reply button instead of doing nothing.
    Enter on a button is still that button.
 -  Opening the conversation of a reply whose original this client knows is
    gone now says "원글이 삭제됐어요" and offers no link to it, instead of
    claiming the original was not loaded yet and linking to a 410.
 -  Opening 관리 on your own post draws 수정 and 삭제 (and, on the narrowest
    cards, 저장) as a row of their own under the reading actions, so the five
    never reflow. On a phone reply one level deep or more, and three levels deep
    in the desktop thread panel, 저장 folds into that row so the rest share one
    line; with a count, 대화 folds its word to the icon at every phone width; in
    the narrowest thread panel someone else's 공유 / 좋아요 / 저장 fold their
    words behind their icons. Every folded word stays in the control's name.
    Liking or saving a reply inside a conversation no longer redraws its card.
 -  The edit box says the audience in one line ("공개 그대로 · 본문과 경고
    문구만 바꿔요") and carries no new-post placeholder.
 -  검색 지우기 sits at the end of the search field whenever there is a query,
    and the field says Esc clears it.
 -  Names: the author control reads "…의 정보 보기", 대화 without a count reads
    "대화 열기", and 촘촘하게 only promises less spacing. The sidebar's status
    dot is grey on the landing page, in the preview and while reconnecting, as
    is the preview's account dot.
 -  The character count in the main composer follows what you type again, and a
    draft past 5,000 characters is refused with a visible reason instead of
    being silently cut short. The composer also says that images cannot be
    attached yet.
 -  Every action under a post keeps its word - 답글, 공유, 좋아요, 저장, 대화 -
    at every width, including a phone, and the conversation button no longer
    draws the same bubble as the reply button. A post you have liked or shared
    now says so ("좋아함", "공유함") and takes an outline, so the state does not
    rest on colour alone.
 -  Posts that are not public now show the word beside the icon (팔로워만,
    다이렉트, 조용히) rather than an icon only, and the author's name and the
    "원글 보기" cue are full-size tap targets on a phone.
 -  Confirmations appear as a bar under the page header that pushes the page
    down, so nothing is ever read through a message that covers it.
 -  The confirmation toast stands for three seconds instead of four, lets every
    tap through except its own close control, and on the desktop layout sits at
    the foot of the right column rather than over the reading column's actions.
 -  On a phone my own card is one row of actions: 수정 and 삭제 fold behind a
    관리 control at the end of the row, one tap away, with the same delete
    confirmation; Escape closes it. Wider columns keep both inline.
 -  A sidebar switch, 경고 글 항상 펼치기, opens every content-warned note by
    itself and is remembered in this browser as a flag. The per-note 접기 still
    closes one note for the session.
 -  촘촘하게 sets a content warning as one line - the warning and an inline
    내용 보기 - instead of a boxed block.
 -  A remembered tab draws its navigation and account line at once on reload,
    with the loading skeleton in the list, rather than after the timeline
    arrives.
 -  맨 위로 is centred above the phone tab bar, apart from 새 글 쓰기, and the
    thread panel's 대화 heading no longer looks like a focused button.
 -  The page no longer freezes after a like, share, reply, edit or deletion. A
    write used to disable every control on the page until the timeline had
    been read again, which took a couple of seconds on a long feed. Now only
    the control that was pressed waits, and only for the server's answer; the
    re-read that follows runs quietly in the background - the refresh button
    spins while it does - and every other card and the composer stay usable.
    A like or share shows on its own button the moment the server accepts it,
    and a second reaction can be sent while the last re-read is still on its
    way; the older re-read is then dropped and one newer read follows.
 -  Confirmations arrive when what they confirm is on screen. A like, share or
    deletion is confirmed as soon as the server accepts it, since the button
    or the list already shows it. A new post or an edit is confirmed only once
    the re-read has put the new words on screen; if that re-read fails, the
    message that the write went through but the timeline could not be reloaded
    is the only one shown.
 -  The quick read after editing or deleting a note now reads that note back
    from the server itself instead of looking for it on the first outbox page.
    A note whose original post has fallen past the first page, on a server that
    lists no new row for the edit, still shows its new words - and "글을
    수정했습니다" appears only once they are on screen. A note the server
    answers with 404, 410 or a Tombstone leaves the list. On the tested server
    an edit costs three requests after the POST: the note, the inbox, the
    outbox.
 -  A full 새로고침 now also forgets the reactions this session withdrew and the
    notes it read back, since what it lists is the server's word again; a
    withdrawal confirmed after the connection was replaced no longer touches the
    new session.
 -  Trying to post, like, share, edit or delete in the preview now fails the
    same way every other refused action does: the client recognises the
    preview's refusal itself and shows the explanation in its own words, so a
    genuinely unexpected error can no longer be mistaken for the preview's
    read-only rule. The wording on screen is unchanged.
