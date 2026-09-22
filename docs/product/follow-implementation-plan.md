# Follow lifecycle and people management implementation plan

> Agentic workers: use superpowers:subagent-driven-development, bounded ownership below.

**Goal:** Let a C2S reader discover an exact actor address, request a follow,
inspect accepted/pending/rejected/uncertain states and withdraw the exact own
Follow, while actual server reception remains separately verified.
**Architecture:** Pure request evaluation, a relationship gateway, an application
controller with independent reconciliation, presentation projection and native
accessible people dialog. No UI HTTP/storage imports. Existing timeline queue
is not reused as graph reconciliation; graph failures do not discard a feed.
**Spec:** `follow-design.md`. User explicitly reconfirmed Follow/post reception
as priority over additional cosmetic polishing on 2026-09-22.
**Stack:** pinned Solid2, TypeScript, Vitest/Playwright; npm; no new dependencies.

## Shared contracts

Root scaffolds `domain/relationships.ts` FollowRequest {id,target,rejected} and
`application/relationship-types.ts` RelationshipGateway/State/Evidence. Gateway
load returns complete following IRIs plus evaluated own requests from full
inbox/outbox reads, or rejects. It never turns truncation into absence. All
POSTs go to own actor outbox. Follow and Undo accept200/201/202 (Location
optional); standard Undo embeds the identified original Follow. No Delete
substitute and no client S2S POST.

`normalizeFollowTarget(value, self): string | undefined` is pure, trims/canonicalizes
safe HTTPS or loopback HTTP actor IRIs, refuses self/invalid URLs.
`evaluateFollows(activities, self): {requests: FollowRequest[]; rejected: number}`
keeps own-origin own-actor Follow IDs, excludes authorized own Undo/Delete or
trusted own-origin Tombstones, and marks only Reject by that target referencing
that exact Follow. Forged/malformed relevant evidence cannot establish absence;
adapter rejects when rejected>0. Unknown unrelated types are ignored explicitly.

Application export:
`createRelationshipSession(gateway, actor, {current, update})` returns
`getSnapshot(), refresh(), follow(target), unfollow(target)`. update receives
complete RelationshipState. `current(): boolean` guards account generation.
SocialSession will own it and expose `loadRelationships/follow/unfollow` plus
optional snapshot.relationships, initialized only after a real connected actor.

## Tasks and ownership

- [x] Adapter/domain agent owns `domain/relationships.ts` + tests,
  `activitypub/relationships.ts` + tests, `activitypub/client.ts`,
  `activitypub/collection-reader.ts`, `domain/social.ts`. Add optional advertised
  Actor.following, optional raw nested-object mode in collection reader (default
  behavior unchanged), and client.relationships gateway. Read graph via the
  reviewed membership reader; read activities without remote actor dereferencing.
  Enforce same-origin actor/outbox/pages, full counts/cycles/limits and response
  identity. Prove target spoofing, missing endpoint, partial reads, token/redirect
  protection, original Follow matching and server refusal. Do not edit app/UI.
- [x] Application agent owns new `application/relationship-session.ts` + tests
  and `gateway-errors.ts`. Shared types are fixed. Keep pending/confirmed/uncertain
  per target across navigation. Confirmed receipts land before reads; failed read
  leaves confirmation visible. Old reads cannot replace newer writes; account
  switches invalidate continuations. Reconciliation clears follow uncertainty only
  on matching request/membership; absence alone cannot disprove an unknown Follow.
  Unfollow uncertainty can clear when complete evidence lacks both membership and
  active request. Refuse duplicate operations and ambiguous/missing Follow IDs.
  Definite4xx refusals (except408), read-only and local validation remain retryable;
  transport/5xx/non-confirmed responses quarantine rather than auto-retry. Serialize
  graph writes; no clocks, copy or DOM. Add failures relationship-target,
  relationship-state, relationship-unsupported, relationship-uncertain.
- [x] Root owns integration into SocialSession, presentation projection/copy,
  VM commands/state, App/ActorSheet/people dialog/CSS, mock browser tests,
  documentation/changelog and all final checks. People manager offers an exact
  actor-URL input + explicit identity/address confirmation before POST, preserves
  input on failure, shows pending/following lists and manual read refresh.
  Loaded author sheet offers contextual action; local filtering/hiding remains
  distinct. Native dialog keyboard containment and return focus required.
- [x] Probe agent owns only temporary server source/fixtures and evidence doc.
  Positive fresh Follow→Accept→real graph members→production-shape Note delivery
  →Undo→both graph removals required. Explicit server/gateway corrections never
  become an unlabelled stock-ONI claim. No unrestricted proxy or signature bypass.
- [x] Independent source review; fresh user-perspective screenshots/concrete flows;
  fix material findings and scoped re-review. Full npmcheck then one Playwright
  suite at a time. No source edits while browser tests/review are active. Record
  candid migration verdict; no commits/pushes requested.

## Required lifecycle tests

Use deferred reads/posts to prove old-read ordering, navigation duplicates,
accepted-without-Location plus failed hydration, unknown POST + negative refresh,
old-account continuations, rejected then deliberately retried requests, multiple
Follow IDs, and repeated/cyclic pages. Live negative observations use complete
bounded collection walks; non-delivery during a poll window is not permanent
cessation. Follow acceptance never promises historical posts or guaranteed
federation delivery. Keep user input and typed errors; never automatically retry.

Progress (2026-09-22): domain, gateway, controller, presentation and UI integrated.
Mock browser lifecycle/error/modal tests pass. Real browser test passed (1/1,
4.1 seconds): Follow, Bob UI publication, Alice timeline reception, Undo against
the explicitly corrected canonical fixture. Independent source review findings
(request filtering, collection first traversal, actor pinning, embedded evidence,
malformed partOf and ActorSheet modality) fixed and scoped re-reviewed clear.

Scoped user re-review completed: trial compatible C2S, not whole-community
migration; no further material UI finding. Maintained fixture built from checked
patches and passed its actual browser loop on18448 (1/1,3.9s). Final app check
passed584unit, types, format, build and Sacho. Source architecture review clear.
The final full browser suite passed172/172 with the maintained optional fixture
enabled, including12 stock-ONI tests plus the real two-actor Follow loop.
Fixture packaging review requested module-replacement integrity verification.
The guard now checks both exact go.mod files and disables ambient Go workspace
overrides. All7 offline regressions, actual-source tamper checks and bundle
checksums pass. Independent scoped source re-review cleared the fix.
All planned round25 implementation and verification tasks are complete. Broader
account portability/discovery/moderation remain separate product requirements.
