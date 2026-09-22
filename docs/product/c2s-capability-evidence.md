# C2S capability evidence — 2026-09-22

This is source inspection and local integration testing, not user research or a
public federation test. The existing fixture was not reset. Four deliberately
small test records remain: a public Image, a public Note referencing it, a public
Note with an embedded Image, and a self-addressed Image. Credentials, request and
response bodies, and private content were not logged. Temporary probe scripts
were `/tmp/kimino-media-probe.py` and `/tmp/kimino-media-probe-private.py`; this
document records the results independently of those temporary files.

## Version and protocol boundary

The fixture uses ONI `master-58be49b`, image
`quay.io/go-ap/oni@sha256:a765501d3ee2d0ea557e2585f930cc32e7eca69ea9455a35b70c98549c0d70a5`.
Its [pinned dependencies](https://github.com/mariusor/oni/blob/58be49b/go.mod)
include `go-ap/processing` revision `d6997bfd0e03` and `go-ap/activitypub`
revision `72a94f5a8a10`.

All test writes were authenticated ActivityPub C2S outbox POSTs to the existing
`https://localhost:8443/` actor. No client-side S2S inbox POST, Mastodon REST API,
remote recipient, or unrestricted proxy was used.

[ActivityPub §6.12](https://www.w3.org/TR/activitypub/#uploading-media) leaves
the precise binary upload mechanism out of scope. The ONI mechanism below is an
implementation-specific C2S convention, not a portable capability of every C2S
server. The pinned actor setup advertises OAuth and proxy endpoints, not a media
upload endpoint; the [request validator](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L474)
accepts ActivityStreams JSON on inbox/outbox routes, not multipart uploads.

## Image upload and attachment results

These are payload shapes with placeholders, not captured request bodies:

1. POST a `Create` to the discovered actor outbox. Set its `actor` to the
   connected actor IRI and its public addressing consistently with the object.
   The object shape is `{type: Image, mediaType: image/png, name: <description>,
   content: <data URI containing unpadded base64>, to: [Public]}`.
2. Read the returned `Location` as ActivityStreams JSON and resolve its object.
   The Image has an `id`; use that returned IRI as the binary resource URL.
3. POST a normal public `Create/Note`, with an attachment shaped
   `{type: Image, id: <returned Image IRI>, url: <returned Image IRI>,
   mediaType: image/png, name: <alt text>}`.

| Check | Observed result |
| --- | --- |
| Public `Create/Image` | HTTP 201 with `Location` |
| Image read through Location | `id`, `type`, `name`, `mediaType`, attribution, audience and timestamps present; `url` absent |
| Anonymous Image-id GET with `Accept: image/png` | HTTP 200, `Content-Type: image/png`, bytes identical to the tiny input PNG |
| Public `Create/Note` referencing the Image | HTTP 201 with `Location` |
| Note read back | Attachment URL and `name` alt text exactly retained |
| Single public `Create/Note` with inline Image data | HTTP 201 with `Location`; attachment metadata retained, but no attachment `id`, `url`, or `content` exposed |
| Anonymous GET of that Note's `<note-id>/attachment` | HTTP 200 and identical PNG bytes |
| Self-addressed `Create/Image` | HTTP 201 with `Location` |
| Anonymous GET of self-addressed Image bytes | HTTP 404; no image bytes returned |
| Authenticated GET of self-addressed Image bytes | HTTP 200 and identical PNG bytes |

The inline attachment result proves that bytes can be stored atomically with a
Note on this server, but does not provide a discoverable attachment URL. The
`/attachment` path is an ONI convention, not a general ActivityPub media endpoint.
The separate Image-then-Note sequence is the tested path with an explicit URL
that the current attachment normalizer can consume.

Source evidence:

- [ONI binary decoder](https://github.com/mariusor/oni/blob/58be49b/helpers.go#L147)
  uses `base64.RawStdEncoding`, hence the unpadded encoding used by the probe.
- [Create processing](https://github.com/go-ap/processing/blob/d6997bfd0e03/content_management.go#L119)
  stores the object, then removes data-URI content before dissemination.
  [Object creation](https://github.com/go-ap/processing/blob/d6997bfd0e03/content_management.go#L265)
  and [property flattening](https://github.com/go-ap/activitypub/blob/72a94f5a8a10/flatten.go#L96)
  explain why an inline attachment can be retained without receiving a separate
  generated resource IRI.
- [Create response handling](https://github.com/go-ap/processing/blob/d6997bfd0e03/handlers.go#L103)
  sets Location for the created activity. Its object must be resolved rather
  than treating Location itself as the image URL.
- [ONI resource GET](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L859)
  applies authorization filters before selecting ActivityStreams or binary
  rendering. [Property retrieval](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L274)
  supports the observed nested `/attachment` read.

No maximum upload size, supported image-format set, large-image behavior,
followers-only delivery, remote rendering, or cross-server interoperability was
established. No general server upload capability should be inferred from these
four tests.

## Requirements for a future image authoring flow

- Treat the first successful Image Create as a committed write. A public Image
  exists independently of whether the later Note succeeds. Explain that before
  upload; cancelling a Note does not undo the already published Image.
- After a confirmed upload, failed Location hydration is an unresolved uploaded
  resource, not an upload failure. Preserve this state and recover using reads;
  do not automatically resend the Image POST. Once resolved, keep its IRI with
  the in-memory draft so retrying a failed Note does not upload again.
- A confirmed Note Create remains successful if its subsequent hydration fails.
  Apply the existing no-automatic-POST-retry rule to both writes. An ambiguous
  network outcome must not silently trigger another upload.
- Keep bearer tokens in memory and send them only to the configured actor
  origin. Reject redirects and validate returned IRIs before authenticated
  resource reads. Never forward actor credentials to an external media host.
- Public images can use the existing explicit-load rendering path. Self-only
  images require authenticated explicit fetching and an in-memory blob URL;
  ordinary image elements do not carry the bearer token. Preserve the rule
  against automatic remote image loads. The self-only probe does not establish
  followers-only interoperability or justify claiming private-media support.
- Gate ONI-specific upload behavior deliberately. Do not infer support merely
  from an actor having an outbox, and do not silently try an unsupported binary
  upload convention on arbitrary C2S accounts.

## Follow and Accept: correcting the previous conclusion

The old observation was that a Follow was accepted by the single-actor fixture,
no Accept was seen, and `following` remained empty. The recorded evidence does
not identify its target or diagnose delivery, so it cannot establish that ONI
never accepts Follow requests.

The pinned [ONI handler](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L1153)
automatically accepts a Follow received in an inbox, and its
[accept helper](https://github.com/mariusor/oni/blob/58be49b/handlers.go#L1013)
creates an Accept through the followed actor's outbox processing. The pinned
[Follow processor](https://github.com/go-ap/processing/blob/d6997bfd0e03/relationship.go#L55)
addresses the followed actor without immediately updating `following`;
[Accept processing](https://github.com/go-ap/processing/blob/d6997bfd0e03/reactions.go#L168)
updates the local following/followers collections. This matches the
[C2S Follow acceptance boundary](https://www.w3.org/TR/activitypub/#follow-activity-outbox).

The current Compose fixture has one actor whose canonical host is localhost.
Container-local localhost is not the host's Caddy listener, and no two-server
delivery test was performed. The [official ONI documentation](https://mariusor.srht.site/apps/oni/index.html)
also documents development-image signatures as incompatible with the wider
fediverse. These are fixture constraints, not a diagnosed cause of that earlier
pending request. A reachable two-actor fixture and observed Follow → Accept →
subsequent Note delivery are required before claiming a working follow timeline.

Follow UI remains unimplemented; image upload findings do not remove the
separate account compatibility and social-network requirements.
