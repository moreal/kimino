# Following people — design constraints before implementation

The intended outcome is a daily social client: readers can choose whose future
posts arrive, understand whether a request was merely sent or accepted, and
stop following without confusing local hiding with a server relationship.
This follows the user’s product/UX/clean-architecture objective. It does not
replace the C2S boundary with Mastodon REST or client-side inbox delivery.

## Evidence gate

The isolated investigation is recorded in `follow-capability-plan.md`. A Follow
201 is proven. In explicitly corrected temporary servers, a matching Accept
reaches the requester and both graph collections expose actual member IRIs.
Subsequent Note delivery is not yet verified: the first test failed with a
recipient-side HTTP400/JSON parsing error. Stock-image and experimental results
must remain separate. No product control should claim reliable delivery from
request acceptance or collection membership alone.
The next implementation plan must use the diagnosed server behavior, including
withdrawal, rather than translating a 201 into “following”.

## Product and information hierarchy

The author sheet is a contextual entry point: identity first, relationship and
its state second, local reading controls clearly separate. A dedicated people
manager is needed for accounts whose posts have not arrived yet; a timeline-only
entry point cannot bootstrap an empty account. It accepts an explicit actor URL,
not a falsely advertised global handle search or directory.

A successful flow must show distinct outcomes:

- Server confirmed the request: sent/requested, not accepted.
- The actor’s complete following collection contains the target: following.
- Read failed or was truncated: unknown/stale, never “not following”. Preserve
  the last known state and offer an explicit state refresh.
- POST outcome unknown: do not automatically repeat the request or show a new
  active Follow action. Explain verification before another deliberate action.
- Cancellation/withdrawal: identify the original own Follow, wait for a confirmed
  write, and reconcile collection state. Do not guess an activity IRI.

Acceptance may take time and may never arrive. Refresh is an explicit read;
no unlimited polling. Leaving and reopening a sheet must not enable duplicate
writes. Switching accounts invalidates old continuations. Known hidden authors
remain manageable without un-hiding their content. Local author hiding never
implies unfollowing, server blocking or stopped delivery.

## Architecture direction

Use a separate optional relationship port alongside `TimelineGateway.images`,
not relationship-specific HTTP in a component. Domain code normalizes/evaluates
relationship evidence without clocks, framework, networking or copy. Application
owns account lifecycle, pending operations and confirmation/reconciliation.
The HTTP adapter discovers advertised collections, serializes C2S Follow and the
verified withdrawal operation, enforces pagination/IRI/origin rules and returns
typed evidence. Presentation projects labels and action availability and stores
only memory state; Korean copy stays in presentation. Bootstrap injects adapters.

Read collection member IRIs without automatically resolving every remote actor.
An own following collection may list remote actor IRIs, but remote profile fetches
are not required just to decide membership. Preserve the existing bearer-origin
and redirect rules. Relationship read failure must be scoped to relationship UI,
not discard an otherwise readable timeline.

## Alternatives considered

1. Treat Follow POST acceptance as subscription success: fast, but false during
   pending/rejected delivery; rejected.
2. Add only a button on already-loaded authors: minimal UI, but cannot create a
   useful empty account and provides no place to recover pending requests;
   insufficient by itself.
3. Contextual action plus a small people manager, driven by explicit evidence:
   recommended once delivery and withdrawal have reproducible live evidence.

## Verification requirements

Independent tests must cover late Accept, missing Location, unknown POST outcome,
truncated/failed collection reads, duplicate clicks after navigation, forged or
mismatched activity references, and old-session completion. Real isolated-server
checks must prove Follow receipt, Accept, both relationship collections, later
Note delivery, and withdrawal effects. Browser checks cover keyboard/phone focus,
empty-account discovery, honest pending wording and retry/reconnect behavior.
A fresh surrogate must test the resulting concrete flows and give a candid
Mastodon migration verdict; simulated feedback is never reported as user research.

Status: design constraints recorded; product implementation has not started.
The probe agent owns its separate temporary topology and evidence document.

## Independent design review corrections

Membership and requests are separate evidence. Absence from a complete following
collection does not prove that no Follow request is pending. On reconnect, recover
pending requests from verified own-outbox Follow evidence; if this evidence cannot
be established, report request status unknown and withhold a blind new Follow.
Missing Follow activity IRI disables withdrawal, not already-confirmed membership.
Define a safe new-request condition from both membership and request evidence in
the implementation plan; memory-only receipt loss cannot imply “never requested”.

The relationship adapter needs a dedicated IRI membership reader. The timeline
reader dereferences members and is not suitable unchanged. Discover optional
`Actor.following` from the advertised document; never synthesize its URL. Fetch
only collection/page resources, validate their identities and allowed origin,
retain validated member IRIs without fetching profiles, and reject cycles and
inconsistent declared totals. A terminal traversal with no declared total can
prove traversal completeness for that response, not historical completeness or
absence of an outstanding request. Failed/truncated traversals prove no absence.

Confirmed Follow/withdrawal receipts must land before reconciliation, even when
Location is absent. A later relationship GET failure marks evidence stale without
turning the committed write into failure. The current timeline write queue is not
a drop-in graph controller: its automatic timeline refresh and global error scope
must not accidentally discard graph confirmation. Keep per-target pending/uncertain
state in application, and use both session and relationship-read generations so
an older refresh cannot overwrite a newer confirmed request/withdrawal. Navigating
a sheet cannot reset these guards or enable another POST.

## Round 24 user-perspective evidence

The independent community-reader surrogate confirmed the gap in both desktop and
phone flows: actor sheets only offer local filtering/external profile/hiding, and
handle search is scoped to loaded posts. They requested identity confirmation
before a Follow, a separately discoverable people/address entry, pending/following
lists and an honest explanation that future delivery does not promise historical
posts. Preserve target input on errors and provide a route back to the timeline.
This supports the contextual action + people manager direction. Existing Mastodon
account compatibility remains a separate limitation; the reviewer still would
not migrate even if the Follow UI were added. See round 24 in the iteration log.
