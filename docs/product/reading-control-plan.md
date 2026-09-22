# Reading controls — implementation plan (2026-09-22)

Goal: make a busy C2S feed manageable while continuing to evaluate whether the
whole product earns migration. Round 21's independent surrogate named missing
negative feed controls as the highest bounded blocker. Account compatibility,
media authoring and following remain distinct requirements, not redefined away.

Design: an author's sheet offers '이 작성자의 글 숨기기', except for myself.
Hide that author's loaded notes from every reading list, search, saved cards,
reply peek, parent excerpts and conversations. Do not delete saves or drafts.
Explain deliberately hidden parents without claiming they are missing/deleted
or inviting an external click that bypasses the hide. A persistent count and
management button opens an accessible list where each author can be restored.
Store only author IRIs, scoped to the connected account, in browser preferences.
Preview changes stay in memory and reset on exit/reload. Clearly explain local
scope: no server blocking, no delivery prevention, no cross-device sync.

Architecture: domain/evaluation and HTTP adapter stay unchanged. A pure
presentation projection excludes authors; the view model owns commands and
persistence errors through Preferences. Browser serialization stays in the
infrastructure adapter; bootstrap wires it. UI consumes state/actions only.
Use the existing visual tokens/icon set. Native dialog gives modal focus/inert
behavior without adding a framework dependency; no motion added.

Tasks / owned paths:
- [x] Core agent: presentation ports, selectors, view model, pure reading module,
  new copy-reading module, preferences adapter + tests, bootstrap. Unit regressions
  for hide/unhide across lists/threads, account isolation, storage refusal, demo
  non-persistence, preserved saves/drafts and self protection.
- [x] Coordinator: author sheet action, hidden-author manager dialog and header
  entry; hidden-parent cues; UI regressions incl keyboard/focus/mobile layout.
- [x] Independent reviewer: code findings and fresh user-perspective screenshots;
  fix material regressions and request scoped re-review.
- [x] Coordinator: full check and Playwright (including live ONI), changelog,
  round log and next-round handoff. Do not claim migration success from UI tests.

Parallel evidence task: inspect/probe the pinned ONI C2S image and Follow paths.
No fabricated API support. Any implementation follows the observed contract.

Progress: core and UI implemented; five browser regressions pass. Independent
review reproduced background-refresh focus loss; Solid 2 ID-keyed rows fixed it.
Fresh surrogate independently found misleading empty copy; counterfactual scope
projection now distinguishes hidden results from no matches, with recovery CTA.
Scope copy names affected screens. Scoped code/user re-reviews passed; full check passed with 404 unit tests and
all 159 Playwright tests (11 real ONI). This bounded feature is complete; the
overall product goal and remaining capability work stay active.

Parallel capability probe complete: pinned ONI public Image creation followed by
Note attachment works and preserves alt text. Private binary retrieval requires
authentication. Source and runtime evidence is in `c2s-capability-evidence.md`;
image authoring UI remains unimplemented, not claimed complete. Follow's earlier
single-fixture failure does not prove it unsupported; handoff corrected.
