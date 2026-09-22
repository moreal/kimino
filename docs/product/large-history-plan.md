# Round31 — bounded, resumable full history

Previous turn made progress: image recovery shipped, privacy capability matrix
completed, and a real connection failure was diagnosed. Main8443 has1982distinct
outbox activities within100pages but points to an empty terminalpage101. All
reads returned200. Preserve that fixture; do not silently truncate, trust a
count instead of following next, or raise an arbitrary ceiling to get green.

## Intended product behavior

A large account can finish loading through explicit bounded continuation. After
each page budget, show counts and offer continue or cancel. Retain traversal
state only in memory, publish no initial timeline until the complete traversal
finishes, and keep an existing timeline unchanged while refreshing. Each
continuation authorizes one bounded chunk, never an unlimited automatic walk.
Existing hard object bounds remain explicit errors, and request timeouts remain. Relationship graph
reads continue to require complete evidence; this work must not quietly convert
them to partial membership or allow writes based on partial state.

Use per-invocation timeline-read options, not a callback attached globally to a
client. A refresh superseded by a write must lose its own prompt and stop its
reads without aborting the POST or a newer read. Abort pending gates and their
listeners on disconnect, replacement, cancellation and read supersession. Only
the current read can display/resolve a gate. No cursor, bearer or remote body is
part of presentation state or persistence.

## Implementation sequence and ownership

1. Typed application read-limit failure, safe reason/limit only; presentation
   explains a client safety boundary rather than blaming server format. Agent
   image_application owns gateway-errors, copy-failures and focused newtests.
2. Reader foundation: optional per-traversal continuation callback and abort
   signal, preserved seen/cache/result state, no request whilepaused, no
   count-based completeness shortcut. Agent image_adapter owns reader and new
   focused continuation tests. The default remains fail-closed.
3. Integrate per-load options through TimelineGateway/TimelineReader, client and
   write queue. Application owns gate state and per-read cancellation; a newer
   write supersedes a paused refresh. Root integrates after independent design
   review, then presentation/view model and accessible continue/cancel controls.
4. Browser tests cover initial load, refresh preserving old timeline, cancel,
   disconnect, stale prompt, actual main8443 continuation and a write superseding
   refresh. Fresh simulated user evaluates screenshots and concrete flow. Keep
   product sources frozen during browsers.
5. Durable real-test isolation needs a separate fixture/account lifecycle with
   no destruction of existing evidence. Never reset main data to hide failure.
   Final full code and browser checks must be recorded with exact terminal counts.

## Current status

Steps1–3 implemented. Per-invocation read gates and transport cancellation
are integrated into connect, explicit refresh and full hydration fallback. UI
offers continue/cancel; background pause preserves draft focus, cancellation
retains the old timeline. Disposal also cancels the pending read. Three mocked
browser regressions passed. Independent review found two synchronous listener
reentrancy bugs; both were reproduced and fixed with operation generation and
budget ownership, then scoped re-review cleared them. Fresh simulated user31 review completed with no scoped UX blocker; no full
migration verdict because account compatibility/private media remain blockers.
Finalcodecheck passes702unit,format/types/build/Sacho; all4scopedhistorybrowser
cases pass. Last full180-test result is179passed/1failed: all main8443 cases
passed, while maintained18448 cannot completeUndo because serverpagination
returns an incomplete inbox. No fullsuitegreen or currentfullFollowcycle claim.


Reader tests cover multiple chunks, no duplicate fetch, empty terminal page,
abort/rejection, cycle across continuation, declared totals not short-circuiting,
and preserved hard object/depth bounds. Application tests cover replacement,
stale callbacks, double continue, cancel/reconnect and confirmed POST fallback.
The real fixture helper now explicitly presses continuation at most three times
within its existing wait allowance; it does not raise limits or reset data.
Durable fixture isolation remains separate follow-up work, not claimed complete.

## Round31 source findings leading to the server correction

Actual adapter readonlyprobe reports `Collection total does not match complete
read`: Alice18448inbox root andcanonicalfirst eachreturn20activities,total21,
noNext. Following membership is1/declared1. NoUndo was sent and the known accepted
Follow remains; preserve all volumes. A10-cycle mockclose/reopen investigation
did not reproduce the earlier apparent dialog failure.

Pinnedgo-ap/filters f116eb702ce2 cursor.go399 generates next.after only under
`len(result)>=1 && len(col)>maxItems+1`. With21items/max20 it omits the cursor;
PaginateCollection atline65 suppresses nextIRI equal tofirstIRI. ONI requests
WithMaxCount20. Coordinator independently inspected these source conditions.
Likely minimal correction changes the threshold to `len(col)>maxItems`, but
verify lastPage/before/after and filtering semantics before shipping it.

Next bounded work: add real dependency regression matrix0/1/19/20/21/22/40/41
atpage20, complete walks with unique IDs andterminalbehavior, and selective
filters. Reproduce21/20 RED, prove corrected completewalk GREEN. Integrate only
into the explicitly experimental reproducible ONI bundle with pinnedsource/hash,
reviewedpatch andbuildverification. Do not alter stock8443 data or relax client
completeness/guess next URLs. Rebuild/restart maintained18448 only after review,
retainvolumes, then UIreconcileexactFollow andverifyFollow→Note→Undo again.
No serverpatch/build/restart was performed inround31.

## Round32 progress

Previous turn made verified progress: resumable largehistory and its lifecycle
checks, plus the exact21/20 serverfailure. Root re-read authoritative bundle and
source before continuing. Regression agent reproduced21/20 and filtered21 RED,
then changed only the next-cursor threshold. Entire pinned filters module suite
passes in isolated `/tmp/kimino-filters-fix`; no runtime change yet.
Root added filters archive verification, relative replacement, fingerprint input,
module integrity guards and module tests to the maintained build pipeline.
Offline integrity tests first failed against the old pipeline. Independent
source review, final hash integration, verified build and retained-volume restart
are pending. Mainstock8443 and stoppedprivate18449 are untouched.

Round32 build/runtime update: serialized terminal regression reproduced the
review finding before the second correction. The final patch captures the last
eligible IRI before before-cursor reversal and stops Next on the finaldata page.
Full module and repeated boundaries pass; independent scoped re-review clears
P1/P2. Root fresh preparation,9offlineguards, fullfilters+index, processing/ONI
regressions andlinux/amd64 image build allpassed. New image is
`kimino-oni-follow:58be49b-92a7c18775c5` (Docker SHA256
`77796fa8550a575bb46646ac997d8c41f2b283c314954c83f0c2796ded69292b`).
Maintained18448 actors were recreated with existingvolumes; gatewayCA unchanged,
main8443 untouched. Authenticatedstartup passed with memoryonlytokens.

The same actual adapter readonlyprobe now succeeds: Aliceinbox20+1=21, firstdata
page Next present, last1-itempage noNext; activefollowing1 andexactrequest1 are
established. No objectwas removed or reset. RealUI Follow/reception/Undo is now
running, then user32readonlyreview and finalverification remain.

## Round32 terminal verification

The real Follow/reception/Undo test passes after exact prior-state reconciliation.
User32 independently confirmed the resulting read-only UI on desktop/mobile;
no scoped UX blocker, compatible-C2S pilot yes, full migration no. Final complete
browser suite passes181/181 with both fixtures; npmcheck passes702unit plus
format/types/build/Sacho. Offlineguards9/9, source/archive/bundle hashes and
server module regressions pass. Docker confirms both corrected actors use the
new image and original nameddata volumes. No active test process or reviewer browser remains.
No client behavior changed inround32. Remaining capability limits are in the
[current handoff](next-round.md); this plan's pagination work is complete.
