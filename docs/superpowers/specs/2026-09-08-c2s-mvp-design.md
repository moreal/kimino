# Kimino C2S MVP

Build a browser-owned ActivityPub client with a readable timeline, public notes,
and replies. The existing repository is an uncommitted SolidStart/Solid 1 starter,
not React. Use Solid 2.0.0-rc.6 and its matching DOM runtime with Vite: no SSR or
application backend is needed. The user authorized autonomous implementation.

## Boundaries

- `src/activitypub/`: framework-independent C2S transport, bounded collection
  traversal, hydration, and deterministic Activity evaluation.
- `src/components/`, `src/app.tsx`: accessible connection, compose, timeline and
  reply UI. Session credentials stay in memory; actor URL alone may persist.
- `dev/`, `compose.yaml`, `scripts/c2s-*`: pinned, real ONI C2S instance and
  repeatable local provisioning. A local CORS adapter may bridge the browser to
  the fixed server; it must not become an arbitrary authenticated proxy.
- LogTape config belongs at the application entry; never log tokens or contents.
- Sacho fragments describe user-visible changes; CI runs tests/build and validates
  changelog format. AGENTS.md documents interfaces, commands, and review protocol.

## Semantics and limitations

An inbox is not a complete server-wide event log. Read the authenticated actor's
inbox and outbox, follow pagination, deduplicate, resolve referenced objects, and
project supported ActivityStreams representations. Support Notes and
Create/Update/Delete/Announce/Undo; reject unauthorized mutations. Do not claim
full JSON-LD processing or verify federation signatures in the browser: the
instance is the authenticated delivery trust boundary. Unknown types are counted.
Show errors for incomplete synchronization instead of displaying it as complete.

Render incoming content only through an HTML sanitizer with a small allowlist;
never load remote media automatically. Publish escaped plain text in a Create
Note addressed publicly, with reply author and inReplyTo preserved. Keep drafts
on failure. Prevent duplicate submissions and stale session requests.

## Acceptance

Unit tests cover event ordering, tombstones, identity/auth boundaries, collection
pages/cycles, and publishing. Browser E2E connects to the Docker instance, reads
seeded content, publishes a note and replies, reloads, and sees persisted content.
Build, strict TypeScript, tests, and an independent reviewer must pass. Record
remaining interoperability boundaries and concrete commands in README.
