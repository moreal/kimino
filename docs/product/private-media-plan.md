# Round30 — private-media capability audit

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

Previous turn made verified progress: own Image diagnostics and token-safe real
browser testing,674 unit /176 browser checks. Read previous capability evidence
before starting: self-addressed Image bytes were anonymous404 / owner200. That
establishes owner protection only, not remote recipient access or follower scope.

## Intended outcome

Determine whether a C2S-only browser can publish and read follower-only photos
without widening audience, forwarding a bearer to another origin, automatic
remote loads, or a new unrestricted proxy. Do not enable a private option until
binary authorization and delivery both have real evidence. Existing public-only
UI stays accurate while the capability is investigated.

The current browser uses an explicit img element, which cannot attach a bearer.
ONI advertises a POST proxyUrl for ActivityStreams resources; source inspection
must establish whether it can return binary media and authorize only its owner.
The proxy is a server endpoint, not permission to add arbitrary browser proxying.

References: ActivityPub6.12 leaves upload methods outside its definition; object
retrieval/authentication and actor proxyUrl are distinct capabilities:
https://www.w3.org/TR/activitypub/#uploading-media
https://www.w3.org/TR/activitypub/#proxyUrl

## Bounded local evidence matrix

Use a separate loopback-only two-actor fixture on18449, preserving main8443 and
maintained18448. Same reviewed image/patch bundle; no server code or auth changes.
Only synthetic tiny pixels and placeholder Note text, no personal content.
Bearers acquired and held in memory, used only at their actor origins. Log only
status/type/count/byte-equality, never request/response bodies or credentials.

- Establish one Alice→Bob Follow through Alice outbox, reconcile exact persisted
  request and complete graph membership. No retry of unknown POST outcomes.
- Bob self-addressed Image: owner metadata/bytes, anonymous metadata/bytes,
  Alice's own advertised proxy with JSON and image Accept headers.
- Bob follower-addressed Image + Note referencing it: owner and anonymous reads,
  Alice inbox delivery, Alice own proxy JSON/binary negotiation. Do not send
  Alice bearer to Bob or directly POST S2S inboxes.
- Optional known-exact Undo and subsequent bounded read may describe observed
  access after withdrawal; do not assume normative retroactive revocation.

Source audit and a documented matrix determine next implementation work. A
successful private Note with public bytes is a failure, not partial privacy.
Owner-only success is not follower-media support. Redirects, unsupported MIME,
resource limits and cancellation remain separate client requirements.

## Progress

The isolated real matrix is complete; see [evidence](private-media-evidence.md).
One confirmed Follow and five synthetic Creates succeeded without POST retries.
Recipient inbox delivery succeeded, but follower media retrieval failed. The
existing proxy returned warmed restricted metadata to an anonymous caller and
never returned the requested PNG bytes. Restricted owner reads also advertised
public caching. No private-image support or proxy integration is enabled.

A bounded reader improvement now preserves alt text after image failure, explains
failure without guessing its cause, and offers explicit retry/hide. A stable
button retains keyboard focus across these states. No automatic retry, bearer
forwarding, or new remote request path was added. Independent source re-review cleared the focus fix. Fresh simulated user30
verified desktop/mobile recovery with no scoped blocker, but declined migration
because account compatibility and restricted media remain unsupported. Code
check passes 674 unit tests; final browser validation remains pending. The
isolated18449 fixture is stopped with evidence volumes retained.

Follow-up server work must independently establish authenticated proxy access,
private caching, follower-aware resource authorization and bounded recipient
binary retrieval before private authoring/viewing can be considered. This audit
is evidence about the pinned experimental ONI fixture, not all C2S servers.

### Main-fixture validation interruption: confirmed pagination boundary

Read-only diagnosis of the main fixture after the browser run: outbox declared
1,982 activities. At page 100, all 1,982 distinct activities were already read,
but `next` remained present. Page 101 was an empty terminal page; the completed
walk still contained exactly 1,982 activities. Inbox took two pages (four rows,
two distinct activities, declared total two). All 104 HTTP requests returned
200: one actor read, two inbox pages and 101 outbox pages. No credentials,
resource identifiers or content were logged; no writes/reset occurred.

`ActivityPubClient` defaults `maxPages` to 100, and `collection-reader.ts` throws
its unexpected-response page-limit error before fetching page 101, even when
the preceding count already matches the declared total. This explains the
connection failures without alleging malformed server JSON or more than 2,000
stored activities. The empty terminal continuation, not the approximate item
ceiling, is the precise boundary observed here.

Final browser verification:167passed/4failed/1interrupted/5notrun. New reader
recovery and corrected18448 Follow/reception/Undo passed. Main8443 now reaches
its100page complete-read cap:1982declared/distinct activities bypage100, with an
empty terminalpage101. Read-only audit saw onlyHTTP200, no malformed bodies.
Noreset/truncation/ceilingincrease was applied. Record this separate operational
limit before the next iteration; final fullsuite is notgreen.

## Corrected-runtime capability continuation

Do not redefine success as direct-only media. Simulated user acceptance remains:
Bob's restricted image reply (Alice qualifies through followers membership, not an
extra direct address), Alice receives alt text and explicitly loads/hides/retries
correct bytes, anonymous/nonmember deny even warm, origin-confined tokens, cleared
blobs/late-load suppression on disconnect/switch, failed-draft/upload reuse with
matching audience, restricted orphan uploads, truthful UI copy. No client enable
until these requirements have evidence. This is simulated requirements, not research.

Raster step is implemented in candidate bundle: exact PNG/JPEG/WebP Accept before
signed request; successful raster response requires exactly one matching MIME,
otherwise no body forwarding. Metadata default remains unchanged. TaggedfullGo
suite and sameIRI metadata→PNG regression pass. Candidate applied only isolated
18449, reusing4existing syntheticImages andexistingFollow (no Create/Follow writes).
Direct/public authenticated proxy now yields exact PNG; anonymousproxy403,
self-onlyAlice404, followersAlice404. Follower grant remains next required step.

Authorization design audit: extend only single-resource ONI authorization, not
genericfilters or collection listing. Require exact configuredlocalowner, exact
storedresourceID, single attributedToowner, exact canonicalownerfollowers recipient,
verified nonanonymousrequester, currentpositivefollowers membership and no current
block. All errors/incomplete evidence deny. No arbitrary audience dereference or
cachedallow decisions. Test follower beyondpage1, blocked/nonmember, foreignowner/
collection, lookup failure and warm-afterUndo for metadata andbinary.

Storage caveat to resolve beforecoding: FS cache is IRI-keyed; filtering can mutate
cachedcollections and WithMaxCount is stateful. A filtered/limited read cannot prove
complete membership or no block. Verify authoritative complete semantics or add an
explicit storage membership operation; don't infer safety from a partial list.
Redirects, bounded raster responses and byte validation remain client/proxy design
requirements before exposing private loading. Existing owner/cookie/no-store guards
must survive every change. Main18448 stays6d69; candidate18449 isd7e4a3883690.

### Storage/bootstrap facts verified before follower-grant implementation

Current SetupCtl passes no cache/index options, and pinnedstorage-all zero-values
both false. The dev HTTP cache is separate. Existing WithCache(false)/UseIndex(false)
can explicitly preserve the invariant; no fourth dependency fork or direct file
parsing is needed. Unfiltered Storage.Load retrieves collection members; helpers
must still verify exactID/type/distinctcount==TotalItems because FS suppresses
some child-load errors. No cached or partial absence may prove no block.

Normal actual actor bootstrap invokes CreateCollectionsForObject, which explicitly
creates hidden blocked/ignored collections. Therefore failclosed on missingblocked
does not require artificial block/unblock seeding for normal accounts. Missing
header is not trustworthy emptiness: memberlinks may still exist, and bootstrap
can swallow collectioncreation failures. Test real bootstrap and corruptedheader.

Implementation underway only in preparedONI: exactlocalNote/Image follower grant,
verified requester and exactsingleowner attribution/ownerfollowers audience,
completecurrentfollowers+blocked reads; preserve basicAuthorized andcollectionpaths.
Root will validate retained18449 images across Block/UndoBlock and UndoFollow,
using exactactivities, no automaticPOSTretry, and restore one Follow explicitly.
No new imagecreation/clientenablement is part of this server gate step.

### Follower resource review and build gate

Independent review found a private-child disclosure in filesystem-expanded Tag
objects. The fallback now projects all nested Item/ItemCollection fields to their
resource IDs; ID-less inline links retain only type and href. Unidentified nested
objects and excessive/cyclic nesting fail closed. Parent content and image alt
text remain intact. Real-FS regressions cover 96 nested-field cases; independent
scoped re-review found no remaining P1/P2. Fresh full tagged Go tests passed.

Root build caught a post-test go.mod drift using the existing original-module
integrity check. Deployment remains pending investigation; the check is unchanged.
The isolated runtime probe will test both metadata and exact PNG after warm reads,
Block/UndoBlock and UndoFollow, preserving alt text and restoring the known Follow.

Module drift was resolved by using storage-all's existing FS factory in tests;
fresh tagged tests preserve go.mod byte-for-byte. Two subsequent root builds
failed the unchanged filters/index natural-language map-order assertion. A bounded
test-only correction will compare sorted string slices, preserving duplicate
counts and all production behavior; no test is skipped.

The test-only order correction passed100 repetitions plus full filters tests.
Root image build now passes all guards and regression subsets, producing
58be49b-2851ec0145c6 (Docker908c90501803142a7c74babc9028ec10260bb752b381bfe5ac2d35b23f6fa055).
Applied only to retained18449. Initial runtime probe stopped before any graph
writes: collection-root GET returns a canonical default-query page ID rather than
the requested root ID. The probe is being narrowed to accept that exact verified
page representation while preserving strict ordinary resource identity.

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

## Client read implementation design

Use an application ImageReadGateway returning bounded encoded raster bytes rather
than a remote URL. The ONI transport uses only the advertised, exact-own-origin
proxy for remote resources; the account token never goes to the image origin.
Only explicit reader action initiates loading. Reject redirects, unsupported MIME,
oversized or mismatched bytes; cancellation covers response body consumption.
An eventual session use case must authorize the target against a currently loaded
note/attachment and guard session identity. The Solid/browser bridge owns object
URLs and releases them on hide, replacement, failure and teardown; late results
must never revive a hidden image or another account's media.

Restricted upload must derive the exact same canonical addressing as the final
Note (including reply participants), and reuse confirmed uploads only for that
identical audience. A public upload must never be silently reused in a narrower
reply. Complete the read and upload contracts before enabling the feature in UI.

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

## Restricted image authoring implementation

Use canonical, copied to/cc sets for upload and Note; receipt reuse requires exact
audience equivalence including recipient roles. The application snapshots the
submission before async work. The ONI adapter verifies returned Image addressing
and any exposed Create addressing;201 with missing/mismatched metadata stays
accepted-but-unresolved and is never automatically reposted. Client-held verified
receipt associations also guard direct publishNote calls against fabricated
attachment audience claims. Changing a Note attachment caption does not rewrite
the uploaded Image's original name.

Generic ONI mode must not unlock private uploads on uncorrected stock ONI. The
corrected fixture explicitly advertises a generator Service marker with exact
id urn:kimino:oni:private-media:1, preserving existing generator values, only for
the configured local root actor with KIMINO_PRIVATE_MEDIA_CAPABILITY=1. This is a
versioned experimental server assertion, not a standard or security attestation.
Client requires both this marker and explicit ONI mode; unsupported servers keep
restricted authoring disabled without changing draft visibility.

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
