# Round26 — find a known person by their handle

Previous goal turn made verified progress: Follow/reception/Undo shipped and
584 unit /172 browser checks passed. Current source/handoff were re-read before
planning. The next remaining product barrier is reaching a first person without
knowing their technical actor IRI. C2S-only authorization remains in force.

## Intended behavior

People management retains exact Actor URL inspection and adds explicit lookup of
`@name@server` (also `name@server`). Typing makes no request. Submitting a handle
makes one credential-free WebFinger GET to its HTTPS server. A successful result
shows the queried handle and server-provided actor URL, not a verified-person
claim. Follow remains a separate action through the existing C2S use case.
Remote profiles/images are not automatically fetched. Errors preserve input and
the manual URL path. No Mastodon REST, proxy or server code changes are required.

Lookup supports a deliberately strict subset: preserve username case; normalize
hostname; reject ambiguous separators, paths, credentials, whitespace, query and
fragment. Strict normalized subject equality is required. Require one distinct
safe `self` link with an ActivityStreams media type; malformed relevant links or
conflicting targets fail. Cross-host actor URLs are allowed as server assertions.
Redirect-based hosting and subject canonicalization are not silently accepted.

## Architecture and acceptance

- Pure domain handle/JRD normalization, independently tested.
- Application discovery port/result/error state; use case owns generation and
  cancellation. Abort and clear result on edits (including A→B→A), new lookup,
  account switch/disconnect and disposal. No copy/browser/framework dependency.
- Dedicated outer HTTP adapter: no authentication arguments, credentials omitted,
  redirects rejected, no-referrer, bounded streamed JSON and a timeout through
  body consumption. No reuse of the authenticated ActivityPub request helper.
- Bootstrap injects gateway into the view model; UI consumes state/actions only.
  Korean labels/help/errors centralized; no automatic Follow on lookup success.
- Mock browser verification checks no request while typing, result-before-Follow,
  exact target, absence of auth/cookies/referrer and failure/manual fallback.
  Existing relationship safeguards must remain in force.
- Independent review and simulated desktop/mobile re-review; one complete check
  and browser suite after source settles. Preserve previous work, no commits.

## Evidence and current progress

Read primary references RFC7033 §§4.4.1,5,7 and Mastodon WebFinger documentation:
https://www.rfc-editor.org/rfc/rfc7033
https://docs.joinmastodon.org/spec/webfinger/
Independent architecture review confirmed the separation and surfaced strict
subject/alias handling, actual body limits and input-generation cancellation.

A credential-free GET against maintained local ONI verified CORS but returned400
for its username@host:18448 resource. Source uses unrestricted colon splitting,
so nondefault ports are not supported by that server's acct parser. This is a
fixture limitation, not evidence against standard HTTPS WebFinger. Do not patch
ONI or claim a live lookup success from mocks. An external documentation-example
GET is in progress; poll its original handle rather than restarting.

Fresh simulated user26 is reviewing current screenshot/flows with intercepted
responses. Product source is frozen until their browser is closed. No discovery
implementation has started. Next: incorporate verdict, implement bounded
contracts/tests and adapters, integrate UI, then repeat review and verification.

Implementation progress: domain/JRD parser, bounded credential-free transport,
application cancellation controller and VM injection implemented. Empty timeline
CTA and unified address/handle input integrated. Seven relationship browser tests
pass (including two new discovery flows). Integration caught an early reset
notification before account hiding preferences loaded; moved reset after those
preferences, and all169 targeted tests pass. Fresh UI re-review is running.
The public documentation-example GET completed200 withCORS*, exactsubject and
oneActivityPub self link. No public write or profile fetch was made.

Completed: fresh scoped user re-review verifies desktop/mobile explicitlookup,
separateFollow, candidateinvalidation andfallback; stillnotmigrating dueexisting
accountcompatibility andgroupmanagement. Core andUI/VMsource reviews clear.
Finalcheck:636unit plusformat/types/build/Sacho pass. Fullbrowser174/174 pass
including maintainedactualFollow loop. Diffwhitespacecheck passes. No commits,
publicFollow or serverchanges. Nextiteration: multi-person management hierarchy.
