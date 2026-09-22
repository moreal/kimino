# Browser ActivityPub subset

The client reads an actor's inbox and outbox, follows `first` and `next` pages, and resolves activity and object IRIs. Collections must use compact ActivityStreams property names (`id`, `actor`, `object`, `orderedItems` or `items`). Types accept compact names or the full `https://www.w3.org/ns/activitystreams#` IRI, including arrays. This is not a general JSON-LD expansion engine: custom contexts and aliased properties are unsupported.

The evaluator supports Note, Create, Update, Delete, Announce, Like, Tombstone, and Undo of Announce or Like. Other activities are counted in diagnostics. It deterministically sorts and deduplicates the snapshot. Historical Updates cannot overwrite a Note snapshot with a newer updated/published timestamp. Mutation requires the original author's actor ID; object IDs must share their author's origin. A valid Delete remains a tombstone for the entire loaded snapshot, even if a later duplicate Create appears. Undo can remove only its actor's own announcement or like, and a Delete of an own Like or Announce activity withdraws it the same way. A Tombstone - an activity that is one, or whose object is one, including any object carrying `formerType` - is read as a deletion of the IRI it names before anything else is evaluated, so a note whose Create the server has rewritten with a Tombstone cannot be re-established by that Create, by an Announce carrying the whole Note, or by a stale Update, and none of those count as ignored or rejected. A Like attaches to a note known from Create/Note/Announce (its object may be that Note or its IRI); a note that is only liked is never shown, and a like whose object never becomes known is counted as rejected. Every effective Like/Announce is exposed with its activity IRI so the client can withdraw its own (an IRI is required: a reaction the snapshot carried without one is reported as not withdrawable), and `tag` entries of type Mention with an http(s) `href` become the note's mentions. Servers that assign objects to a different origin need an explicit ownership proof mechanism before this subset can accept those objects.

The read after a confirmed write is incremental. The tested ONI server answers the inbox and outbox roots as an inline `OrderedCollectionPage` (`orderedItems` on the root itself, newest first, 20 items per outbox page, `first` equal to the root and `next` pointing at the older page; the inbox there is a single page with no `next`), and a newly accepted Create appears at index 0 of the outbox root on the next request - a reply posted within the same second appeared at index 1. The client therefore reads the root of each collection once (following `first` once only when the root carries no items, never `next`), leaves out every activity the last full read already holds, resolves only the new ones, and merges them over the held activities by activity IRI (`mergeActivities`, pure) before re-evaluating: a re-sent activity replaces the held copy, so a Create whose object the server rewrote as a Tombstone after a Delete wins, and activities that fell off the first page stay held. The result carries the last full read's reach unchanged and is marked `partial`; it claims nothing about how far the collections go. An actor's own C2S activities are never delivered to its own inbox on that server, so a reply to oneself is found through the outbox page. Connecting and an explicit refresh remain full walks. The actor document is read again on every full walk and reused by writes and the incremental read, so that read costs one request per collection: on the fixture, three requests (the Create's Location, the inbox root, the outbox root) and about a quarter of a second between the accepted post and its card, where the full walk took forty-odd requests and three seconds.

The first pages are not where an edit or a deletion of an older note is looked for. The tested ONI server does list an `Update` row at outbox index 0 for an Update of a note whose Create lies on a later page (probed against a note at outbox index 34: the Update was accepted with 201 and no Location, the outbox root then began with that `Update`, the object read answered the new content, and the Create on the later page carried the rewritten object; `updated` stayed equal to `published`), and it rewrites a deleted note's Create in place, so on that server the first page alone would have been enough. The client does not rely on it: `loadRecent(previous, touched)` takes the IRIs of the objects the write changed - the edited note, the deleted note; a reaction touches nothing - and reads each back with the session's credentials before the two roots. What comes back is merged as an `Update` by the session actor keyed by the object IRI (`<object IRI>#read-back`, so a later read of the same object replaces an earlier one), carrying the object as read, or a Tombstone for a 404, a 410 or a Tombstone body - the same rule as `noteExists` - which the evaluator reads as a deletion; any other failure fails the read, as it would have. The note keeps the server's own timestamps, so a server that does not advance `updated` still shows no "수정됨" marker. An edit thus costs, after the POST, three requests: the object, the inbox root, the outbox root (plus the existence check before the POST). The application records what each confirmed write touched and lets a landed read forget it - a read dropped for a newer write leaves it for the read that write owes - and a full read forgets both the touched objects and the withdrawn reactions, since what it lists is the server's word again.

The browser trusts the actor server and returned ActivityStreams data; a server must reject forged activities claiming a different local actor or another local actor’s object ID. First-Create ownership alone cannot establish identity for two actors sharing an origin. The client does not verify federation HTTP signatures or prove identity between actors sharing an origin. It does not implement federation delivery, OAuth discovery, authenticated private-image rendering, or arbitrary JSON-LD contexts. Remote images require explicit loading.

Tokens remain in the calling application's memory and are sent only to the configured actor URL's origin. Redirects are rejected, including on POST, and credentials are omitted. URLs require HTTPS, except HTTP loopback hosts for local development. Collection cycles and limits fail explicitly rather than returning an apparently complete partial timeline. A load also reports how far it reached: the number of distinct activities read (pages that overlap, as ONI's inbox does through `first`, count once) and, per collection, the shortfall against the `totalItems` it declared. A collection that declares no total makes no claim. There is no "load older" request to make: `next` is followed to the end of the chain, so a shortfall is stated as unreachable rather than offered as another page. Every read uses a fresh per-load resolution cache. A nested object IRI returning HTTP 404 or 410 becomes an unavailable Tombstone placeholder and is omitted from visible notes (read as a deletion by the evaluator, not as a rejection). Missing actor, collection, or top-level activity endpoints still fail the load, as do authentication, other HTTP, and network failures.

Posting sends a public Create/Note to the actor outbox with escaped plain text, the Public recipient, followers in cc when available, and the reply author's ID in cc. Success requires 201 and a Location header. Failure to read that Location does not negate an already accepted post; the returned activity is null and the UI can reload later. Cross-origin servers must enable CORS, allow the required Authorization/Content-Type request headers, and expose Location for posting.

Reactions send a Like or Announce `{actor, object: <note IRI>, to, cc}` to the outbox, addressed no wider than the note itself. A 201 response is accepted, as are 200 and 202; any other status fails with that status in the message. Unlike Create, a Location header is optional: the tested ONI server returns 201 without one, and the new activity is discovered on the next timeline load.

Withdrawing a reaction sends `Delete {object: <own Like/Announce IRI>}`, not `Undo`: the tested ONI server answers an Undo of a Like or Announce with 400 and hard-deletes Create and Follow, while a Delete of the reaction activity removes its outbox row. A withdrawal therefore needs the activity IRI the load carried; without one it is refused rather than aimed at a guessed IRI.

Deleting one of the actor's own notes sends `Delete {object: <note IRI>}` with the same addressing rule. **A Delete may report success as 410 Gone** (ONI answers 410 with a Location header), so the adapter accepts 200/201/202 or 410 for a Delete and for nothing else: every read, Create, Like/Announce and Update still fails on 410. The deleted note's Create stays in the outbox with its object replaced by a Tombstone (`formerType: "Note"`), and an authenticated read of the object answers 410 with that Tombstone; the evaluator reads both as a deletion. This deletes the note on the actor's own server; it is not a claim about copies other servers already hold.

Before a Delete or an Update is sent, the target object is read with the session's credentials (`noteExists`), and HTTP 404, HTTP 410 and a Tombstone body are treated as gone; every other read failure (offline, 401, a malformed answer) rejects, so an unreachable server is never mistaken for a deletion. This is not politeness: the tested ONI server treats an `Update` naming a deleted object as an upsert and republishes the note, readable by anyone, while the client has no card left to reach it by. An Update is therefore refused when the object is gone, and a Delete of an object that is already gone is reported as already gone instead of as a fresh deletion.

Editing sends `Update {actor, object: {id, type: Note, attributedTo, content, mediaType, summary}}`. The object must be embedded **with its id**: a bare IRI is accepted (201) and changes nothing. `summary` is always present - an empty string is how a content warning is removed - and no `to`/`cc` is sent, so the note keeps exactly the audience it was published to. The tested ONI server does honour a new `to` in an Update, but this client does not use that: it cannot reproduce a published note's original recipients faithfully from what it loaded. That server also stamps `updated` at creation and does not advance it on an Update, so an edited note there is not marked as edited; the client shows the "수정됨" marker only when `updated` is later than `published`.

## Optional ONI image authoring

An explicit, default-off connection option enables the pinned ONI Create/Image
convention; an outbox alone is not evidence of upload support. The browser accepts
up to four PNG/JPEG/WebP images, each at most 5 MiB, with optional alternative
text. Selection and previews remain local, and drafts stay in memory. On submit,
Image Creates precede the Note Create; the Note carries resolved Image URLs and
alt text. Only public/unlisted audiences are supported. Private replies are never
widened to allow images. Uploaded Images are separate public objects and may
remain after a failed or cancelled Note or removal from a local draft.

Confirmed uploads are reused after a Note failure. Accepted uploads whose
Location cannot yet be read offer GET-only recovery when a trusted Location is
available. An ambiguous upload outcome is quarantined rather than repeated.
Metadata and binary URLs must remain on the configured actor origin; redirect
and token protections are unchanged. Existing-note edits preserve attachments.
Attachment-only Notes may omit content only when safe attachments normalize
successfully. Real fixture tests cover PNG, JPEG, WebP, alt text, exact binary
roundtrips, image-only Notes, and explicit remote-image loading. This convention
is not claimed to work on other C2S servers.

## C2S relationships

The separate relationship gateway reads the advertised `following` collection
and complete inbox/outbox activity evidence. Remote member IRIs remain data: no
automatic profile dereference or remote image request is made. Missing endpoints,
malformed identity, incomplete pagination and contradictory evidence are errors,
never an empty graph. A bound CollectionPage may normalize its pagination query
only when its nonblank `partOf` exactly names the requested collection and the
origin/path still match. Actor identity is pinned after the first successful read.

Follow posts to the actor's own outbox. Withdrawal posts standard Undo embedding
the exact persisted own Follow after a fresh read; it does not use Delete or a
remote inbox POST. HTTP 200/201/202 confirm these writes without requiring
Location. Confirmed writes survive failed reconciliation. Unknown POST outcomes
remain quarantined, and negative reads alone cannot justify repeating a Follow.
Old account/read continuations cannot replace current relationship state.

The people dialog distinguishes submitted requests from accepted membership.
Address entry validates URL syntax only, not a remote person's identity. Loaded
author profiles offer a contextual entry point. Approval does not imply historical
post import: the timeline refresh reads only what the server has delivered.

A real browser Follow → remote author Create/Note → follower timeline → Undo
loop passed against the explicitly modified two-actor ONI fixture. The required
server patches and narrowly scoped public-root key-bootstrap workaround are
documented in `dev/oni-follow/README.md`; this is not stock-ONI or general
Mastodon-account compatibility evidence.

## Explicit account discovery

People management accepts `@name@server` or `name@server` in addition to exact
actor URLs. A separate credential-free adapter queries the HTTPS WebFinger
endpoint only after explicit submission. It sends no Authorization, cookies or
referrer, rejects redirects, limits the streamed response to256KiB and applies
a10-second timeout through body consumption. Lookup never fetches actor profiles
or images and never submits a Follow automatically.

This implementation preserves username case, normalizes hostnames and requires
strict normalized `acct:` subject equality plus one distinct safe ActivityPub
`self` link. Server assertions are presented as addresses, not verified personal
identity. Redirect-hosted discovery, different canonical subjects and servers
without browser CORS support may require manual actor-URL entry. Inputs and
results stay in memory, and edits/account changes/disposal invalidate old reads.
Existing Mastodon-account login remains unsupported; standard WebFinger is not
the Mastodon REST API.

References: [RFC7033](https://www.rfc-editor.org/rfc/rfc7033) and
[Mastodon WebFinger documentation](https://docs.joinmastodon.org/spec/webfinger/).
A credential-free GET of the documentation's public example returned200,
`Access-Control-Allow-Origin: *`, matching subject and one ActivityPub self link.
This is read-only discovery evidence, not federation delivery or identity proof.
The maintained ONI fixture's nondefault-port acct resource returned400 because
its parser splits every colon; no server patch was added for this feature.

Timeline diagnostics count activities that are not rendered as posts, rather
than claiming those operations are unsupported by the entire client. Follow,
Accept and Reject may contribute to that count while people management handles
the relationship evidence separately. A valid Undo of a Follow (embedded, or
referencing a loaded original) is also unrendered and never removes a reaction.
Conflicting original IDs, actor/target contradictions and malformed embedded
Follow evidence remain rejected. A bare unknown Undo reference cannot establish
a valid relationship withdrawal; existing rejection behavior remains. No browser
signature verification is implied by this classification.

A structurally valid own ONI raster Image Create is also counted as unrendered
rather than as a malformed Note. This narrow classification requires the reading
actor identity, matching activity actor and Image attributedTo, safe own-origin
activity/object IDs, unambiguous types and PNG/JPEG/WebP media. ONI may omit the
Image's content and URL after upload. The standalone activity creates no card or
attachment; its Note's attachment still requires explicit image loading. Foreign
Image Creates and other media types are outside this scoped recognition.

### Private-media capability evidence

The isolated pinned ONI audit distinguishes inbox delivery from binary access.
Follower-addressed objects arrived, but recipient proxy reads failed; successful
restricted owner reads advertised public caching. A warmed direct-recipient proxy
metadata response was also readable anonymously. No restricted PNG byte leak was
established. See [the matrix](../../docs/product/private-media-evidence.md) for
scope and reproducible source findings. Those initial failures were corrected in
the maintained fixture; the later sections below describe the now-implemented
authenticated read path and capability-gated restricted authoring. These results
do not establish private-media support on unpatched ONI or other servers.

### Bounded full-history continuation

Full timeline reads may pause before each next 100-page chunk for an explicit
application continuation. The same traversal retains collected activities,
resolution cache and cycle detection; declared totals never replace following
an advertised next page. No partial initial timeline is exposed. A canceled
refresh keeps the previous timeline. Per-read cancellation is separate from the
session signal, so a superseding POST cancels the old read without canceling
that write. Recent hydration keeps its existing semantics; any full-read
fallback uses the continuation mechanism and never repeats a confirmed POST.
The 10,000 object-resolution and nested-depth limits remain hard bounds.
Relationship collection reads also support explicit bounded continuation while
remaining complete-or-error. Following membership and original request evidence
land together only after all three collections finish; hard object/member bounds
remain.
Multi-request traversal is not an atomic server snapshot.

### Withdrawal preparation and read cancellation

Relationship reads use their own continuation controller, independent of timeline
reads. `prepareUnfollow` snapshots the selected request ID/target, completely
reads membership/inbox/outbox and validates the exact original Follow, without
sending a POST. It returns a single-use command bound to that validated original.
The application checks its operation ticket immediately before invocation; read
cancellation controls preparation, not the command's POST. The POST uses the
session signal, never an expired preflight signal. Failures before invocation
remain read failures; uncertainty classification starts only after invocation.
Legacy combined withdrawal remains available outside read cancellation.

Canceling a relationship read retains previous evidence/confirmed receipts but
marks the graph canceled and blocks new graph actions until a fresh complete
read. Closing or leaving relationship controls releases pending reads. Moving
between account sheet and People retains the visible gate and displays the exact
captured withdrawal target. No partial membership, guessed original or automatic
POST retry is introduced.

## Explicit private image reads in ONI mode

For a restricted received note, the reader may explicitly load a normalized raster
attachment through the configured account's advertised same-origin HTTPS proxy.
Only a current timeline attachment URL/MIME can reach this use case; the caller
cannot use it as an arbitrary URL fetcher. Browser bearer credentials go only to
the account proxy, never to the image origin. No cookies, referrer, redirects or
browser cache are used. The adapter requires exact PNG/JPEG/WebP MIME, validates
its encoded signature, bounds the stream at5MiB and the entire read at10 seconds.
These are header checks, not a complete image decoder; the browser can still
reject a malformed image and presents the same retry state.

The presentation controller owns cancellation and generation ordering; its browser
resource port creates/revokes object URLs. Hiding, replacing or disposing a view
releases the resource, and late results cannot allocate a new displayed image.
Session changes invalidate in-flight results. Public/unlisted images retain the
existing explicit direct image path. Restricted uploads require the explicit
capability described below.

## Restricted upload receipts

The corrected local fixture can advertise generator Service
`urn:kimino:oni:private-media:1`. Only that exact capability plus explicit ONI mode
enables private image authoring. Images use the final clamped Note's canonical
`to` and `cc`, including reply participants. Each memory-only receipt is bound to
those separate recipient sets, preventing reuse after recipient or scope changes.
The submission is copied before asynchronous work. Image readback must match the
expected addressing; unexpected `audience`, `bto` or `bcc` is rejected on both
Create and Image. A confirmed201 remains unresolved if verification fails, and
recovery is read-only. The client also retains verified image/audience associations
so supplying an attachment with fabricated audience fields cannot bypass checks.

Changing a retry's attachment description updates the final Note descriptor, not
the uploaded Image object's original name. Removing an image or cancelling the
Note does not delete or revoke the uploaded resource: it may remain accessible
within its original recipient scope. Server assertions remain the trust boundary.
