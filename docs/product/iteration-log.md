# Product improvement iterations

These are agent-based surrogate evaluations, not interviews or evidence of real
Mastodon user conversion. Do not optimize the reviewers into saying yes.

## Round 1 — baseline

Verdict: would not switch; willing to try as ONI client.
Priority blockers: cannot follow conversations in-app; unclear account/server
compatibility; mobile secondary text/actions too faint and small.

Accepted work: inline parent context/replies; explicit C2S compatibility and
read-only exploration; higher contrast and larger touch targets. Also improve
retrieval with current-feed search and browser-local saved post IDs. No fake
federation/notifications/likes. Keep account credentials memory-only.

Architecture: pure domain models/evaluation, framework-free application session
use cases against gateway ports, ActivityPub HTTP infrastructure, thin Solid
presentation adapter and focused view components. Verify boundaries automatically.

Acceptance: preserve failed/unfinished drafts per reply, mobile conversation
navigation without external tabs, explain unavailable parents; existing real C2S
E2E stays green. Repeat independent surrogate evaluation after screenshots.

## Round 2 — conversation and onboarding improvements

Independent verdict: would try with a C2S account as a secondary client, would
not migrate a primary Mastodon account. Explicit compatibility, demo, inline
parent context, thread view and return-position restoration accepted.

Remaining actionable issues: small/tightly spaced mobile actions; saved posts
suggest permanent full-post storage, but only IDs were kept and demo did not
persist. Enlarged actions to 14px and >=44px targets; clarified link-only storage,
added unavailable saved links with original access/removal and their count,
reported blocked storage as tab-only, and labeled demo resets explicitly.

Technical review also found and fixed overlapping explore/connect mode changes,
stale focused conversation after refresh/delete, and POST errors disappearing
when the composer unmounted. Session generation and browser regressions cover
these cases. UI now receives session/preferences solely from composition root;
domain/application and UI import boundaries are checked by tests.

## Round 3 — scoped validation

Third independent surrogate accepted readability and saved-link changes. Still
would not switch primary Mastodon use: existing accounts/relationships,
notifications/interactions, visibility scopes and cross-device state remain
unproven or unsupported. No further design iteration requested for this scope.
Minor wording updated to include normally not-yet-loaded posts, not just deletion
or permission failures. Saved unavailable state was reviewed in source, not an
actual human usability session.

Decision: preserve candid non-conversion feedback. Do not claim product-market
fit or keep asking agents until one says yes. The next substantive iteration
requires account/network/interaction capability work, not more visual polish.

Validation: architecture/unit checks plus real ONI and browser flows. The browser
suite covers demo search/save/thread, unavailable saved links, inline draft
preservation, focus restoration, refreshed/deleted conversation, global POST
failure after navigation, disconnect cancellation, HTML safety and real C2S writes.

## Round 4 — interaction capability and reading hierarchy

Fresh independent surrogate (demo mode, desktop and mobile screenshots) would
not switch and would not yet use Kimino as a secondary client: no Mastodon
login, no social loop (boost/like/notifications/follow/profiles/media/CW), demo
could not demonstrate composing, three exit controls and no entry, absolute
timestamps and every name/time leaving the app. Hierarchy: ~320px of chrome
before the first post, under-weighted low-contrast action row with the permalink
looking primary, thread focus not visually distinct, developer diagnostics
exposed, three vocabularies for the demo mode and for the saved list.

Verified against the real ONI fixture before building: the outbox accepts C2S
Like and Announce (201, no Location header); Undo of either is rejected with 400
by the server. Reactions are therefore built as honest C2S writes, and a
rejected undo is reported plainly rather than faked.

Accepted work: Like/Announce reactions with own-state and counts from loaded
activities; an inbox-derived "replies to me" view (replies to my notes or
mentions) instead of fake notifications; relative time; single demo vocabulary;
reduced chrome; in-app parent navigation; composer reachable in demo with an
explicit error; skeleton loading and last-load time. Architecture: pure feed
view model with focus port, split layout components, presentation import
boundary tests, reaction evaluation in the pure domain evaluator.

Second independent surrogate (mobile-first, evaluated a production build after
a dev-only clock regression was found and fixed): still would not switch
primary use (Mastodon login impossible, no notifications/follows/media/private
posts) and would not yet adopt as a secondary client. New concrete frictions:
reaction errors rendered above the fold as a sticky global alert; no pending or
pressed feedback on a tapped reaction; reactions cannot be withdrawn on the
reference server, so a like feels irreversible; the open reply composer followed
its note into every list view; preview-mode error copy said "게시" for likes;
header update line duplicated the account card; nav glyphs read as random
symbols. Kept as strengths: honest landing constraints, thread layout, in-app
parent link, dark scheme contrast, storage disclosures.

Accepted 4b work: per-note inline reaction feedback with pending state, sticky
dismissible page alert, closing the reply on navigation with a draft badge,
action-specific preview copy, thinner preview pill, single thread affordance
with a reply count, SVG nav icons, and a render error boundary. Reversibility
of reactions remains a server capability gap, recorded rather than faked.

## Round 5 — content warnings, visibility, media, chrome and architecture

Fresh independent surrogate (3-year Mastodon user, Elk and official app) would
not switch (no Mastodon login) and would not yet adopt as a secondary client,
but would bookmark it: the reading and threading model was called the calmest
seen in a fediverse web client. Blockers: no content warnings, media or
visibility control; nothing survives a reload; sticky page alerts following the
user across views and three colored boxes before the first reply in a thread;
"답글" doing four jobs; ~280px of chrome before the first post; mixed Unicode
and SVG iconography; developer setup instructions shown to end users. Kept as
strengths: exact scroll restoration, reply composer quality, 44px targets,
specific empty states, honest storage disclosures.

Verified against the real ONI fixture before building: `summary` round-trips
but `sensitive` is silently dropped, so a non-empty summary is the CW signal;
only the full `https://www.w3.org/ns/activitystreams#Public` IRI addresses a
note publicly (`as:Public` is discarded); `to`/`cc` come back as IRI arrays;
followers-only and direct notes are hidden from anonymous readers; a single
attachment is compacted to a scalar object.

Accepted work: content warnings on read (collapsed body, 44px toggle) and
write; visibility inferred from addressing with an indicator for non-public
notes; a four-option visibility picker whose replies default to the parent
scope and cannot widen; attachments listed with alt text and loaded only on
tap, never automatically; opt-in tab-scoped session persistence via
sessionStorage, off by default; content-first header (first post at ~93px on
both viewports); view-local alerts with success as a transient toast; one
demo notice per screen; one word per concept (답글 / 원글 보기 / 대화 N /
받은 답글); a single inline SVG icon set; quieter reacted states; plain-language
setup guidance with developer steps behind a disclosure.

Architecture: removed the undeclared `src/ui` layer (sanitizer into
infrastructure, link helpers into presentation); Solid imports confined to
`presentation/solid`; saved-link key and serialization only in infrastructure;
application throws typed failure codes and presentation maps them to copy;
feed derivation, saved links and note display split out of the view model with
their own tests; boundary tests now scan recursively, catch dynamic imports and
cover infrastructure, activitypub and the entry point.

Second independent surrogate (5-year, mobile-first, CW-heavy, followers-only
poster; also exercised a mocked C2S actor because the demo has no CW, media or
non-public notes): still would not switch (no Mastodon login, no follow
timeline, no media upload, no notifications beyond replies, no follow/mute/
block, no edit/delete) and would not yet adopt as a secondary client. Found a
privacy defect: a reply to a direct note defaulted to followers-only instead of
direct. Other frictions: untranslated developer English in error alerts; CW
field without a visible label; on mobile the publish failure alert renders at
the page top while the composer sits below the fold; the session checkbox
misaligned on 390px; the mention-only notice shown even when the parent is
visible; a 25px-tall demo banner link; CW bar, attachment rows and section
headers sharing one flat tint. Accepted as good: CW read path, visibility
clamping with spoken-language hints, load-on-tap media with honest alt-text
state, session opt-in copy, alert clearing on navigation, vocabulary
consistency, first-post offset, Mastodon-conventional visibility icons.

Decision: the direct-reply default is a correctness bug and is fixed in 5b with
tests, together with the listed frictions. Media upload, sensitive-media flag,
follow/mute/block and edit/delete remain recorded capability gaps, not faked.
Both surrogate answers remain "no" for primary use; do not read the warmer
tone as conversion evidence.

### Round 5b/5c — direct-reply fix and verification

5b fixed the direct-reply default at its root: a note addressed only to known
actors (reader, author, mentions) is now classified direct, replies to it
default to direct and address the author plus mentions, and unknown scope also
defaults to direct. Failures are typed in the application layer and mapped to
plain Korean with a "자세히" disclosure; publish failures render under the
owning composer and scroll into view; the CW field has a visible chip label;
the session checkbox is a proper label row; the mention-only notice appears
only when the parent is absent; the demo banner link is 44px; CW bar,
attachment tiles and section headers are visually distinct; demo mode
restores on reload. A Solid fan-out limit surfaced once the ONI fixture grew
past ninety notes and was fixed with one projection memo per card.

Third independent surrogate (desktop-first, keyboard-leaning reader) verified
all eight 5b items as pass, with demo reload partial (mode and view restored,
saved items not). Verdict unchanged: would not switch (their instance has no
C2S) and would not yet adopt as secondary. New blockers: thread view lacks
ancestors and nesting; no keyboard shortcuts or Escape; demo saves lost on
reload; the desktop right column stays a tutorial and tagline after
connecting; the landing is three columns of slogans with the form off-center;
desktop controls feel phone-sized. Carried into Round 6.

### Round 6 — conversation tree, keyboard, honest preview persistence, desktop layout

Addressed the third surrogate's blockers. Conversations are a pure projection
(`projectConversation`: loaded ancestors oldest first, the first unavailable
ancestor named, descendants as a depth-first tree, flattened past four
levels); the view renders ancestors with a connector, the focused note
enlarged, and replies indented up to three levels on desktop and two on
phones, then a "↳ …에게" cue. Keyboard shortcuts are a pure key-to-intent
mapper plus a roving tab stop in the list (j/k, arrows, Enter/o, r, s, l, b,
Escape, ?), ignored inside inputs and with modifier chords; a "단축키" dialog
lists them; the skip link targets the list so the first card is two stops
away. Escape in a reply composer closes it, keeps the draft and announces it;
취소 now follows the submit button. Preview saves are kept in the same
sessionStorage record as the preview marker (so a reload keeps them and
closing the tab clears them) and the toast says exactly that. On screens
1100px and wider a conversation opens in the right column beside the
timeline, which otherwise shows replies addressed to me; below that width the
single-column thread is unchanged, so the existing focus and scroll tests
still hold. The landing leads with the form and the preview button (both in
the first viewport on 390x844) with the compatibility note in a compact
aside. Desktop controls are 36px on fine pointers; coarse pointers keep 44px.

Not done in this round: the content-warning reveal keeps 44px on desktop
because an earlier product test pins it; the demo has no chain deeper than
one reply, so the nested tree is exercised only by mocked timelines in
`tests/ui.spec.ts`. The surrogate verdicts remain "would not switch" while
their instances lack C2S; do not read this round as conversion evidence.

Fourth independent surrogate (community moderator, self-hosted Mastodon plus
an oni project account, 1440x900 and 390x844, keyboard-heavy): would not
switch primary use (no notifications feed, profiles, follow/mute/block/report,
only client-side search) but would adopt Kimino cautiously as a secondary
client for the oni account, calling it more legible than oni's own UI. This
is the first secondary-client yes across six rounds; it applies only to an
account that already lives on a C2S server and is not conversion evidence.
Verified pass: ancestors and nesting, missing-ancestor state, keyboard set and
Escape semantics, focus ring and scroll-into-view, demo saves with an honest
toast, landing form-first. Partial or failing: 360px thread column wrapping
action rows, desktop density (about six cards per screen), j/k dead inside the
thread column, mobile compatibility note below the fold, "대화 N" counting only
direct loaded replies, right-column profile card repeating the sidebar.

### Round 6b — reply scope, desktop density, thread keyboard, author sheet

Correctness first. The composer and the domain disagreed on a parent of
unknown scope (composer fell back to direct, `clampVisibility` capped at
followers); both now use `replyLimit('unknown') === 'direct'`, the composer
narrows a stale choice through `effectiveReplyVisibility` (a thin wrapper over
`clampVisibility`), and the hint says the reply goes to the author and the
people mentioned. Unit tests cover the unknown case in the domain, the
presentation and the session; a browser test posts such a reply and checks
`to` is exactly author plus mentions with no followers or Public recipient.
"대화 N" counted only direct loaded replies; it now counts every loaded
descendant through `projectConversation` and carries a "불러온 답글 기준"
tooltip.

Architecture (independent re-audit): persistence orchestration left `app.tsx`
for `presentation/session-restore.createPersistence` (unit-tested with fake
store and feed; preview saves go through `saved-links.savePreviewLinks`);
thread placement, the replies peek and `visualDepth` are pure selectors; the
roving cursor is `keyboard.nextCursor`; gateway error classes and `toFailure`
live in `application/gateway-errors.ts`; failure/notice text in
`presentation/copy-failures.ts`; `reactedBy`/`isEdited` are shared; the toast
re-announces through a monotonic `noticeId`, the help dialog and the desktop
media query are owned by the view model and `presentation/solid/media.ts`;
reply-dismiss focus goes through the `FocusPort`. Boundary tests now forbid
runtime imports from `domain`/`application` in views, storage globals in
views, `matchMedia`/`navigator`/`globalThis` outside adapters and the Solid
bridge, and pin `bootstrap.ts` and `logging.ts`.

Surrogate frictions (moderator persona, 1440x900 and 390x844): the thread
column keeps its action row on one line (layout widens from 1280px, labels
fold behind icons with tooltips from 1100 to 1279px; tested at 1440 and
1200); a "촘촘하게" toggle (persisted density preference, fine pointers only
for the 32px controls) fits ten one-line public notes in 900px at 1440 (test
reports the measured average card height); j/k walk conversation cards and
Escape returns to the originating timeline card; the Actor URL label carries a
one-line compatibility helper on phones; the right column's profile card is
one account line with an exit icon; tapping an author opens an in-app sheet
(handle, server, loaded count, server profile link, client-side filter over
loaded notes). Follow/mute/block are not offered and no counts are invented.

Not done: the density target is met for short public notes; long notes and
notes with a visibility badge are taller, as expected. The compatibility
helper is a single sentence and the full note stays in place. No claim is made
about conversion; the surrogate verdicts were not re-run in this round.

Fifth independent surrogate (product designer, four years on Mastodon web and
Ice Cubes, 1440x900 and 390x844): would not switch primary use (no Mastodon
login, no notifications, no follow graph, no media upload) and would adopt as
a secondary client only on an ONI account, calling the reading model exactly
right and the visual system eighty percent there. Every Round 6b item passed:
one-line action rows in the right column, thread j/k with Escape returning to
the originating card, the mobile compatibility helper, the right-column
account line, author-sheet honesty with no invented counts, an unknown-scope
parent capping replies at direct, and "대화 N" counting all loaded
descendants. Compact density missed its target on realistic mixed-length
notes: eight cards per 900px rather than ten. Remaining frictions were visual
coherence: nine font sizes, six weights, gaps of 4/7/8/11/12, four pill radii
in one composer, icons drawn at five sizes beside Unicode glyphs, plus a
composer whose buttons wrapped at 390px, a toast covering the composer footer,
and a landing form squeezed into a 260px column at 1440.

### Round 7 — one visual system

Independent designer-persona review (surrogate, not real users) passed every
functional item; the remaining gap was visual-system coherence. Measured
before: gaps of 4/7/8/11/12px (0/2/5/8 in compact density), eight font sizes
between 11 and 18px plus 28px, six font weights including 650 and 750, 13px
text set at three different line heights, four pill radii in the composer
alone.

`src/app.css` now declares the whole scale once at `:root`: spacing
`--s-1..--s-6` (4/8/12/16/24/32), a type scale where each step owns one line
height (`--t-xs` 12/1.4, `--t-sm` 13/1.45, `--t-body` 14/1.5, `--t-base`
15/1.55, `--t-md` 16/1.5, `--t-lg` 18/1.35, `--t-xl` 28/1.2), weights 400/500
/600, radii `--r-sm` 6px / `--r-md` 10px / `--r-pill` 999px, and icon sizes
`--icon` 20px / `--icon-sm` 16px. The brief's six type steps did not cover the
14px used by the compact body and the comfortable handle, so the scale carries
that seventh step (`--t-body`) rather than resizing the density work.
`design-system.test.ts` scans the stylesheet and fails on any font weight
outside 400/500/600, any font-size or border-radius px literal outside the
`:root` token block, and any type step paired with more than one line height;
it also scans `src/components/*.tsx` and `presentation/copy.ts` for
`↗ ↳ ♡ ↻ ◎ ⌕` used as icons.

Hierarchy: the handle no longer outweighs the body (comfortable 14/600 over
15/1.55, compact 13/600 over 14/1.5, meta 12/400 everywhere). Icons render at
20px in action rows and navigation and 16px in meta and badges, with the
stroke widened to 2 at 16px so both read at the same weight; visibility badges
and attachment rows come from `Icons.tsx` instead of a second inline set, and
the `↗`, `↳` and `•` glyphs became drawn shapes (external, corner-down-right,
a CSS dot in the brand mark).

Layout: the composer footer wraps as a whole with the primary button first and
`white-space: nowrap` on both buttons, and the visibility control is an even
grid — four cells above 420px, 2x2 below. Action labels now fold behind the
icons by the same rule in every column (`@container column (max-width: 419px)`
on `.main-column` and `.context-column`), replacing the 1100–1279px thread
column special case; on a 390px phone that means icon-only rows with the
titles and accessible names intact. The toast moved from the bottom to
top-centre under the header on all viewports, safe-area aware, keeping
`aria-live="polite"` and the 4s duration; because a scrolled composer can sit
there, `Toast.tsx` slides the region below any open composer footer. The
landing is one centred column at every width (the wide-layout three-column
rule had been reclaiming it above 1280px and squeezing the form into 220px):
the form is capped at 560px, the tagline sets with `word-break: keep-all`, the
compatibility note follows directly under the form, and the phone helper line
moved from between label and field to under the field.

Escape closes a reply composer from any control inside it (the handler moved
from the textarea to the form), with the same draft-preserving semantics;
adding a content warning moves focus into the warning field.

Tests: 194 unit tests (18 files, +8 new in `presentation/design-system.test.ts`)
and 50 Playwright ui+product tests (+4 in a "round 7" group: no wrapping at
390 plus the 2x2 grid, the toast clear of the composer footer at 390 and 1440,
the landing column and untruncated placeholders at 1440, Escape from the
content-warning field), plus the real-ONI c2s suite. Not done: the reply
composer's warning text is still local state, so Escape keeps the typed body
but not an unsent warning line; no claim is made about conversion.

Sixth independent surrogate (low-vision reader, browser zoom 150-200 percent,
VoiceOver, phone-first): would not switch primary use and would not adopt as a
secondary client, because the composer has no file input at all, so images and
therefore alt text cannot be posted, and alt text is the norm their community
enforces. Found a real regression: the main composer character counter stayed
at zero while text was typed. Judged the Round 7 icon-only mobile action rows
a failure, since the reply and thread controls both rendered the same speech
bubble and no label survived below 420px, though every control kept a correct
accessible name and a 44px box. Also flagged an opaque toast painting over the
composer and the first card, a reacted state carried by a 1.23:1 color shift,
a visibility badge whose word was screen-reader-only at every viewport, ten
distinct size and line-height pairs against a five-value token scale, and
author and reply-context controls only 21 and 28 pixels tall. Passed: focus
visibility at 7.87:1 identical across zoom levels, no clipping or horizontal
scrolling at 823x514, secondary text at 6.41:1, alt text rendered as visible
body text with an explicit missing-alt state, heading order without skips,
content-warning expanded state, and live regions for the toast and errors.

### Round 8 — the counter, the words on the buttons, the toast

Independent low-vision review (surrogate, not real users; browser zoom
150–200%, VoiceOver, phone-first) on the Round 7 build. Findings and what
changed:

Regression: the main composer's character count sat at "0 / 5,000" while text
was typed. `FeedList` passed `draft={props.vm.draft('new')}`; `vm.draft` reads
the view model's own snapshot variable, which is not a signal, so the count
and the textarea's value binding never re-ran. It now reads
`props.state.drafts.new`, the same tracked state the card list already renders
from (the reply composer was never affected: it reads `state.drafts[note.id]`
through a memo). The 5,000-character ceiling is enforced in the composer
instead of by `maxlength`: pasting a longer paragraph no longer loses its tail
silently — the count turns red, says 너무 길어요, and the publish button is
disabled. The number is deliberately not a live region (it would speak on
every keystroke); a separate polite region announces only the refusal.

Action rows: the Round 7 rule that hid `.action-label` below a 420px column is
gone. A narrow column now buys the space from the type step (12px label), the
icon size (16px) and the padding instead. Measured at 390: five buttons,
57/57/67/57/57px wide, 318px total in a 318px row (no scrolling needed; the
row scrolls rather than wraps if a draft badge widens it), each 44px tall,
labels at 12px. The conversation button draws a new stacked-bubble icon
(`chat-stack`) so it is no longer the same shape as the reply button; the
single `chat` bubble was dropped.

Reactions: pressed like/share carry the word (좋아요 → 좋아함, 공유 → 공유함,
matching 저장 → 저장됨) in both the label and the accessible name, the filled
icon, `aria-pressed`, a `--accent-soft` tint and a 1px `--accent` inset
outline. Token contrast is asserted in `design-system.test.ts`: accent on
accent-soft 6.0:1 light / 6.6:1 dark, accent outline against surface 7.3:1
light / 8.8:1 dark.

Visibility: the badge now prints the word beside the icon (팔로워만 / 다이렉트
/ 조용히 / 제한됨) at 12px, `--ink-muted` on `--surface-2` (5.6:1 light,
6.4:1 dark); the full sentence stays as the screen-reader text and the title.

Toast: `.toast-region` is no longer fixed or sticky. It is a bar in the
reading column's own flow, directly under the page header, so it pushes the
composer and the first card down instead of covering them; at 390 it is one
line instead of four wrapped ones. `aria-live="polite"` and the 4s duration
are unchanged, and the JS that used to nudge the fixed region around open
composers is gone. Trade-off: a confirmation raised while scrolled far down
the list is announced but not on screen.

Type scale: the tokens were already seven steps, but 72 rules set a
`font-size` without a `line-height` and inherited whichever leading was in
scope, so the rendered scale had drifted. Every rule that sets one now sets
both, `.author` lost `line-height: inherit`, and the compact-density leading
overrides that fought their own type steps were removed. The design-system
test fails on a rule that declares only one of the pair, on a bare
`line-height` number outside `:root`, and on more than seven size/leading
pairs.

Touch targets at 390: the author control went 128×21 → 128×44 and the
"원글 보기" cue 68×28 → 44px tall, both through padding and `min-height`
(`max-width: 650px`, or any coarse pointer).

Honesty: the composer says `이미지 첨부는 아직 지원하지 않아요. 대체 텍스트도
여기서는 쓸 수 없어요.` — there is no file input and none is implied.

Tests: 199 unit tests (18 files; +5 across `design-system.test.ts` and
`note-body.test.ts`, including WCAG contrast maths over the colour tokens) and
56 Playwright ui+product tests (+6: the counter under real keystrokes and the
over-limit refusal, five labelled 44px actions with five distinct icon paths
at 390, the author and reply cue as 44px targets, a reacted control that
differs by text/fill/outline as well as hue, the toast clear of the first card
and an open composer at 390 and 823×514, the visibility word and its contrast
at 390 and 1440), plus the three real-ONI c2s tests. Not done: no media upload
or alt-text authoring (stated in the composer rather than faked); no
conversion claim is made from this review.

Seventh independent surrogate, the actual target user: self-hosts a go-ap/oni
server as their personal account, drove Kimino against the real fixture and
verified every claim with authenticated requests. Would not yet switch from
curl and a hand-written script, because Kimino can only create, with no delete,
edit or follow, so the terminal stays open beside it. Honesty audit found one
real defect: sharing a followers-only note stored an Announce addressed to the
public collection, so the card's own badge and its own button contradicted each
other, which would leak on a federating server. Also found the reply composer
rendering a still-hidden warned body verbatim, replies not carrying the
parent's warning forward, and the dropped-activity count reachable only by
hovering an element that is hidden on a phone. Everything else matched the
server exactly: addressing per visibility on publish, the reply clamp, and the
rejected undo reported truthfully with its status. All six Round 8 items passed
with measurements, including the character counter, visible mobile action
labels with distinct reply and thread icons, the visibility word, non-color
reaction states, the non-overlapping toast, and 44px author and reply controls.

A follow-up probe of the same server then contradicted the Round 4 conclusion
that reactions cannot be withdrawn. Undo is indeed refused, but Delete of the
Like or Announce activity succeeds, and Delete and Update of one's own notes
work as well. Delete answers 410 Gone with a Location header, so a client that
treats 4xx as failure would misreport success, and Update requires the object
embedded with its id. Follow is accepted but inert, with no Accept and an empty
following collection, so it stays unbuilt.

### Round 9 — reaction scope, the warned reply, the dropped count, long feeds

Independent review by a reviewer who self-hosts an oni server, driving this
build against it and checking the results with authenticated GETs. Findings
and what changed:

Privacy defect: `client.react` hard-coded `to: [as#Public]` on every Like and
Announce, so sharing a followers-only note stored an Announce addressed
`to: [Public], cc: [followers]` over an object whose own `to` was `[followers]`
— the card said 팔로워만 while the button published it. Addressing now comes
from the note itself, through the rule that already clamps replies
(`reactionAddressing` in `domain/note-content.ts`, which delegates to
`buildAddressing`). Per note visibility, for Like and Announce alike:
public → `to: [Public], cc: [followers, author, mentions]`;
unlisted → `to: [followers, author, mentions], cc: [Public]`;
followers → `to: [followers], cc: [author, mentions]`;
direct → `to: [author, mentions], cc: []`;
unknown → `to: [author], cc: []` (no guess, no followers collection, no
Public). Self is filtered out of the participant list everywhere, so reacting
to one's own followers-only note sends `to: [followers], cc: []`. A scope that
needs a followers collection the server does not expose (followers, unlisted)
is refused with `AddressingError` before the POST, and reads as a plain reason
under the note rather than being widened. Undo is left addressed as it was:
ONI rejects Undo with 400 regardless, and the honest report of that rejection
is what the previous round verified.

Non-public cards now carry one line above the action row saying what the share
will do (e.g. 팔로워만 공개 글이라 팔로워에게만 공유돼요.); public cards say
nothing, because a share reaches the same people the note already did.

Content warnings: replying to a warned note quoted its body verbatim into the
composer's parent preview, walking past the gate the card puts up. The preview
now shows the same warning line and 내용 보기 / 접기 control. A reply also
starts with the parent's `summary` prefilled in its warning field (editable,
removable, no "re:" prefix), so a warned conversation stays warned; a reply to
the R8 test note stored `summary: "R8 경고"` instead of `None`.

Dropped activities: `syncSummary` lived only in a `title` on `.context-handle`,
which is `display: none` at 390px, so the one place the client admits it
dropped activities was unreachable on a phone. The foot of the timeline now
prints it as text on every viewport — "불러온 글 N개 중 M개 표시 · 마지막 확인
… · 미지원 활동 N개는 표시하지 못했어요" — and the last clause is omitted when
the count is zero. The tooltip is unchanged.

Long feeds: 122 notes rendered as one 16,191px page. The list is now read 50 at
a time (`PAGE_SIZE`, `pageNotes`) with a 더 보기 control that says how many
loaded notes remain, and a fixed 맨 위로 control that appears past roughly two
screens and moves both the viewport and the focus to the top of the list
(`scroll-behavior: auto` under `prefers-reduced-motion: reduce`, and its
appearance animation is disabled there too). Paging is client-side over
already-loaded notes only — no server pagination is faked — and the page count
lives in the view model, not in the list component, so it survives a
conversation opening over the list on a narrow window. Search, save, threads
and the author filter all reset to the first page; a refresh does not.
`focusPort.restore`/`focusCard` now wait for the frame after the state change
before restoring the offset: on a narrow window the list is re-created when a
thread closes, and the old microtask ran while the page was still short enough
for the browser to clamp the scroll.

Tests: 219 unit tests (19 files; +20 across `note-content.test.ts` (reaction
addressing per visibility, unknown, and the refusal), `core.test.ts` (the
client sends that addressing and posts nothing when it cannot),
`note-body.test.ts`, `feed-selectors.test.ts`, `feed-view-model.test.ts` and a
new `copy.test.ts`), 60 Playwright ui+product tests (+4: the share scope line
and an Announce with no Public over the mock server, the warned parent preview
and the inherited warning through two POST bodies, the dropped count as visible
text at 390, and paging + 맨 위로 + scroll restoration returning from a thread
on page 2), and 4 real-ONI tests (+1: publish a followers-only note, share it
through the UI, find the stored Announce in the outbox and assert `to` is the
followers collection with no Public IRI in `to` or `cc`).

Not done: Undo addressing is unchanged (see above); there is still no server-
side pagination, no media upload, and no claim is made about conversion.

Eighth independent surrogate (sysadmin who runs an oni server for a small
shared hobby account, never used curl for ActivityPub) drove the new
destructive actions against the real fixture and verified each with
authenticated requests. Verdict: would not move their account onto Kimino,
because an edit sent from a stale card silently republishes a deleted post
while the app keeps calling it deleted, and because a post can be edited only
once before the editor opens empty. Confirmed correct against the server:
publish, editing text, adding then removing a warning, followers-only
addressing with no public collection anywhere, delete leaving a Tombstone that
stays gone after reload, and likes and shares genuinely absent from the outbox
after withdrawal. Destructive-action UX passed on the confirmation wording,
focus placement, cancel path, target sizes and the 407px separation between
the delete trigger and its confirm button, and edit and delete correctly
appear only on the reader's own notes. Remaining: the composer promises an
edited marker that this server never shows, one share withdrawal reported
success and failure at once, deleting an already-deleted post reports success,
the new own-post controls sit off the right edge at 390px, and 199 of 299
outbox items load with no way to reach older posts.

### Round 10 — withdrawing a reaction, deleting and editing my own post

Probed against the running ONI fixture (master-58be49b) before writing code, and
re-verified in `tests/c2s.spec.ts`. `Delete` is accepted and its **success**
status is 410 Gone with a `Location` header. Deleting a Note leaves its `Create`
in the outbox with the object replaced by a `Tombstone` carrying
`formerType: "Note"` and `deleted`; an authenticated GET of the object then
answers 410 with that Tombstone. Deleting a `Like` or `Announce` removes that row
from the outbox. `Undo` of a Like or Announce is still refused (400), so it is no
longer sent anywhere. `Update` is accepted (201) with the object embedded **and
its id**; a bare IRI is accepted and changes nothing. `summary: ""` clears a
content warning. Omitting `to`/`cc` from the patch leaves the stored addressing
untouched.

Withdrawing a like or share now deletes that reaction's activity. The activity
IRI comes from the loaded activities through the pure evaluator; `ownReaction`
returns one only when it is an addressable http(s) IRI, and without one the
client refuses with the reason rather than guessing which activity to delete.
The 410 rule lives in the HTTP adapter and is scoped to the single call that
sends a Delete: reads, Create, Like/Announce and Update all still fail on 410,
which `core.test.ts` asserts call by call.

Own notes carry 수정 and 삭제 at the end of the action row, after the five actions
every note has, so the reading controls keep their place and their 44px targets.
삭제 opens an inline confirmation naming what happens (the post leaves this
server, it cannot be undone, copies other servers hold are not recalled); focus
lands on 삭제 취소 and there is no keyboard shortcut, so no stray key press can
delete a post. After a successful delete the note leaves the list, its drafts go
with it, an open conversation on it closes with a reason, and focus moves to the
list. The evaluator now reads a Tombstone (or any object with `formerType`) as a
deletion before anything else, so the rewritten `Create` cannot resurrect the
note and it is counted as neither ignored nor rejected.

수정 reopens the composer with the stored text (HTML flattened back to plain text
by `editableText`) and warning, and posts an `Update` with the object embedded.
Visibility is reported, not offered: this server does honour a new `to` in an
Update, but a published note's original recipients cannot be reproduced
faithfully from what the client loaded, so the patch carries no addressing at
all and the form says so in one line. The "수정됨" marker shows the relative time
of the edit — but ONI stamps `updated` at creation and never advances it (an
explicit `updated` in the patch is ignored), so on this fixture an edited note is
not marked as edited. The real-server test asserts that limitation instead of
hiding it; the marker itself is covered in `tests/ui.spec.ts`.

Tests: 231 unit tests (19 files; +12 across `core.test.ts` (tombstoned objects as
deletions, a Delete withdrawing an own reaction, `ownReaction`, the 410 rule per
call path, the Update payload shape), `feed.test.ts` (`editableText`),
`note-body.test.ts` (`composeScope`) and `feed-view-model.test.ts` (the
confirmation, the closed conversation, a refused delete, and the edit round
trip)), 66 Playwright ui+product tests (+6: withdrawal by Delete over a mock that
answers 410 and drops the row, a reaction with no activity IRI refused, the
confirmation flow including Enter and Escape backing out plus the tombstone not
resurrecting the note, the conversation closing with a reason, the dated 수정됨
marker, and the edit round trip asserting the embedded object and the absent
addressing), and 6 real-ONI tests (+2: publish/delete/reload with the 410 read
back as a Tombstone, and publish/edit/read back with content, summary and
audience checked).

Not done: no follow (the server accepts `Follow` but never answers `Accept` and
`following` stays empty), no media upload, no `Block`, and no visibility change
on edit. Deletion is described only as what it does on this server.

### Round 11 — stale cards, the reopened edit, action words, the phone row

An independent reviewer who self-hosts an ONI server drove the round 10 delete and
edit features against it and verified each finding with authenticated requests.

A stale card could republish a deleted post. With two tabs on one account, tab B
deleted a note (410 with a Tombstone) while tab A kept showing its card; editing
from tab A reported success and the server served the note again at 200 with the
new body, readable unauthenticated, with Create, Delete and Update all in the
outbox — and the post was unreachable in the app, so it could not be deleted
again. ONI treats an `Update` as an upsert. The gateway now has `noteExists`, an
authenticated read of the object that answers false on 404, 410 or a Tombstone
body and rejects on anything else, so an unreachable server is never read as a
deletion. An edit confirms the object first and refuses with `note-gone`; the
form closes, its draft goes with it, the card leaves the list and the page says
what happened. A delete confirms first too and reports `already-gone` — truthful,
and not an error to act on. Both are covered against the real server, including
an unauthenticated read of the object afterwards and the absence of any `Update`
in the outbox.

The edit form locked after one save. `Composer.submit` writes its cleared value
back to the owner on success (`setText('')` → `onDraft('')`), and `startEdit`
took that empty string as a kept draft (`local.drafts[key] ?? …`), so the second
open showed an empty textarea with the save button disabled while the warning
field, whose options entry had been dropped, refilled from the note. The rule is
now `editDraftText`: a blank kept draft is not a draft, so the form reopens with
what the server stores. Verified by reverting the rule and watching the new
browser test fail with an empty value.

A withdrawn share reported success and failure at once. `reload-failed` now
carries the write it followed (publish, reply, edit, delete, like, unlike, share,
unshare) and the copy is per action, so a withdrawal never borrows publishing
words. A confirmed like or share is also kept in view-local `confirmed` state and
applied over the loaded notes by `withConfirmedReactions`, so the control shows
what was written even when the read after it fails; a later successful load
supersedes it.

At 390px the action row scrolled sideways with no hint, hiding 수정 and 삭제. The
row now wraps under a 560px column: the five common actions stay on the first
line, the own-note controls sit on the second, and every control keeps its label
and its 44px target. Own notes carry a "내 글" badge, since every author on a
one-person server shares the host.

The composer no longer promises a "수정됨" marker; it says the marker depends on
the server recording an edit time. The marker rendering is unchanged for servers
that advance `updated`.

The list foot now reports what the read actually reached: distinct activities
fetched from the inbox and outbox, and per collection the shortfall against the
`totalItems` it declared. Nothing is claimed for a collection that declares no
total, and there is no "load older" control: this client follows a collection's
own `next` links to their end, so anything still missing has no page left to ask
for and the foot says plainly that older posts cannot be reached. On the local
fixture the client reads 386 distinct activities against 345+13 declared (ONI's
`totalItems` lags its own pages), so no shortfall is claimed.

Tests: 253 unit tests (19 files; +22 across `core.test.ts` (collection reach with
overlapping pages and a declared shortfall, `noteExists` for 200/404/410/Tombstone
and its authenticated header, and a server problem never read as a deletion),
`social-session.test.ts` (the refused edit, the already-gone delete, a read
failure failing the write, and the action on every reload failure),
`feed.test.ts` (`editDraftText`), `feed-selectors.test.ts`
(`withConfirmedReactions` and the gone filter), `copy.test.ts` (`reachLine`),
`copy-failures.test.ts` (per-action reload copy, `note-gone`, `already-gone`) and
`feed-view-model.test.ts` (reopening an edit after a cleared draft, the dropped
card, a delete surviving a failed reload, and a confirmed reaction)), 73
Playwright ui+product tests (+7: the twice-edited note, the withdrawal with a
failed reload, the refused stale edit, the already-gone delete, the 390px row
with all seven controls inside the viewport, the own-note label, and the foot's
shortfall line), and 8 real-ONI tests (+2: the stale edit and the already-gone
delete).

One existing product assertion was adjusted: the reaction-feedback proximity
check now measures from the action row rather than from the one button, because
the row wraps on a phone; the button-to-message distance is still asserted.

Not done: no "load older posts" control, because the client already follows every
`next` link a collection offers and there is no further page to request; the foot
states that rather than faking pagination.

Ninth independent surrogate (oni self-hoster, pragmatic, previously burned by
clients that misreport server state) verified Round 11 against the real server
and gave the first unqualified yes: would move their oni account to Kimino,
because every destructive and corrective action told the truth about what the
server held, including the two failure modes the previous reviewer found. They
would still need another tool for attachments, follows and Mastodon-only
contacts. Measured passes: three consecutive edits without reload, each
reopening with the stored text and each landing on the server; a warning added
then removed with the summary absent, set and absent again; the stale-card edit
refused with no Update activity written and the note still gone to an anonymous
reader; the stale-card delete reported as already gone rather than as an error;
twelve of twelve reaction transitions matching the outbox, including a blocked
refresh that kept the control truthful and an offline withdrawal that did not
flip; a deleted reply lowering the parent count everywhere; other people's
posts offering no edit or delete; and every own-post action reachable on a
phone without scrolling the row. Two honesty gaps remained: activities the
client rejects for safety are counted but never shown, so a post the server
holds can vanish silently, and a success toast from one save can still be on
screen while the next save is in progress. One new defect: on desktop, at every
width from 1100 to 1920, the delete control and its confirmation are clipped
outside the conversation panel and cannot be clicked.

Verification note: the full browser suite is 81 tests and passed nine
consecutive runs after Round 11, including two full runs against the real ONI
fixture. One earlier run showed a single failure that has not reproduced since
and whose artifacts were not retained, so it is recorded as an unexplained
flake rather than a fixed defect.

### Round 12 — the panel action row, refused activities, a stale toast, the token

Root cause of the clipped delete control: `.thread-panel .note-actions` set
`flex-wrap: nowrap`, and being a two-class selector it outranked the
`@container column (max-width: 559px)` rule that makes the row wrap (a container
query adds no specificity, so file order could not fix it). That query's
`overflow-x: visible` did win over the row's own `overflow-x: auto`, so the row
could not be scrolled either, and `.thread-panel { overflow: hidden }` clipped
what overflowed. Measured before the fix at 1280-1920: row `scrollWidth` 460
against `clientWidth` 390, `scrollLeft` stuck at 0, and `elementFromPoint` at the
delete control's centre returning the app shell. The panel row now wraps
explicitly, as the phone row does; no control is hidden and no label is dropped.

Also in this round: the list foot now reports `diagnostics.rejected` beside the
existing unsupported count, in separate words that say the activities were
refused for safety rather than unsupported, and stays silent at zero; the
evaluation guard itself is unchanged. Any notice standing from a previous write
is cleared when the next write begins - the POST, and also the composer,
confirmation or reaction that starts one - instead of waiting out its four
seconds. After a connect that did not tick the sessionStorage box, one
dismissible line says the session ends on reload and that the option exists; the
default is unchanged, nothing is stored either way, and it is offered at most
once per page session (never for the preview or a restored tab).

Tests: 261 unit tests (19 files; +8 across `copy.test.ts` (`refusedActivities`),
`session-restore.test.ts` (`shouldOfferSessionHint`), `feed-selectors.test.ts`
(`currentNotice` and the two new state fields) and `feed-view-model.test.ts` (the
superseded confirmation across five write beginnings, and the reminder offered
once)), 80 Playwright ui+product tests (+7: the panel row and delete
confirmation at 1100/1280/1440/1600/1920, the refused count, silence at zero, the
stale confirmation, the reminder and its dismissal, the opted-in and restored
tab, and the preview) and 8 real-ONI tests (unchanged). The round 6b assertion
that the panel row stays on one line was replaced: it asserted a property the
clipped row satisfied vacuously, and now asserts that every control lies inside
the panel and the row does not scroll sideways.

Not done: attachments and follow, which remain honest capability gaps.

Verification: 88 browser tests (ui + product + c2s) passed, then ui+product
passed twice more, 80/80 each; `npm run check` green.

### Round 13 — the write lock, the author's name, the phone bar, the quiet foot

Tenth independent surrogate (four-year mastodon.social user on the official web
app and Phanpy, weighing a move to a self-hosted oni server; drove the real
fixture at 1440x900 and 390x844 and checked every write with authenticated
GETs) would not yet move their account but would use Kimino as a secondary
client today, calling the reading side calm and honest. Every write matched the
outbox. Top frictions: after every write the whole page froze for about two
seconds (POST answered 201 in 58 ms, the toast appeared at +200 ms, the button
flipped at +2500 ms, and 250 of 421 buttons were disabled meanwhile); own posts
were attributed to "localhost:8443" although the actor has a preferredUsername;
toasts claimed completion before the UI showed it; Escape on the conversation
heading did nothing; "연결 해제" sat as a fifth phone tab with no way to compose
once scrolled; the list foot's diagnostics were the second-loudest text on an
empty replies view; the first post began 183/229 px down because the session
hint banner sat over the feed; 삭제 was the only coloured word in an own row.

Root cause of the freeze: `write()` in the session kept `busy` true across the
POST and the full-timeline reload, and every control was disabled off that one
flag. The session now splits `busy` (a POST or connect in flight) from
`refreshing` (the read that follows a confirmed write). The write resolves at
the 201; the reload runs in the background under its own generation guard, so a
new write may start during it — the stale read's result is dropped and exactly
one read follows the new POST. Two POSTs are still refused, now only for the
POST's own duration. A pure `noticeTiming(action)` rule puts reaction and
delete notices at the 201 (the list already reflects them through the existing
confirmed-reaction map and the local card removal) and publish, reply and edit
notices with the read that shows them; a failed read leaves only the per-action
`reload-failed` warning, never a success toast. Only the header's refresh
control follows `refreshing`.

Names: `presentation/actor-name.ts` derives the label as name, then
preferredUsername, then the id's last path segment, then the host, with a muted
`@user@host` line that is omitted when it would repeat; cards, "님이 공유", reply
targets and the account line use it. Escape anywhere inside an open conversation
(outside inputs and open composers) returns to the originating card in both
layouts. On phones 새 글 쓰기 is the fifth tab and disconnect lives in the account
sheet opened from a header control; the preview keeps its exit tab. The list
foot is one muted line — loaded count, "표시하지 않은 활동 N개", last check — with
a 자세히 disclosure holding the per-reason sentences and the reach line, and it
stays silent at zero. The session hint moved under the account line (wide),
under the composer (tablet) or into a dismissible strip above the tab bar
(phone); first-card offset with the hint shown went 183 → 120 px at 1440 and
229 → 129 px at 390. 삭제 is neutral at rest and red on hover, focus or while its
confirmation is open; pressed pills lost their extra weight; the permalink is
"서버에서 보기" so it no longer collides with "원글 보기"; the desktop right
column is a single muted line when there are no replies.

Architecture (independent audit, all items applied): the adapter's English
empty-note guard is gone (the composer owns it); demo refusals are a typed
`GatewayReadOnly(action)` mapped to `{ kind: 'read-only' }` with the Korean text
in `copy-failures.ts`, so no adapter can smuggle copy through a bare Error;
Delete addressing policy is `withdrawalAddressing` in the domain; the
unknown-scope rule has one home (`replyLimit`); one `parentOf`; the duplicated
`parents/replies/missingParent` state fields are gone; `Density` is imported,
not mirrored; the boundary test normalises root-absolute specifiers, matches
re-exports and fails on an empty directory; dead exports and stale "for Undo"
comments removed.

Tests: 286 unit tests (20 files; +25), 100 Playwright ui+product+writes tests
(+13 including the new `tests/writes.spec.ts`: like flips within 300 ms while
the outbox GET is delayed 1.5 s with zero disabled action buttons, a second like
mid-reload, and the edit toast landing in the same frame as the edited content)
and 8 real-ONI tests, all green. Two spec adjustments: the failed-refresh publish
test now expects no success toast, and the real-server phone flow opens the
account sheet to disconnect. Not done: no "새로고침 중" text in the foot (the
header spinner is the only indicator); the phone hint is a fixed strip rather
than in flow, because the header and collapsed composer alone reach 129 px.

### Round 13b — the write queue, the toast pill, the phone corner, one naming rule

Eleventh independent surrogate (six-year Mastodon user who runs a small
Hometown instance, Tusky and the web app) verified the Round 13 build against
the real fixture: would not yet move their account, would use Kimino as a
secondary client today, and found nothing dishonest about server state (two
edits produced exactly two Updates, deletes answered 410 and left the outbox,
the withdrawn like was gone). Of the eight Round 13 claims, Escape, the quiet
foot and the first-card offset passed outright. Partial: during the POST's own
47-120 ms window every control was still disabled; reply cues carried no name
and the account sheet printed a bare host; after a failed reload the success
toast and the warning stacked; the fixed 맨 위로 button sat on top of the new
새 글 쓰기 tab; the phone hint strip covered whichever card was behind it. New:
the in-flow toast pushed the first card down 53-60 px for the toast's lifetime,
so a second tap at the top of the feed hit the wrong control; author search
matched the raw IRI host rather than the shown name; a revealed content warning
re-collapsed after every write and reload, so an edited warned note never
showed its new text until re-revealed.

An independent code review of the same build found two defects the surrogate
did not: a POST that failed while an earlier write's read was still out
discarded that read and started no replacement, so the earlier write never
landed; and list shortcuts fired behind the modal sheets (r opened a composer
under the backdrop). Also: Takahe-style `/@alice` paths produced `@@alice@host`,
and two actor-labelling rules still coexisted.

Session: writes are a serial queue — a second write waits for the first POST,
never for its read; a queued write suppresses the earlier write's reload so one
read covers both, and a write arriving during a read discards that read and is
followed by its own. A read discarded or skipped this way is remembered as
owed, and a failed POST that owes one starts it with the POST failure kept as
the error, so nothing written ever fails to land. `busy` is gone from the
session and the view state; `connecting` covers the only case a global gate is
honest, reactions and deletion are gated per note, and a reload failure clears
the success notice so one message shows. `refresh()` reports whether a read
ran, and the view model clears errors only then and "gone" cards only when the
load time advances. Content-warning reveal state lives in the view model keyed
by note id, survives reloads and paging, and resets on disconnect. Author
search matches the display name always and the `@user@host` handle when the
query contains an @, never the bare IRI.

Surfaces: the toast is a fixed, bottom-centred pill with `pointer-events: none`
(taps pass through), safe-area aware and one slot above 맨 위로 on phones; it
never shifts the feed (asserted zero first-card movement at 390 and 1440) and
never intersects the first card or the composer at scroll 0. Trade-off: it can
visually overlap a reply composer scrolled to the very bottom. 맨 위로 sits above
the tab bar on phones (measured y 732-776 against a bar starting at 788, and
`elementFromPoint` at the compose tab returns the tab). The phone hint is one
36 px in-flow line with a 자세히 toggle; first card 166 px shown / 129 px
dismissed at 390, 120 px at 1440. Shortcuts are inert while a sheet or the help
dialog is open, and dialog close restores focus only to a still-attached opener.
`actorName` is the single rule (leading @ stripped, no doubled handle);
`actorLabel` is deleted and the author/account sheet, header chip and account
line derive from it. Reply cues read "alice에게 · 원글 보기" when the parent is
loaded. Every Hangul literal left the components for `copy.ts`, and
`copy.test.ts` scans components and `app.tsx` and fails on any that returns.

Tests: 306 unit tests (20 files; +20) and 109 Playwright tests (101 ui, product
and writes; +9 including the queued-likes, single-message-on-failed-reload and
revealed-through-edit cases; 8 real-ONI, unchanged), all green. Two spec
adjustments follow from the rules above: a withdrawn share with a failed read
shows only the warning, and the author sheet exposes name and `@handle`
separately. Not done: attachments and follow remain recorded gaps; the pressed
reaction pill keeps weight 500, the same as every other action.

### Round 14 — the quick read after a write, the phone row, always-open warnings

Twelfth independent surrogate (five-year mastodon.online user, Ivory and the
advanced web UI, a Korean illustrator who posts daily behind content warnings)
verified every Round 13b claim as a pass on the real fixture: two likes 20 ms
apart both landed with nothing else disabled, the toast moved neither the first
card nor the composer, 맨 위로 cleared the compose tab by 11 px, shortcuts were
inert behind the sheets, a revealed warning survived two edits and a reload, the
account line and sheet showed name plus handle, and reply cues carried the
parent's name. Nothing about server state was dishonest. Verdict unchanged:
would not yet move the account, would use Kimino as a secondary client, and
named one change that would most move them: every post or edit waited about
three seconds on a 46-request walk of the whole outbox, while a like showed in
75 ms. Other frictions: the toast pill sat over the fourth card's actions for
its lifetime; seven own-card actions took two rows on the phone, so a warned
own card was 322 px; no way to keep all warnings open; 촘촘하게 saved about
eleven percent because the warning box and action bar dominate; a restored tab
showed no navigation or account line for the three seconds of the first read.

An independent code review of the same build added: a superseded refresh wiped
per-note errors; `deleting` and `pending` were single ids, so a second delete or
reaction re-enabled the first one's control; a queued write dropped by
disconnect resolved as success and the composer cleared its draft; the Hangul
scan missed escapes and entities; two headings shared an id.

Probed the fixture before building: the outbox root is an inline ordered page,
newest first, twenty items, `first` pointing at itself; a just-accepted Create
is at index 0 on the next request; the inbox is one inline page and never holds
the actor's own C2S activities. The gateway port gained `loadRecent(previous)`:
one page per collection, merged into the held activities by the pure
`mergeActivities` (incoming wins by IRI; a note that fell off the first page is
kept, because the server still holds it), with the reach figures carried
unchanged from the last full read and the timeline marked partial so the foot
says "마지막 부분 확인". The read after a write is the quick one; connect and
새로고침 are still full walks, and a failed quick read falls back to one full
read before reporting `reload-failed`. One correction surfaced by the existing
withdrawal test: a Like or Announce the server removed at this client's request
is exactly what must not be kept when it vanishes from the first page, so the
session remembers confirmed withdrawals and drops them before the quick read.
The actor is read once per connection and reused by writes. Measured on the
fixture, publish to card on screen: 47 GETs and 3,067 ms before, 3 GETs and
266–348 ms after, asserted in the real-server suite.

Surfaces: the toast pill passes taps through (only its dismiss control is
interactive), lives for three seconds, and on wide layouts sits at the foot of
the right column instead of over the reading column. Under a 480 px reading
column, own cards keep six actions on one row and fold 수정/삭제 behind a 관리
control (aria-expanded, Escape closes and refocuses; the delete confirmation is
unchanged); a warned own card at 390 is 195 px folded and 243 px open, and
1280/1440 keep them inline (the 1280 reading column is 504 px, which is why the
threshold is 480 and not 560). "경고 글 항상 펼치기" beside 촘촘하게 is a persisted
flag; a per-note 접기 still collapses one note for the session. In compact
density a warning is one line: a warned card at 1440 went 152 → 92 px. A
restored tab renders the navigation and "…로 연결됨" from sessionStorage before
the first read completes. Also: the per-note in-flight sets, the refresh that
clears errors only when the load time advances, the dropped queued write that
now fails as not-connected, the hardened Hangul scan, focus restore that skips
hidden or disabled openers, and a single `page-heading` id.

Tests: 332 unit tests (21 files; +26) and 117 Playwright tests (108 ui, product
and writes; 9 real-ONI including the new GET-count assertion), all green after
one test rewrite: the "publication waiting for actor discovery" case encoded
the second actor read that no longer happens, and now asserts one actor read
and nothing hydrated after a disconnect mid-POST. Real-server connect
assertions carry a 30 s timeout because the full walk is about 800 activities.
Not done: no server-side pagination and no "load older" control (unchanged);
the quick read cannot discover activities that arrived deeper than the first
page since the last full read, which is why 새로고침 stays a full walk.

### Round 15 — reading back what was touched, threads that read as threads

Thirteenth independent surrogate (three-year Mastodon user on a mid-sized
Korean instance, Mastodon web and Moshidon, a software engineer weighing an oni
server with Kimino as the only client) verified the Round 14 build against the
real fixture. Verdict: would not move as the only client — on a single-user
go-ap server the timeline is the reader's own outbox, so a reading habit built
on following four hundred people has nowhere to go, a server-model gap rather
than a client one — but would adopt Kimino as a secondary client "without
hesitation", calling its write round-trips the fastest and most honest C2S
flows they had used. Measured: publish 265–286 ms and exactly three GETs after
the POST; reply and edit likewise; withdrawal 102 ms with the Like gone from
the outbox; the stale-tab edit refused with no re-Create; nothing dishonest.
Partial: the phone toast's dismiss control intercepted a tap on a card's action
beneath it, and once counts appeared the phone row wrapped so 관리 dropped to a
second line. New frictions: at 1440 the conversation column wrapped every own
card's 수정/삭제 to a second row and every reply carried the same "Oni에게 · 원글
보기" cue, so a three-deep thread was four unordered cards; six visible cards
all wore "내 글", the handle and a self-reply cue on a one-person server; j/k
moved the outline while a green bar stayed on the note the thread was opened
from; a reload dropped the open conversation; the two sidebar toggles rendered
as the same filled pill as the active nav item.

An independent code review of Round 14 added one high finding and one honesty
gap: the remembered account read once at mount was shown while a different
account connected, and the quick read could not see an Update of a note whose
Create lay past the first outbox page (probed: ONI does add an Update row at
index 0 and the object read reflects the new content, so the case did not bite
on this server, but the client relied on it).

Quick read: `loadRecent(previous, touched)` now reads back each object the
write changed — the edited or deleted note — before the two collection roots,
and merges it as a synthetic read-back Update keyed by the object IRI (a 404,
410 or Tombstone is a deletion; other failures fail the read). Edit is four
GETs around the POST (existence check, read-back, inbox, outbox), publish stays
at three. The session records `touched` and `withdrawn` only after the
generation check, forgets what a partial read consumed, and resets both when a
full read lands or the connection changes. The real-server suite gained a test
that pushes a note past the first page with twenty-one newer notes, edits it
through the UI and sees the new words within a second.

Surfaces: the remembered account is a signal cleared when restore settles, and
a restored line says "연결 중…" until the actor's name is known unless the IRI
carries a username. The 관리 fold covers the thread panel, so own cards there
keep one row (347 px in the 458 px column at 1440); reaction labels fold behind
the icon once a count is present, so the phone row with two-digit counts is
302 px on one line with every target 44 px and the count still spoken. A reply
cue quotes its parent — the author and up to forty characters of plain text, the
warning line instead when the parent is warned, "이어서 · 원글 보기" for a
self-reply. When every loaded note is the reader's own, the "내 글" badge and
the handle are hidden and return with a second author. The thread has one
cursor: the roving outline; the opened-from note keeps its type step and loses
the bar. The open conversation is stored beside the view in the same
sessionStorage record and reopened after the first read if the note is loaded.
촘촘하게 and 경고 글 항상 펼치기 are `role="switch"` rows with a track and knob,
and the reveal preference is written through the view model like density. The
toast mounts once across the breakpoint, sits statically at the foot of the
right column on wide layouts, and on phones becomes the tab-bar band itself for
three seconds (full width, whole band dismisses, live region kept) so nothing
content-bearing is ever beneath it. Escape no longer closes the 관리 group while
its delete confirmation is open.

Tests: 350 unit tests (21 files; +18) and 127 Playwright tests (117 ui, product
and writes; 10 real-ONI including the page-two edit), all green. Caveat: the
fixture's outbox has grown to about 1,200 rows from reviewer notes and the
page-two test's extras, so a full connect walk measures about 5 s and the
real-server connect assertions carry a 30 s timeout. Not done: the follow
timeline remains a recorded gap, and the surrogate's primary-use "no" rests on
it.

### Round 16 — one voice, the deleted parent, the foot that counts, cards that fold themselves

Fourteenth independent surrogate (six-year Mastodon user, Elk and Tusky, a UX
writer who posts long self-reply threads) verified the Round 15 build against
the real fixture: would not yet move the account, would adopt Kimino as a
secondary client (connect 7.3 s on the grown fixture, publish, edit and delete
each under 400 ms, honest about what it had not loaded). Passed: hidden badge
and handle on a one-person server, one cursor mark, the restored conversation,
the switches, account switching with nothing of the previous account shown,
the page-three edit landing in 354 ms. Partial: nested cards still wrapped
their action rows (depth 3 in the thread column, depth 2 on the phone, and a
two-digit "대화 12" at depth 0 needed 321 px in a 318 px row); the desktop toast
sat statically below the viewport after a few replies. Named the single change
that would most move them: one voice — every toast was 습니다체 while every
other sentence was 해요체, and the save toast mixed both in one line. Found one
dishonest state: after deleting a thread root, its replies' cue became a live
"원글 보기 ↗" link to a URL the client itself had just made answer 410. Also:
the feed foot claimed "불러온 글 7개 중 7개" while a search over 505 loaded notes
was active; the edit composer's footer said "Enter로 게시" under a 수정하기
button and repeated a three-line marker hint on every edit; "Oni에게" between
nested own replies; the shortcuts dialog listed j/k as 이전/다음; the right
column's English tagline; the connection dot lit beside "연결 중…".

The Round 15 code review added: the phone toast band sat exactly over the tab
bar, so a tap meant for a tab dismissed the toast; `nameFromIri` greeted opaque
Misskey and numeric ids as usernames; the read-back did not verify the returned
object's id; a parent summary in the reply cue bypassed entity decoding; five
copy keys were dead.

Voice: every 습니다/됩니다/입니다 string in `copy.ts` and `copy-failures.ts` is
now 해요체 (게시됐어요, 저장했어요, 내 서버에서 글을 지웠어요, 걸러요, 동기화되지
않아요), and `copy.test.ts` fails on any that returns. Deleted parents: the
feed state's `gone` set is the union of local deletions and every tombstone the
evaluator recorded, `parentState` answers loaded, gone or unknown, and a reply
whose parent is gone reads "원글이 삭제됐어요" as plain text with no link;
"원글 보기 ↗" stays only for parents the client has never seen. The foot says
"검색 결과 N개 · 불러온 글 M개" under a search and "저장한 글 N개 · 불러온 글 M개"
in the saved view. The edit composer says "Enter로 수정" and keeps the marker
note behind a "수정 표시에 대해" disclosure. The thread cue reuses "이어서" for a
self-reply. j/k reads 다음/이전; the footer carries the sidebar's Korean caption;
the dot is grey until the actor is loaded. Cards are their own containers
(`container-name: card`), so the label folds key on the card's content width
rather than the column: at 390 a depth-2 row is 279 px and a depth-0 row with
two-digit counts 302 px, and a depth-3 own card in the 1440 thread column keeps
one row of six plus 관리. The phone toast is a strip directly above the tab bar
with no pointer events and no dismiss control (it clears itself in three
seconds; a tab tap during it navigates, asserted); the desktop toast is sticky
at the column's bottom edge, passes taps through, and the column reserves its
height while it shows so the last action row is never beneath it. Also:
`readObject` refuses a body whose id is not the note asked for; `nameFromIri`
accepts only segments that open with a letter, so Misskey aids and numeric ids
fall back to "연결 중…"; the cue decodes a parent's summary like its body.

Real-server suite: a page-two delete test (publish, push past the first page
with twenty-one newer notes, delete through the UI, card leaves, anonymous GET
answers 410), and the timeout raised to 120 s per test because the fixture's
outbox is now about 1,350 rows. A cleanup step was deliberately not added: on
ONI a Delete keeps the Create row and adds a Delete row (616 tombstoned Creates
and 337 Delete rows measured), so deleting would lengthen the walk, and the
only hard removal is an Undo of the Create, which is not shipped unasked.

Tests: 363 unit tests (21 files; +13) and 134 Playwright tests (123 ui, product
and writes; 11 real-ONI). Not done: the follow timeline remains the recorded
gap behind every primary-use "no"; the fixture reset is left to the user.

### Round 17 — refused deletions stay visible, shortcuts from inside a card, rows that never reflow

Fifteenth independent surrogate (four-year Mastodon user, official web app and
Ice Cubes, an accessibility-minded product manager who uses a keyboard and a
screen reader part of the day) verified the Round 16 build against the real
fixture: would not yet move the account, would use Kimino as a secondary
client today, calling the reading experience the calmest ActivityPub client
they had used and finding no lie about server state during an hour of writes.
Passed: 해요체 everywhere (zero hits across text, labels, titles and
placeholders), the deleted-root cue on cards, the scoped foot, the edit footer
and disclosure, the phone toast strip (a tab tap during it navigated), the
sticky desktop toast within the viewport, the grey dot until the actor loads,
the j/k wording. Failed: action rows still wrapped — the 1440 thread column at
depth 3 once 관리 was opened, and the phone at depth 2 and 3 with no counts and
at depth 0 with two-digit counts. Partial: screen-reader names — the author
control was named only "Oni", the countless 대화 button was a bare "대화", the
edit textbox kept the new-post placeholder. New: after `r` then Escape, focus
sat on the reply button and Enter reopened the composer while the next keys
typed into the draft; opening the thread of a reply whose parent the client
had just deleted showed "서버에서 원글 보기 ↗" pointing at a 410; the edit
composer carried an orphan "공개" label and a two-clause scope line; 검색 지우기
existed only in the empty state.

The Round 16 code review found a real regression: the presentation selector
that derived deleted parents added any Delete activity's object to the gone
set, so a Delete relayed from a non-author — which the domain refuses and
counts as rejected — would hide the reader's own note and mark its replies
deleted. It also found the 해요체 scan missing 합니다/갑니다/십시오, page-two
test posts leaking into the fixture on a failed assertion, the sidebar's dot
always green, and the username rule rejecting Mastodon's digit-leading names.

Deletions: the evaluator now exposes `deleted`, the set of deletions it actually
accepted (the author's own Delete, tombstones, read-back tombstones), and the
feed's gone set is local deletions plus that list; the selector's own Delete
scan is gone. A relayed Delete by another actor leaves the note visible and its
reply cue at 원글 보기, asserted in the domain and the selector. The thread view
reads a gone ancestor from the same set and says "원글이 삭제됐어요" with no link.

Keyboard: arrows and Escape act from any focusable element inside a card (the
card is resolved by `closest`), letters already did, and Enter stays card-only
so a button's Enter remains the button's. Conversation cards are memoised by
note id, which also fixed a reflow that recreated every card on any state
change and lost focus and the open 관리 row on a save or like.

Rows: the opened 관리 group is its own sub-row beneath the six on every card
under 431 px, so opening never reflows the reading controls. On cards under
349 px 저장 folds into that row for own notes; on cards under 300 px others'
공유/좋아요/저장 fold behind their icons; the 대화 count folds under 387 px.
Measured one-line rows at 390 for depth 0 with counts of 12/12/16 (279 px in a
318 px row), depth 1 to 3, and in the 1440 thread column at depth 1 to 3. The
1100 px panel at depth 3 (206 px card) still wraps, as the Round 12 test allows.

Also: the edit composer says "공개 그대로 · 본문과 경고 문구만 바꿔요" with no orphan
label and no new-post placeholder; 검색 지우기 shows whenever the query is
non-empty and the field's description says Escape clears it; the author control
is named "Oni 정보 보기", the countless thread button "대화 열기", the density
switch no longer claims to shrink the type; the formal-ending scan covers
니다/니까/십시오 while excluding 아니다; the sidebar and column dots are pending
unless a real actor is loaded; the scoped foot reads "저장한 글 중 검색 결과 N개 ·
저장한 글 M개" and names an author scope; `nameFromIri` accepts `2ndlaw` and
rejects only all-digit segments and Misskey aids; the page-two real-server
tests clean up in `finally`.

Tests: 367 unit tests (21 files; +4) and 143 Playwright tests (127 ui and
product, 5 writes, 11 real-ONI). Not done: the follow timeline is still the
gap behind every primary-use "no"; the fixture reset is left to the user.

### Round 17b — relayed tombstones, Escape backs out one level, the fixture ceiling

An independent code review of Round 17 found that the evaluator buried any
activity whose object was a Tombstone with no ownership check, while the
ownership rule covered only bare-IRI Deletes; Mastodon's real Delete carries a
Tombstone, so a Delete relayed by anyone could bury the reader's own note.
Burial now runs after ownership is established: a Tombstone wrapped in an
activity with an actor is accepted only when that actor is the note's author,
otherwise it is counted as rejected and the note stays. Bare Tombstones,
actor-less wrappers, Tombstones over notes never loaded, and the client's own
read-backs (which carry the session actor over own notes) still bury. Covered
at the domain and selector level. Also: Escape on the 삭제 button while its
confirmation is open now cancels the confirmation and keeps focus on 삭제
instead of falling through to the list (the Round 16 test that pinned the
older "nothing happens" behaviour was rewritten); the formal-ending scan
matches only ㅂ-final 니까 so the 해요체 connective 하니까 passes; the Misskey
aid rule requires a digit and a letter.

The full real-server suite then failed at connect on every test. Root cause was
the fixture, not the code: today's runs had grown the outbox to 2,012 rows
across 102 pages, past the client's deliberate 100-page ceiling, and the client
refused the truncated timeline with "서버 응답이 ActivityPub 형식과 달라요"
rather than showing a partial one. The Docker fixture was reset and re-seeded,
and `scripts/c2s-smoke.py` now asserts the outbox is within the readable
ceiling, names the reset command, and verifies the seeded notes by IRI. The
ceiling itself is a product limit worth its own decision: an account with more
than about 2,000 outbox activities cannot connect at all today, and the client
does not yet offer a bounded read with an honest "older posts not loaded"
state. Recorded, not changed.

Tests: 368 unit tests and 144 Playwright tests (127 ui and product, 6 writes,
11 real-ONI), all green on the reset fixture.

### Round 18 — rows that fold by their own width, selectors once, three files split

Sixteenth independent surrogate (five-year Mastodon user, Phanpy and Tusky, a
designer-developer who runs a personal oni server) verified the Round 17b build
on the reset fixture: every one of the eight claims passed except the rows —
arrows and Escape from any control in a card, the deleted-parent thread header,
the one-sentence edit scope line, 검색 지우기 on any query, the named author and
thread controls, Escape backing out of a delete one level at a time, grey dots
until a real actor. Verdict: not yet the daily client for their own server,
because on a 1280 px laptop every own card had 수정/삭제 orphaned on a second
line; yes as the secondary client, "beats curl and the oni web UI, and never
lies about what the server holds". Measured wraps at 1100, 1180, 1200 and 1280
while 1024, 1240, 1366 and 1440 were one row — the fold keyed on two fixed
steps, and the right column's jump from 360 to 460 px at 1280 stole card
width. New frictions: "이어서 · 원글 보기" repeated under a parent 40 px above it
in the thread column; "아직 받은 답글이 없어요" twice on one screen; 자세히 on its
own line; the composer placeholder one step larger than the body and the nav in
a slate that is not the brand green; the landing pre-filling a localhost URL;
the phone demo banner truncating; the edit composer opening with its submit
row off-screen.

An independent whole-codebase re-audit added: every card projected the whole
conversation tree to count its replies (O(n²) per state change); the note
selector ran twice per derivation; ~25 Korean strings in `note-body.ts`; the
draft ceilings as component constants; breakpoints and container thresholds
drifted into unnamed numbers; `social-session.ts`, `client.ts` and `app.css`
each mixing three concerns; the adapter importing errors through the use-case
module; `new Date()` in the application layer; derived state in JSX; duplicated
roving-cursor, warning-gate and failure-alert markup; three copies of the
browser test helpers; dead copy keys and CSS.

Rows: container steps are named in `presentation/design-tokens.ts` and the
stylesheet — fold 511 (관리 takes 수정/삭제, panel density), counted 419 (a
counted 공유/좋아요/대화 folds its word), tight 387, saveFold 349, icons 299 —
and `design-system.test.ts` fails on any `@media`/`@container` px literal that
is not a named value. Measured one row for own cards in the main column at
1100 (346 px), 1180 (426), 1200 (446), 1280 (406) and 1440 (534, seven inline),
in the 1440 thread column, and at 390 for depth 0 to 3. The thread cue is
suppressed when the parent is the immediately preceding rendered node; the
replies peek hides while the replies view is open; 자세히 sits inline; the
composer text is the body step (16 px kept on phones against iOS zoom); the nav
uses the accent token; the landing's Actor URL is empty with the local server
as placeholder; the demo banner wraps on phones; a reply or edit composer
scrolls its footer into view on mount.

Architecture: `application/write-queue.ts` owns the serial write queue, owed
reads, touched/withdrawn state and notice timing (social-session 524 → 282
lines); `activitypub/collection-reader.ts` and `errors.ts` take the collection
walker and error classes out of the client (538 → 385); `NOTE_LIMITS` and
`htmlFromPlain` live in the domain; `SessionError` lives with the gateway
errors and the re-export barrel is gone; the session takes an injected clock
and the architecture test forbids `new Date`/`Date.now` in domain and
application, covers optional-chained and `self`/`top`/`parent` globals, and
scans `src/routes` when it exists. Presentation: `byId` and `replyCounts` maps
computed once per derivation (an 8,000-note timeline derives in under two
seconds where the per-card walk took minutes); one-pass scope counting;
`copy-content.ts` for the note-body strings; `focusedNoteId` plus
`conversation.focused` replace the overloaded `thread` field; `skipTarget` is
symbolic and mapped to ids in the shell; `view-flags.ts` for connection-lit,
sheet-is-self and avatar initials; `WarningGate`, `FailureAlert`, `moveCursor`
and `joinLine` replace the duplicated markup; the stylesheet is reordered into
named sections with a z-index ladder and one `:root`; `tests/helpers/mock.ts`
and `tests/helpers/c2s.ts` hold the shared browser helpers, and the real-server
tests keep only their server-state assertions.

Tests: 391 unit tests (23 files; +23) and 150 Playwright tests (139 ui, product
and writes; 11 real-ONI). Not done: `NOTE_LIMITS` reaches the composer through
a presentation re-export of a domain constant, which is allowed by the boundary
test but is a seam worth a look; the follow timeline remains the gap behind
every primary-use "no".

### Round 19 — preview before credentials, writing position before the footer

2026-09-22. A fresh independent surrogate reviewed desktop (1440×900) and phone
(390×844) screenshots and used preview, saved posts, conversations and reply
drafts without reading earlier verdicts. This is simulated feedback, not user
research. Verdict: **no migration from Mastodon**, because the existing account
and network cannot be brought here; **would trial a compatible C2S account as a
quiet secondary reader**. The quiet palette and reading width worked. Ranked
frictions: the phone reply's submit/cancel fell below the bottom navigation;
the landing asked for a localhost Actor URL and exposed sessionStorage jargon;
the desktop's wide right rail repeated a reply already in the feed. Search was
interrupted during this review and was not reported as a product defect.
Screenshots: `/tmp/kimino-review19/{landing-mobile,feed-desktop,reply-draft-mobile}.png`.

Implemented the first two bounded fixes. The preview now precedes credentials,
with explicit example/read-only wording and a divider separating C2S connection.
An account URL example replaces localhost; local setup remains in developer
help. The retention checkbox uses plain language while its selected-state helper
still states the exact token storage behavior. Preview storage details remain
available in a disclosure. Existing colors, typography and styling system stay
consistent rather than adding a second visual system.

The reply failure was measurable: at 390×844 the submit button ended at y=837
behind navigation starting at y=787; at 390×300 the focused textarea began at
y=-56.5 after the footer scroll. The form now scrolls as a whole when it fits,
with bottom navigation clearance, then keeps its textarea visible when it does
not fit. Detached forms cannot scroll a later screen. Three browser regressions
failed on the original behavior and passed after the changes (including draft
preservation on cancel/reopen). A short viewport is a proxy for limited vertical
space; this does not claim a physical-device virtual-keyboard test.

The independent architecture audit reproduced an owed read leaking across a
direct reconnect and a disconnected reaction withdrawal throwing a raw
TypeError. Queue reset now clears the previous session's owed read; withdrawal
uses typed connection failures. Both have regression tests. Presentation time
helpers now require the injected/shared clock, including the account tooltip;
the architecture guard permits date parsing but rejects implicit wall-clock
reads outside the Solid bridge. NOTE_LIMITS remains a single inward dependency,
not duplicated merely to avoid its presentation export.

Deliberately deferred: shrinking the right rail also shrinks the active thread
and its action rows, so a static width reduction needs a separate comparison;
no unrelated layout overhaul or animation was introduced. Follow/network
compatibility, media authoring and the outbox page ceiling remain separate
product requirements. No reviewer was asked to change their verdict.

Independent code review found no P1/P2 defects. It identified that the new UI
regressions must be included by the documented `test:e2e:ui` command; integration
will put them alongside the existing UI cases. Final verification and fresh
post-change surrogate verdict follow in Round 20.

### Round 20 — a fresh verdict, then keep the draft visible after a resize

A second fresh surrogate, again without the earlier verdicts, used landing,
preview, search, saved posts, conversations, reply, cancel and reopen at
1440×900 and 390×844. Verdict: **no Mastodon migration** (existing-account
compatibility and image authoring remain blockers); **yes for a compatible C2S
account as a text-focused secondary client**. They found the reading surface
calm and readable and the audience/local-saving scopes clear. This remains
simulated feedback, not actual user research. The surrogate used demo data;
real connection and writes are covered separately by the ONI suite.

Measured confirmation: phone submit bottom 736px, navigation top 787px; a reply
opened at 390×300 keeps the textarea at y129–217. Cancel and reopen preserve the
exact draft, draft badge and notice. The first un-settled screenshot preceded
the mount layout frame; the settled measurements and screenshots are the review
evidence, not that transient frame.

One new bounded issue: resizing an already focused reply from 390×844 to
390×300 left its input at y379–467. Added a regression that failed with visibility
ratio zero, then kept the current focused composer control visible on window
resize. The handler coalesces frames, checks that the target is still focused
and connected, and removes its listener/pending frame on disposal. Unfocused
composers cannot move the reader. Independent code re-review found no P1/P2
lifecycle or focus defects. The same surrogate verified the fix: after resize
input y144–232, navigation y243; cancel/reopen input y129–217 and exact draft
preserved. Their migration verdict did not change and was not challenged.

Also separated the connection field's accessible name from its help description
so a screen reader need not repeat the compatibility text. The four new browser
regressions now live in `tests/ui.spec.ts`, covered by the documented isolated
UI command. Sacho fragments and generated `CHANGES.md` are updated.

Screenshots: `/tmp/kimino-review20/{landing-mobile,landing-desktop,preview-desktop,reopened-mobile,fixed-shrink,fixed-shrink-reopen}.png`.
Visual review scope: typography, surfaces and existing icons in those screens;
no new motion, no physical-device keyboard or assistive-technology session.
Window resize coverage does **not** prove mobile `visualViewport` keyboard
behavior. Follow/network compatibility and media creation remain product
requirements; more decorative polishing will not remove them.

Final code verification: `npm run check` passed (393 unit tests, strict types,
format, production build and Sacho consistency). The full browser rerun after
the last source change passed: **154 Playwright tests**, including **11 real
ONI tests**. `git diff --check` also passed. The local fixture was started
without resetting its data; smoke checked its readable page count before the
real-server suite.

### Round 21 — control unwanted authors, not just include favourite ones

2026-09-22 continuation. The previous goal turn made verified progress, but did
not complete the broader product objective. A new independent surrogate who
values control over an overwhelming feed used phone and desktop screenshots,
search, saving, author sheets and conversations. Verdict: **no Mastodon account
migration; only a trial as a secondary C2S reader**. Highest bounded blocker was
missing negative reading controls: an author could be included exclusively but
not hidden. They explicitly asked for reversible local author hiding, with a
discoverable management list, without calling it server blocking. Thread hiding
and account/media capabilities remained distinct needs. The author-name buttons
were also only 18.5–24.2px wide despite 44px height. This is agent simulation,
not human research. Evidence: `/tmp/kimino-review21/`.

Implemented author hiding across loaded timeline, received replies, search,
saved cards, parent previews, conversations and the reply peek. The account's
own author cannot be hidden. Saved IDs and unsent drafts stay intact. Unknown
unloaded saved links stay accessible because this client does not know their
author; the manager explains that exception. Known hidden parent notes get an
explicit hidden-parent cue, never a misleading deleted/unloaded statement or an
external link around the filter. Author hiding closes affected editing context
and refuses stale hidden-note reply/thread navigation.

Architecture: domain evaluation and the HTTP adapter are unchanged. Pure
`presentation/reading-controls.ts` owns filtering; the view model owns commands,
notices and the preference port. Browser serialization stores author IRIs only
under account-specific keys, wired at bootstrap. Preferences are loaded before
the first actor snapshot is emitted to avoid briefly exposing hidden cards.
Storage refusal applies changes only in memory and says so. Preview never stores
hidden authors and resets them on exit/reload. UI receives projected state and
commands; Korean copy lives in `copy-reading.ts`.

The author sheet offers the action; a persistent header count opens the native
modal manager. Each row restores an author. Native modal containment makes the
background application inert, and closing returns focus to its opener or the
heading when the opener disappeared. Short author names now get a 44px-wide
phone target. Added `tests/reading-controls.spec.ts` to the documented isolated
UI command so these tests are not accidentally omitted.

### Round 22 — explain absence and preserve the control being used

A fresh surrogate independently repeated save → hide → saved/replies and
restore at 390×844 and 1440×900. They found hiding and restoring understandable,
the local scope honest, and the mobile sheet layouts usable. Verdict remained
**no Mastodon migration; worth trialling as a reading-focused C2S companion**.
They did not verify real writes and did not claim to. Two actionable findings:
the generic empty copy implied no saved posts/replies existed, and the scope
text did not name all the affected screens. Both were implemented, not merely
recorded. A pure counterfactual checks whether this exact list/search would have
matching non-deleted notes without hiding, so unrelated hidden authors cannot
be blamed for a genuine empty search. It then explains hiding and offers
'숨김 설정 확인'. Scope names all five surfaces and preserved links/drafts.

Independent code review found a P2: recreating ActorProfile objects on each
session update replaced the management rows and lost keyboard focus. A delayed
refresh test reproduced it. Solid 2's ID-keyed `For` with accessor children now
keeps the focused restore button when that refresh lands. Scoped code re-review
found no remaining P1/P2 findings. The user surrogate also rechecked both empty
states and scope copy, restored sol, and confirmed its saved state returned.
Their migration verdict remained unchanged. Screenshots:
`/tmp/kimino-review22/fixed-{author,saved,replies,restored}.png`.

Five browser regressions cover hiding/restoring, saved-link preservation,
account reconnect vs preview reset, hidden-parent conversation cues, short-name
touch targets and delayed-refresh focus (the first flow groups related reading
surface assertions). `npm run check` passed: 404 unit tests, strict types,
format, production build and Sacho consistency. Final whole-browser run passed **159 tests**, including **11 real ONI
tests**. `git diff --check` passed.

Parallel capability evidence changed the next action: the pinned ONI really
stores `Create/Image` media; a subsequent Note attachment retains its URL and
alt text. Four deliberately tiny local probe records were created, with no
remote recipients, credentials or bodies logged. Private binary reads enforce
authentication. A single embedded attachment lacks a discoverable URL, so it
cannot simply be treated as an interoperable one-request upload. Also, ONI has
inbox Follow auto-Accept handling; the prior single-actor loopback failure does
not prove lack of Follow support. Pinned sources, probes and limits are in
`c2s-capability-evidence.md`. Image authoring and a reachable two-actor Follow
fixture are still unfinished product work, not claimed as shipped. The broader
goal remains active.

### Round 23 — image authoring, then a mobile accessibility correction

A fresh photography/accessibility surrogate reviewed desktop and 390×844 mobile
flows. This is simulated feedback, not human research. Verdict: **no Mastodon
migration; willing to try public photos with a compatible C2S account**. Existing
Mastodon account compatibility and private-photo use remain blockers. The
surrogate did not publish real posts; automated live ONI tests cover that path.

Implemented explicit, default-off ONI image posting for public/unlisted new
posts and replies: four local PNG/JPEG/WebP previews, alternative text, removal,
and memory-only drafts. The UI explains that uploaded Images exist independently
of a Note and can remain public after its failure/cancellation. Application
receipt state distinguishes confirmed, unresolved and uncertain uploads; explicit
Note retry reuses confirmed uploads, recovery only reads, and ambiguous outcomes
never silently repeat. Tokens, recipients and remote-image loading retain their
existing boundaries. Domain validation/evaluation stay pure, application owns
write sequencing, the adapter owns the ONI convention, and presentation owns
draft state and Korean copy. Architecture tests enforce inward dependencies.

Independent code review found two material lifetime bugs: navigating away during
upload could permit duplicate submission, and deleting a parent could retain
its image draft. VM-level pending state and centralized draft disposal fix both.
A scoped re-review found no remaining material concerns. Additional tests caught
ONI omitting content on photo-only Notes and Solid 2 rejecting reactive cleanup
writes when leaving during FileReader work. Both were reproduced and fixed. The whole-suite warning assertion also caught
an imperative signal read in the picker cancellation effect; explicit untracked
snapshots removed the Solid diagnostic, and scoped review confirmed the change.

The user surrogate found image settings hard to discover and mobile alternative
text too far below the editing position. Renamed the disclosure to ‘이미지 게시
설정’ and focused/scrolled the first new alt field after selection, without
stealing focus if the user already moved. Scoped mobile re-review confirmed the
field at y710–776 above the bottom navigation, Korean alt entry, cancel/reopen
preservation and removal back to 0/4. Their migration verdict remained **no**.
Screenshots: `/tmp/kimino-review23/{mobile-photo,desktop-photo,fixed-mobile}.png`.

Final verification: the complete check passed with 461 unit tests, strict
types, production build and Sacho. The first full browser run passed 164/166; the two failures were the Solid
diagnostic and a checkbox locator that became ambiguous after adding the upload
option. Both fixes passed targeted regression and the final full rerun passed
**166/166**, including **12 live ONI tests**. No product source changed after
these checks. Private media, Follow/Accept/delivery and existing account
compatibility remain distinct unfinished requirements; cosmetic approval does
not close the active product goal.

### Round 24 — subscriptions are the next product requirement

A fresh simulated Korean small-community reader independently drove preview at
1440×900 and 390×844, inspected screenshots, and closed both browsers. No real
account connection or writes were performed, and the reviewer did not read the
previous verdicts first. Verdict remains **no Mastodon migration**. Reading,
received replies, parent/thread navigation and clearly local author filtering
worked; mobile author and navigation controls fit. The two material blockers
were existing account compatibility and inability to discover/subscribe to
future posts. Searching an actor handle only searched loaded text; the author
sheet offered filtering, external profile and hiding, not subscription.

The reviewer requested contextual follow plus a separate address entry/people
manager, visible identity before submission, explicit sent/pending/accepted
states, preserved targets on failure, no blind retry after unknown outcomes,
recoverable pending/following lists and clear limits on receiving historical
posts. These requirements are recorded in `follow-design.md`. Independent
architecture review added separate request/membership evidence after reconnect,
a non-dereferencing IRI collection reader and independent reconciliation ordering.

Screenshots: `/tmp/kimino-review24/desktop-author.png`, `desktop-search.png`,
`mobile-author-feed.png`, `mobile-replies.png`, `mobile-conversation.png`.
This is simulated feedback, not real user research. No UI feature is claimed
shipped from the design alone.

The separate two-actor ONI investigation now has loopback-only ingress, internal
actor networking and a container-scoped CA. The initial TLS delivery failure is
diagnosed; later DNS and authenticated/public actor reads work from inside the
actor network. Follow acceptance/delivery is still unresolved and source-level
key-fetch diagnosis is continuing. See `follow-capability-plan.md` for exact
state and safe resume commands; do not resend an ambiguous Follow automatically.

A bounded prerequisite is implemented in `activitypub/membership-reader.ts`:
read only collection pages, retain remote member IRIs without profile fetches,
validate origin/identity/partOf, require complete bounded traversal, reject
inconsistent totals and propagate read failures. Independent review reproduced
a false-absence bug when root `next` skipped `first`; four regressions failed
before the fix. Strict root navigation now rejects ambiguity. All 33 reader
cases and eight architecture checks pass; scoped re-review has no remaining
material issues. This helper is not yet wired to product UI and does not make
Follow a shipped feature.

Final application check for this prerequisite passes: 494 unit tests, strict
types, formatting, production build and Sacho. Last full browser evidence remains
round 23’s166 tests; no browser rerun was needed for an unintegrated helper.
`git diff --check` passes. The live server correction experiment continues in
separate temporary infrastructure and is not a product compatibility claim.

Further server evidence: an owned-root-only correction and exact public-root GET
signature-header handling allow a matching Accept to reach Alice without the
previous cold-start request explosion. Bearer and all inbox POST validation remain
intact. A separate source filter incorrectly excludes actors from graph response
items; a narrowly scoped experimental correction is building. Note delivery and
Undo remain unverified. These are explicitly temporary server diagnostics, not
stock ONI compatibility and not a browser-side federation workaround.

### Round 25 — C2S Follow, received posts and exact withdrawal

The user explicitly prioritized Follow and post reception while keeping the C2S
boundary. Implemented a pure relationship evaluator, a complete graph/activity
HTTP gateway, a framework-independent relationship controller and presentation
projection. UI entry points are people management and a loaded author's profile.
Requests, accepted membership, rejected requests, confirmed-but-unread writes and
unknown outcomes remain distinct. Reads do not silently turn truncation into an
empty graph. Accepted writes survive hydration failures; unknown POSTs are never
automatically repeated. Withdrawal uses the exact persisted own Follow in Undo.
No Mastodon REST or browser S2S inbox POST was introduced.

The first independent simulated-user review exercised mocked desktop/mobile
Follow → pending → accepted → received Note → Undo. It found ambiguous address
checking and two separate refresh/navigation steps. Renamed the address action
‘입력 주소 보기’, explicitly explained syntax-only checking, added contextual
author guidance and a ‘타임라인에서 새 글 확인’ action. ActorSheet became a native
modal with keyboard containment and return focus. Scoped independent re-review
at 1440×900 and 390×844 confirmed these fixes, preserved input, one Follow/Undo
per flow, no remote profile fetch and no page errors. Screenshots were opened
and inspected in `/tmp/kimino-review25b`; the actor screenshots capture a transient
status load, while settled text and keyboard checks include withdrawal.

Candid verdict: **would trial a compatible C2S account; would not yet migrate a
whole existing Mastodon community**. Remaining blockers are first-person discovery
from an empty timeline and server-level moderation/relationship portability.
These are functional requirements, not spacing or copy defects. This feedback is
simulated, not real user research, and its server responses were mocked.

Separate real evidence: a two-actor corrected ONI environment completed Follow,
a matching Accept, both graph memberships, a production-shaped Note in Alice's
inbox, exact Undo and both graph removals. A later Note remained absent during a
bounded full-read window; this does not prove permanent cessation. The browser
then independently completed Follow → Bob UI publication → Alice timeline
reception → Undo. The repository OAuth helper was corrected after source review
and the live browser test rerun passed (1/1, 4.1 seconds). Bearers remain only in
memory; traces/screenshots/video are disabled for that test and token entry avoids
secret-bearing timeout action logs.

These results require explicit experimental server corrections: owned-origin
locality, actor graph filtering, local followers expansion, authenticated cached
Follow Undo with replay protection, and canonical HTTPS received-in identity
behind TLS termination. A narrowly scoped exact-public-root GET key-bootstrap
workaround is also required. No inbox POST authentication is stripped. Stock ONI
and general server/account interoperability are **not** established. Source
patches and provenance are in `dev/oni-follow/`; full diagnostic history is in
`follow-capability-plan.md`.

Independent code review found and fixed old rejected-request interference,
collection first-page traversal, same-origin actor identity swaps, contradictory
embedded relationship evidence, malformed partOf aliases and ActorSheet modality.
Scoped re-reviews found no remaining material issue in those fixes. Reproducible
fixture packaging and broad final verification are in progress; results below
will supersede previous-round counts.

Final verification: `npm run check` passed **584 unit tests**, formatting, strict
types, production build and Sacho. The complete browser suite with the maintained
Follow fixture explicitly enabled passed **172/172**, including the existing
12 real stock-ONI tests and the new two-actor Follow/reception/Undo test. Earlier
runs exposed one obsolete no-Follow assertion and a300ms image-read test race;
the former now checks preview cannot submit Follow, and the latter uses an
explicit release after navigation (5/5 repeated regressions passed). No product
source changed for either correction. Final architecture review reports no
P1/P2 findings. The unused temporary18447 environment was stopped with data
preserved; the reproducible18448 fixture remains available.

Packaging review also caught a missing integrity check for the local processing
module replacement. Exact original-plus-replacement go.mod verification now runs
before compilation and after server tests, with ambient Go overrides disabled.
Seven offline guards and actual prepared-source tamper checks pass; independent
scoped re-review cleared the finding. Bundle checksums and final diff whitespace
checks pass. Round25 is complete; broader portability/discovery/moderation remain
separate requirements, not implied by the experimental C2S success.

### Round26 — from a familiar handle to the first Follow

A fresh independent simulated Korean reading-group organizer inspected mocked
1440×900/390×844 flows and screenshots. Verdict: **not yet migrating**. Two
material blockers were technical Actor-URL entry from an empty account and an
undifferentiated list of eight accepted/pending people. The second remains a
separate next iteration; this round implements handle discovery and empty-feed
entry rather than claiming copy changes solve either requirement.

People management now explicitly looks up `@name@server` using a dedicated
credential-free WebFinger adapter. It shows the handle and server-provided actor
address before a separate C2S Follow. Typing makes no network request. Editing
clears the candidate; unknown/unreachable/malformed lookup preserves input and
manual actor-URL entry. Returned addresses are not represented as verified
personal identity. Empty real timelines offer a visible people-finding action.

Clean architecture: pure handle/JRD interpretation, an application discovery
port and generation/cancellation controller, a separate HTTP adapter injected
through bootstrap, and Korean presentation copy. The adapter rejects redirects,
omits credentials/referrer, bounds streamed JSON to256KiB and times out body
consumption. No profile/image GET, Mastodon REST or proxy was added. Subject
binding is strict; hosted redirects/canonicalized subjects may need manual entry.

Core independent source review reported no P1/P2 finding. Integration testing
caught a new early reset notification before hidden-author preferences loaded;
the reset now occurs after those account preferences are installed, and the
existing privacy regression passes. Two new browser flows assert explicit
lookup, no token/cookie/referrer, separate Follow, input invalidation and manual
fallback. Additional selector coverage keeps first-follow guidance out of search,
saved/reply lists, preview, disconnected states and author-hidden feeds.

Scoped simulated-user re-review confirmed the first-person path on desktop and
mobile, with exactly one mock Follow per flow and no lookup while typing.
Candidate invalidation and failure fallback worked. Verdict remains **not yet**
due to existing Mastodon-account compatibility and multi-person management.
Screenshots were opened and inspected in `/tmp/kimino-review26`, including
`mobile-lookup.png`, `mobile-lookup-failure.png`, `mobile-manual-fallback.png` and
`desktop-empty.png`. This is simulated feedback and mocked browser traffic.

Separate read-only external evidence: the official documentation's public
WebFinger example returned200, CORS*, matching subject and one ActivityPub self
link without credentials. No actual Follow was sent to that account. The local
ONI nondefault-port acct lookup returns400 due to its colon-splitting parser; no
server changes were made for discovery. Live Follow/reception coverage continues
through exact actor URLs in the maintained fixture.

Final verification: `npm run check` passes **636 unit tests**, formatting,
strict types, production build and Sacho. The full browser suite with maintained
Follow fixture enabled passes **174/174**, including12 stock-ONI tests and the
actual two-actor Follow/reception/Undo test. The initial format gate identified
one test-file formatting issue, corrected without a behavior change. Final UI/VM
source review reports no actionable P1/P2 finding. `git diff --check` passes.
Round26 is complete; the ranked multi-person list issue remains next.

### Round27 — managing a small group's relationships

Previous turn made verified progress: explicit handle lookup,636unit and174
browser checks. Current PeopleDialog and relationship projection were re-read.
User26's concrete eight-person list finding drives this round: accepted/pending
people lacked counts/search and close/refresh scrolled offscreen.

Implemented separate find/manage views, globally counted status filters and
local name/handle/address search using a pure presentation projection. Pending,
confirmed and uncertain operations go to attention even when older membership
says following. No remote profile fetch or guessed display name is added; absent
profiles show their exact address once. Stable target keys preserve row identity.
Close/view controls and refresh surround an independently scrolling body. Input
and candidates remain available in finding; existing requests use the same
application safeguards. All text uses existing Korean presentation copy/tokens.

Five projection regressions plus existing relationship/architecture checks pass.
Initial browser verification caught Solid2 untracked effect reads and boolean
ARIA attribute types; explicit snapshot reads and string ARIA states fixed them.
Independent scoped source review has no P1/P2 finding. Browser and fresh simulated
user verification are in progress; final results will be appended.

Fresh simulated user27 independently drove desktop/mobile 3accepted/5pending,
local filtering/search/reset, find/manual candidate and separate Follow, long
scroll refresh, keyboard and Escape return. All browser contexts closed. Verdict:
**eight-person management is usable; not migrating primarily because existing
Mastodon account login is unsupported**. Unknown profiles still require matching
raw addresses; public identity enrichment is separate capability, not permission
to guess names or fetch remote profiles automatically. Reviewer also measured a
24px refresh button and tightly adjacent mobile filters. Those concrete tap-target
and spacing issues are being corrected. Screenshots were actually inspected in
`/tmp/kimino-review27`; only mocked requests were used, not live delivery research.

The initial full browser suite passed175/175 before the touch refinements.
A new geometry assertion then reproduced the refresh button's24px height (RED)
and passed after the44px minimum (GREEN). View controls now have padding/gaps;
mobile state filters use a two-column grid with separated counts. The manage
intro is shorter and the existing timeline action moved to the fixed footer,
freeing list space. Eight relationship browser tests pass again. Scoped visual
re-review and final post-refinement checks are in progress.

Scoped visual re-review confirmed44px controls,8px gaps, stable footer and no
overflow. It correctly found that the intended grid rule had not landed: mobile
was3+1. The coordinator applied the missing rule, added a coordinate regression
for two aligned mobile columns, and reran the mock harness. Final screenshots
`mobile-final-list.png` and `desktop-final-list.png` were rendered; the mobile
image was opened and verified. This last grid confirmation is coordinator
evidence, not a claim that the simulated reviewer saw a later build.

Remaining product limitation identified by user27: people without received posts
have no loaded profile name, so operators must compare exact actor addresses.
A future explicit public-profile read may help, but needs a separate bounded
transport/use-case design; never auto-fetch profiles or attach C2S credentials.
Account compatibility remains intentionally constrained to C2S.

Final round27 verification: fullbrowser **175/175** passes after the finalgrid
andtouch changes; full`npm run check` passes **641unit**, formatting,types,build
andSacho. The600pxfilter breakpoint was then registered in the central named
token table to satisfy the design-system gate; this changed no tested CSS or UI
behavior. Finaldiff whitespacecheck passes. No commits or publication.

Follow-up source investigation found a separate correctness issue in timeline
diagnostics: Follow/Accept/Reject are counted as ignored by the note evaluator,
but copy calls them globally unsupported; valid Undo(Follow) may be classified
as a rejected reaction withdrawal. This did not block the reviewed manager flow
but should be corrected next, before new profile features. Keep unknown activity
counts and forged-reaction rejection tests; do not subtract graph snapshots from
timeline diagnostics. Source references: domain/evaluate.ts around147/267 and
presentation/copy.ts around418/447. Investigation was read-only this round.

### Round28 — truthful timeline diagnostics for relationships

Previous turn made verified progress: people-management hierarchy,641unit and175
browser checks. Current evaluator and diagnostic copy were inspected before this
bounded fix. Follow/Accept/Reject were not rendered as notes, but that count was
called product-wide unsupported; Undo(Follow) entered reaction withdrawal logic.

Presentation now names unrendered timeline activity without implying missing
product support. It explains that relationship activities or unhandled timeline
types may be included. Rejected-shape/ownership evidence is described separately
without claiming every case was a mismatching author. Four copy regressions
failed before the change; new wording passes. Domain withdrawal correction and
independent review are in progress. No graph-snapshot subtraction, network change
or new user-facing capability is part of this fix.

Domain implementation adds conservative relationship Undo recognition using raw
original evidence before timeline deduplication. Valid embedded originals or
loaded IRI references affect diagnostics only; ID/type/actor/target conflicts
cannot fall through to Like/Announce removal. Seventeen new domain regressions
and existing protections pass; bare unknown Undo references remain rejected and
Delete(Follow) behavior is unchanged. Independent scoped review found no P1/P2.

Fresh simulated user28 checked desktop/mobile eight Follow records plus a normal
Note, then valid Undo(Follow), then separate malformed/forged Notes. Counts and
people-management states agreed; valid withdrawal had no exclusion warning, and
invalid Note evidence remained a separate diagnostic. Screenshots were opened
and inspected in `/tmp/kimino-review28`, including mobile Undo and invalid detail.
Verdict: **would trial a secondary C2S reader, primary migration undecided**.
Actual account/server compatibility and private-media needs are the remaining
requirements; a small mocked timeline cannot establish long-term adoption. No
further copy polishing was requested; a wrapped footer line is optional P3.

Fullcodecheck passed658unit,format/types/build/Sacho. Four focused browser cases
passed; final complete browser suite is running. An optional user question asks
for a real C2S server kind/public address to prioritize compatibility checks, with
no request for credentials. It does not block local improvement.

Follow-up read-only source audit identified a separate diagnostic gap for the
supported ONI Create/Image upload convention: every Create currently enters
`toNote`, so a standalone Image counts as rejected. Existing image evaluator
coverage only checks Notes with attachments. Next bounded correction should
recognize valid own Create/Image as unrendered without rendering/fetching it,
with strict actor/self/object/activity identity and supported raster-type checks.
Malformed/forged Note protections must remain. This was source evidence only;
no image-classification implementation or new compatibility claim in round28.

Final round28 verification: **658 unit tests** and formatting/types/production
build/Sacho pass. The complete browser suite, with the maintained two-actor
fixture enabled, passes **175/175**. Its first run had174 passes and one old
wording assertion; the corrected assertion passed alone and the full rerun then
passed. `git diff --check` passes. No source behavior changed after verification.
Relationship diagnostics are complete for this round; the separate Create/Image
classification gap remains the next bounded task.

### Round29 — own image-upload activity diagnostics

Previous round made verified progress with relationship diagnostics,658unit and
175browser checks. The current ONI adapter/evaluator and tests were re-read.
A credentialed read of existing local fixture metadata (no new POST) confirmed
an Image Create with own-origin activity/object IDs, matching actor/attributedTo,
image/png media type and no URL/content. Only booleans/type metadata were logged;
no tokens, object bodies, names or image bytes were output.

The pure evaluator now recognizes structurally valid own raster Image Creates as
unrendered, not rejected Notes. Self/actor/attributedTo, explicit safe own-origin
IDs, unambiguous types and PNG/JPEG/WebP are required. No new image card, network
fetch or automatic display is introduced. Attached Notes retain existing handling;
foreign Image Creates remain outside this scoped recognition. New negative tests
preserve malformed/forged Note and mixed-type protections.

Mock upload fixtures now retain the Image Create in the outbox, matching the real
server, so browser coverage can detect the previous false warning. A real ONI
image test now compares rejected counts before/after upload of all three raster
formats. Domain RED→GREEN and150narrowchecks pass. Source review and browser
verification are in progress.

Fresh simulated photo-sharing user29 exercised image selection, alt text,
publishing, one visible Note, diagnostic details and explicit loading at1440×900
and390×844. Valid uploads had no rejection warning; malformed-author Notes still
had a separate exclusion message. No image request occurred before explicit load,
and alt text survived. Screenshots were opened and inspected under
`/tmp/kimino-review29`. All mock browsers closed; an existing Vite listener was
left untouched. Verdict: **would use a public-photo ONI secondary client, not
fully migrate**. Existing Mastodon account compatibility and follower-only photo
publishing remain functional limits; visual polishing is not their solution.

Related test hygiene was tightened: main real-C2S tests now disable failure
traces/screenshots/video, and token entry uses an editable check plus DOM input
event rather than secret-bearing locator.fill metadata. This matches the separate
Follow suite's protections. Independent scoped review found no privacy/correctness
issue. Source classification review likewise found no P1/P2. Fullcodecheck passes
674unit,format/types/build/Sacho; complete browser suite is running.

Final round29 verification: `npm run check` passes **674 unit tests**, format,
types, production build and Sacho. The complete browser suite with both local
fixtures enabled passes **176/176**, including the real PNG/JPEG/WebP diagnostic
regression and real Follow/reception/Undo. Final whitespace check passes. No
product behavior changed after these checks. Public/unlisted own-upload scope
remains explicit; no private-media or general-server compatibility claim added.

## Round30 — recipient media evidence and recoverable image loading

The isolated 18449 fixture established a confirmed Alice→Bob Follow and five
synthetic Creates with no write retries. Direct/follower objects reached Alice's
inbox. Owner-only protection did not translate to follower binary access: the
existing proxy returned follower404 and AS JSON rather than PNG. Restricted
owner reads used public cache headers; a warmed direct-recipient metadata proxy
response was readable anonymously. This is a metadata/description disclosure,
not evidence of restricted PNG bytes leaking. See [evidence](private-media-evidence.md).
No client proxy integration, private scope or server authorization patch was added.

Reader UI now explains failed explicit image loads, retains alt text, offers
manual retry and hide, and ignores stale image callbacks. Independent review
identified keyboard focus loss from swapping buttons; a stable button and focus
assertions address it. No automatic media requests/retries or cross-origin bearer
use were introduced. Fresh simulated user review and final validation pending.

Fresh simulated user30 visually inspected desktop/mobile failure and loaded
screenshots. Keyboard Enter/Space preserved focus; alt text remained visible,
mobile retry was 44px high, and there was no overflow. Requests were 0 before
consent, 1 after failure, 2 after explicit retry and still 2 after hide, with no
authorization/referrer headers. No P1/P2 UI blocker; scoped independent source
re-review also cleared the focus correction. Verdict: recovery is usable, but
**would not migrate an existing Mastodon account yet** because account/network
compatibility and restricted-media delivery remain separate requirements. This
is simulated feedback, not real user research. Reviewer browser is closed and
the existing Vite listener was left untouched.

Code verification passes 674 unit tests, formatting, types, production build
and Sacho after synchronizing the new change fragment. Complete 177-test browser
verification is running; do not treat its count as a passed result yet.

Final browser run did not pass: **167 passed, 4 failed, 1 interrupted, 5 not
run**. The coordinator stopped repeated identical main8443 connection failures;
new image recovery and corrected18448 Follow/reception/Undo passed. Failing
cases showed a connection format error before any test-specific write, rather
than merely slow sharing. A bounded read-only audit is checking whether the
grown preserved collection exceeds the existing complete-read limit. Do not
report177/177 or reset the fixture to hide the issue. No active suite remains.

Read-only diagnosis confirmed the exact boundary: main outbox declares1982
activities;100pages already contain1982distinct activities, but advertise next.
Page101 is empty and terminal. All104HTTPreads (actor1,inbox2,outbox101) returned
200. The client default maxPages100 refuses before requesting that terminal page,
so the connection is classified as unexpected response. This is not proof of
malformed server data or more than2000activities. No data reset, writes, limit
increase or silent truncation was used. Next iteration must address bounded
large-history semantics and durable test isolation; a larger arbitrary ceiling
would only postpone the fixture-growth failure.

## Round31 — explicit continuation for large histories

The previous round produced real evidence: main8443 reaches its100page budget
while a valid empty terminalpage101 remains. Implemented bounded user-controlled
continuation without skipping next links, restarting previous pages, publishing
a partial initial timeline or changing the hard object/depth bounds. Application
owns one current read/gate; per-read abort is separate from session/POST abort.
Connect, refresh and full fallback after confirmed writes share this mechanism.
Cancel keeps the previous timeline/draft; confirmed writes are never retried.
Relationship reads still require complete evidence within their existing cap.

Read-limit errors are now typed separately from protocol/credential failures.
Three browser regressions passed for initial terminal-page continuation,
connection cancellation and refresh preserving old content/draft focus. Source
review found background autofocus and two reentrant cancellation ownership bugs;
all were corrected with regressions and scoped re-review cleared P1/P2 findings.
User31 mock review and final full verification are in progress.

Fresh simulated user31 verified keyboard continuation from100pages to an empty
terminalpage101 at390×844 and1440×1000, no partial cards, refresh draftfocus,
retained timeline and cancellation without errors. Screenshots were visually
inspected under `/tmp/round31-{mobile,desktop}-{initial,refresh}.png`. No scoped
blocking UX finding. Minor follow-up: identify the current inbox/outbox and the
next bounded chunk more clearly. Verdict remains **no full migration** because
existing Mastodon-account compatibility and private photos are unsupported;
compatible-C2S-server pilot is plausible. This is simulated feedback, not real
research. Browserclosed, unowned Vite listener preserved.

The full real suite now passes the first main8443 connect/publish/reply/reconnect
case with explicit continuation and preserved data. Final suite is still running.
Codecheck found only a new paragraph typography token-pair issue; apply its small
CSS fix after browsers finish, then rerun codecheck and scopedhistory browser.

Full browser terminal result:179passed/1failed. Every main8443 case, including
largehistory reconnect/edit/delete/images, now passes. Corrected18448 Follow and
Note reception succeeded, but reopening People before Undo left no dialog, so
Undo was not sent. Investigating this UI race rather than resetting graphstate
or claiming fullgreen. Dedicated fixture's accepted Follow remains until its
exact state is verified and explicitly withdrawn for a fresh test.

Additional cancellation audit found that canceling a paused fallback after an
accepted publish omitted its confirmation notice. RED reproduced it; cancellation
now applies the already-earned notice without replacing timeline/timestamps or
retrying the POST.53 focused queue/session/design tests pass. The typography
pair is corrected; a browser regression for accepted-post cancellation is added.

The remaining Follow failure is not established as a dialog race:10 mocked rapid
close/reopen cycles all stayed open. A read-only actual adapter probe identified
an authoritative relationship-read failure instead: Alice18448inbox advertises
21items, returns20items in both the canonical root and advertised first page,
and exposes no next link. The strict reader correctly rejects its mismatched
complete total. Following membership itself has1item/declared1. No cleanup Undo
was sent: the UI could not establish complete activity evidence. No graphreset,
guessed next URL or weakened completeness rule was used. Pinned server pagination
investigation is underway. Earlier successful Follow→Note delivery remains valid;
full cycle is not currently green once this collection crosses20items.

The added accepted-post cancellation browser fixture initially omitted CORS
exposure of its Location header; corrected the fixture rather than weakening
production201/Location requirements. Final scopedhistory andcodechecks running.

Final round31 verification: `npm run check` passes **702 unit tests**, formatting,
types, production build andSacho. All **4 scoped history browser tests pass**,
including canceling accepted-post hydration while retaining confirmation and
sending exactlyonePOST. No active test/browser process remains. Last fullsuite
result remains179passed/1failed; do not replace it with a scoped success claim.

Source diagnosis identifies the remaining server failure: pinnedgo-ap/filters
f116eb702ce2 cursor.go emits next.after only when len(col)>maxItems+1. For21items
withmaxItems20 it does not add the cursor; the nextIRI equals firstIRI and is
suppressed. ONI setsmaxItems20. This explains the observed20/21 incomplete inbox
and why strict relationship reads refuse it. No serverpatch/build/restart has
yet been performed. Next work is the bounded dependency correction and boundary
regressions, preserving all volumes and client completeness checks.

## Round32 — server pagination boundary correction

Re-read the pinned build pipeline and observed21/20 inbox failure. In an
isolated copy of filtersf116eb702ce2,21-item complete walks andfiltered21 failed
before a minimal threshold correction; the entire module suite then passed.
Root added third-archive preparation, pinnedmodule replacement and exactmodule
integrity checks (RED→GREEN,9offlineguards). Fresh preparation verified archive,
patch and source hashes. No runtime change at this stage.

Independent review cleared packaging/isolation but found that the initialfix
still advertised an empty trailing page whose serialized emptyitems disappear
whiletotal21 remains. A strictrelationshipreader would correctly reject it.
Added serializedterminal behavior to the pending serverregression work; no
clientrelaxation or deployment while that issue remains.

Second pagination correction snapshots the last eligible item before cursor
reversal and suppresses Next afterthe finaldata page. Serializedterminal and
before→next regressions wentRED→GREEN; scoped independent review cleared it.
Fresh rootbuild verified every pinnedhash/module,9offlineintegrity checks,
fullfilters+index andprocessing/ONI regressions, then built newimage92a7c18775c5.
Recreated only maintained18448 actors, retainingvolumes andgatewayCA;8443unchanged.
Actualclient readonlyprobe nowreads all21inboxactivities as20+1 withcorrectNext,
establishesfollowing1/request1, and returns success. No clientcompleteness
relaxation or datareset. RealUI flow andfinalchecks pending.

Real maintained18448 browser flow passed in3.8seconds: exact priorFollow cleanup,
freshFollow, BobNote publication, Alice reception and exactUndo. User32 then
independently used readonly realUI (OAuth only, no relationship/content writes):
latestreceivedNote visible, People shows no activefollowing and exactBob target
asnotfollowing. Desktop1440×1000 andmobile390×844 screenshots inspected; Escape
restores openerfocus. No scoped UX blocker. Verdict: **compatibleC2S pilot yes,
fullMastodon migration no** because existingaccountconnection andprivatephotos
remainunsupported. This is simulated feedback, not realuserresearch. Browser
closed, unownedVite preserved.

Finalcodecheck passes702unit,format/types/build/Sacho. Maintainedfixture offline
integrity9checks andbundleSHA256SUMS pass. Final181-browser suite is running;
its terminalresult is not yetknown. No client behavior changed inround32.

Final round32 verification: **181/181 browser tests pass** with both real local
fixtures enabled (4.0min), including Follow/reception/Undo, large-history
continuation, accepted-write cancellation, and real edit/delete/images. Code
check passes **702 unit tests**, format/types/build/Sacho. The maintained server
build passed all module regressions; offline integrity **9/9** and bundle hashes
pass. Docker inspection confirms both18448actors run image92a7c18775c5 with their
existing nameddata volumes. No active test/reviewer browser remains. Main8443
was not rebuilt or reset. This completes the pagination correction, not general
Mastodon account compatibility or private-media support. Goal remains active.

## Round33 — complete relationship continuation and withdrawal handoff

Extended bounded explicit continuation to following membership and inbox/outbox
request evidence. Partial data never lands as a relationship graph. Canceling
retains previous evidence but marks it canceled and disables graph actions until
a fresh complete read. UI names the current collection and keeps actions visible
in the People footer and account sheet.

Undo is split into complete, cancellable preparation and a single-use POST
command. The original request and target are captured; read cancellation cannot
misclassify an already invoked POST as unsent. Accepted receipts survive canceled
hydration. The shared controller preserves timeline alias identity and uses an
independent relationship instance. No bearer, cursor or remote body enters UI.

Review found alternate sheet exits that left preparation alive; filter/hide,
navigation/moderation and self-profile paths now cancel, with RED→GREEN tests.
Moving to People retains the visible gate and explicitly names its captured
withdrawal target even when a different Find target is inspected. Independent
source re-review cleared P1/P2 findings. Narrow13browser checks and733unit plus
format/types/build/Sacho pass; complete186browser suite is in progress.

Simulated user33 authored and partially ran its mock review, then host descriptor
exhaustion blocked its tools. Root ran the corrected script to terminal0: mobile
anddesktop target switching, preflightcancel0POST, acceptedcancel1POST/receipt,
and both sheet exits pass. No realaccount/fixturewrites inthatreview. Agent's
visual inspection remained unavailable; root opened screenshots atbothsizes and
found no clipping. No useragent visualclaim is made. Verdict: better control for
compatible C2S accounts, not existingMastodon/privatephoto migration. Browserclosed.

Final round33 result: **186/186 browser tests pass** (4.4min), including actual
Follow/reception/Undo and real Note/image flows; **733 unit tests** plus format,
types, build andSacho pass. Independent interaction scenarios passed; pixel
inspection by agents was blocked by descriptor exhaustion, while root opened
both screenshots and found no clipping. No independent visual sign-off is
claimed. Test/reviewer browsers are closed, no server configuration changed,
and existing fixture volumes remain intact. Goal remains active.

## Round34 — Follow preparation and recovery

Own-actor GET503 reproduced an uncertain Follow despite zero POSTs. Follow now
shares cancellable preparation and a single-use send command. Outbox validation
and payload capture happen before entering write uncertainty. Explicit failure
state supports truthful unsent copy and manual retry; POST refusals and unknown
outcomes retain their separate handling. No automatic retries were added.

Independent source review reported no actionable P1/P2. Five actual-client tests
cover recovery, cancellation during reads and at handoff, POST403 and single-use
commands with isolated read signals. Nine relationship browser tests passed.
Full check passed738unit tests, formatting, types, build andSacho. Full browser
verification was prevented by host descriptor exhaustion and is now being resumed.

Simulated user34 reviewed current scenarios/copy and opened the older round33
mobile screenshot, not the round34recovery screen. Verdict: compatible-C2S trial
yes, main-account migration not yet. Explicit opt-in public profile lookup could
help identify people before Follow. This is simulated feedback, not real research.

The user selected local ONI as the continuing improvement/verification target.
Other server interoperability remains uninvestigated; do not block local progress
on a public server address or imply stock/general interoperability from the
maintained corrected ONI fixture. Preserve existing actor data and credentials.

## Local ONI follow-up — recipient scope evidence

A fresh independent simulated reviewer accepted public-text trial use but withheld
full daily-use migration. Their source review found that the two-actor test proves
public delivery, while the followers-only test proves author-side addressing and
storage only. They requested actual follower-side text reception within the same
local ONI fixture. This is a test-coverage gap, not an observed delivery failure.
No new browser observation or real-user research is claimed. Next: exercise
followers-only text delivery separately from unsupported private image paths.

Full187browser suite passed (5.1min); final check passed738unit tests and other
checks. The subsequently expanded actual two-actor test confirmed follower-only
text visible in Alice's timeline but failed at Undo: People could not refresh
complete evidence. Diagnostic actual adapter error: collection total mismatch;
inbox declares32, first20 plus next11, and maxItems100 yields31. Existing green
checks do not cover this newly exposed case. Client refuses unsafe inference.
Source review identified query-dependent ONI collection-owner comparison causing
an extra authorization filter on pages. Server regression/fix is in preparation;
no deployment, data reset, or client relaxation. This is concrete new evidence,
not a successful end-to-end result or proof of private-content isolation.

## Local ONI owner-page correction — implemented

The32-row shared-handler regression reproduced31/32 on owner pages (RED). Exact
resource identity independent of request queries fixes ownership without relaxing
nonowner item authorization or changing content/page query execution. Fresh bundle
and full ONI Go suite pass, independent review no findings. Maintained build verifies
all hashes, nine offline guards and new TestOwnCollection regressions.

Only maintained18448 was updated to58be49b-c2197c547411; original alice/bob data
volumes and authenticated startup verified. The previously failing actual browser
Follow → public text → followers-only text → Undo now passes4.6s. The test also
asserts outgoing followers addressing and noPublic without logging payloads.
Full187browser suite is running; private media and other server interoperability
remain unproven. No client invariant was weakened and no data reset was used.

The independent simulated reviewer now supports daily text-focused trial use on
local ONI: their previous recipient-side followers-only gap is resolved by the
reported execution and current assertions. Full migration remains withheld. They
did not independently browse the new run. Next bounded requirement: after Undo
is reflected server-side, verify a new followers-only post is not delivered, with
an explicit processing-completion control rather than treating a short empty wait
as proof. This is simulated judgment, not real-user research or privacy sign-off.

Final verification after maintained ONI deployment: **187/187 browser tests pass**
(5.3min), including the expanded followers-only reception and Undo regression.
Full738unit/type/format/build/Sacho check, nine offline guards, filters/processing
and ONI build regressions also pass. Independent source review has no findings.
No browser suite remains live; current fixture is58be49b-c2197c547411 with retained
volumes. Next nondelivery-after-Undo requirement remains explicit and unimplemented.

## Post-Undo nondelivery — deterministic evidence

Added actual synchronous Follow/Accept/Note/Undo processing regression with recording
transport. Disabling relationship removal fails graph removal and zero Alice-call
assertions; original restored. Full processing Go suite passes. Local-only opt-in
terminal observer emits hashes/counts/flags, not content/IRIs/tokens/rawerrors, after
actual dispatch including zero targets. Async scheduling remains unchanged. Phase
flags describe returned errors only, not all upstream recipient failures.

Independent code review cleared observer, strict complete-read helpers and bounded
log parser. Updated verified bundle built and deployed only maintained18448 as
58be49b-53c0248136ad (Docker6ba4ff935e9ad257ee6a5aee415ec3719ee56361522647b03374cb90e0478586).
Existing data retained. Actual browser test passes4.8s: baseline received Note and
terminal positive routing, exactUndo, bothgraphs empty, freshfollowers-only Note's
completed zero remote routing, and absence in complete Alice inbox. This proves
that controlled dispatch, not arbitrary future nondelivery/resolution health.

Full738unit/type/format/build/Sacho check passes. Final187browser suite is running.
Fresh independent simulated user supports daily local text trial but withholds
sensitive full migration. They reviewed source/reported execution, not a new browser
or real users. Next missing evidence: direct-read access to a fresh followers-only
Note for owner, eligible follower, removed follower and anonymous requester. This
is not a reproduced privacy defect. Keep Alice bearer at Alice origin; do not turn
that question into cross-origin bearer forwarding or an unrestricted proxy.

Final post-Undo result: **187/187 browser tests pass** (5.8min), including the actual
async completion-correlated nondelivery scenario. **738 unit tests** plus types,
formatting, build andSacho pass. Maintained image build regression suites and nine
offline guards pass. All test handles terminal; no browser remains running. No
client behavior or asynchronous delivery policy was changed, and no data reset.
Direct-read privacy remains the next separate evidence gap.

## Direct-read privacy — reproduced defects and fix in progress

Controlled local Note checks: owner directGET200/bodymatch, anonymous directGET
403/404/no body, but owner response public-cacheable. Existing Bob proxyUrl with
anonymous caller and that same known Bob Note returned200/bodymatch. All content
was synthetic; logs contain status/boolean assertions only. No other origins,
real private content, external accounts or new proxy were involved.

Conservative dynamic no-store/no304 regression is GREEN in prepared ONI; combined
proxy owner-auth fix and tests are in progress. Browser regression includes valid
owner, anonymous cold/warm, invalid bearer and no-store checks. It is currently
RED on deployed53c0248136ad. Client check738unit/type/format/build/Sacho passes;
that green result does not establish resolution of these server privacy defects.

Privacy corrections applied only to maintained18448, image58be49b-6d69e8571f84.
Cache policy covers dynamic JSON/HTML/binary, no validators/304. Proxy gate requires
exact verifiedlocalowner before targetfetch, with separate strictcookieOrigin guard
because broad credentialedCORS could otherwise bypass intent. UpstreamSetCookie
andvalidators stripped. Static assets/clientproxy support unchanged. Independent
re-review clear. Taggedtests initially showed sharedcache interference; per-case
unique targets fixed tests while preserving positive1/negative0 fetch assertions.
Exacttaggedsubset twice, fullGo suite, freshbundle/hash/build andnineguards pass.

Actual privacy browser regression now passes5.0s: ownerdirect success, anonymous
direct denial, anonymous proxy cold/warm denial, invalidtoken denial, ownerproxy
success/privateNoStore, plus Follow/reception/Undo/nondelivery. EarlierRED had
anonymous200/bodytrue, so this is a verified fix rather than a missing-evidence
claim. No prior cachedcopies are retracted; stock8443 andstopped18449 unchanged.
Final187browser suite is running; currentclientcheck738unit andothergates passed.

Fresh simulated reviewer supports daily text trial on the maintained fixture,
not comprehensive privacy certification/full migration. They reviewed source and
reported execution, without a new browser or real-user research. Next bounded
requirement: two-person followers-only reply exchange; Alice replies to Bob's
received Note, Bob finds it in received replies and correct refreshed conversation;
assert parent IRI, noPublic, actual reception and anonymous-read protection.
Existing real reply test is self-reply; this is a coverage gap, not a defect claim.

Final privacy verification: actual expanded privacy/lifecycle regression passes5.0s;
client738unit/type/format/build/Sacho and finalmaintained image regressions pass.
Fullbrowser run:186pass, one stock8443 initial-read30s timeout before publishing.
The unchanged failed connect/publish/reply/reconnect case passes isolated51.8s.
This is not reported as a single fullygreen187run. No timeout increase, volume
reset or server/client workaround was applied. Bothhandles terminal; no browser
remains active. Current image and original actorvolumes verified byDockerinspect.

## Two-person replies and recipient disclosure

Expanded actual local ONI test passes: Alice replies to Bob's followers-only Note,
reply keeps parentIRI and exact Bob-only directaddress/noPublic, Bob finds it in
received replies afterrefresh and opens parent+reply conversation. Owner can read
the reply; anonymous cannot. Existing lifecycle/nondelivery/privacy checks remain.

Independent simulated review found misleading composer scope explanations for
parent mentions. Added framework-free reply-audience model reusing canonical
replyParticipants; no duplicated addressing/network logic inUI. Composer displays
labels and fullIRIs, excludes self/dedupes, distinguishes followers+participants
from direct participants, and handles empty/unavailable sets explicitly. No sending
semantics changed. Eight unit regressions, two width-specific three-person browser
checks prove displayed list equals actualPOSTtargets, including a longIRI.

Independent source review no P1/P2. Independent user-perspective reviewer opened
both mock390/1440screenshots and found no blocking UX issue for this flow; supports
local daily-conversation trial, not unconditional migration/real-user research.
Minor nextissue: private ImagePicker currently prioritizes connection-setting hint
though privateuploads unsupported; audience restriction should takeprecedence.
Current746unit plus types/format/build/Sacho pass; actualexpandedrealtest6.0s and
newbrowserdisclosure2tests pass. Standard UI suite running; includesnewtestfile.

Final recipient-disclosure verification: standardUI suite **148/148 passes**
(1.5min); completecheck **746 unit tests**, types, formatting, build andSacho pass.
Actualtwoactorprivate reply plus existingsecurity/lifecycle passes6.0s. Independent
mock screenshot review bothwidths clearedflow. No browser/testhandlesremainlive.
No server/network/addressing changes thisiteration; no fullstockbrowser rerun is
claimed. Prior stocklarge-history timeout and isolatedpass remain documented.

## Private image hint priority

Both390/1440browser cases reproduced misleading settings guidance in a directreply
when ONI images were disabled (RED). ImagePicker now explains disallowed audience
before capability settings. Existing selection/upload/cancellation guards unchanged.
Two width regressions confirm scopehint/no settingsCTA, disabledimagebutton and
successful textreply; image-authoring suite also passes (ninebrowser checks total).
Independent source review no findings. Independent simulated reviewer inspected
both regenerated mock screenshots: misunderstandingresolved, no newblockingUX;
would use localONI text conversations but keep another client for privateimages.
This is a capabilitylimit, not anothercopydefect or fullmigrationapproval.

Next iteration should investigate private media on the corrected maintainedserver,
using prior evidence and explicit privacy/access invariants, rather than repeatedly
polishing this settledhint. Do not enable privateuploads until recipientaccess,
anonymous/nonrecipientdenial, caching and recovery are proven; no unrestricted
proxy or cross-origin bearer. Old18449 evidence remains valid for thatoldimage,
not automatically the currentprivate-response-corrected18448 runtime.

## Private media corrected-image recheck and raster transport

Reused preserved isolated18449 data on6d69: acceptedFollow and four known synthetic
Images, zero newCreate/Follow. Owner PNG bytes/private-no-store correct; anonymous
origin restricted404 andproxy403 confirm prior fixes. Directrecipient proxymetadata
200 butPNGrequestedJSON; followerproxy404 despitebothmembers. This changed the
next action from copy polish to two concrete server capability gaps.

Implemented exact PNG/JPEG/WebP proxyAccept before signing; 2xx response requires
singlematchingMIME, otherwise reject withoutbody. Metadata default unchanged.
TaggedGo fullsuite, duplicate/mismatchedMIME and sameIRI metadata→PNG tests pass;
independent source review clear. Built verifiedcandidate d7e4a3883690 and applied
ONLY18449. Rereading sameImages now gives exact direct/public proxyPNG, metadata
JSON; anonymous remains403, self-only andfollowers still404. Main18448 unchanged.

Simulated user's current verdict remains no private-image migration. Acceptance
requires full restrictedreply→eligiblefollowerload/hide/retry and authorization,
cleanup/draft/audience consistency. Direct-only plumbing is not a substitute.
Storage-aware followergrant needs complete current membership and block evidence;
FS cache/filter behavior must be resolved before implementing that access check.
No private client uploads/loading were enabled. Full746unit/types/format/build
check and Sacho pass, plus nineofflineguards and imagebuildserverregressions.
The isolatedprobe was stopped after testing with all evidence volumes retained.

## Follower resource authorization review loop

Independent simulated user review (not real research) accepts trial parallel use
for local text conversations, but not migration of private photo conversations.
The next bounded priority is the retained18449 follower-only image access matrix,
without adding Alice as a direct recipient. Client private images remain disabled.

Code review found filesystem-expanded nested objects could disclose private child
content through a follower-readable parent. Projection now preserves parent text
and alt text while requiring separate authorization for nested resource IDs;
minimal inline links retain type/href only. Independent scoped re-review cleared
the mitigation after real-FS regressions. The build's original-module guard caught
a new test's indirect dependency import; tests now use the existing storage API,
with the guard unchanged. Runtime results are recorded separately below.

### Follower access gate completed on isolated18449

The retained-image matrix now passes eligible follower access, warm Block denial,
Undo Block restoration, Undo Follow denial with direct-recipient positive control,
and restored Follow access. Exact PNG bytes, alt text, no-store and anonymous/self
denial were verified. Four exact graph writes, no retries and no new content.
The probe resumed from a confirmed checkpoint after adapting to ONI empty-page
aliases and deletion of the original Follow on Undo; evidence documents both
interruptions rather than claiming a single uninterrupted run.

Next gate is bounded authenticated client/proxy loading with redirect/body/MIME/
byte validation and lifecycle cleanup, followed by restricted upload/draft/audience
consistency. Private images remain disabled; see private-media-evidence.md for
results. Do not rerun the completed checkpoint-specific resume.

Post-matrix independent simulated user verdict: text-only parallel use remains
reasonable; photo-conversation migration is still withheld because the app feature
is disabled. Next requested concrete flow: one followers-only image reply with
alt text, received by a follower who is not separately addressed, explicit
open/hide, failure-safe draft/upload reuse and disconnect cleanup. This is
simulated source/evidence-based judgment, not real research or a browser trial.

## Authenticated private image reading in the app

Added application ImageReadGateway and current-timeline attachment authority;
ONI adapter uses only advertised same-origin HTTPS proxy, token confinement,
redirect rejection,5MiB stream bound,10-second whole-read deadline and raster
MIME/header checks. Domain header policy is shared with upload validation. Pure
presentation resource controller owns generation/cancel/release; Solid browser
bridge owns object URLs. Restricted ONI attachments use it only on explicit click.
Public/unlisted image behavior is unchanged; restricted upload remains disabled.

Independent code review found no P1/P2. Client tests cover late completion after
hide/disconnect/replacement, decodefailure and resource release, bounded and
stalled bodies, both cancellation sources, invalid targets/proxy and MIME.
Mock browser checks passed390/1440 open/hide/disconnect, alt, denial and explicit
retry. Initial mobile test needed the existing account-menu disconnect route;
product behavior did not need a workaround.

Server proxy hardening is packaged in candidate81f68e4a59de
(Docker77d9fcffd3c72730746167790e7a24c5ecc5969f00d32fcda0bebc74bf5b9c5c),
applied ONLY18449 with retained data. Proxy-specific signed client rejects
redirects and bounds every status body before retries/output, with one10-second
deadline; it bypasses private cache/debug-body wrappers. Federation client is
unchanged. Independent source review/fulltagged Go/build regressions pass.

Actual browser test tests/private-media-c2s.spec.ts passed against the existing
received followers Note/Image: no automaticload; click→ownproxy→blobURL→decoded
1pixel→hide→disconnect. Zero directimage requests toBob and zero bearer leakage.
No new Note/Image/relationship writes were needed. Test requires explicit
KIMINO_PRIVATE_MEDIA_FIXTURE_DIR=/tmp/kimino-private-media andKIMINO_FOLLOW_PORT=18449;
it is separate from stockfixture tests.

Post-implementation simulated user review (not real research) expands parallel
use to receiving private photos and replying in text; full photo-conversation
migration remains withheld until one restricted image reply can be authored.
Next: identical Image/Note addressing, audience-bound uploadreceipt reuse, failed
Note draft retention without duplicate/public uploads, then actualbrowser
restrictedreply→eligiblefollowerread. Do not repeat serveraccess investigation.

Final verification checkpoint: npm run check passed811 unit tests plus format,
types, build and Sacho; full independent UI suite passed151/151 (1.6min). The
actual isolated ONI private-image browser test passed1/1. Bundle checksums and
git diff --check pass. Isolated18449 is stopped, volumes/CA/data retained.
Main18448 remains6d69; source and isolated image are81f68e4a59de. No live root
process/test/browser handles remain, no commit/push. Next work is restricted image
upload addressing/receipts and the complete authored image reply, not read-side
research. Broad product goal stays active.

## Restricted image reply implemented and verified

Application snapshots submissions before queuing, derives Image addressing from
the clamped Note and reply participants, and binds receipts to copied canonical
to/cc sets. Changed recipients cannot reuse uploads; confirmed unresolved or
uncertain uploads still never auto-retry. The ONI adapter verifies wrapper and
Image addressing and retains verified ID/MIME/audience associations for Note
publication. Independent review found additional audience/bto/bcc could bypass
to/cc checks; RED regressions reproduced it, then both wrappers and objects were
restricted to exact to/cc and scoped re-review cleared the P1.

Private authoring requires explicit ONI mode and exact generator Service marker
urn:kimino:oni:private-media:1. Unmarked stock ONI stays disabled. The marker is
response-only, configured local root only, opt-in KIMINO_PRIVATE_MEDIA_CAPABILITY=1,
preserves generators/storage and is an assertion, not security attestation.
Refresh removes the UI/application gate if the actor stops advertising support.

Candidate ac17f3e26faa (Docker801b86d3cc76878327a2e86a764ff417a8ad7563bc2c2a034ff2ff1ff079b57b)
was built and applied only18449. Main18448 is still6d69. TaggedGo/build tests passed.
Mockbrowser public/restricted/recovery tests passed11/11;390/1440 captures at
/tmp/kimino-private-compose-390.png and-1440.png show actual draftscope, alt,
pre-upload state and restricted orphan-upload disclosure.

Actual tests/private-media-c2s.spec.ts: Bob replied to his existing followers-only
parent with a new Image; Alice remained only a follower, never a direct recipient.
The first Note POST was explicitly injected503 before reaching ONI; actualImage
Create/hydration succeeded. Retrying retained the draft and submitted no second
Image:1ImagePOST,2Noteattempts, matchingfollowers-onlyto/emptycc throughout. The
final Note reached Alice; alt text and explicitblobPNGdecode/hide passed.
Initial run stopped after acceptedwriting because the test used the wrong refresh
button name; selector corrected and a new synthetic specimen passed1.1s. Existing
received-image regression also passed. Earlier accepted objects were preserved.

Independent simulated user inspected both screenshots and concreteflow evidence:
no boundedUXblocker; would try moving photo conversations among localfollowers.
This is not realresearch or proof of all conversation types/history/server
compatibility. User-deferred externalserverresearch is not a localacceptancegate.

## Latest verified local state

The local private-media iteration is implemented. Maintained18448 now runs
kimino-oni-follow:58be49b-ac17f3e26faa, preserving alice-data/bob-data volumes and
CA. Isolated18449 is stopped with data retained. Stock8443 is unchanged. Earlier
chronological statements below about private authoring being disabled or18448
still running6d69 are historical and superseded by this checkpoint.

Validation:836 unit tests plus format/types/build/Sacho passed;153/153 independent
UI tests passed. Actual authored followers-image reply/recovery/reception passed
on18449; actual maintained18448 Follow→public/followers reception→private text
reply→Undo→fresh-post nondelivery regression passed8.9s after promotion. Exact
image/volume identities verified; bundle checksums and offlineguards passed.
Independent code review cleared the additional-addressing P1 after regression
tests. Independent simulated user inspected390/1440 screens and would try local
photo conversations, with no scopedUXblocker. This is not real user research or
a claim of stockONI/MastodonREST/externalserver/full-history migration support.

No outstanding required implementation work was identified by the local-scope
completion audit; other-server research remains explicitly deferred by the user.
No commits, pushes or publication. The sections below retain the investigation
history and earlier evidence; do not restart completed probes from them.
