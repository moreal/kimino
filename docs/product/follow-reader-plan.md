# Following collection reader implementation plan

> Agentic workers use `superpowers:executing-plans` for this bounded prerequisite.

**Goal:** Read advertised following collection member IRIs completely without
fetching remote profiles or incorrectly interpreting failed traversal as absence.
**Architecture:** A transport helper in activitypub receives the existing JSON
fetch boundary; application/domain/UX remain unchanged until live delivery is
verified. No new package, persistence, browser API or server writes.
**Spec:** `follow-design.md`, especially independent design-review corrections.
**Tech stack:** TypeScript, Vitest, existing ActivityStreams helpers/errors.

## Contract and files

Create `src/activitypub/membership-reader.ts` and `membership-reader.test.ts`.

```ts
interface MembershipReaderOptions {
  actorOrigin: string;
  fetch: (url: string) => Promise<ASObject>;
  maxPages: number;
  maxMembers?: number;
}
// Resolves only on a terminal complete traversal; throws on uncertain absence.
function readMembership(start: string, options: MembershipReaderOptions): Promise<readonly string[]>;
```

Page resources must share actorOrigin; remote member IRIs are data and are never
fetched. A declared response ID must match the requested IRI. Embedded pages can
omit IDs, but any declared page ID remains actor-origin. A declared `partOf`
must match the starting collection. Navigation cycles, malformed item arrays,
invalid member IRIs, duplicate members and exhausted limits reject. The root’s
nonnegative integer total, when present, must equal unique observed members.
An explicit terminal item array (including empty) without total establishes
traversal completeness. A collection declaring zero with no items/first may
represent empty. A missing list with no empty declaration/first proves nothing
and rejects. Inline root items allow only a reference-only `first` matching the validated
root identity, matching ONI’s root-as-first-page representation. Root navigation
without items cannot have conflicting `next`; dual item lists are rejected.

## Steps and verification

- [x] Write failing tests for paginated remote IRIs (assert only local page GETs),
  inline first pages, embedded pages, total-less terminal pages and empty totals.
- [x] Write failures for cross-origin pages/start, identity/partOf mismatch,
  cyclic or repeated pages, malformed lists/members, duplicates, total mismatch,
  invalid totals and page/member limits. Verify failures never return partial data.
- [x] Run `npx vitest run src/activitypub/membership-reader.test.ts`: missing module
  is the first expected RED. Implement with existing `safeUrl`, `iri`, `record`,
  `isType`, `sameOrigin`, and typed `unexpected` errors; never swallow fetch errors.
- [x] Run the reader tests and `src/application/architecture.test.ts`, typecheck,
  formatting. Independent reviewer checks pagination trust/completeness contract.
- [x] Coordinator records results and remaining integration in the product handoff.
  No commit/push requested. Existing green full app tests remain baseline until
  a product integration changes their covered behavior.

Review focus: incomplete collection roots, cross-origin `next`, response ID swaps,
server totals that cannot establish absence, and loops hidden in embedded pages.

Results: initial missing-module RED; 33 reader cases now pass. Independent review
found root navigation could skip first-page members and return false absence.
Four new regressions reproduced it; strict root navigation fixed it. Scoped
re-review found no remaining material issues. Reader + architecture:41 tests.
No UI/adapter integration or shipped Follow capability is claimed. Full check
is the coordinator’s final verification, recorded in next-round.md.
