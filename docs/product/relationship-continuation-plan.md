# Round33 — complete relationship reads with explicit continuation

Previous round made verified progress: corrected retained ONI pagination and
181 browser /702 unit checks passed. Re-read current relationship ports,
controller and both strict readers before starting. Timeline continuation alone
does not resolve the100-page cap for membership and original Follow evidence.

## Intended behavior and safety invariants

People and account sheets offer an explicit bounded continuation for long
following/inbox/outbox reads. Keep traversal state in memory and publish graph
membership and request evidence together only when all reads complete. Count
labels identify the collection; no token, remote body or cursor reaches UI.
Cancel preserves previous evidence but marks it canceled, disabling graph actions
until a fresh complete read. Closing its surface/disconnecting releases gates.

Undo preparation is separated from POST. `prepareUnfollow` performs complete
reads and exact-original validation, then returns a single-use send command.
Read cancellation controls only preparation. Check the operation ticket at the
prepare/send boundary; cancellation there sends nothing. Once sending starts,
read cancellation cannot claim the POST was unsent. Confirmed receipts survive
canceled hydration; uncertain POSTs remain uncertain and are never retried.
Legacy combined `unfollow` runs outside read cancellation when preparation is not
available. Account replacement suppresses old completions without affecting the
new session. Timeline and relationship gates are independent.

## Ownership and verification

- Root extracted shared collection-read controller with timeline aliases retaining
  class identity, and owns client wiring, presentation, UI and integration.
- Architecture agent owns relationship ports/controller and social-session hooks.
- Adapter agent owns strict membership/activity reader budget plumbing, prepared
  Undo and transport regressions. Preserve totals, cycles, origin binding,
  malformed evidence checks and hard item bounds.
- Independent reviewer checks read/POST handoff, reentrancy, cancellation and
  partial-evidence refusal. Fresh user agent evaluates concrete mobile/desktop
  flows and gives a candid simulated migration verdict.

Test cancellation at every collection gate, zero POST during preparation,
cancellation between prepared command and send, cancellation after send begins,
repeat Continue, changed/ambiguous original refusal, old-gate suppression,
confirmed hydration cancellation and close/reopen. Browser tests must establish
that partial membership cannot enable Follow/Undo. Run narrow tests then final
codecheck and complete browser suite, one browser at a time with source frozen.

Status: shared extraction's prior timeline tests pass; implementation of the
relationship port/controller and adapter is in progress. No completion claim.
No server changes are planned for this round; maintained18448 stays on reviewed
bundle92a7c18775c5 with retained volumes. No commits or publication requested.

## Implementation and narrow verification

Application and adapter changes are implemented. Shared collection-read logic
reuses the existing generation/ownership protections; timeline exports alias the
same class/functions. Relationship state includes purpose and a captured target.
Prepared Undo commands are single-use, with read cancellation separated from POST
classification. Membership and activity readers preserve their original complete
count/cycle/origin checks across pauses and keep hard limits.

Independent review found alternative sheet-closing paths that omitted read
cancellation. Filter, hide, navigation, moderation and self-profile paths now
cancel; five regression cases failed before the fix and pass afterward. Transfer
from ActorSheet to People intentionally retains the visible gate. The captured
Undo target remains visible if the user inspects another person. Scoped review
cleared remaining P1/P2 findings.

Narrow browser verification passes13cases (5new +8existing relationship flows).
It proves no graph action from partial data, zeroPOST when canceling preparation,
onePOST plus retained receipt when canceling hydration, close/reopen lifecycle,
and filter/hide exits sending nothing. Finalcodecheck passes733unit plus
format/types/build/Sacho. Full186-browser suite is running inexecsession13221;
source/server frozen, do not restart on observation timeout.

User33's corrected mocked review script completed at390×844 and1440×1000 via
root execution after its tool suffered file-descriptor exhaustion. It verified
unchanged capturedBob target while inspectingCarol, visible footercontrols,
zeroPOST on preflight cancellation and onePOST/retainedreceipt after acceptance.
Its browser closed. The user agent could not view screenshots because its image
tool also failed; root independently opened both viewport screenshots and found
no clipping or missing controls. A separate visual-only review is requested.
This feedback is simulated, not real user research; fullmigration remainsblocked
by unsupported existingMastodon accounts/privatephotos. No serverchanges thisround.

## Terminal verification

Final complete browser suite passes **186/186** with both actual local C2S
fixtures enabled (4.4min). Final codecheck passes **733 unit tests**, formatting,
types, production build andSacho. Whitespace verification is clean. No source
or server behavior changed after the final runs. All test and review browser
handles are terminal; source is unfrozen. No server change, data reset, commit or
publication occurred inthisround.

Independent interaction review completed via the user agent's exact corrected
script; independent pixel review remained blocked by tool descriptor exhaustion,
including a separate visual reviewer attempt. Root successfully opened the
mobile/desktop screenshots and found no clipping or missing controls. This limit
is retained explicitly rather than claiming independent visual sign-off. The
simulated migration verdict remains compatible-C2S use only; existing Mastodon
accounts and private photos are still unsupported. The overall goal stays active.

Next bounded audit candidate: `follow()` still performs an actor GET inside the
combined gateway write promise. Reproduce whether an actor-read failure before
any POST is incorrectly retained as an uncertain Follow, then decide whether a
prepared-Follow boundary is warranted. This is a source observation to test,
not a verified new defect or permission to retry unknown POSTs.

## Round34: Follow preparation

Reproduced actor GET503 before any Follow POST being classified as an uncertain
write. Extend the existing prepare/send boundary to Follow, capture and validate
the outbox/body during preparation, and preserve a single-use send command.
Application state explicitly records preparation failures; HTTP refusals after
POST must not receive the unsent explanation. Cancellation uses the existing
handoff ticket and never passes the read signal to POST. Five focused actual-client regressions and nine relationship browser tests pass.
Independent source review found no actionable P1/P2. Full check passes738unit
tests plus formatting, types, build andSacho; full browser suite is being rerun
after host descriptor exhaustion recovered.
