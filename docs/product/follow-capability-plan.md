# Follow capability investigation — 2026-09-22

Status: stock ONI cannot complete this tested loop. Three labeled experimental
corrections reproduce Follow → Accept and visible graph membership on fresh
storage. An additional processing fork also removes both graph memberships on
Undo; follower-addressed Note delivery remains unverified/unsuccessful in the
bounded observations. Post-review Undo regressions are fixed in temporary source
and await rereview/rebuild; do not treat the old image as containing those fixes.
All temporary containers are stopped; no investigation process is active.
See the final sections for current results and two proposed, unimplemented fixes.
No Follow UI, repository Compose configuration, application source, packages or
existing fixture data changed. No Playwright run. This is integration evidence,
not user research. Read [the earlier capability evidence](c2s-capability-evidence.md)
for the pinned server and source-backed acceptance semantics.

## Owned temporary topology

Files are under `/tmp/kimino-follow-probe/`:

- `compose.yaml`: project `kimino-follow-probe`; two ONI services `alice`, `bob`,
  and one Caddy `gateway`. Each has its own project-prefixed storage volume.
- `Caddyfile`: TLS virtual hosts `alice.test:18443` and `bob.test:18443`, routing
  to the corresponding ONI service on port 4000.
- `root.crt`: public CA certificate exported from this temporary Caddy only.
- `probe.py`: initial bootstrap/Follow/conditional Note-delivery probe. It prints
  statuses, collection types and boolean assertions, not credentials or bodies.
  **Do not rerun it blindly:** it sends another Follow.
- `read-state.py`: obtains temporary OAuth tokens in memory and reads collection
  state without any ActivityPub write. Use this to resume inspection first.

Both ONI services use the repository-pinned image
`quay.io/go-ap/oni@sha256:a765501d3ee2d0ea557e2585f930cc32e7eca69ea9455a35b70c98549c0d70a5`
(`master-58be49b`, linux/amd64). Caddy uses
`caddy@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`.
Only already-cached images were used (`--pull never`).

The ONI containers connect only to `kimino-follow-probe_default`, an internal
Docker network. Gateway has aliases `alice.test` and `bob.test` on that network
and also joins `kimino-follow-probe_ingress`. Only gateway publishes a host port:
`127.0.0.1:18443 -> 18443/tcp`. Docker inspection confirmed this binding and
`Internal=true` for the actor network. The existing `kimino-c2s` project on
localhost:8443 was neither restarted nor reconfigured.

The host Python probe overrides resolution of the two `.test` hosts to
127.0.0.1 within its own process; it preserves the canonical hostname for TLS
and HTTP and disables environment proxies. No hosts file or host trust store
changes. Its SSL context trusts only the temporary CA explicitly. Redirects
are rejected and authenticated requests assert the matching actor origin.

Each ONI service mounts `./root.crt:/probe-ca/root.crt:ro` and has
`SSL_CERT_FILE=/probe-ca/root.crt`, scoped to these temporary containers.
The temporary known bootstrap password is development-only; tokens stay in
probe memory. Do not dump raw ONI logs: upstream bootstrap logging can contain
credentials. Diagnostics so far used counts of known error phrases only.

## Attempts and observations

1. Initial gateway joined only the internal Docker network. It started, issued
   both TLS certificates, but host connection to port 18443 was refused and
   `docker compose ps` showed no published binding. No ActivityPub write occurred.
   Adding gateway-only ingress fixed host reachability without adding an
   external network to either ONI actor.
2. Both canonical actor GETs and OAuth client-credential exchanges succeeded.
   Alice C2S `Follow` of Bob, addressed to Bob, returned **201 without Location**.
   Thirty polls found no Accept, empty Alice following and Bob followers, and
   no received Follow in Bob's inbox. Sanitized error counters identified
   `tls: failed to verify certificate` / `certificate signed by unknown
   authority` (three occurrences each). Thus this attempt failed at TLS
   delivery, not because Follow acceptance is absent.
3. Exported the temporary public CA and mounted it into both ONI containers
   through `SSL_CERT_FILE`; recreated only those temporary ONI containers,
   preserving their temporary storage. A deliberate second probe again passed
   canonical actor GETs and OAuth, but its Follow POST exceeded the script's
   **10-second read timeout**. This write has an ambiguous outcome and was not
   automatically retried. Subsequent collection reads succeeded: Alice outbox
   contained one Follow and its bootstrap Create; Bob inbox/outbox contained
   only bootstrap Create. Both relationship collections remained empty.
   The single Follow row cannot establish whether the second request replaced,
   deduplicated, or never stored another activity. No cause for the post-CA
   timeout has been established.
4. After container recreation, inspected log windows contained no matching TLS,
   timeout, signature or acceptance diagnostic phrases. Absence of those log
   messages is not proof of successful delivery. No subsequent Note was sent,
   because the probe sends it only after both relationship assertions pass.

Current outcome: **Follow stored once; Accept and subsequent Note delivery not
verified.** The first delivery failure has a concrete TLS cause; the later
request timeout remains open. Never translate this into “ONI never accepts
Follow.” The earlier single-actor result is still not a federation test.

## Safe resume commands and next investigation

Run from any directory; each Docker command explicitly names the temporary
Compose file so it cannot select the repository's main fixture:

```sh
docker compose -f /tmp/kimino-follow-probe/compose.yaml ps
python3 -u /tmp/kimino-follow-probe/read-state.py
docker inspect kimino-follow-probe-gateway-1 --format '{{json .NetworkSettings.Ports}}'
docker network inspect kimino-follow-probe_default --format '{{.Internal}} {{len .Containers}}'
```

Next steps, in order:

1. Record current collection activity IDs internally and compare to earlier
   state without printing bodies. Confirm whether an Accept arrived late. Do
   not resend the ambiguous Follow as the first debugging action.
2. Inspect actor-to-gateway DNS resolution and TLS from inside the isolated
   network, including the actual `SSL_CERT_FILE` value and file readability.
   Confirm each actor can retrieve the other canonical actor and its public key.
   Host HTTPS success alone does not establish container-to-container success.
3. Trace the pinned processing/client path before changing configuration:
   determine whether resolving Bob during Alice's C2S request waits on a signed
   fetch and a reciprocal public-key fetch. This is a hypothesis, not a finding.
   Capture only method/status/error categories or sanitized goroutine state;
   never publish raw request bodies, token headers, private keys or raw logs.
4. Once the request path is understood, use a bounded explicit timeout adequate
   for the diagnosed path. If another Follow is necessary, make it a deliberate
   documented test action after reading current state, not an automatic retry.
5. Assert all three independently: Bob receives Alice's Follow, Alice receives
   Bob's Accept referencing that Follow, and Alice following/Bob followers each
   contain the other actor. A 201 alone is not subscription success.
6. Only then POST a public Create/Note to **Bob's outbox**, addressed to Public
   with Bob followers in cc, and poll Alice inbox for that specific activity IRI.
   The client must never deliver to Alice inbox itself. This demonstrates server
   delivery after subscription instead of simulating federation client-side.
7. Before browser UI work, repeat with fresh isolated storage under a new project
   name or an explicitly approved temporary-only cleanup. Preserve the existing
   repository fixture. Test Undo/withdrawal and delayed/failed acceptance
   separately; they are not established by this investigation.

Temporary containers are currently left running for continuation. When no
longer needed, stop **only this project**, retaining volumes for diagnosis:

```sh
docker compose -f /tmp/kimino-follow-probe/compose.yaml stop
```

Do not run `down --volumes` against the main repository fixture. Temporary
resource deletion should be explicitly scoped to `kimino-follow-probe`.

## Source evidence and limits

- [Pinned ONI dependencies](https://github.com/mariusor/oni/blob/58be49b/go.mod):
  processing `d6997bfd0e03`, client `5680ad0797ed`, auth `c65b146155c7`.
- [ONI inbound auto-accept](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L1153)
  and [Accept construction](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L1013).
- [Follow processing](https://github.com/go-ap/processing/blob/d6997bfd0e03/relationship.go#L55)
  and [Accept collection changes](https://github.com/go-ap/processing/blob/d6997bfd0e03/reactions.go#L168).
- [ONI HTTP client setup](https://github.com/mariusor/oni/blob/58be49b/control.go#L120)
  includes development TLS configuration and signed client setup; source intent
  alone did not prevent the observed certificate failure in this image.
- [W3C C2S Follow](https://www.w3.org/TR/activitypub/#follow-activity-outbox)
  distinguishes submitting Follow from receiving Accept and updating following.
- [Official ONI development-image caveat](https://mariusor.srht.site/apps/oni/index.html)
  warns that development signatures are incompatible with the wider fediverse.
  Even a successful two-ONI test would not establish public-server compatibility,
  private-recipient semantics, production signatures, or browser CORS behavior.

## Continuation: peer TLS verified; remote delivery misclassified

This section supersedes the earlier visible-empty snapshot; all earlier
observations remain chronological evidence, not the current verdict.

Completed additional checks:

- `netcheck.go` / `netcheck` under the temporary directory use only Go's standard
  library. The binary was cross-compiled for linux/amd64 and copied into temporary
  Alice as `/probe-netcheck`. Running it inside Alice confirmed the configured CA
  file is readable and parses, both canonical actor hostnames resolve, and both
  HTTPS actor GETs return 200 with matching canonical IDs and a public-key field.
  This establishes container-to-gateway TLS connectivity, unlike host-only GETs.
- Safe pprof summaries (`stacks.py`) retained function names/counts only, never
  arguments or response data. They showed many idle HTTP/2 client connections
  after the timeout but no active go-ap call chain. A reciprocal signed-key
  fetch loop therefore remains an unproven hypothesis, not a diagnosed cause.
- A subsequent pre-write collection read found **two** Alice Follow rows: the
  previously timed-out second request eventually committed. This is direct
  evidence that timeout must remain ambiguous and must not trigger retry.
- One additional, deliberate diagnostic Follow (`diagnose-follow.py`) was sent
  after those reads and after peer TLS verification. It returned **201 without
  Location**. It was not an automatic retry. Alice now has three Follow rows;
  Bob's inbox has the two post-CA Follows, and Bob's outbox has two Accepts.
- `shape.py` inspects only types, IDs and addressing. Each emitted Accept has
  Bob as actor, Alice in `to`, and an embedded Follow whose actor is Alice and
  object is Bob. The accepted Follow IDs match those received by Bob. No
  acceptance was fabricated by the probe or posted directly to an inbox.
- Bob's sanitized collection-write errors attempt local filesystem paths
  `alice.test:18443/following` and `alice.test:18443/inbox`, both failing with
  “no such file or directory.” Similar errors target the remote Follow's replies
  collection. This provides a concrete explanation for the missing return
  delivery: it is attempted as a local collection write, not remote inbox POST.
- `collection-shape.py` separates membership visibility from declared totals:
  Alice following is an `OrderedCollectionPage` with `totalItems=0`; Bob
  followers is an `OrderedCollectionPage` with **`totalItems=2` but neither
  `items` nor `orderedItems`**. Both have string `first` and no `next`.
  Consequently the earlier “empty Bob followers” statement means no visible
  members, not a proven empty server collection. Repeated Follows may explain
  the count, but this investigation has not proved the storage/count semantics.

### Source-backed diagnosis and boundary

[ONI `IRIHasLocalParent`](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L1055)
normalizes an IRI to its origin root and considers it local when that root can
be loaded from storage. It does not check that the root is a configured local
actor or that the server owns its key. **Inference from source plus observed
local Alice-path errors:** once Bob has stored Alice's actor while handling a
Follow, Alice can be misclassified as local. The
[local dissemination path](https://github.com/go-ap/processing/blob/d6997bfd0e03/collections_dissemination.go#L122)
then attempts filesystem collection writes. This fits the observed Accept
present in Bob outbox but absent from Alice inbox.

The unresolved 10-second first-post-CA timeout is a separate issue; the local
collection error does not itself prove why that earlier request was slow.
[Auth key retrieval](https://github.com/go-ap/auth/blob/c65b146155c7/key-loader.go#L38)
uses the supplied client, and
[ONI GET authorization](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L747)
supplies an actor-signed client, so reciprocal key-fetch investigation remains
reasonable if a cold-start reproduction is needed. No signature stripping,
server bypass, or weakened inbox validation was applied.

Current verdict: **stock pinned ONI receives Follow and emits correct-shaped
Accept, but the tested two-server relationship handshake does not complete.**
Subsequent follower-addressed Note delivery and Undo/withdrawal are therefore
not yet verified. No Note was sent in this investigation. It would be incorrect
to claim either “Follow unsupported” or “subscription works.”

### Next bounded work

1. Resolve the origin-ownership predicate upstream or in an explicitly labeled
   temporary server build: use configured locally owned actor roots, not merely
   presence of a cached actor in storage. Keep signed inbox validation intact.
   Do not disguise such a server patch as stock-image compatibility.
2. With that issue addressed, repeat the handshake in fresh isolated storage.
   Confirm Alice receives Bob's Accept and both graph collections expose real
   member IRIs. Investigate Bob's count-without-members independently; never
   substitute a declared count or cached profile for proven membership.
3. Only then test follower-addressed Note delivery and spec `Undo` of the exact
   persisted Follow ID. Observe both collections and a later Note. If Undo is
   refused, characterize Delete separately as an ONI-specific behavior, not a
   generic C2S substitute. Confirm pending-request cancellation independently.
4. Do not invent a Follow receipt ID: 201 lacks Location on this image. Discover
   the persisted Follow through subsequent outbox reads and match actor/object;
   ambiguous multiple requests must remain distinguishable from membership.

Useful additional read-only commands:

```sh
docker compose -f /tmp/kimino-follow-probe/compose.yaml exec -T alice /probe-netcheck
python3 -u /tmp/kimino-follow-probe/read-state.py
python3 -u /tmp/kimino-follow-probe/collection-shape.py
python3 -u /tmp/kimino-follow-probe/shape.py
```

`shape.py` prints only temporary activity and actor IRIs plus type/addressing
metadata. The Go compiler used was the already-installed
`/Users/moreal/.local/share/mise/installs/go/1.26.5/bin/go`, with
`GOCACHE=/tmp/kimino-follow-probe/go-cache`, `GOOS=linux`, `GOARCH=amd64`, and
`CGO_ENABLED=0`. No global tool configuration was changed. The temporary
containers remain running for continuation; all main-fixture resources remain
untouched.

## Temporary correction preparation (in progress)

A path-only configuration workaround is not established: pinned
[`Run.Run`](https://github.com/mariusor/oni/blob/58be49b/cmd.go#L92) declares a
URL option but does not pass it to the runtime, and
[`oniActor`](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L936) plus
`requestRootIRI`/`baseIRI` use the host origin for request identity and bootstrap.
`DefaultActor` retaining an arbitrary IRI does not prove runtime support for
`/alice` and `/bob`. The locality predicate also strips every candidate path to
`/`, which could break local-path classification as well. No path workaround
was applied.

The stock binary was copied from the temporary container to
`/tmp/kimino-follow-probe/oni-original` and inspected with `go version -m`.
It confirms version ldflag `master-58be49b`, tags `dev,ssh,tui`, linux/amd64,
`CGO_ENABLED=0`, `GOEXPERIMENT=greenteagc`, and the exact processing/client/auth
revisions already cited.

A separately labeled correction experiment is being prepared at
`/tmp/kimino-follow-owned/oni-58be49b`, extracted from the official pinned GitHub
source archive. Only `handlers.go` is modified: after the existing root-IRI
normalization, `IRIHasLocalParent` compares that root to an explicitly supplied
`ONI_PROBE_LOCAL_ACTOR` environment value, instead of loading arbitrary cached
actors from storage. The temporary env contract is not a production patch;
there is no signature or inbox-validation change. Each temporary server will
receive only its own canonical actor root as that value.

The exact image's public `main.js`, `main.css`, `icons.svg`, and `robots.txt`
were copied through public static GETs into the source `static/` directory for
embedding, avoiding an unrelated frontend dependency regeneration. Go module
resolution is underway with `GOMODCACHE` and `GOCACHE` scoped below
`/tmp/kimino-follow-owned/`. The planned comparison will use a distinct explicit
local image tag `kimino-oni-follow-probe:58be49b-owned`, new Compose project
`kimino-follow-owned`, fresh volumes, and loopback port 18444. Stock failure
resources remain intact. Build and corrected handshake results are not yet
claimed.

Build completed: temporary image `kimino-oni-follow-probe:58be49b-owned`, image
ID `sha256:ee34f1cacf1ab36b78ce1e1a46aaae0a1ca8ed78b2c4ee0ed1d8c7dd4d322981`.
Source patch is `/tmp/kimino-follow-owned/oni-58be49b/handlers.go`; the configured
root equality replaces only the final storage-presence predicate and adds an
`os` import. Fresh `kimino-follow-owned` actors/gateway started successfully;
both canonical HTTPS actor reads and OAuth succeeded. Initial corrected probe
is running as `python3 -u /tmp/kimino-follow-owned/probe.py`, exec session 38960.
Do not start a concurrent copy or repeat its POST while that result is pending.

### Cold-start request expansion: experimental actors stopped

Session 38960 exited with a 10-second Follow read timeout. Subsequent reads
found no persisted Follow or Accept yet. Without another write, live safe pprof
summaries then found **19,251 goroutines on Alice and 19,450 on Bob**, including
roughly 6,400 concurrent inbound handler chains and outbound HTTP/2 client
requests each. This is uncontrolled reciprocal request expansion, not a normal
long delivery queue. The experimental Alice/Bob containers were stopped
immediately (exec session 60072), preserving volumes and leaving the main
fixture untouched. The stock comparison containers were not changed.

The concrete source chain is: actor GET calls `loadAuthorizedActor`, which
supplies the local actor-signed client to auth verification; the remote key
loader issues another GET through that client. Each side can therefore require
the other actor's as-yet-uncached signing key. ONI's
[`Client`](https://github.com/mariusor/oni/blob/58be49b/dynamic-oauth-client.go#L278)
constructs an `http.Client` without a Timeout, so the ten-second probe timeout
is not a server-side bound. Aggregate frame evidence demonstrates the request
explosion; root-GET unsigned handling is the next narrowly scoped causal test.

The planned gateway-only diagnostic removes Signature, Signature-Input and
Authorization headers for **GET of exact path `/` only**, where this fixture's
public actor and public key live. It must preserve all headers/verification for
inbox POST, all other writes and every private-object read. If this makes the
handshake work it is evidence of an upstream bootstrap defect/workaround, not
stock ONI compatibility or a recommended browser workaround.

### Handshake succeeded after scoped public-key bootstrap workaround

Session 60072 completed successfully with both experimental actors stopped.
They were then restarted explicitly after a gateway change and resource limits
(512 MiB, one CPU, 256 PIDs per actor). Gateway now removes `Signature` and
`Signature-Input` only for exact **GET /**. It removes `Authorization` on that
same method/path only when its value matches `Signature*`; Bearer is preserved.
No inbox POST, other path or object read has any header stripped. The exact
configuration is `/tmp/kimino-follow-owned/Caddyfile`.

After restart, reconciliation found no stored Follow from the aborted initial
request. One deliberate subsequent Follow returned 201 without Location. Bob
received it and emitted Accept; Alice inbox received the Accept referencing
that exact Follow. Observation showed about 59 MiB and seven PIDs per actor,
without the earlier expansion. This supports the public-key bootstrap diagnosis.
Session 59145 completed normally, but its strict graph-visible-member condition
remained false, so it did not automatically proceed to a Note.

Alice following and Bob followers now each declare `totalItems=1` but expose no
items. The third exact source defect is
[`ActivityPubItem`](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L887):
all `ValidObjectCollection` responses receive `HasType(validObjectTypes...)`,
where validObjectTypes excludes actors. The pinned vocabulary
[`typer.go`](https://github.com/go-ap/activitypub/blob/72a94f5a8a10/typer.go#L315)
explicitly includes Following and Followers in that category. Thus correct
actor members are filtered out of the response while totals remain nonzero.

A third, separately attributed experimental correction is being compiled:
Following/Followers receive `HasType(vocab.ActorTypes...)`; other object
collections retain their exact previous `NilInReplyTo` and content-type filters.
Authorization checks below that branch are unchanged. It adds no fabricated
membership and bypasses no visibility filter. The replacement source remains
`/tmp/kimino-follow-owned/oni-58be49b/handlers.go`; the next explicit local image
tag will be `kimino-oni-follow-probe:58be49b-owned-graph`. Build process session
87607 is the current active process; no probe or previous session remains active.

### Real graph members exposed; Note delivery remains a separate failure

The graph-corrected build completed as image
`kimino-oni-follow-probe:58be49b-owned-graph`, ID
`sha256:beb376d9d6d76925984cc297bf64367db53052f9ca48ea3ff019d13b8290f657`.
Sessions 87607 and 13897 exited successfully. After replacing only experimental
actors while preserving their storage, Alice following and Bob followers each
returned one embedded `Application` actor with the expected canonical IRI,
`totalItems=1`. The matching Accept remained in Alice inbox. This confirms the
rendering filter diagnosis without deriving membership from counts.

`delivery-undo.py` then posted a public Bob Create/Note addressed to Public with
Bob followers in cc. It returned 201 with Location but did not appear in Alice
inbox during 15 polls. Session 22133 exited at that assertion, before Undo.
Sanitized server-delivery diagnostics report a recipient HTTP 400 and JSON
parser failure (“cannot parse number”, unexpected character); the request body
was not printed. This is a new unresolved delivery issue, not proof of a usable
following timeline. No fourth server rewrite was applied.

The exact original Follow is now being tested separately with spec Undo via
Alice outbox (`undo-only.py`, active exec session 91454). It initially returned
201 without Location. This separates relationship withdrawal from the failed
positive Note delivery. A subsequent non-delivery result cannot establish that
Undo stops a working stream when positive delivery itself has not yet passed.

## Final bounded replay and current state

All chronological “active session” references above have ended. The corrected
fresh replay used `/tmp/kimino-follow-fresh/compose.yaml`, project
`kimino-follow-fresh`, loopback port 18445, fresh actor/Caddy volumes, and the
owned-graph image. It retained exactly the three labeled corrections: explicit
owned root, exact public-root signature stripping, and actor-type graph filter.
A first invocation failed during actor readiness before any ActivityPub write;
a later invocation sent one Follow and succeeded. Its original root-only probe
was supplemented by `production-flow.py`, which walks `first`/`next` with a
100-page bound, cycle detection, ID deduplication and declared-total checks.

That complete reader established:

| Check | Fresh replay evidence |
| --- | --- |
| Cold Follow request | 201, no Location |
| Acceptance | Alice inbox contains Bob Accept referencing that precise Follow |
| Alice following | One complete page, one distinct member, declared total 1; expected Bob IRI |
| Bob followers | One complete page, one distinct member, declared total 1; expected Alice IRI |
| Production-shaped public Note | 201 with Location; object includes attributedTo, text/html mediaType, content, to and cc exactly as the application client does |
| Before-Undo Note observation | No matching activity in 12 bounded complete Alice-inbox polls; each final walk had one page, two distinct activities and total 2 |
| Exact Follow Undo | 201 without Location |
| Alice after Undo | Following walk complete across two pages, total/distinct 0; original Follow absent from complete outbox; historical Accept still present |
| Bob after Undo | Followers walk complete, total/distinct 1; Alice remains present |
| Subsequent public Note | 201 with Location; no matching activity in another 12 complete inbox polls |

Session 76234 completed normally with these assertions/results. Later absence
is only a bounded observation; because baseline Note delivery did not succeed,
it cannot show that Undo caused a working stream to stop. The original probes'
root-only absence observations and their Notes without attributedTo/mediaType
are weaker, shape-specific evidence. They must not be substituted for this
production-shape, fully walked comparison.

`http-shapes.go` classifies temporary ONI dump files *inside* containers and
prints only method, host/path, activity/object types, JSON validity, byte counts
and response status when present. It never prints headers or bodies. It found
valid JSON for Follow, Accept, Undo and Create/Note; actual Follow and Accept
inbox POSTs returned 201, and an Undo inbox POST also returned 201. Earlier
collection-error logs included a 400/parser category and a dump status on Bob's
outbox, but no failing resource GET was isolated. Some input dump files lack an
associated response, represented by status 0 in that classifier. Do not infer
an incoming malformed Note or a particular failed GET solely from those logs.
The missing collection expansion below is independently reproducible source
evidence and needs no such inference.

All three temporary projects (`kimino-follow-probe`, `kimino-follow-owned`,
`kimino-follow-fresh`) were stopped explicitly using their `/tmp` Compose paths.
Stop session 73815 exited 0 after confirming all nine containers stopped.
Volumes, local images, public certificates, source trees and scripts remain for
resumption. No main-fixture container, volume or host trust setting changed.
No probe/build remains active. No Follow UI was implemented.

## Two proposed scoped corrections — not applied or built

### 1. Expand a local followers collection into actor recipients

The pinned
[`BuildOutboxRecipientsList`](https://github.com/go-ap/processing/blob/d6997bfd0e03/client_to_server.go#L241)
loads a recipient then passes it to `vocab.OnItem`, whose callback only accepts
actor types. But pinned
[`OnItem`](https://github.com/go-ap/activitypub/blob/72a94f5a8a10/item.go#L301)
iterates an ItemCollection, not the members of an OrderedCollection object.
A pure reproduction at
`/tmp/kimino-follow-owned/oni-58be49b/probe-recipients/main.go` constructed an
OrderedCollection containing one Application actor and used that same callback
pattern. The verified output was:

```text
ordered_collection_members=1 callback_calls=1 actors_seen=0
```

The filesystem backend
[`loadCollectionItems`](https://github.com/go-ap/storage-fs/blob/ee78f0622342/repository.go#L808)
returns the collection wrapper with `OrderedItems`; the wrapper therefore
reaches the actor guard and is skipped. This is upstream recipient construction,
not JSON encoding by Kimino or the graph GET rendering patch.

Proposed limited experiment: when an addressed recipient is a **local Followers
collection**, extract `CollectionInterface.Collection()` and pass its members
through the existing actor/block/shared-inbox recipient selection. Resolve
member IRIs through existing dereferencing as needed. Expand one level only;
do not introduce arbitrary remote collection recursion or a browser proxy.
Keep existing deduplication and actor authorization behavior. Test embedded and
IRI members, empty membership, and blocked/self-recipient behavior before a
fresh delivery replay. This is intentionally narrower than a general upstream
collection-recipient implementation.

### 2. Dispatch and validate incoming Undo of a known Follow

Pinned
[`processServerActivity`](https://github.com/go-ap/processing/blob/d6997bfd0e03/server_to_server.go#L326)
handles Create, Delete and Reactions, but has no Negating/Undo dispatch. That
matches the observed incoming Undo returning 201 without removing Bob's
follower. The existing C2S
[`NegatingActivity` and `ValidateClientNegatingActivity`](https://github.com/go-ap/processing/blob/d6997bfd0e03/negating.go#L12)
provide the Follow undo operation and same-actor/type checks.

Do **not** simply add dispatch without ownership validation. The S2S entry point
[validates before saving remote properties](https://github.com/go-ap/processing/blob/d6997bfd0e03/server_to_server.go#L49).
For the narrow experiment, validate an incoming Undo before that save: load the
original cached Follow by its IRI, require a Follow, compare its stored actor
with the authenticated Undo actor, replace the supplied object with that
verified stored Follow, then reuse the existing negating validator and handler.
This avoids trusting a spoofed embedded object's actor or overwriting the stored
original before checking it. Missing originals should fail explicitly for this
limited test; no general support for Undo of other activity types is proposed.

Tests before replay: same-actor known Follow removes the local follower; a
mismatched actor, spoofed embedded Follow actor, wrong object type, or missing
original fails without collection changes. Existing HTTP-signature validation
remains intact. The only next integration replay should be separately labeled
as including these additional corrections, using fresh scoped storage and the
complete collection reader/production Note shape. Neither correction has yet
been applied or built; coordinator review/authorization is the next step.

## Authorized processing-fork experiment (building)

The coordinator authorized the two proposed narrow fixes after user priority
was clarified as Follow plus actual post reception. They are now implemented
in `/tmp/kimino-follow-owned/processing`, a writable copy of exact upstream
processing revision `d6997bfd0e03`; no repository dependency changed.

`kimino_probe_test.go` was run before implementation and failed for missing
embedded/IRI follower recipients, no incoming Undo follower removal, and invalid
Undo acceptance with a storage save. After implementation, the new tests plus
the existing `Undo|Negating|BuildOutbox` test subset pass. Tests cover embedded
and IRI graph members, public shared inbox versus nonpublic direct inbox,
blocked/self members, valid embedded/IRI Follow Undo, actor mismatch, spoofed
embedded actor, missing original, wrong original type, and unchanged unsupported
Like-Undo dispatch. Invalid Follow Undo assertions require zero saves/removals.
The test store removes by IRI, matching filesystem storage; upstream mock removal
uses object-equality behavior unsuitable for this check.

Exact changed processing paths: `client_to_server.go` expands one level of a
local Followers collection through existing recipient checks; `negating.go`
adds cached-original Follow validation; `server_to_server.go` invokes that
validation before remote-property saves and dispatches only verified Follow
Undo. Other stored Undo object types retain prior unsupported dispatch behavior.
The ONI temporary go.mod uses an explicit local `replace` for this processing
fork. Existing ownership, public-root bootstrap and graph-rendering corrections
remain unchanged.

Build session 7132 is active for version `master-58be49b-follow-loop-probe`.
The planned one fresh replay is project `/tmp/kimino-follow-final/compose.yaml`,
`kimino-follow-final`, loopback 18446, local image
`kimino-oni-follow-probe:58be49b-follow-loop`, fresh volumes/CA, resource limits
unchanged. Its `probe.py` retries only readiness GETs, never POSTs; its
`production-flow.py` retains complete collection walks and production-shaped
Notes. No earlier fixture has been restarted.

### Processing-fork replay result and independent-review corrections

Build 7132 completed and image `kimino-oni-follow-probe:58be49b-follow-loop`
was created with ID
`sha256:e2c9530ed1ddc896a15fb37bc91a3cd302938dc3694d64fc4340a42590de8c6e`.
Fresh project `kimino-follow-final` on loopback 18446 completed probe session
23520. Follow returned 201, matching Accept arrived, and complete graph walks
each found the other actor (one page, declared/distinct 1). The production-shaped
Note returned 201 with Location but remained absent across 12 complete Alice
inbox polls (one page, declared/distinct 2). Thus the local-followers expansion
unit tests passed but **real Note reception still did not pass**; its exact
remaining cause is open. Do not infer a successful social timeline from green
unit tests or successful POSTs.

Exact Follow Undo returned 201 and now removed **both** graph memberships:
each complete walk covered two pages with declared/distinct 0. The original
Follow disappeared from Alice outbox while historical Accept remained. A later
Note returned 201 and remained absent across 12 complete inbox polls. Because
positive Note delivery was never established, the latter is not evidence that
Undo stopped a previously working stream. Resource observations stayed around
60 MiB and seven/eight PIDs per actor. All three final-project containers were
stopped; stop session 51681 completed 0. All four temporary projects are now
stopped and no process is active.

Independent source review then found two P2 defects in the experimental Undo
patch; both were reproduced with failing tests and fixed **in source only**:

1. `TestKiminoReplayedUndoDoesNotRemoveNewFollow` constructs F1 → U1 → accepted
   F2 → redelivered U1. Previously U1's side effects ran again and removed F2's
   actor-pair membership. `server_to_server.go` now validates ownership, detects
   the exact previously stored Undo (matching actor/object), and returns before
   any new save/removal. This is a narrow applied-Follow-Undo replay guard.
2. The `unsupported_like_missing` case showed that requiring a cached original
   before checking an embedded type changed the existing unsupported Like-Undo
   path. `negating.go` now leaves an explicitly embedded non-Follow on the prior
   unsupported dispatch path before requiring cached Follow evidence. Both
   cached and uncached embedded Like cases are tested.

The two new regressions failed before fixes, then the entire
`TestKimino|Undo|Negating|BuildOutbox` subset passed (session 14586, exit 0).
Changed files for scoped rereview:

- `/tmp/kimino-follow-owned/processing/server_to_server.go`
- `/tmp/kimino-follow-owned/processing/negating.go`
- `/tmp/kimino-follow-owned/processing/kimino_probe_test.go`

The earlier expansion remains in `client_to_server.go`. No image includes these
last two P2 corrections yet, and no subsequent replay has been performed.
Further changes to delivery require a new concrete diagnosis/review; no browser
inbox POST or additional signature weakening is an acceptable substitute.


## Independent delivery diagnosis — runtime blocked

A fresh source review traced Create processing, local Followers expansion, filesystem
collection loading, locality filtering and the delivery client. No new functional
fix is supported yet. Storage caching is disabled by the storage-all defaults and
ONI SetupCtl does not enable it; a stale cached empty Followers collection is not
a source-supported explanation for this fixture. The client CtxToCollection uses
the supplied collection URL unchanged, so the earlier Bob/outbox HTTP 400 cannot
yet be assigned to an attempted Alice/inbox delivery.

Stage/count-only instrumentation was added temporarily to processing/client_to_server.go:
recipient load local/nil/error flags, expanded Followers count, recipient type,
and final recipient count, all prefixed KIMINO_STAGE. The source before this
instrumentation is preserved at /tmp/kimino-follow-owned/client_to_server.before-diagnostic.go.
The latest Undo corrections are retained. A linux/amd64 diagnostic binary built
successfully at /tmp/kimino-follow-owned/image/oni with version
master-58be49b-delivery-diagnostic (build session 42329, exit 0).

No diagnostic image or runtime replay was completed: Docker build failed because
/Users/moreal/.orbstack/run/docker.sock was absent; a following attempt to create
an owned diagnostic Compose copy failed with no space left on device. Root owns
resource recovery; this reviewer has performed no cleanup or restart. All prior
temporary containers remain stopped. The next justified step is a bounded replay
with this diagnostic binary, matching Follow/Accept and both graph memberships
before one production-shaped Note, then reading only KIMINO_STAGE diagnostics
and complete collection counts. Never print raw container logs or dump bodies.


## Concrete remaining delivery cause: mixed request schemes behind TLS termination

After Docker/disk recovery, diagnostic image 179ad4530d4905765825a8ece15d023af7f1697d72e915974b603fff08d4fd00
ran only in existing project kimino-follow-final. Diagnostic sessions 33587 and
61258 completed. The first deliberately re-established the previously undone
Follow; both verified matching Accept and actual graph members with complete
collection walks. Each production-shaped Note returned 201 with Location but
was absent after 12 complete Alice-inbox walks (one page, three distinct rows).

Stage-only runtime evidence established that local Followers loading succeeds,
contains one Application actor, and produces two recipients. The exact selected
recipients were http://bob.test:18446/outbox (local=false) and
https://alice.test:18446/inbox (local=false). Alice advertises the correct HTTPS
inbox and no shared inbox. Both destinations entered the network branch.
Thus follower expansion is working; the own-outbox HTTP scheme is wrong.

Pinned processing/handlers.go reqIRI derives scheme solely from r.TLS. Caddy
terminates TLS and forwards HTTP, so both inbound inbox/outbox receivedIn IRIs
become HTTP. ONI helpers.irif and requestRootIRI separately hardcode HTTPS.
The configured ownership predicate correctly considers only the HTTPS origin
local. Bob's own outbox therefore enters remote delivery on a TLS-only port and
produces HTTP400. Crucially, Alice's BuildInboxRecipientsList also appends the
HTTP receivedIn inbox. A public Note addresses only Public and Bob followers,
so no other destination adds Alice's HTTPS inbox; local dissemination drops
that HTTP destination. An inbox POST can therefore return201 while the Note is
not indexed in Alice inbox. Accept succeeds because it explicitly addresses
Alice, adding the correct HTTPS inbox separately. Do not rely on a batch-abort
hypothesis to explain the missing Note.

Proposed correction, not yet applied: in the temporary ONI ProcessActivity
callback, derive receivedIn from the explicitly configured owned origin plus
request path/query, requiring request Host to match that configured origin.
Do not alter request/TLS/signature state or trust arbitrary forwarded headers.
A plain HTTPS environment toggle cannot fix processing.reqIRI without actual
backend TLS. The coordinator has been notified before any functional patch.
Main kimino-c2s containers were observed stopped after Docker recovery and were
not started or modified by this diagnostic. Final-project actors currently run
only for this bounded continuation; stop them after the terminal investigation.


## Fresh canonical-origin replay: Follow, actual Note reception, and Undo pass

The coordinator authorized the proposed narrow origin correction. It is the
**fourth temporary ONI/configuration correction**, separate from the two
processing-fork corrections (Followers expansion and verified Follow Undo):
`oni-58be49b/probe_received_in.go` derives collection identity from explicit
`ONI_PROBE_LOCAL_ACTOR`, requires HTTPS root configuration and matching request
Host, then copies request path/query onto that owned origin. It does not use
ResolveReference, trust forwarded headers, mutate the request, or modify
signature validation. `handlers.go` invokes it before processing; without the
probe environment value it preserves the original receivedIn behavior.

`probe_received_in_test.go` first failed all three targeted regressions: zero
local recipients for a public Note delivered behind TLS termination, incorrect
canonical path/query, and accepted mismatched Host (session60286 exit1). After
implementation, these cases plus unconfigured-behavior and request-immutability
checks passed (session16960 exit0). Initial test locality was tightened to the
actual configured strict HTTPS predicate; WithIRI alone ignores scheme and
would not reproduce this fixture's failure. Independent review was requested.

Fresh project `kimino-follow-canonical` lives entirely under
`/tmp/kimino-follow-owned/canonical-replay/`. It uses fresh volumes and a fresh
public CA; gateway binds only 127.0.0.1:18447. Docker inspection confirmed each
actor has memory536870912, NanoCPUs1000000000, PIDs256, and the three-container
actor network is Internal=true. Image `kimino-oni-follow-probe:58be49b-canonical-follow-loop`
ID is sha256:3a4a8fee6de357dd5299eae87640b26330755f9ab8e3459d1722e0633fceb30f,
version master-58be49b-canonical-follow-loop. It includes the latest replay-safe
Undo corrections and stage-only diagnostic instrumentation.

Verified results (probe14779 and production-flow45612 both exit0):

| Check | Result |
| --- | --- |
| Fresh Follow | 201; matching Accept observed |
| Both graph memberships | Each complete walk has one actual member and declared/distinct1 |
| Production-shaped Create/Note | 201 with Location; Alice inbox contains that activity on poll2 |
| Alice inbox after delivery | Complete one-page walk, declared/distinct3 |
| Exact persisted Follow Undo | 201; both graph walks complete with declared/distinct0 across two pages |
| Follow history | Original Follow absent from Alice outbox; historical Accept remains |
| Subsequent production Note | 201; absent from Alice inbox across12 complete polls |

Runtime stages now show Bob's own HTTPS outbox local=true and Alice's HTTPS
inbox as the sole network recipient before Undo. After Undo, Followers count0
and the only destination is Bob's local outbox; there is no network recipient.
The post-Undo absence is now supported by a working positive baseline and
recipient-selection evidence, but the12 polls remain a bounded observation.
This establishes this corrected two-ONI fixture, not stock ONI or broader server
compatibility.

The earlier final diagnostic fixture was stopped (session81146 exit0). Root
requested the latest canonical fixture remain available for browser E2E.
No main-fixture containers, volumes, packages, host trust or browser protocol
were changed. A read-only bootstrap helper is
`/tmp/kimino-follow-owned/canonical-replay/bootstrap.py`: importing it reads the
public CA, resolves .test names to loopback in-process, reads actors and obtains
OAuth tokens into its own `tokens` map. It prints readiness metadata only;
never print that map or write tokens to repository files. `probe.py` submits a
new Follow and must not be blindly rerun; `production-flow.py` assumes one
active persisted Follow and performs Note/Undo/Note, so it is not a read-only
health check. The current relationship is disconnected after successful Undo.


### Browser handoff: CORS confirmed; credentials-file persistence blocked

Temporary functional server source is frozen after the canonical-origin patch;
the separate patch-bundle agent owns read-only extraction. Canonical18447 remains
running and no Follow/Note/Undo was rerun for this handoff.

The requested credentials.json was **not created**: automatic approval review
rejected persisting live OAuth bearer tokens as conflicting with the project's
memory-only token rule. No indirect persistence workaround was attempted.
Browser E2E can obtain OAuth tokens inside its own process instead; the existing
bootstrap.py demonstrates that memory-only exchange and trusts only the scoped
public CA at /tmp/kimino-follow-owned/canonical-replay/root.crt.

Read-only cors-only.py used exact Origin http://127.0.0.1:5173. Both actors
returned200 for outbox OPTIONS requesting POST and authorization,content-type:
Allow-Origin matched exactly, Allow-Methods was POST, Allow-Headers was
Authorization, Content-Type, and Allow-Credentials was true. Authenticated actor
GETs also returned200 with matching Allow-Origin and Allow-Credentials. No
Access-Control-Expose-Headers appeared on these GET/OPTIONS responses; actual
POST Location visibility still needs browser verification. Tokens were never
printed or written. No host trust changes occurred.

## Local ONI owner-page correction (in progress)

The real two-actor test received followers-only text, then blocked Undo because
inbox declared32 while pages yielded31. ONI's query-dependent collection owner
comparison incorrectly added per-item authorization on owner page requests.
Strict client completeness checks remain unchanged. Isolated server helper tests
reproduced the defect and passed after exact resource identity comparison.

Complete the shared handler/filter32-row regression, preserve nonowner exclusion
and explicit query filters, package verified patch hashes, independently review,
build/deploy only maintained18448 retaining volumes, and rerun actual Follow →
public/followers-only text → Undo. Other server compatibility and private media
remain separate. The wrapper now runs TestOwnCollection along with received-in
regressions; nine offline packaging/isolation tests pass before bundle update.

Owner-page correction completed: bundle independently reviewed, built and applied
to maintained18448 as58be49b-c2197c547411 with original volumes. Expanded actual
public/followers-only reception and Undo pass, and final complete187browser suite
passes5.3min. Full738unit and other checks pass. Subsequent nondelivery after Undo
needs deterministic delivery-completion evidence; it is not claimed by this fix.

## Post-Undo nondelivery proof (in progress)

Synchronous actual processing regression now checks Follow/Accept, baseline Note
transport/reception, exact Undo, empty graphs and subsequent zero Alice calls.
Temporarily disabling relationship removal fails both graph and transport checks;
original source restored. Full processing Go suite passes.

For real async fixture, opt-in KIMINO_DELIVERY_AUDIT markers correlate SHA256
activity/object IRIs with selected remote-target count and normal-completion flag.
They contain no source IRIs, bodies, credentials or raw errors and add no endpoint.
A marker is emitted after the actual dispatch call, including empty routing;
exceptional exits retain completed=false. Count uses the same computed recipient
list as delivery. Phase error flags describe returned AddTo* errors only: upstream
swallows some per-recipient errors, so these flags are not delivery receipts.

Require positive actual received Note plus terminal nonzero routing, empty Alice
following and Bob followers, a fresh followers-only Note's terminal zero routing,
and a complete Alice inbox read with absence. This proves the controlled dispatch,
not arbitrary future nondelivery or complete resolution health. Failures remain
failures; do not infer success from elapsed time or unrelated control posts.

## Direct-read privacy: two reproduced local defects

The actual synthetic post-Undo followers-only Note is readable by Bob, denied to
anonymous direct GET, but Bob's authorized response advertises public caching.
A single anonymous POST to Bob's existing proxyUrl for that same known Bob Note
returned200 with the synthetic body. No external targets, real content, arbitrary
proxying or cross-origin bearer forwarding were used. This is reproduced text
exposure, separate from earlier Image metadata evidence on18449.

Root browser regression now asserts direct owner/anonymous controls, no public
caching/private-no-store, owner-proxy success, anonymous cold/warm denial and
invalid-token denial. Server changes in preparation: conservative no-store for
all dynamic representations with no conditional304 reuse; proxy requires verified
exact local owner before target fetch and enforces private response headers.
Static assets unaffected. Client proxy integration remains absent. Existing cache
copies are not retroactively retracted; future response policy is the patch scope.

Independent review found a residual cookie-origin issue in the first proxy gate:
broad credentialed CORS plus cookie-based owner verification can expose proxy
results to a foreign origin when a browser includes owner cookies. The first
package is not deployed. Add a pre-auth guard for any Cookie-bearing request:
strict same actor Origin when supplied; reject null/malformed/foreign Origin and
absent-Origin cross-site/same-site Fetch Metadata. Authorization headers cannot
bypass this cookie guard. Cookie-free bearer C2S and same-origin cookie use remain.
Actual handler regressions must show denied requests fetch no target.
