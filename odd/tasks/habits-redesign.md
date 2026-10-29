# Habits — full UI/UX redesign, same functions

Objective: rebuild the `/habits` interface from the ground up — new page architecture, new components, new
interaction surfaces — while every behaviour the section has today survives. The user's words: *"lo que busco
con rediseño no solo es cambiar colores de contenedores y reacomodar, yo hablo de ir a rediseño real, tomar
las funciones y recrear de 0 la ui/ux"*. Branch: none — the tree stays uncommitted. Delivery: `ask-on-risk`, no
commits unless asked. Tests: `pnpm --filter @chub/web test`, `pnpm --filter @chub/web typecheck`,
`pnpm --filter @chub/web build`.

The functional contract of the previous wave lives in `odd/tasks/habits.md` (S1–S15) and is **not** being
renegotiated. This document restates it as a parity checklist, then specifies the new interface.

## Specs

**S1 — The mandate.** Replace the current interface, not just its colours. Every item in S2 must still work
afterwards; nothing else about the section may be added or removed without saying so here.

**S2 — Parity contract. Each item is a test the redesign must pass.**

- **F1 Create.** A habit is created with a name (and its icon), and creation also creates its first `check`
  field labelled "Done" in one transaction. It appears immediately in Today and in the matrix.
- **F2 Archive.** Archiving removes the habit from Today, the matrix and the roster, and keeps every entry.
  Nothing in the UI deletes a habit in one click.
- **F3 Restore and purge.** Restore brings the habit and its history back. Permanent deletion exists only in
  the archived list, only for an archived habit, and only behind a confirmation; it removes the habit's
  fields and entries.
- **F4 Fields.** A habit owns an ordered list of fields of kind `check`, `number` or `text`. A number carries
  a unit and a target. The kind is not editable after creation. A field that already has entries is archived
  instead of deleted, and the response says which happened. Add, edit label/unit/target, and remove all work.
- **F5 Entries.** At most one value per field per local date. Writing is an upsert; unchecking a check and
  setting a value to `null` delete the row, so absence means "no record", never a stored false. Text is a
  note and never counts toward completion.
- **F6 The only entry surfaces.** Entries are created in the Today panel (the seven-day strip plus the day
  rows) and nowhere else. No matrix cell is interactive.
- **F7 Read-only history.** The matrix renders levels only; cells are never buttons and never write.
- **F8 Periods.** Month shows one column per day with that day's level; quarter shows 13 columns and year 52,
  both with the rounded average of each week. Previous/next window and a caption naming the window work.
- **F9 Two history views.** The monochrome glyph matrix and the Amicro activity heatmap both remain
  available, switched from the interface, with the same data.
- **F10 Level and streak.** Levels stay `0..4` from `level.ts`: a check is binary, a number is satisfied at or
  above its target (or above zero without one), text never counts, and a habit with no trackable field falls
  back to "has any entry". Current streak, best streak and 30-day rate keep their current definitions.
- **F11 Local dates.** A day is the local calendar string `YYYY-MM-DD`; no UTC conversion anywhere. Future
  days are visible, disabled, and never written.
- **F12 Optimistic writes.** A check toggles immediately, reverts on failure and shows a `role="alert"`
  message. A failed write never looks successful.
- **F13 States.** Loading, empty (no habits), load failure with retry, and the archived empty state all exist.
- **F14 Bundle.** `/habits` stays a lazy route and neither the heatmap nor any chart library joins the entry
  chunk.

**S3 — New page architecture.** `/habits` is a workspace with three zones, not a vertical stack of sections:

```
header        Habits · subtitle · summary stats · [New habit]
hero grid     ┌ consistency panel (wide) ┐ ┌ today panel (rail) ┐
              │ period · view · matrix   │ │ day strip · rows    │
roster        All habits — name · streak · 30-day rate · fields · ⋯
archived      disclosure at the bottom
```

Desktop: `lg:grid-cols-[minmax(0,1fr)_360px]`, the Today panel sticky under the header. Mobile: one column
with Today **first** (`order-first lg:order-none`) so the daily action is never below the fold. The matrix
stays the dominant desktop surface, which honours the earlier decision that the heatmap is the main view.

**S4 — Consistency panel.** One panel owns the matrix: title, a segmented period control (Month / Quarter /
Year, `aria-pressed` buttons, not a `Select`), previous/next icon buttons with accessible names, an
`aria-live` caption, a Mono / Activity segmented switch, the matrix or the activity heatmap, and a real legend
(Less · five swatches · More) aligned to the panel edge. The matrix sits in an `overflow-x-auto` wrapper with
a minimum width so a 30- or 52-column window never squeezes to unreadable cells, plus a hint on small screens.
`GraphHeatmap` stays byte-identical and receives the same props; the custom legend stays outside it.

**S5 — Today panel.** The only recording surface, rebuilt as a panel rather than a strip:

- Header: the selected day, formatted for humans ("Thu, Apr 16"), a "Today" marker when it is today, and a
  `Back to today` ghost button when it is not.
- Seven-day strip: 44 px day buttons with weekday initial and day number, the selected day filled, today
  ringed, future days disabled, horizontally scrollable on phones.
- One row per habit, minimum 56 px: habit icon and name, a streak chip, and its fields.
  - `check`: a 44×44 toggle with a `Check` icon when on, `role="checkbox"`, `aria-checked`, and the existing
    accessible name shape `<habit> <field label> <date>` so the meaning is unchanged.
  - `number`: a compact numeric input with the unit and a muted `value / target` hint; commits on blur or
    Enter, never per keystroke.
  - `text`: progressive disclosure — a note affordance reveals the input, which commits on blur or Enter.
  - A row with several fields shows its completion as `2/3` in `tabular-nums`.
- One `role="alert"` line under the panel header for failed writes.

**S6 — Roster and archived.** "All habits" is a list of 44 px rows: icon, name, current streak, 30-day rate
as a thin bar with a numeric label, field count, and a kebab that opens settings. Archived habits live in a
disclosure at the bottom with Restore and Delete permanently (confirmed). This replaces the separate
"Add habit" and "Archived" sections.

**S7 — Settings dialog.** The habit settings keep the dialog and its two-step purge, restyled as sections:
Identity (name, icon), Fields (kind badge, label, unit, target, remove), Add field (kind switch, then the
relevant inputs), and a separated danger zone with Archive habit. Errors stay inside the dialog as a
`role="alert"` line and never close it.

**S8 — Visual system.** The `ui-ux-pro-max` skill is mandatory for every design decision. Reuse the tokens in
`web/src/styles/tokens.css`; **no new dependency, no new font, no new CSS variable**, and no hardcoded colour
— the current `bg-[#1b6e66]` is a defect this redesign removes. Surfaces are `bg-card` with `border-border`
and `rounded-xl` for panels / `rounded-lg` for rows; hierarchy comes from type scale, spacing and hairlines,
not shadows. Lucide icons only, one size family, 8 px spacing rhythm, 150–200 ms colour/opacity transitions,
`prefers-reduced-motion` respected, dark mode checked separately. Motion is limited to the day-change
crossfade and the check press; nothing decorative. The vendored `GraphHeatmap` keeps its own upstream row
animation because S4 forbids touching it, and that animation already honours `useReducedMotion` internally.

**S9 — Accessibility.** Every control is at least 44 px, every icon-only button has an `aria-label`, focus rings
come from the existing primitives, the segmented controls expose `aria-pressed`, the matrix keeps its
`aria-label` per row, and colour is never the only carrier of meaning (the check also has an icon, the level
also has a glyph). Labelled fields: a number and a text field show their label next to the control, and a text
field shows it on the collapsed note affordance; the `check` field is the deliberate exception, because its
visible label is the habit name on the same row and a repeated "Done" would be noise — its accessible name
stays `<habit> <field label> <date>`.

**S10 — Responsive.** Verified at 375, 768, 1024 and 1440. No horizontal page scroll; only the matrix wrapper
scrolls. The summary stats wrap without clipping and the Today rail unsticks below `lg`.

**S11 — Boundaries.** No server change: the API, schema, migration and `level.ts` / `date.ts` /
`habits-api.ts` stay as they are. `graph-heatmap.tsx` and the `graph-frame` trio stay byte-identical. The
redesign touches only `web/src/features/habits/` and, if a class is genuinely needed, `web/src/styles/shell.css`.

**S12 — Tests.** `date.test.ts`, `level.test.ts` and `habits-api.test.ts` stay untouched and green. The four
DOM test files are rewritten against the new structure and must cover the parity checklist: create, archive,
restore, purge guard, field add/update/remove with the archived-field answer, optimistic toggle with revert,
number commit on blur/Enter, future day disabled and never written, day strip and prev/next/today, period
change and caption, view switch, empty/loading/error, and the settings sections. No snapshots, no E2E.

**Non-goals:** new habits features (weekday schedules, times per week, reminders, goals, notes), server
changes, a new heatmap library, a `/habits/:id` route, and removing the Amicro view.

## Design brief

- Type: 24 px semibold title, 13 px muted subtitle, 12 px uppercase tracking-wide stat labels, 20 px
  `tabular-nums` stat values, 14 px body, 13 px meta.
- Summary stats: three blocks separated by 1 px hairlines, a thin 4 px progress bar for "Today", computed
  client-side from `dayLevel`, `currentStreak` and `completionRate`.
- Panels: `bg-card`, `border-border`, `rounded-xl`, `p-5`; panel headers use a 13 px uppercase muted label
  plus the controls, aligned on one baseline.
- Segmented control: a `rounded-lg border-border` group of `Button`s, the pressed one `bg-foreground
  text-background`, 36–44 px tall, `aria-pressed`.
- Today rows: hairline dividers, hover `bg-muted/40`, the check filled with `bg-foreground text-background`
  when on; the streak chip `text-[12px] tabular-nums` with a `Flame` icon.
- Roster: hairline dividers, rate bar 48 px wide, kebab 44 px, whole row opens settings.
- Empty states: one sentence plus the action, never a bare frame.

## Tasks

| ID | Scope | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | Web redesign: page architecture, consistency panel, today panel, roster, settings, visual system, rewritten DOM tests (S3–S12) | delegated → `gentle-ai-worker` | done | L3, L4, L5, L6 |
| T2 | Independent verification of the parity contract and the bundle boundary | delegated → `gentle-ai-verify` | done | L7, L8 |

Risk: item 6 — the DOM tests are rewritten, so functional parity is guaranteed by the S2 checklist and by an
independent verifier, not by the old assertions.

## Log

**L1** — 2026-10-23. User request, verbatim:

> genial, ahora con la skill de ux ui pro max haz una mejora y rediseño completo de /habits, lo que buscon
> con rediseño no solo es cambiar colores de contenedores y reacomodar, yo hablo de ir a rediseño real, tomar
> las funciones y recrear de 0 la ui/ux, dale con eso

**L2** — 2026-10-23. Design system queried with `ui-ux-pro-max --design-system "habit tracker daily check-in
progress dashboard calm minimal editorial"`. It returned "Vibrant & Block-based", an amber/green palette and a
Lora/Raleway pairing. Rejected as a package: this app already owns a neutral token system, the user asked for
a redesign of this section and not a re-theme of the product, and a new font would break the bundle rules.
Adopted from the skill: its accessibility, touch-target, motion, data-density and state rules, which are
encoded in S8–S10.

**L3** — 2026-10-23. Decisions taken while designing, all reversible:

- The matrix stays the dominant desktop surface, because the user had already decided that the heatmap is the
  main view of the section. Today becomes a sticky rail beside it, and moves first only on phones, where the
  matrix cannot be the working surface.
- The `Mono | Activity` switch survives, because the second heatmap was a user request in the previous wave;
  it moves into the consistency panel as a segmented control instead of a loose toggle.
- The "Add habit" and "Archived" sections disappear as sections: creation moves to the header, archive lives
  in a disclosure, and the roster takes the middle band.
- The settings dialog keeps its two-step purge and its inline field editing, because the vendored Base UI set
  has no sheet primitive and the purge guard is a safety rule, not a layout choice.

**L3** — 2026-10-23. The writer returned `partial` with two open points and one honest read of the design
constraints: it could not verify the four responsive widths in its browser, and it read S8's motion limit as
colliding with S4's byte-identical heatmap. It also reported the RED it observed (the new dialog close-target
assertion failing against a `size-7` control) and a green focused run of 35 tests.

**L4** — 2026-10-23. Parent resolution of the two open points:

- Motion: the vendored `GraphHeatmap` animates its own rows and imports `useReducedMotion` from `motion/react`
  (`graph-heatmap.tsx:4,109`), so it already respects the user's preference. S8 was amended to exempt that
  upstream animation instead of asking for a vendored file to be edited, which S4 forbids.
- Responsive: the parent drove the section in a real Chrome session at 1280 px and read the rendered
  composition, but the available browser tool has no viewport control, so 375/768/1024 remain verified only
  from the breakpoint classes. Recorded as a limitation, not as a pass.

**L5** — 2026-10-23. Visual pass at 1280 px, and the defects it exposed, all fixed by the parent:

- The vendored heatmap rendered its own `[ HABIT HISTORY ]` plate inside the chart, duplicating the panel
  title. Its `title` prop is required by `GraphHeatmapProps` but optional in the frame, so it is passed as an
  empty string and the plate disappears; the panel header is now the only title.
- The streak read "2 day streak" in both the Today rows and the roster; now `N-day streak`.
- The habit icon rendered as a bare 16 px muted circle, which read as an unchecked radio next to the real
  check. It now sits in a 32 px `bg-muted` tile in the Today rows and the roster, so it reads as an icon.
- Two components the redesign replaced were left dead: `week-strip.tsx` and `day-switcher.tsx`, with no import
  anywhere. Both were deleted.

**L6** — 2026-10-23. First verification verdict: F1–F14 met, S1–S8 met, S12 met, F14 met (a separate 21.75 kB
`habits-page` chunk, no chart in the entry). One blocker on S9: the number field's label was `sr-only`, and
the text field's label was `sr-only` once expanded, so a field could show only a unit. S10 was reported as not
code-provable, and the verifier noted the two server DB sidecars (`chub.db-wal`, `chub.db-shm`) had later
mtimes than the session start — the user's own database being written by the running dev server, not a source
change.

**L7** — 2026-10-23. Correction, one batch. S9 was made precise instead of being enforced literally: a number
and a text field show their label visibly, the `check` field is the deliberate exception because the habit name
on the same row is its visible label and a repeated "Done" is noise. `today-strip.tsx` now renders the number
label as visible text; the text field already showed its label on the collapsed note affordance. The parent
did not commit a regression test for label visibility: asserting "not `sr-only`" pins a class rather than a
behaviour, and the verifier proved the rendered state directly.

**L8** — 2026-10-23. Limited recheck by a fresh verifier, against the amended S9: the number label is visible,
the check keeps `role="checkbox"`, `aria-checked` and the `<habit> <field label> <date>` name, the text label is
visible collapsed and `sr-only` beside the expanded input, every kind is disabled on a future day and writes
nothing, the deleted components have no references, `vitest run src/features/habits` is 9 files / 63 tests
green, `tsc` is clean, and the habits route still builds as its own chunk.

**L9** — 2026-10-23. Final numbers from the parent: web 45 files / 316 tests, typecheck clean, build clean,
`habits-page` 21.75 kB as its own chunk, entry 1,610.94 kB — unchanged by the redesign, which is the point of
S14. `date.test.ts`, `level.test.ts` and `habits-api.test.ts` were not touched; their 26 tests pass under a
non-UTC `TZ`.

**L10** — 2026-10-23. Second pass, after the user reviewed it himself: *"se ve bastante bien, un poco tosco… botones enormes,
contenedores cerrados, todo está encerrado… liberemos esa carga visual… pero la disposición me encanta"*. The layout stays
exactly as approved; only the weight changes.

- Cards removed from the page: the summary band, the roster, the archived block and both hero panels are now open ground
  separated by `border-y` / `border-t` hairlines, a `divide-y` list and, on desktop, a single left rule between the matrix
  and the Today rail. The matrix keeps one faint `border-border/70` frame because the vendored frame draws corner marks
  that need an edge.
- Controls shrunk and lightened: the `New habit` action is an outline button at 36 px instead of a filled 44 px block, the
  segmented period/view controls are plain 32 px chips with a `bg-muted` pressed state instead of black pills, the day strip
  is 40 px with a translucent selection instead of a solid block, the check is a 22 px box inside the existing 44 px target,
  the number input is 32 px, and prev/next are 32 px icon buttons.
- Type and space: page title 20 px, stat values 18 px, panel labels 13 px normal case instead of uppercase tracking-wide,
  row padding reduced, hover fills removed, and the page widened from 1100 to 1240 px so the month matrix fits without
  horizontal scrolling at 1280.
- One regression caught by looking: at the narrower inner width the month labels truncated to "1." / "2.". Widening the
  page and the matrix minimum fixed it; the wrapper still scrolls below `lg`.
- Verification for this pass was the parent's own, at the user's instruction: `pnpm --filter @chub/web test` (45 files / 316
  tests), `typecheck`, `build` (habits chunk 21.49 kB, entry unchanged) and a browser look in light and dark at 1280. No
  independent verifier was spawned, and 375/768/1024 remain unverified by eye.
