# Private media capability evidence — 2026-09-22

The first sections record the original image. See **Corrected-image recheck** below
for the newer owner/proxy/cache protections; historical failures are not a claim
that those same failures remain on the corrected image.

**Verdict: private-image authoring/viewing is not ready for client integration.**
Owner-only binary access works in the tested cases, but the existing proxy
exposes a directly addressed Image's metadata to an anonymous caller after its
cache has been warmed. This is **not evidence of private PNG byte disclosure**:
that proxy returned ActivityStreams JSON even when asked for PNG. A confirmed
follower could not retrieve the followers-addressed Image through the same
proxy. Successful private responses also advertise public caching.

This is a bounded synthetic integration probe, not user research or a general
ActivityPub compatibility claim. It used only the separately started fixture at
port **18449**, project `kimino-c2s-follow-376e2e8bdb`, directory
`/tmp/kimino-private-media`. Main port 8443 and maintained port 18448 were not
modified. No server/product changes, builds, authentication bypass, new proxy,
external target or network scan were performed.

## Method and retained state

The fixture is the explicitly corrected ONI follow environment documented in
[the follow investigation](follow-capability-plan.md), based on ONI commit
`58be49b478fc1e0eb1011732a46c010cb520ea81` and processing revision
`d6997bfd0e03`. Existing private-media findings were read first; see
[C2S capability evidence](c2s-capability-evidence.md).

Client-side writes were exactly:

- One Alice Follow of Bob through Alice's outbox; 201 without Location.
  Subsequent complete collection reads confirmed the matching Accept and both
  graph memberships before followers-addressed objects were created.
- Four Bob Create/Image writes: self-addressed, directly addressed to Alice,
  followers-addressed, and Public control. Every write returned 201 with
  Location. Readback confirmed the intended Image audience and absence of
  Public in all three restricted cases.
- One followers-addressed Bob Create/Note referencing the followers Image,
  containing only a nonsensitive placeholder caption. It returned 201 with
  Location.

All image data was the same canned one-pixel PNG. Each Image used the ONI
unpadded-base64 content convention. No real photograph or private user content
was involved. There were no POST retries and no unexpected POST statuses.
Confirmed objects were resolved by reads rather than republished.

OAuth bearer tokens existed only in probe memory. Alice's bearer was sent only
to Alice's origin, Bob's only to Bob's. HTTPS connections explicitly trusted the
fixture's public CA while connecting to loopback with canonical TLS SNI/Host.
Redirects were rejected; responses were bounded to 1 MiB with eight-second
request timeouts. Collection reads followed first/next with a 20-page bound,
cycle detection, deduplication and declared-total checks. No credentials,
resource IRIs, request/response bodies or original content were logged or saved
in the evidence output.

The explicitly authorized proxy checks POSTed only the fixture's advertised
Alice proxy and only the four known synthetic Bob Image resources created in
this probe. They compared Alice-authenticated versus anonymous caller requests,
with ActivityStreams JSON and PNG Accept headers. No proxy was added to Kimino.

Scripts and safe results remain outside the repository:

- `/tmp/kimino-private-media-probe.py`
- `/tmp/kimino-private-media-probe.verify.py` (readback/identity verification;
  it creates no additional content)
- `/tmp/kimino-private-media-probe.results.json` (statuses, MIME/cache headers,
  booleans only; no resource IRIs or tokens)

**Do not rerun the creation script as a retry.** The accepted Follow and all five
synthetic objects remain in the isolated fixture. No Undo, Delete or reset was performed. After the audit, the coordinator
stopped only this isolated project with its managed down command; all evidence
volumes were retained. Main8443 and maintained18448 remain running. Any later removal
should be explicitly scoped to this separate project and its known synthetic
records, preserving evidence as needed.

## Origin metadata and binary reads

Metadata Accept was `application/activity+json`; binary Accept was `image/png`.
Every successful owner metadata read was separately verified to identify the
same created Image, with type Image and no inline binary content.

| Image audience | Owner metadata | Owner PNG | Anonymous metadata | Anonymous PNG |
| --- | --- | --- | --- | --- |
| Self | 200 AS JSON | 200, exact PNG bytes | 404 JSON error | 404 JSON error |
| Directly Alice | 200 AS JSON | 200, exact PNG bytes | 404 JSON error | 404 JSON error |
| Followers | 200 AS JSON | 200, exact PNG bytes | 404 JSON error | 404 JSON error |
| Public control | 200 AS JSON | 200, exact PNG bytes | 200 AS JSON | 200, exact PNG bytes |

AS JSON responses used `application/ld+json` with the ActivityStreams profile.
Successful binary responses used `image/png`. **All successful responses in this
table—including restricted metadata and PNG bytes—returned
`Cache-Control: public, max-age=604800` and `Vary: Accept`.** The 404 responses
had no Cache-Control header and reported `Vary: Origin`.

This verifies origin authorization behavior in direct uncached HTTP requests;
it does not prove safe behavior in shared HTTP caches or between browser
sessions. The public cache directive is an observed server response, not merely
a hypothetical configuration concern.

## Inbox delivery is not image-byte availability

Alice's authenticated inbox contained the exact activities for the direct Image,
the followers Image, and the followers Note. It did not contain the self-only
Image or the Public-only control. The latter was addressed only to Public,
without followers in cc; no delivery was expected from Public addressing alone.

Thus follower delivery of these metadata activities worked. It does not mean
Alice's server received the actual PNG bytes, or that a browser can subsequently
fetch the original privately hosted image.

## Existing Alice proxy results

Each cell below was tested both with AS JSON and PNG Accept. The response did
not change to PNG: successful requests always returned AS JSON and **no PNG byte
match**.

| Known Bob Image | Alice bearer caller | Anonymous caller |
| --- | --- | --- |
| Self | 404 JSON error | 404 JSON error |
| Directly Alice | 200 AS JSON | 200 AS JSON |
| Followers | 404 JSON error | 404 JSON error |
| Public control | 200 AS JSON | 200 AS JSON |

The direct-to-Alice Image was fetched through the authenticated proxy first.
Subsequent anonymous proxy responses included the server's `is-cached` /
`cached-at` cache indicators. A separate anonymous verification read confirmed
that the returned object was **the same directly addressed Image**, had type
Image and its synthetic description, and contained no inline binary content.
The successful responses still advertised public seven-day caching.

This is concrete **warm-cache anonymous disclosure of restricted Image
metadata/description** through the existing endpoint. It does not establish
cold-cache anonymous behavior, disclosure of PNG bytes, accessibility of every
private object, or behavior outside this fixture. No extra object was created
to investigate cold-cache behavior because the observed disclosure already
blocks integrating this proxy as a private-media viewer.

The followers Image remained 404 through the proxy even with Alice's bearer,
despite verified Follow/Accept/membership and inbox delivery. This is a different
failure from the anonymous metadata disclosure: authorized delivery and later
resource-read authorization do not have equivalent behavior here.

## Source paths explaining the results

- [ONI object GET](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L859)
  loads the authorized actor, applies `filters.Authorized`, loads storage, then
  selects AS JSON or `ServeBinData` according to Accept. The same resource
  authorization path precedes both representations.
- [Authorization filter](https://github.com/go-ap/filters/blob/f116eb702ce2/authorized.go#L16)
  checks actor, attribution, direct recipients, Public and related object IDs;
  [recipient matching](https://github.com/go-ap/filters/blob/f116eb702ce2/recipients.go#L7)
  checks the recipient IRIs themselves. It does not expand followers membership.
  This supports the observed difference between directly addressed and
  followers-addressed Image retrieval.
- [Create object handling](https://github.com/go-ap/processing/blob/d6997bfd0e03/content_management.go#L265)
  merges activity/object audiences and stores the Image. The
  [media cleanup path](https://github.com/go-ap/processing/blob/d6997bfd0e03/content_management.go#L140)
  removes data-URI content before dissemination. The experimental Followers
  expansion changes delivery destinations, not this resource-read authorization
  policy or byte-storage behavior.
- [ONI writeResponse](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L446)
  marks object responses public with a seven-day maximum age and varies only by
  Accept. It has no private-response branch. This matches the observed headers.
- [ONI ProxyURL](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L1203)
  reads the authenticated actor for logging but fetches through the local
  instance actor's signed client. Its blocking middleware does not require all
  callers to be authenticated. This is consistent with the observed anonymous
  warm-cache metadata access; this task did not modify or bypass that behavior.
- [Client fetch defaults](https://github.com/go-ap/client/blob/5680ad0797ed/internal/requests/builder.go#L38)
  request ActivityStreams/JSON representations. ProxyURL does not forward the
  incoming PNG Accept choice, consistent with its JSON-only successful results.

## Product boundary

Do not integrate the existing proxy or offer followers-only image publishing
based on these results. Required guarantees are still missing: safe restricted
response caching, a caller-authorized recipient media-read path, followers-aware
resource authorization, and verified byte availability to legitimate recipients.
Owner Bearer success and successful activity delivery are insufficient.

No recipient bearer was sent cross-origin, no browser-side federation signature
was invented, and no unsafe fallback was added. Private image rendering would
also need explicit authenticated blob loading where appropriate and correct
in-memory cleanup; ordinary image elements do not carry a same-origin bearer.
That client work cannot repair the observed server authorization/cache behavior.

This probe did not test revocation after unfollow, deletion of media or copies,
conditional/cache replay across browser sessions, cold-cache anonymous proxy
access, upload size limits, or other servers. It makes no guarantee about those
unmeasured cases.


## Corrected-image recheck

The preserved isolated18449 fixture was restarted on corrected6d69e8571f84.
Existing actor volumes, accepted relationship and four synthetic Images retained;
no new Create/Follow writes. Main18448 and stock8443 were not changed. OAuth tokens
remained in memory, each sent only to its actor origin; redirects/oversized bodies
rejected. Only advertised Alice proxy with known synthetic Bob resources was used.

Both graph memberships remain present. Owner PNG reads return exact original
bytes with private,no-store; restricted anonymous origin reads return404. Every
anonymous proxy request now returns403, including after authenticated warm reads.
Public anonymous origin PNG remains200/exact bytes. These confirm the recent
privacy protections apply to the earlier synthetic images as well.

| Existing Image | Alice authenticated proxy metadata | Alice proxy PNG request |
| --- | --- | --- |
| Bob self-only | 404 | 404 |
| Directly Alice | 200 AS JSON | 200 AS JSON, not PNG |
| Bob followers | 404 | 404 |
| Public control | 200 AS JSON | 200 AS JSON, not PNG |

Remaining independent gaps: proxy ignores raster Accept and default client requests
JSON; resource authorization does not expand positively verified local follower
membership. Do not enable private-image client support from metadata success.
Current work first isolates raster negotiation while retaining all owner/cookie
and no-store guards; follower access remains a separate required fix, not an
acceptable substitute for full requested private-media capability.

Read-only-content recheck script: /tmp/kimino-private-media-recheck.py.
Safe results: /tmp/kimino-private-media-recheck.results.json (status/MIME/cache,
exact-byte booleans; no resourceIRIs/tokens/bodies). Original creation script was
not rerun. Isolated18449 was stopped after the candidate verification, preserving all volumes.

## Raster negotiation candidate result

Candidate58be49b-d7e4a3883690 (Docker3c53c9fb6b441616f9c365b235514e60a784081018fd654d26246740594e6478)
was built with verified patches and applied ONLY to isolated18449. Main18448 is
still6d69. No new content or relationship writes; same existing4Images reread.
Direct/public Alice-authenticated proxy PNG requests now return image/png with
exact original bytes and private,no-store, even after metadata reads of sameIRI.
Metadata stays JSON. Anonymousproxy stays403; Bob-self-only stays404 forAlice;
follower image still404 despite membership. These are server transport results,
not a completed private-image feature or permission to enable client uploads.

Baseline6d69 results retained at /tmp/kimino-private-media-recheck.baseline-6d69.json;
new candidate results at /tmp/kimino-private-media-recheck.results.json. Both contain
only status/MIME/cache/byte-match evidence. TaggedGo suite, MIME mismatch rejection,
duplicate Content-Type rejection and sameIRI cache regression passed. Independent
source review found no issue in this bounded raster step.

## Verified follower image access transitions

Candidate58be49b-2851ec0145c6 was applied only to isolated18449 with retained
volumes and the existing four synthetic images. Maintained18448 remains6d69.
The existing follower was not added as a direct recipient of the follower image.

| State | Followers image metadata / PNG | Direct image metadata / PNG |
| --- | --- | --- |
| Accepted follower | 200 / 200 | 200 / 200 |
| After confirmed Block, warmed reads | 404 / 404 | 404 / 404 |
| After confirmed Undo Block | 200 / 200 | 200 / 200 |
| After confirmed Undo Follow and both graphs empty | 404 / 404 | 200 / 200 |
| After restored Follow, matching Accept and both graphs | 200 / 200 | previously verified |

Allowed PNG responses exactly matched the original bytes; metadata retained alt
text and identity. All observed responses used no-store. Self-only resources
returned404 to Alice; anonymous proxy reads returned403. These are current-request
authorization results, not retraction of copies already received or an atomic
snapshot guarantee for concurrent graph mutations.

Execution was checkpointed, not one uninterrupted run: the probe first rejected
ONI's default-query page IDs, then stopped after confirmed Undo Follow on an empty
page alias. Read-only reconciliation confirmed both graphs empty. ONI deletes the
original Follow on Undo, so the resume matched the sole retained Undo target to
the prior Bob Accept before continuing. No accepted POST was repeated. Exactly
four graph writes (Block, Undo Block, Undo Follow, restoring Follow), zero new
Images/Notes. Restored membership and image access were confirmed.

Safe evidence: /tmp/kimino-follower-access-probe.results.json, with original
checkpoint /tmp/kimino-follower-access-probe.partial.json. Probes:
/tmp/kimino-follower-access-probe.py and /tmp/kimino-follower-access-resume.py.
Do not rerun the checkpoint-specific resume after successful restoration.
No tokens, response bodies or resource IRIs are stored in these result files.

Independent scoped source review found no remaining P1/P2 after nested-object
projection. Full tagged Go tests, image build regressions, nine offline fixture
guards, twelve empty-page probe cases and root npm check (746 tests) passed.
Private client uploading/loading remains disabled and unfinished; this result
closes the server follower-access gate only.

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
