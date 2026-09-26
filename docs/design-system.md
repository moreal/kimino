# Kimino visual system

Kimino uses Solid 2 components and colocated CSS, with shared tokens in
`src/styles/` and responsive widths in `src/presentation/design-tokens.ts`.
`app.css` is now only an ordered stylesheet manifest. Tokens alone do not guarantee a coherent
interface: these component rules define how they should be used and reviewed.

## Open the component library

```sh
npm run dev:design-system
npm run test:design-system
npm run build:design-system
```

The development URL is `http://127.0.0.1:5173/design-system.html`. If Vite is
already running, open that URL without starting another server. The theme picker
uses the same light/dark palette files as the app. It stores no preference.
The separate static build is in `dist-design-system/`; the ordinary app build
does not include the gallery entry. No new UI framework or dependency was added.

| Layer | Source | Responsibility |
| --- | --- | --- |
| Foundations | `src/styles/tokens.css`, `palette-*.css`, `base.css` | Shared colors, scale, reset, icons and focus |
| Primitives | `src/components/ui/Button.tsx`, `Button.css`, `Field.tsx`, `Field.css` | Native controls, variants, reactive props/events/refs |
| Composed UI | `NoteActions`, `NoteCard`, `Composer` with colocated CSS | Real post and writing states, reused in the workbench |
| Composition | `src/styles/shell.css`, `density.css`, `responsive.css`, `feedback.css` | Page layout and responsive integration |
| Workbench | `src/design-system/entry.tsx`, `gallery.css` | Synthetic fixtures and interactive examples only |

`Button` supports primary, secondary, danger, ghost and icon variants; it defaults
to `type="button"`. Pass `type="submit"` explicitly for submission. Icon-only
buttons require an accessible label. `TextInput` and `TextArea` retain native
semantics: callers supply associated labels and connect help/error text with
`aria-describedby`. Use `aria-invalid` for the shared error appearance.

The app already uses these primitives in connection/composition forms and note
actions. Feature-specific controls retain their own components; they are not
replaced by fake gallery-only lookalikes. The workbench includes real NoteCard
and Composer examples and never connects an account or publishes an activity.

## Hierarchy

Post content is the primary reading surface. Author names identify its source;
handles, time, reply context and counts support it. Repeated actions must not
look like calls to publish. Avoid placing multiple framed surfaces inside every
post. Reserve filled primary buttons for the next important action in a form.

| Component | Rest | Selected / unavailable | Interaction |
| --- | --- | --- | --- |
| Post actions | Transparent, aligned icons and labels; modest corner radius | Same geometry and transparent surface; accent text, filled heart/bookmark, explicit share/save state | Subtle neutral hover; distinct keyboard focus ring |
| Like | Visible “좋아요” and optional count | Visible label stays “좋아요”; filled heart and `aria-pressed` communicate state; accessible name reports “좋아요 취소” | Selection adds no padding or frame; count changes may change width |
| Primary button | Solid accent surface, contrasting text | Neutral surface and muted text when disabled, not a faded copy of the active accent | Disabled control stays recognizable but subordinate |
| Form fields | Body-weight text and placeholders, modest rounded corners | Label remains semibold; text never inherits label weight | Visible rounded focus ring; mobile text at least 16px |
| In-app reply cue | Muted arrow and text, including explicit original-post action | No persistent full-line underline | Underline on hover/focus; keyboard and touch access preserved |
| Remote body links | Accent with underline | No reinterpretation based on untrusted HTML classes | Keep links distinguishable from ordinary prose |
| Composer auxiliary controls | Shared left alignment, compact vertical rhythm | Disclosure reveals optional guidance | Touch target remains at least 44px on phones |

## Foundations

- Use the existing seven typography steps, six spacing steps and semantic
  light/dark color pairs. Do not add component-specific literal colors.
- Small and medium corner radii belong to controls and fields; full-round shapes
  belong to avatars, compact badges and the existing navigation/search shapes.
- Color is not the sole selected-state cue: retain filled icons, changed state
  words where needed, and semantic attributes. Focus is separate from selection.
- Preserve contrast in both themes. Disabled states and read-only explanatory
  copy must remain distinguishable; do not darken all secondary content to hide it.
- Compact density changes spacing, not the meaning of controls. Container rules
  retain accessible names when labels fold, and never shrink touch targets.

## Review gate

Inspect real populated states, not just empty fixtures: liked/unliked, saved,
shared, hover, keyboard focus, enabled/disabled forms, empty and error screens.
Compare light/dark at 390/1440px, then check 320px and nested conversations.
Use screenshots at rest after color transitions have settled. Component tests
write per-section PNGs for both themes and widths into Playwright's test results;
inspect those images rather than treating screenshot creation as visual approval.
Passing geometry
or contrast tests is supporting evidence; it cannot approve visual hierarchy.

Current visual-system changes and independent findings are recorded in
`docs/product/iteration-log.md`. The previous visual acceptance missed the
oversized selected-state capsules and is superseded by this review gate.
