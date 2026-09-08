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
