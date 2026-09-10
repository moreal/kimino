# Working on Kimino

Kimino is a browser ActivityPub **C2S** client. Read `README.md` for setup and
`src/activitypub/README.md` for protocol guarantees and intentional limitations.
Do not substitute Mastodon REST endpoints or S2S inbox POSTs for C2S.

## Fast context map

- `src/domain/`: canonical models, ActivityStreams normalization and pure evaluation.
- `src/application/social-session.ts`: framework-independent use cases against
  `TimelineGateway`; cancellation (`guard.ts`), request ordering, and typed
  `SessionFailure`/`SessionNotice` state. No user-facing text; gateways signal
  refusals with the error classes in `gateway-errors.ts` (`toFailure` classifies
  them). `DEMO_ACTOR` selects the sample gateway.
- `src/activitypub/client.ts`: HTTP adapter over `domain/`; do not add business
  rules back into this layer.
- `src/bootstrap.ts` and `entry-client.tsx`: composition root injecting real/demo
  gateways and preferences into the application view.
- `src/presentation/`: framework-free view model (`feed-view-model.ts`), pure
  selectors (`feed-selectors.ts`), tab persistence (`session-restore.ts`),
  saved-link rules, link/label helpers, all Korean copy (`copy.ts`; failure and
  notice text in `copy-failures.ts`) and the `Preferences` port. Only
  `presentation/solid/` may import Solid (store bridge, shared clock, media query).
- `src/app.tsx`, `src/components/`: accessible UI over the view model. Never import
  concrete network/storage adapters here (only `infrastructure/sanitize` is
  allowed) and use `domain`/`application` as types only; dependency boundaries
  are enforced in `application/architecture.test.ts`.
- `src/infrastructure/`: DOMPurify sanitizer, browser preferences (IDs only, no
  drafts/tokens/content) and clearly labeled read-only example content.
- `compose.yaml`, `dev/`, `scripts/c2s-*`: real ONI fixture and local TLS.
- `tests/ui.spec.ts`, `tests/product.spec.ts`: isolated browser tests; `tests/c2s.spec.ts`: real Docker E2E.
- `changes.d/`: Sacho fragments. Add a short user-facing fragment for behavior changes.

## Commands

Use Node >=22.12 and **npm**, with committed `package-lock.json`.

```sh
npm ci
npm run check                   # strict types, unit tests, production build, Sacho
npm run c2s:up
npm run c2s:seed                 # creates ignored .local/ credentials + CA
npm run c2s:smoke
npx playwright install chromium
npm run test:e2e                 # requires real seeded Docker instance
npm run test:e2e:ui              # independent UI tests only
```

Run narrow tests while iterating, then one complete check after the last changes.
Sacho may need write access to `.git/sacho.lock`; Docker needs its local socket.
If the sandbox blocks these, use the platform's scoped escalation mechanism.
Do not expose `.local/c2s-credentials.json` or request bodies in logs/review output.

## Implementation rules

- Solid **2** uses `@solidjs/web` for JSX and DOM, lowercase HTML attributes,
  split effects, and microtask-batched signals. Keep matching RC packages pinned.
  Do not import `solid-js/web`, `onMount`, or Solid 1 router/start dependencies.
- Keep activity evaluation pure, deterministic and independently tested. Server
  delivery is the trust boundary; never imply browser signature verification.
- Unknown Activity types are ignored explicitly; pagination truncation/network
  failures are errors. Exercise deletes, stale updates, repeated pages and IRIs.
- Bearer tokens stay in memory and only go to their configured actor origin.
  Redirects must not leak tokens. Never add an unrestricted proxy.
- Never render remote HTML outside the sanitizer. No automatic remote images.
- A confirmed POST followed by failed hydration is still a successful write.
  Preserve failed drafts and do not auto-retry POSTs.
- Configure LogTape once in the entry point; log counts/status, never credentials,
  private object content, or response bodies.
- Keep Docker loopback-only. Do not alter host trust stores automatically.

## Efficient agent orchestration

The coordinator owns integration, package/lockfile changes and final verification.
Delegate only bounded independent work with explicit owned paths and shared types;
pass task-specific context, not full conversation history. Avoid multiple agents
editing the same file or installing packages concurrently. Ask an independent
reviewer for concrete severity/file/reproduction findings after implementation.
Fix high-impact findings, run regression tests, and request a scoped re-review.
Record progress and unresolved limits in the implementation plan so another agent
can resume without repeating completed research. Do not create extra plans for
small fixes. Do not push, publish, or message others without authorization.

When a commit is requested, follow the session's exact model-identity/trailer
instruction; do not invent identities or add AI Co-authored-by trailers.

## Product review loop

Use independent user-perspective agents to evaluate screenshots and concrete
flows. Record candid verdicts and actionable blockers in
`docs/product/iteration-log.md`; never claim simulated feedback is real research.
Implement the highest-value bounded fixes and repeat the evaluation. Do not keep
polishing solely to pressure a reviewer into approving migration. Account/network
compatibility and privacy scopes are separate product requirements, not UI polish.
