# Component library and visual workbench

Goal: give Kimino a real shared component library and a component-level visual
review surface, while completing the active visual-hierarchy fixes.

## Design

Keep Solid 2 and native controls. Foundations live in `src/styles/`; reusable
buttons and fields live with their styles in `src/components/ui/`. `app.css`
retains only ordered imports; feature and responsive styles have named owners.
The workbench renders the same primitives, NoteCard and Composer used by the app.
It uses synthetic `.invalid` identities and local state only, with no adapters,
tokens, persistence or publication. It has its own HTML entry and build command.

The workbench covers enabled/disabled/busy controls, valid/invalid/filled fields,
selected reactions, keyboard focus, long labels, content warnings and composer
states. Light/dark browser preferences and narrow/wide viewports are exercised by
Playwright; screenshots supplement interaction and accessibility assertions.

## Tasks

- [x] Preserve current quiet reaction and field improvements; existing three
  visual-language regressions pass after failing on the original implementation.
- [x] Build native Button/TextInput/TextArea wrappers; integrate connection and
  composer forms; typecheck wrappers and live prop/ref/event forwarding.
- [x] Extract shared tokens, base and primitive CSS from the monolith.
- [x] Integrate shared button in NoteActions; update stale selected-outline tests.
- [x] Build workbench, scripts and state-focused browser tests.
- [x] Inspect component screenshots in both themes, then actual app composition;
  request independent visual/code review and fix concrete findings.
- [x] Run final check, workbench build and complete UI regression; record limits.

Final verification: 836 unit tests, 196 UI tests and 6 write-flow tests passed;
types, formatting, application/workbench builds and Sacho passed. The static
workbench loaded with four card specimens, no page errors and no mobile overflow.
Independent follow-up found no actionable issue in the scoped reviewed states.
See iteration-log.md for evidence and real-device/assistive-technology limits.
No commit, push or deployment is part of this change.

No new framework or UI dependency is needed. This is an internal component
library, not a claim of a published third-party package or Storybook integration.
