# Product iteration handoff

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

## Current scope and state

The user wants sustained aesthetic, usability and clean-architecture improvements
with independent simulated-user reviews. Follow and post reception are the chosen
priority, with C2S only. The user explicitly selected local ONI; other server
interoperability needs later research and is not a prerequisite for local work.
No commits/pushes/publication were requested. Preserve all uncommitted work.

Recent completed work: relationship read continuation, cancellable Follow/Undo
preparation, truthful pre-send failure recovery, and ONI owner-page correction.
The latter fixed inbox declared32/returned31 after followers-only text without
weakening the client's complete-read invariant. See iteration-log.md for history.

Latest work adds deterministic post-Undo nondelivery evidence. A synchronous
processing test executes actual Follow/Accept/Note/Undo functions through recording
transport. Disabling relationship removal fails both graph-removal and zero-call
assertions; original code was restored. The full processing Go suite passes.

The maintained fixture enables KIMINO_DELIVERY_AUDIT=1. Its terminal marker records
only SHA256 activity/object IRIs, selected remote-target count and completion/phase
flags. No raw IRIs, content, tokens or errors; no new endpoint. Scheduling remains
asynchronous. The count comes from the same recipient list used by the dispatch.
Incomplete/panicking dispatches cannot yield completed=true. Phase flags describe
returned AddTo* errors only; upstream swallows some recipient errors. They are not
delivery receipts or evidence that all resolution succeeded.

The actual expanded browser test passed4.8s: positive public/followers-only receive,
correlated terminal nonzero routing, exact Undo, both complete graphs empty, fresh
followers-only Note's terminal zero-target routing, complete Alice inbox absence.
This proves that controlled dispatch, not arbitrary future nondelivery. The helper
in tests/helpers/follow-audit.ts bounds and sanitizes Docker log reads and uses
actual strict complete readers, keeping tokens on their actor origins.

## Verification and live work

- Current private-response/proxy fixes: independent review and scoped cookie-origin
  re-review have no remaining P1/P2. Exact taggedGo subset twice and fulltaggedGo
  suite pass. Nineoffline guards, freshbundle/hash verification and imagebuild pass.
- npm run check passes738unit tests, formatting, types, build andSacho.
- Narrow actual private-response/lifecycle test passes5.0s on finalimage.
- Full187browser run:186pass, one stock8443 firstconnect timeout at30s in the
  preserved large-history fixture. session84116 terminated1. The exact failed
  connect/publish/reply/reconnect test passed isolated51.8s, session68577 exit0.
  Do not claim one completely green187run for this patch. No timeouts/data changed.
  Revalidate underload only when justified; preserve this verification limitation.
- No browser/test jobs remain live. Source/runtime unfrozen for the next change.

## Fixtures and commands

Current maintained18448 image: kimino-oni-follow:58be49b-6d69e8571f84.
Docker SHA256:3b98d1492abed3af083c98dcd8f95712017ca13f71d003d4d9fc7005fd325033.
Directory .local/c2s-follow, project kimino-c2s-follow; original named actor volumes
retained. Stock8443 unchanged. Old18447 and private-media18449 are stopped with
volumes/evidence preserved. Corrected ONI is not stock/general interoperability.
Prepared sources: /tmp/kimino-owner-collection-fix/{oni,processing,filters}.
The authoritative reproducible patch bundle is dev/oni-follow.

Use one browser suite at a time; freeze product source/server during browser work
because HMR discards memory-only tokens. Root owns integration/deployment/final
checks. Delegate disjoint paths only, then independently review concrete changes.

```sh
npm run check
python3 scripts/c2s-follow-fixture.test.py
KIMINO_FOLLOW_FIXTURE_DIR=.local/c2s-follow KIMINO_FOLLOW_PORT=18448 npm run test:e2e
```

For builds use KIMINO_FOLLOW_GO=/Users/moreal/.local/share/mise/installs/go/1.26.5/bin/go
and KIMINO_FOLLOW_CACHE_DIR=/tmp/kimino-follow-owned. Do not change global mise,
host trust or unrelated processes/system limits. Recurrent host EMFILE can block
process/file access; never assume it means a live job exited. No data resets.

## Next product requirement

Fresh simulated reviewer supports daily text trial on maintained localONI but not
comprehensive privacy certification/full migration. Next evidence gap: actual
Alice→Bob reply exchange on Bob's followers-only Note, received-replies view and
correct refreshed conversation; assert parentIRI, noPublic, reception and anonymous
read protection. Existing real reply test is self-reply. No defect reproduced yet.
Review is source/scenario/reportedexecution, not independent browser/realresearch.

Currentprivacy scope: directowner/anonymous and ownerproxy/anonymouscold-warm/
invalidtoken cases verified. Eligible follower reads delivered content through its
local authenticated inbox. Direct origin retrieval using follower server signatures
is not established; never forward Alice bearer toBob or add client proxy support
without separate design. Priorreceived/cachedcopies aren't retroactively removed.

Private media remains unsupported: separate18449 evidence found public caching on
restricted responses, warmed directly addressed Image metadata exposed anonymously
through existing proxy, and failed follower binary reads. No PNG-byte disclosure
was established. Read private-media-evidence.md before more probes; do not blindly
rerun its creation script. External account compatibility, moderation, portability
and streaming remain separate requirements. Do not pressure simulated reviewers
into approving migration or treat their feedback as real research.


## Latest direct-read privacy correction

Actual controlled Note probe reproduced anonymous text exposure via existing Bob
proxy, despite anonymous direct GET denial, and public-cache headers on owner
responses. Fixed in current maintained image above: all dynamic representations
private/no-store/no304; exact verified localowner gate before proxy target fetch;
strict cookie-origin guard independent of Authorization; strip upstreamSetCookie.
Cookie-free bearer C2S preserved. Go real-handler RED/GREEN and scoped independent
re-review cleared changes. Tagged tests had cache interference; unique targets
fixed it without weakening allowed1/denied0 request assertions. Exact taggedsubset
count2/fullsuite, freshbundle/build/nineguards pass.

Actual expanded browser privacy regression passed5.0s: ownerdirect/bodytrue,
anondirect denied, anonproxy cold/warm denied, invalidtoken denied, ownerproxy
bodytrue/privateNoStore, plus original lifecycle/nondelivery. No bearer crosses
origins. Client proxy feature remains absent; eligible follower reads delivered
content via its local inbox. Direct signed follower retrieval from origin remains
unestablished. Past cached/received copies are not retroactively removed.

Final187browser run and targeted rerun are terminal; see verification above.
The earlier fullygreen51982 run predates these privacy changes. Root738check
passed currenttest/helper code; no further client edits.
Other stock8443/stopped18449 deployments were not patched by this update.

Latest simulated reviewer next priority: actual two-person private-text reply
conversation. Alice replies to received Bob followers-only Note; Bob receives it
in 받은 답글 and opens the correct conversation after refresh. Check parent IRI,
noPublic and anonymous direct-read protection. Existing real reply is self-reply;
no two-person failure has been reproduced. Make UI changes only on actual need.

## Latest: two-person replies and truthful recipient disclosure

Actual two-account private reply flow nowpasses, including parentIRI/exact Bob-only
address/noPublic, received-replies placement, refreshed conversation, ownerGET200
and anonymousdenial. Userreview thenfound misleading recipientcopy for third-party
mentions. New presentation/reply-audience.ts reuses canonical replyParticipants;
Composer lists fullIRIs and truthful followers/direct wording without changing
addressing. Eightunits and two390/1440browser regressions pass; screenshots at
/tmp/kimino-reply-audience-{390,1440}.png independently inspected, no blocker.
Independent source reviewclear. Final746unit/fullcheckgreen including script addition of new UItest.
UI suite52908 terminal0:148/148pass1.5min; sourceunfrozen.
ActualexpandedC2Stest alreadypassed6.0s; oldstockfullsuite timeoutlimitation remains.
Next bounded UXfix fromreview: ImagePicker should prioritize private-audience
restriction over connection-setting prompt, since enabling settingcannotenable
privateuploads. No new image support authorized/inferred from this finding.

## Latest: private image hint resolved

ImagePicker now prioritizes audience restriction over ONI-enable instructions.
390/1440cases RED→GREEN; nine relatedbrowser tests pass. Independent source review
clear and simulated reviewer opened both updatedscreenshots, no blockinghintissue.
They still need anotherclient forprivateimages: capabilitygap, not a reason to
keep polishing the same UI. Next useful investigation: private media oncurrent
correctedmaintainedONI, without assuming old18449 findings remain identical.
Keep tests/probes synthetic and scoped; no crossbearer/unrestrictedproxy orprivate
uploads enabled without evidence. Read private-media-evidence.md and existingprobe
scripts first, never blindly rerun creation scripts. Current change has no server
mutation and no new media capability. Allninebrowserchecks terminal.

## Latest: private media transport candidate, not full support

Existing18449 fourImages/Follow rechecked on6d69 with no newCreate/Follow. Auth/cache
fixes hold; directproxyPNG returnedJSON andfollowerproxy404. RasterAccept plumbing
now packaged in sourcebundle, independently reviewed and Go/build regressionspass.
Candidateimage58be49b-d7e4a3883690, SHA2563c53c9fb6b441616f9c365b235514e60a784081018fd654d26246740594e6478,
was applied ONLY18449. Existingdirect/public images now return exactPNG after
metadata; anonymousproxy403 andself-onlyAlice404 remain. FollowersAlice404 remains.
Main18448 still6d69; sourcebundle ahead of it intentionally. Client remainsprivate
imagesdisabled. Isolated18449 stopped, volumes/data/CA retained; no browsers live.

Recheck script /tmp/kimino-private-media-recheck.py reusesknownexistingobjects only;
oldcreation script mustnotrerun blindly. Safe results .results.json and baseline
.baseline-6d69.json besideit. See private-media-evidence.md/latestsections.
Next requiredwork: storage-aware exactownerfollowers resourceauthorization with
positivecurrentmember and no currentblock, failclosed; no genericfilter expansion.
FS Load/cache is IRI-keyed andfilteringmaymutatecachedcollection; establish complete
authoritative membership/block reads beforegrant. Tests beyondpage1, wrong/foreign
owner/collection, nonmember/blocked, lookupfailures, warm-afterUndo, metadata+binary.
Thenboundedredirect/body/MIME/byte validation andclientprivateupload/loading lifecycle
are stillrequired; fullacceptance inprivate-media-plan.md. Simulateduser correctly
withholdsprivate-image migration untilfullflow, notdirect-onlytransport, works.

## Current follower-resource candidate (latest checkpoint)

Source and isolated18449 now use image58be49b-2851ec0145c6
(Docker908c90501803142a7c74babc9028ec10260bb752b381bfe5ac2d35b23f6fa055).
Main18448 remains6d69. Exact local Note/Image follower authorization now requires
complete current membership and no block, with FS cache/index explicitly off.
Nested resources are projected to references after a P1 review finding; full
tagged Go and independent scoped re-review pass. Wrapper includes TestProbeFollower.

Build found and fixed test-only indirect-import module drift, preserving original
go.mod guards. Upstream natural-language map ordering test now compares unordered
values with duplicate counts;100 repetitions pass. Root build and all746 app tests,
types/format/build/Sacho pass.

Runtime probe /tmp/kimino-follower-access-probe.py initially stopped BEFORE writes
on ONI default-query collection page IDs; narrow read-only preflight correction
in progress. No Block/Undo/Follow was sent in that initial attempt. Do not rerun
original creation script; existing four synthetic images and accepted Follow are
retained. Final runtime result/checkpoint below supersedes this staging note.

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

Final checkpoint: isolated18449 stopped after confirmed relationship restoration;
all volumes, CA and safe evidence retained. Main18448 and stock8443 unchanged.
No browser session or root test handle remains running. No private client feature
was enabled, no commit/push performed. Continue from the client media lifecycle
gate rather than repeating the completed server access investigation.

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
