# Reproducible experimental Kimino follow fixture

This bundle produces a **modified ONI test fixture**, not stock ONI and not a
claim of wider-fediverse interoperability. It contains minimal source patches
and regression tests for the reviewed local C2S follow experiment. No browser
inbox POST, Mastodon API, host trust change, or general proxy is involved.

## Maintained build and runtime commands

From the repository root, use Python 3, Docker Compose and Go 1.26.x (validated
with 1.26.5). The wrapper verifies pinned originals, patch hashes, every patched
source file, and all three exact go.mod files including the relative processing and filters forks.
Removing or redirecting that replacement fails before compilation. Builds also
ignore ambient Go workspaces/GOFLAGS so they cannot silently select other code.

```sh
python3 scripts/c2s-follow-fixture.py build
python3 scripts/c2s-follow-fixture.py up
python3 scripts/c2s-follow-fixture.py seed
python3 scripts/c2s-follow-fixture.py env
python3 scripts/c2s-follow-fixture.py down
```

`up` builds if the matching image is absent, starts the gateway first, exports
its public CA, then starts and checks both actors. `seed` means actor/OAuth/read
verification; it posts no content and saves no token. Only readiness GETs retry.
`down` targets only this managed project and retains volumes. The generated
`.local/c2s-follow/compose.yaml` and `root.crt` are the browser-test contract;
bootstrap commands are concrete JSON arrays. The known development password is
local-only, and bearer credentials remain in process memory.

Default host port is **18448**, project `kimino-c2s-follow`. Ports 8443 and 18447
are reserved to protect the main and existing experimental fixtures. The wrapper
accepts `--directory` and `--port`; nondefault combinations derive a stable
separate project name, and an existing unmanaged directory is never overwritten.
Actor services use an internal network; only the gateway binds to 127.0.0.1.
Each actor is limited to 512 MiB, one CPU and 256 PIDs. No host trust settings
change. `compose.follow.yaml` is the maintained template, not the runtime file
for direct Compose invocation.

For tests, use the assignments printed by `env`:

```sh
KIMINO_FOLLOW_FIXTURE_DIR="$PWD/.local/c2s-follow" KIMINO_FOLLOW_PORT=18448 \
  npx playwright test tests/follow-c2s.spec.ts
```

If Go is not on PATH, set `KIMINO_FOLLOW_GO` to the Go 1.26 executable. Caches are
scoped below the fixture directory by default. `KIMINO_FOLLOW_CACHE_DIR` can
reuse an existing dedicated cache (its `downloads`, `go-mod`, `go-cache` children)
to avoid downloading and compiling dependencies into another large cache.

Maintained packaging verification: pinned preparation, nine offline integrity
and isolation checks, processing/ONI regression subsets, the API-only image
build, and authenticated startup checks passed. The coordinator also ran the
real browser Follow → received Note → Undo test on maintained port 18448
successfully. Existing deployments were not altered. The runtime was left
running for the coordinator's full browser suite; invoking `down` was not part
of this handoff.

## Files and provenance

- `oni.patch`: owned-origin locality, actor-type following/followers responses,
  configured HTTPS received-in identity behind TLS termination, and the new
  received-in helper/tests; query-independent exact collection-owner identity
  with shared handler authorization checks and 32-row pagination regressions.
- `processing.patch`: one-level local Followers expansion; pre-save validation
  and processing of Undo of a cached Follow; applied-Undo replay protection;
  preservation of explicitly embedded unsupported Undo types; regression tests.
- `filters.patch`: correct the one-extra-item pagination boundary and exercise
  complete walks around 20-item page boundaries, cursors and selective filters.
- `manifest.json`: exact archive URLs/checksums, ONI full commit, processing/filters
  pseudo-versions and module h1 checksum, and original/patched hashes for every
  source file affected by these patches.
- `prepare.py`: verifies archives and patches, extracts into a **new** directory,
  applies patches, verifies resulting file hashes, adds a relative module
  replacement and an API-only placeholder static asset. It performs no network,
  package installation, compilation, Docker operation or trust-store change.

ONI commit: `58be49b478fc1e0eb1011732a46c010cb520ea81`.
The original downloaded archive used the abbreviated immutable commit URL
`https://codeload.github.com/mariusor/oni/tar.gz/58be49b`; the script verifies
both its SHA-256 and the full commit in the tar PAX comment. Changing the URL to
use the full commit changes the archive's root-directory name and checksum;
do not silently replace the verified archive with a differently packaged one.

Processing module: `github.com/go-ap/processing`, version
`v0.0.0-20260905151925-d6997bfd0e03`, revision `d6997bfd0e03`.
Its official Go-proxy module zip and h1 checksum identify the source exactly.
The bundle does not invent an unavailable full processing commit hash.

The patches contain no workstation paths. The ONI module replacement is added
as `replace github.com/go-ap/processing => ../processing` and
`replace github.com/go-ap/filters => ../filters` during preparation. The latter
ensures transitive users inside the ONI build use the corrected filter module.
Upstream dependency versions are otherwise unchanged.

## Prepare in a throwaway directory

Prerequisites: Python 3, `patch`, and `curl`. Run from this bundle directory:

```sh
bundle_dir="$PWD"
work_dir="$(mktemp -d)"
curl -fsSL https://codeload.github.com/mariusor/oni/tar.gz/58be49b \
  -o "$work_dir/oni-58be49b.tar.gz"
curl -fsSL https://proxy.golang.org/github.com/go-ap/processing/@v/v0.0.0-20260905151925-d6997bfd0e03.zip \
  -o "$work_dir/processing-d6997bfd0e03.zip"
curl -fsSL https://proxy.golang.org/github.com/go-ap/filters/@v/v0.0.0-20260831130242-f116eb702ce2.zip \
  -o "$work_dir/filters-f116eb702ce2.zip"
python3 "$bundle_dir/prepare.py" \
  --oni-archive "$work_dir/oni-58be49b.tar.gz" \
  --processing-archive "$work_dir/processing-d6997bfd0e03.zip" \
  --filters-archive "$work_dir/filters-f116eb702ce2.zip" \
  --output "$work_dir/source"
```

`source` must not already exist. `prepare.py` refuses overwrites and checksum
mismatches. It ignores archive symlinks and rejects escaping paths. Archives
remain alongside the prepared source as provenance.

## Test and build later

These are manual reproduction instructions. Initial bundle capture did not
execute them; the maintained wrapper above subsequently ran equivalent tests
and built the API-only fixture. The prior experiment used Go 1.26.5, linux/amd64, CGO disabled,
`GOEXPERIMENT=greenteagc`, and tags `dev,ssh,tui`. Use scoped caches if required:

```sh
export GOMODCACHE="$work_dir/go-mod"
export GOCACHE="$work_dir/go-cache"
export GOEXPERIMENT=greenteagc
cd "$work_dir/source/filters"
go test -mod=mod -count=1 ./...
cd "$work_dir/source/processing"
go test -mod=mod -tags dev -run 'TestKimino|Undo|Negating|BuildOutbox' -count=1 .
cd "$work_dir/source/oni"
go test -mod=mod -tags dev,ssh,tui -run '^TestProbeReceivedIn$' -count=1 .
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -mod=mod -tags dev,ssh,tui \
  -ldflags '-X git.sr.ht/~mariusor/oni.Version=master-58be49b-kimino-follow-fixture' \
  -o "$work_dir/oni-kimino-follow-fixture" ./cmd/oni
```

Module downloads remain pinned by upstream go.mod and resulting go.sum. The
upstream ONI archive has no go.sum; keep the generated sums in any maintained
fixture build once the coordinator integrates this bundle.

`assets.go` embeds `templates` and `static`. Templates already exist upstream;
`prepare.py` writes only `static/robots.txt` so the API fixture can compile
without npm/Yarn or a frontend asset build. This deliberately does **not** ship
the ONI website: JS/CSS/icon routes are unavailable. Kimino's API tests need none
of those assets. The early live probe reused stock-image static assets. The maintained wrapper
subsequently built with the placeholder and passed actor/OAuth startup plus the
coordinator's real browser follow-flow test.

## Required isolated runtime configuration

The source patches alone are insufficient. The coordinator must preserve these
explicit fixture controls when creating the maintained Docker/browser setup:

1. Use a separate image/tag/project and fresh volumes; keep the stock fixture
   intact. Only a gateway port may bind to host loopback. Each actor server
   belongs to the internal actor network; gateway has DNS aliases for both
   canonical actor hosts and a separate ingress network.
2. Set each actor's `ONI_PROBE_LOCAL_ACTOR` to **its own exact HTTPS origin with
   root path**, for example `https://alice.test:18447/` versus
   `https://bob.test:18447/`. Set `HTTPS=false` for internal plaintext transport
   behind gateway TLS. The received-in helper verifies request Host, retains
   path/query, ignores caller-supplied forwarded scheme, and does not mutate the
   request used for signature verification.
3. Trust only that gateway's public CA through container-local
   `SSL_CERT_FILE`/read-only certificate mount. Host test clients explicitly
   trust the same CA without editing host trust stores.
4. Preserve the narrowly scoped public-key bootstrap workaround on **GET of
   exact `/` only**. Remove Signature and Signature-Input; remove Authorization
   only when it contains Signature authentication. Bearer stays intact. Never
   strip any header for inbox POST, other writes, or private-object reads.
5. Limit actor resources (the experiment used 512 MiB, one CPU and 256 PIDs per
   actor). Stop on uncontrolled request growth rather than retrying writes.
6. Keep all test-client mutations C2S outbox POSTs. Follow 201 lacks Location on
   this server: reconcile the actual persisted Follow ID through reads. Observe
   a matching Accept and complete graph membership. Publish a production-shaped
   Note, verify its exact activity in the follower inbox, Undo the exact Follow,
   and verify both graphs. Use bounded complete first/next walks, cycle/total
   checks, and no automatic retry after an ambiguous POST.

Equivalent Caddy matcher fragment within each isolated HTTPS actor site:

```caddyfile
@publicRoot {
  method GET
  path /
}
@signatureRoot {
  method GET
  path /
  header Authorization Signature*
}
request_header @publicRoot -Signature
request_header @publicRoot -Signature-Input
request_header @signatureRoot -Authorization
```

The source fork and gateway workaround are separate, documented deviations.
They are not a recommendation to weaken normal server authentication.

## Diagnostic exclusions and validation performed

Live `client_to_server.go` was compared to its pre-diagnostic backup: differences
were only `KIMINO_STAGE` prints, their fmt/os imports, and indentation around a
print. The backup was used for that one patch file. Current live
`server_to_server.go`, `negating.go`, and all new regression tests were retained,
so the later replay/non-Follow fixes are included. The live
`collections_dissemination.go` differs from upstream only by diagnostic printing;
it is excluded entirely. No original runtime/source file was modified.

Both patches were applied to fresh copies of the exact original archives inside
the bundle's temporary verification directory, and every patched file's SHA-256
matched the captured expected result. There are no absolute temporary paths or
`KIMINO_STAGE` statements in either patch. Initial bundle capture ran no build, test suite, container, package install or
deployment. The separate maintained-packaging checks above were performed later.

## Pagination correction (round32)

The maintained actor inbox reached21activities. Its20-item root and advertised
first page had no next link, so Kimino correctly refused incomplete relationship
evidence. Pinned filters `v0.0.0-20260831130242-f116eb702ce2` used a strict
`len(col)>maxItems+1` threshold. The experimental correction uses`>maxItems`,
and recognizes the final eligible item before cursor reversal, so the last data
page does not advertise an invalid contentless terminal page. It does not guess next links in the client,
change authorization filters, reset data, or imply stock ONI interoperability.
Fresh preparation, nine offline integrity checks, full filters/index tests,
processing/ONI regressions and image build passed for bundle `92a7c18775c5`.
Maintained port 18448 was updated with its existing volumes and gateway CA.
The same previously failing inbox now reads all 21 activities as 20 + 1 through
Kimino's strict adapter. The real browser Follow → received Note → Undo test
passes, including safe reconciliation of the relationship left by the prior
interrupted run. Stock port 8443 and its data were not changed.

One earlier isolated filters test run exposed the unchanged upstream
`index/Test_ExtractNatLangVal/en-fr` map-order-sensitive assertion; the final
module runs and maintained build passed without changing that test. The
pagination boundary regressions passed ten consecutive runs.


The maintained owner-page correction preserves follower-addressed activities on
owner query pages. Exact scheme/host/port/escaped-path identity determines owner
access; nonowners retain item authorization and content/page queries still apply.
The image build runs `TestOwnCollection*` as well as received-in regressions.
The expanded real browser check covers public and followers-only text reception
followed by Undo. This does not establish private-image safety or general server
interoperability. Existing actor volumes are retained during image replacement.

## Deterministic post-withdrawal delivery evidence

The maintained fixture opts into `KIMINO_DELIVERY_AUDIT=1`. Processing emits a
`KIMINO_DELIVERY_AUDIT` terminal JSON line containing SHA256 activity/object IRIs,
selected remote-target count, completion and returned phase-error flags. No raw
IRI, body, token or error text is emitted by this observer. No endpoint is added;
asynchronous processing and existing recipient/error handling remain unchanged.
The diagnostic is disabled without the exact opt-in value.

Tests correlate a fresh Note's hash, require a positive received control, confirm
both relationship graphs empty after Undo, await that Note's completed zero-target
routing, then completely read the recipient inbox. This is scoped dispatch proof,
not a guarantee about future posts. Upstream may swallow recipient errors; phase
flags are not delivery receipts or proof that all resolution succeeded. The helper
bounds log retrieval and never returns raw logs or subprocess errors.

A separate synchronous processing regression uses real Follow/Accept/Undo paths
and recording transport. Disabling relationship removal makes both graph-removal
and zero-delivery assertions fail. These tests run in the maintained image build.

## Dynamic response and proxy privacy

The maintained patch uses `private, no-store` for dynamic JSON, HTML and binary
resource responses, removes validators, and does not answer conditional requests
with304. Static assets are unchanged. This conservative fixture policy avoids
classifying every possible embedded representation as safe for public caching.

The existing proxy now requires the verified exact local owner before fetching a
target. Cookie-bearing requests must pass a strict origin check before auth;
cookie-free bearer C2S clients remain supported. Proxy responses cannot set local
cookies via upstream Set-Cookie, and receive the same private cache policy.
Actual anonymous text exposure through the previous proxy was reproduced with a
known synthetic local Note, then blocked by the same browser regression. No new
proxy or client proxy integration was introduced. Prior cached copies are not
retroactively retracted; other unpatched deployments are outside this evidence.

The proxy also honors exact image/png, image/jpeg and image/webp Accept preferences
before signing its upstream request. A successful raster response must have one
matching Content-Type or is rejected without its body. Metadata defaults remain.
Authenticated client loading and capability-gated restricted uploads are now
implemented. After verification on isolated18449, candidate ac17f3e26faa was
applied to maintained18448 with its existing volumes and CA. Follow, reception,
private text reply and post-Undo nondelivery regression passed after promotion.

## Local follower resource authorization

The opt-in fixture grants verified current followers access to exact local Note
and Image resources addressed to the configured owner's canonical followers
collection. It requires complete, uncached follower and block collections, exact
owner attribution and resource identity; malformed or missing evidence denies.
It does not expand arbitrary audience collections or grant collection access.

Nested objects are projected to resource IDs, requiring separate authorization
on dereference. ID-less inline links retain only type and href. Parent text and
image alt text remain intact. This prevents filesystem-expanded private child
objects from leaking through an otherwise readable parent. Independent scoped
review and real-filesystem regressions cover this boundary.

A test-only upstream correction compares natural-language map values without
assuming iteration order, while preserving duplicate counts. Production indexing
behavior is unchanged. The corrected test passed100 consecutive runs.

Proxy transport now rejects redirects before a second hop, enforces a single
10-second deadline and buffers at most5MiB per response before downstream output
or retry handling. Bounds apply to error bodies too. The proxy-specific signed
client bypasses private cache/debug-body wrappers; ordinary federation clients
retain their existing behavior. This prevents redirect signature forwarding and
unbounded upstream draining before the browser can apply its own read limits.

## Experimental private-media capability

With KIMINO_PRIVATE_MEDIA_CAPABILITY=1, the exact configured root actor's response
appends generator Service urn:kimino:oni:private-media:1, retaining other generators
and leaving storage untouched. Kimino requires this exact versioned assertion and
explicit ONI mode before enabling restricted uploads. Generic ONI detection alone
is insufficient. This is a local experimental convention, not standard discovery
or an independent attestation of server security. Unpatched deployments remain
unsupported for restricted authoring.
