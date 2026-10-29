# Habits: a check with optional fields, and a heatmap-first surface

Status: in progress. Feature document for the Habits wave: a habit is a check plus optional typed fields, its history
survives archiving, and the section opens on a monochrome heatmap matrix. Subagents read this file in order and stop
before `## Log`.

## Specs

**S1 — Archive, never delete from one click.** The user's words: "poder crear y/o archivar habitos, no eliminar de una,
igual que las notas". A rule: archiving sets `habits.archived_at`, the habit leaves "Today" and the matrix, and every
entry it ever recorded is kept and comes back on restore. Permanent deletion exists but is a separate, deliberate step:
`DELETE /api/habits/:id/purge` refuses a habit that is not archived (`habit_not_archived`), the archived view asks for
confirmation, and the purge removes the habit's fields and entries with it. Nothing in the UI deletes a habit in one
click.

**S2 — Beautiful with what is already here.** The user's words: "que sea lindo, que usemos lo que tenemos de estilos".
A rule: no new npm dependency. The section uses `page-column`, the CSS variables in `web/src/styles/tokens.css`,
`Button`/`Select`/`Menu` from `web/src/components/ui`, `lucide-react` icons, Magic UI's `BlurFade` and `NumberTicker`,
`motion/react` for the day dialog and the check transition, and `cn` from `@/lib/utils`. Light and dark mode both come
from the existing tokens, with no per-component color.

**S3 — A check first, extra fields when the user asks for them.** The user's words: "que principalmente sean un check,
pero poder agregar campos de texto/numericos como para poder registrar por ejmplo tiempos, paginas, hacer comentarios,
ese tipo de cosas", decided as "Varios campos (check + N extra)". A rule: one uniform model — a habit owns an ordered
list of fields, each `check`, `number` or `text`. Creating a habit creates its first field (`check`, label "Done"), so a
habit that only tracks a number is the same model with one field, not a special case. A `number` field carries a unit
and a target ("30 min", "12 pages"). A field that already has entries is archived instead of deleted, and the response
says which of the two happened.

**S4 — The heatmap is the main view, and it is read-only.** The user's words: "tener un heatmap relacionado con los
habitos y de hecho tiene que ser como la vista principal de los habitos", plus "el heatmap es solo visualizacion no lo
voy a usar para meter los habitos, el registro es en otro lado". A rule: `/habits` opens on the matrix, and no cell is
interactive — the vendored `graph-heatmap.tsx` stays byte-identical to upstream, with no injected click prop. Entries are
created in the "Today" strip and in the habit detail's day dialog, and those are the only two places.

**S5 — The heatmap is MDXCN's `GraphHeatmap`, vendored as a source file.** The user's words: "quiero que el heatmap sea
de https://www.mdxcn.dev/docs/graph-heatmap", chosen as "Glifos MDXCN (como el doc que pasaste)". A rule: vendor
`graph-heatmap.tsx` from `https://mdxcn.dev/r/graph-heatmap.json` (fetch with `curl -sSL`; the host answers on
`mdxcn.dev` and `www.mdxcn.dev`) and keep it byte-identical to upstream except the two documented import substitutions
`@/registry/default/graph-frame/graph-frame` → `@/components/mdxcn/graph-frame/graph-frame` and the same for
`graph-motion`, which is exactly what the already-vendored `graph-frame` trio does. Its only dependency is `motion`,
already declared; no npm dependency is added. Rows are habits and columns are days from the period selector ("Selector
con presets Mes / Trimestre / Año").

**S6 — Monochrome, on a ramp the tokens actually define.** The user's choice: "Monocromo con los tokens actuales". A
rule: the cell level is `0..4` and `intensityClass(level, "mono")` maps it to `text-graph-frame` (0), `text-graph-muted`
(1-2), `text-foreground` (3) and `text-graph-accent` (4), while `intensityGlyph` walks the `shade` set `· ░ ▒ ▓ █`. Those
classes need theme tokens that this repository does not define anywhere today, so `--graph-frame`, `--graph-muted` and
`--graph-accent` are defined in `tokens.css` and exposed in the `@theme inline` block of `index.css`, mapped onto the
existing monochrome values as one strictly increasing ramp in both themes: `--graph-frame: var(--border)`,
`--graph-muted: var(--muted-foreground)`, `--graph-accent: #111110` in light and `#ffffff` in dark. `--graph-accent-2`
and `--graph-accent-3` are deliberately not defined, because only `palette="mono"` is used. Level 0 must stay lighter
than level 4 in both themes, and a token test asserts the four values and that ordering.

**S7 — Daily only, in v1.** The user's words: "solo diarios y agregrando algo". A rule: every habit is daily in v1, so
every past day is either done or missed and a streak means a run of consecutive days. No weekday selection and no
times-per-week target ships in this wave; the period selector and the level rule are the only date logic.

**S8 — The day key is a local calendar date.** A rule: a day is the string `YYYY-MM-DD` produced by the browser from the
user's local calendar and sent as such; the server validates the format and that the date exists in the calendar, then
stores the string unchanged and never converts it to or from an instant. `toISOString().slice(0, 10)` is forbidden
anywhere in this feature, because it shifts the day for any user east or west of UTC. Future days are empty and are
never written.

**S9 — Nothing that works today breaks.** A rule: the existing suite keeps passing, the notes module keeps every
behaviour it has, and the matrix does not join the entry chunk — the first importer is the habits route, and no TanStack
chart is used (importing `ui-kit`'s `MiniChart` would pull `@tanstack/charts` into the entry chunk).

**S10 — Data model.** Three tables in `0002_habits.sql`, plus their Drizzle definitions in `server/src/db/schema.ts`:

- `habits(id text pk, name text not null default '', icon text, position integer not null, created_at text not null,
  updated_at text not null, archived_at text)`, index on `archived_at`.
- `habit_fields(id text pk, habit_id text not null references habits(id), kind text not null, label text not null
  default '', unit text, target real, position integer not null, archived_at text, created_at text not null, updated_at
  text not null)`, index on `(habit_id, position)`.
- `habit_entries(habit_id text not null references habits(id), field_id text not null references habit_fields(id),
  date text not null, value_num real, value_text text, created_at text not null, updated_at text not null, primary key
  (habit_id, field_id, date))`, index on `(habit_id, date)`.

The composite primary key makes the upsert idempotent, so one day holds at most one value per field. A `check` stores
`value_num = 1`; `number` stores `value_num`; `text` stores `value_text`. Unchecking deletes the row, so absence means
"no record" and never a stored false. The migration follows the existing hand-written shape: the SQL file plus its entry
in `server/drizzle/meta/_journal.json` with `idx: 2`, and `server/test/migrations.test.ts` moves its `user_version`
expectations from 2 to 3 and gains a case that seeds `0000` + `0001` (a page carrying an icon) and proves the upgrade
keeps the row and the icon.

**S11 — API contract.** Hono routes in `server/src/habits/repository.ts` and `server/src/routes/habits.ts`, mounted with
`.route("/api", createHabitsRoutes())` in `server/src/app.ts`. Errors follow the pages convention: an `HabitError` class
carrying a code, `invalid_json`/`invalid_body` on 400, `habit_not_found`/`field_not_found` on 404.

- `GET /api/habits` → `{ habits: Habit[] }`, active only; `GET /api/habits?archived=1` → archived only.
- `GET /api/habits/entries?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ entries: HabitEntry[] }` for every habit in the range.
  **Registered before `/habits/:id`**, or Hono matches `:id = "entries"` (the same trap `pages.ts` avoids by listing
  `/pages/tree` first).
- `POST /api/habits` `{ name?, icon?, position? }` → 201 `Habit`, creating the habit and its first `check` field in one
  transaction.
- `GET /api/habits/:id` → 200 `Habit`; `PATCH /api/habits/:id` `{ name?, icon?, archived? }` → 200 `Habit`, where
  `archived: true` sets `archived_at` and `false` clears it.
- `DELETE /api/habits/:id/purge` → 200 `{ purged: string[] }`, and 400 `habit_not_archived` unless it is archived.
- `POST /api/habits/:id/fields` `{ kind, label?, unit?, target?, position? }` → 201 `Habit`.
- `PATCH /api/habits/:id/fields/:fieldId` `{ label?, unit?, target?, position? }` → 200 `Habit`.
- `DELETE /api/habits/:id/fields/:fieldId` → 200 `{ habit: Habit, field: "deleted" | "archived" }`.
- `PUT /api/habits/:id/entries/:date` `{ values: Array<{ fieldId, value }> }` → 200 `{ entries: HabitEntry[] }` for that
  habit and date, in one transaction. `value: null` deletes that field's row; `check` takes a boolean, `number` a finite
  number, `text` a string, and anything else is 400 `invalid_value`.

`Habit` is `{ id, name, icon, position, archivedAt, createdAt, updatedAt, fields: HabitField[] }`, and `HabitEntry` is
`{ habitId, fieldId, date, kind, value }` with `value` already typed per kind, so the client never reads `value_num` or
`value_text`. The server derives nothing: no level, no streak, no aggregate.

**S12 — Level and streak are one pure function each, on the client.** `web/src/features/habits/level.ts` exports
`dayLevel(habit, entries)` and `streak(habit, entriesByDay, today)`, both covered by their own tests, and both are the
only definition used by the matrix, the detail view and the stats.

- Trackable fields are `check` and `number`. `text` fields are notes and never count toward completion, because a habit
  with an optional comment could otherwise never be complete.
- A field is satisfied when a `check` is true, or a `number` is recorded and `value >= target`, or `value > 0` when the
  field has no target.
- `dayLevel` is `0` with no trackable field satisfied, else `round(satisfied / trackable * 4)` clamped to `1..4`, so a
  check-only habit is binary and a two-field habit has the levels `1, 2, 3, 4`. A habit with no trackable field falls
  back to "has any entry" for the day.
- `streak` walks consecutive days ending at `today` and counts the days whose level is greater than 0; an incomplete
  `today` does not break the run, and the longest streak is the maximum such run over the fetched range.

**S13 — The surfaces.** `/habits` is registered inside `AppShell` and the shell's breadcrumb names it "Habits".

- `/habits`: the header with "New habit", the **Today** strip (the only entry surface), the `GraphHeatmap` matrix, and
  the archived view behind a toggle. The matrix passes `max={4}`, `glyphs="shade"`, `palette="mono"`, rows are active
  habits in `position` order, and the columns come from the period selector: **Mes** is one column per day of the
  selected month with the daily level, **Trimestre** is 13 columns and **Año** is 52 columns, both with the average
  level of the week, rounded. A year in a single row is unreadable — 365 columns of `minmax(0,1fr)` leave about 2.4px
  per column while a `1ch` glyph is about 7px — which is why the selector exists at all.
- `/habits/:id`: the habit's own heatmap, the stats (current streak, best streak, 30-day rate, total), the field editor,
  the day history and the archive action.
- The day dialog opens from a history row and edits one past date through the same `PUT` endpoint. No new route.

**S14 — The interactive surfaces are presentational components with fixed contracts.** A rule: the habit UI splits
into components that take data as props and report intent through callbacks, so the data-fetching page is written once
and the pieces stay testable without a server. Both keep the S2 vocabulary — `Button`, `Select`, `Menu` from
`web/src/components/ui`, `Motion`'s `motion/react` for state transitions, `lucide-react` icons, the token variables
and `cn`.

- **Today strip** (`today-strip.tsx`), the only place an entry is created: `{ habits, entries, day, onSetValues }`,
  where `habits` are active habits in `position` order, `entries` are every entry of `day` and `onSetValues(habitId,
  values)` returns a promise that rejects on failure. One row per habit: a `check` renders as a native `<button
  role="checkbox" aria-checked>` — never a new checkbox dependency — that toggles optimistically and reverts with a
  visible `role="alert"` message when the promise rejects; a `number` renders a borderless input with the unit and a
  muted `value / target` hint; a `text` renders a note input. Numeric and text fields commit **on blur or Enter**, never
  per keystroke, so no timer is involved and the behaviour is deterministic in tests.
- **Matrix** (`habit-matrix.tsx`): `{ habits, entries, period, anchor, onPeriodChange, onAnchorChange }`, where
  `period` is `"month" | "quarter" | "year"` and `anchor` is any day inside the current window. It derives its columns
  from `date.ts` and its cell values from `level.ts`, so it owns no calendar arithmetic of its own: a month renders one
  column per day with that day's level, a quarter renders 13 columns and a year 52, both with the rounded average level
  of each week. It renders the vendored `GraphHeatmap` with `max={4}`, `glyphs="shade"` and `palette="mono"`, a `Select`
  for the period, two ghost icon buttons for the previous and next window, and a caption naming the window. A week label
  is drawn only for the week containing the first of a month; the rest are empty so the year's 52 columns stay legible.
  With no active habit it renders `EmptyState` instead of an empty frame.
- The page that fetches data, registers `/habits` and wires these two together belongs to T7 and is written by the
  parent, once, against exactly these props.

**S15 — The habit editor is an inline panel, never a modal.** A rule: `habit-editor.tsx` renders a habit's own settings —
its name and its ordered fields — inline in the page, in a `section` that appears when the user opens a habit. Only Base
UI's `button`, `menu` and `select` are vendored in this repository, so the editor stays inline instead of dragging in a
dialog primitive. Props: `{ habit, onRename(name), onAddField(input), onUpdateField(fieldId, patch),
 onRemoveField(fieldId), onArchive(), onClose() }`, every callback returning a promise that rejects with an `ApiError` on
failure.

- The name is an input committing on blur or Enter, exactly like the Today strip's fields.
- Each field row shows its kind — and the kind is **not** editable after creation, because S10 stores values per kind —
  beside its label, unit and target, with actions to change the label, unit and target, and to remove the field.
- Adding a field chooses `check`, `number` or `text`; a `number` may carry a unit and a target.
- A rejected promise shows a `role="alert"` message and leaves the form usable: a failed write never looks successful.
- Copy is English, like the rest of the app.

## Tasks

- **T0** — Define `--graph-frame`/`--graph-muted`/`--graph-accent` and vendor `graph-heatmap.tsx` with its focused tests.
  — S5, S6 — parent (inline) — `web/src/styles/tokens.css`, `web/src/styles/tokens.test.ts`, `web/src/index.css`,
  `web/src/components/mdxcn/graph-heatmap.tsx`, `web/src/components/mdxcn/graph-heatmap.test.tsx` — done, uncommitted
- **T1** — `0002_habits.sql`, Drizzle definitions, habits repository and tests. — S1, S3, S10 — worker, then parent —
  `server/drizzle/**`, `server/src/db/schema.ts`, `server/src/habits/**`, `server/test/habits.test.ts`,
  `server/test/migrations.test.ts` — done, `Risk: item 1`, independently verified, uncommitted
- **T2** — Hono routes for the S11 contract plus tests. — S11 — parent — `server/src/routes/habits.ts`,
  `server/src/routes/icon.ts`, `server/src/routes/pages.ts`, `server/src/app.ts`, `server/test/habits-routes.test.ts` —
  done, uncommitted
- **T2** — Hono routes for the S11 contract plus tests. — S11 — parent
- **T3** — Web API client and the local-date helpers. — S8, S11 — parent
- **T4** — Habit CRUD and the field editor. — S2, S3 — parent
- **T5** — The Today strip. — S3, S4 — parent
- **T6** — The matrix with the period selector. — S4, S5, S6, S12, S13 — parent
- **T7** — The `/habits` page: data fetching, composition of the Today strip and the matrix, habit creation, rename,
  archive, restore and the deliberate two-step permanent delete. — S2, S3, S4, S13, S14 — parent —
  `web/src/features/habits/habits-page.tsx` — uncommitted
- **T8** — The archived view, the `sections.ts` entry, the breadcrumb and the docs. — S1, S2, S9, S13 — parent
- **T9** — The inline habit editor. — S3, S14, S15 — worker — `web/src/features/habits/habit-editor.tsx`,
  `web/src/features/habits/habit-editor.test.tsx` — uncommitted

## Log

- **L1** (user, verbatim): "Ahora planeemos la parte de habitos, mi idea es simple pero quiero algo bien armado
  1. poder crear y/o archivar habitos, no eliminar de una, igual que las notas
  2. que sea lindo, que usemos lo que tenemos de estilos
  3. que principalmente sean un check, pero poder agregar campos de texto/numericos como para poder registrar por
  ejmplo tiempos, paginas, hacer comentarios, ese tipo de cosas
  4. tener un heatmap relacionado con los habitos y de hecho tiene que ser como la vista principal de los habitos
  es mi idea, pero analizala y dime que propones que te gusta que no o que agregarias, primero planear y luego te doy luz
  verde para implementar hasta que me guste"
- **L2** (user, decisions on the four planning questions, S3/S6/S7): fields "Varios campos (check + N extra)", heatmap
  intensity "Ratio de campos completados (0-4)", color "Monocromo con los tokens actuales", and for frequency: "solo
  diarios y agregrando algo, quiero que el heatmap sea de https://www.mdxcn.dev/docs/graph-heatmap".
- **L3** (user, decisions on the three questions the component itself opened, S4/S5/S13): look "Glifos MDXCN (como el doc
  que pasaste)", entry surface "el heatmap es solo visualizacion no lo voy a usar para meter los habitos, el registro es
  en otro lado", granularity "Selector con presets Mes / Trimestre / Año".
- **L4** (evidence, MDXCN registry and the token gap, S5/S6): `https://mdxcn.dev/r/graph-heatmap.json` answers only after
  following a redirect; it ships four files, declares `dependencies: ["motion"]` and no `registryDependencies`, and the
  three `graph-frame` files are already vendored in this repository and byte-identical to the registry except the
  documented import substitution, so `graph-heatmap.tsx` (5,109 bytes) is the only missing file. Its cells are
  `<span aria-hidden>` with no click handler, and its docs document none, which is why S4 forbids injecting one. A grep
  for `--color-graph-muted` and `--graph-accent` over `web/src` and over the imported `shadcn`/`tw-animate-css` CSS
  returns nothing, so the three tokens are undefined today: without them the matrix would render one flat colour, and the
  already-vendored `web/src/components/mdxcn/callout.tsx` carries `text-graph-muted`/`text-graph-accent` classes that
  currently generate no CSS at all. T0 therefore fixes a pre-existing defect in shared CSS, and its check compares the
  Callout's rendered classes before and after.
- **L5** (user, verbatim): "Dale" — the green light for this document and for T0 and T1.
- **L6** (evidence, T0, S5/S6): the vendored `graph-heatmap.tsx` is 5,109 bytes and its diff against the registry is
exactly the two documented import substitutions. The theme has **three** declaration paths — `:root`, `.dark`, and
`@media (prefers-color-scheme: dark) :root:not(.light)` — so the three tokens had to land in all three; a system dark
preference would otherwise have rendered one flat colour. The MDXCN frame also paints its title with
`graph-title-ink text-graph-accent`, so the frame title depended on the missing token too. RED: three failures reading
"`--graph-frame` is not declared in tokens.css", with the two pre-existing code-block assertions green. GREEN:
`tokens.test.ts` 5/5 (they resolve one `var()` hop and assert the luminance ordering, not just the strings),
`graph-heatmap.test.tsx` 3/3, the whole web suite 29 files / 219 tests passed, `tsc --noEmit` clean, `vite build` clean,
and `web/dist/assets/index-*.css` contains `.text-graph-frame{color:var(--graph-frame)}`,
`.text-graph-muted{color:var(--graph-muted)}`, `.text-graph-accent{color:var(--graph-accent)}` and the resolved
`#111110`. The vendored component is imported by nothing but its own test and the built entry contains zero
occurrences of `GraphHeatmap`, so T0 cannot have moved the JavaScript bundle; the entry chunk measures 1,587.49 kB
against the ~1.44 MB `AGENTS.md` documents, and that drift belongs to the uncommitted waves rather than to this task.
- **L7** (decision, process): the harness refused the worker hand-off for T0 and T1 because the task text lacked the
literal `Spec:` reference and instructed inline execution, so T0 was written by the parent; T1 was relaunched with
`Spec: odd/tasks/habits.md, T1, S1, S3, S10` and runs as a worker. Separately, `AGENTS.md` says nothing is committed
unless the user asks, so this wave leaves every work unit in the working tree; "own commit" in an earlier version of
the task list was wrong and the user decides when to commit.
- **L8** (evidence, T3 and the S12 functions, S8/S11/S12): `web/src/features/habits/date.ts` and `habits-api.ts` landed
with 15 tests. RED was observed (the modules did not exist yet), and the first green attempt surfaced one real defect in
the tests themselves: the S8 source assertion for the forbidden UTC conversion matched the phrase inside `date.ts`'s own
explanation comment, so the test now strips comments first and checks both feature files. The local-day helpers do their
calendar arithmetic at local noon, because a daylight-saving transition can make local midnight not exist at all, and
`dayKeysBetween` relies on the fixed-width key format comparing as calendar order. `tsc --noEmit` exits 0 for the package
while the LSP still reported a stale `2307 cannot find module` for the two new test files, so the compiler is the
authority here and the LSP finding was not acted on. The whole web suite reads 31 files / 234 tests. `level.ts` then
landed with its 10 tests as the single S12 definition of a day's level, the current and longest streak and the completion
rate. It was written implementation-first, so instead of claiming a RED run that never happened the rules were pinned by
a mutation check: making `text` fields trackable and removing the unfinished-today exception failed exactly the four
tests that cover those rules, and the restore was verified byte-identical with a green rerun afterwards. Because the
habit list endpoints do not exist yet, `level.ts` and the client are the last pieces that could be finished without the
server, and T2 waits for the T1 worker to return its repository.
- **L9** (evidence, T1 and T2, S1/S8/S10/S11): the worker's T1 unit arrived with 15 tests, and the independent verifier
ran `pnpm --filter @chub/server test` and `pnpm --filter @chub/server typecheck` inside an isolated copy of the workspace
(exit 0, 10 files / 102 tests) and confirmed the three tables and composite key, the additive migration, the
`habit_not_archived` purge guard, the field archive-versus-delete rule, the cross-habit refusal and the value-type
validation by reading `repository.ts` and the tests. It stated plainly that it ran no probes of its own, so its verdict
is a read of the implementation plus the author's tests rather than independent falsification. The parent's own read then
found two defects the worker had not reported, and both were fixed inside T1: the future-day guard compared the day
against the **server's** calendar, which would reject a legitimate today for a browser east of the server's timezone
(now a one-day tolerance, pinned by a fake-clock test that also proves a day beyond it is still refused), and the entry
read loaded every row and then queried the field table once per row (now one joined query with the range in SQL). T2's 9
route tests were written first and failed as expected — eight 404s from an unmounted router — and the first green attempt
surfaced three defects of the parent's own: the routes were never mounted in `app.ts`, one assertion compared JSON text
against an asymmetric matcher, and another read the response body before cloning it. The pages icon validator moved to
`server/src/routes/icon.ts` so both surfaces share one rule; the differential check is `page-icons.test.ts` (13 tests)
plus the whole suite, which reads 11 files / 111 tests with `tsc --noEmit` exit 0 and exactly one definition of
`isValidIcon` left in the tree.
- **L10** (evidence, T5 and T6, S2/S4/S6/S13/S14): both UI units arrived with seven tests each and their own RED runs. The
parent's review then corrected five defects the workers' reports did not mention. On the Today strip: an unticked box
rendered a **faint checkmark** (opacity 0.45), which reads as a half-done day, and now stays empty; the check's
accessible name was the habit name alone, which collides as soon as a habit has two tickable fields, and now carries the
field label; and a refreshed `entries` payload reset every draft, so typing a note was wiped by a check-in in another
row, which is now guarded by the focused field. On the matrix: the copy was **Spanish** (`Mes`, `Año`, `Anterior`) while
the whole app and `AGENTS.md` are English; the year and quarter windows were calendar periods, so the year view spent
half its columns on days that had not happened yet, and they are now the trailing 13 and 52 weeks ending with the
anchor's own week; and the weekly average divided by all seven days of a week in progress, punishing the most visible
column of the view, so it now averages only the days that have already elapsed. A test discriminates the two behaviours
directly: two completed days of a three-day-old week read as `▓`, and the same two days at the end of the week read as
`░`. Nothing is interactive inside the heatmap, as S4 requires. Whole web suite: 34 files / 259 tests with `tsc --noEmit`
exit 0.
- **L11** (evidence, the browser pass, S13/S14): the pass ran against the `pnpm dev` the user already had running, on their own database,
with three seeded habits and 87 entries across 24 days and the tree purged afterwards — zero habits, zero
entries, and the two pages the user keeps (`Hoja 3.123`, `Nota 1.0`) untouched. It found three integration defects
that every green suite above had missed, because no unit test could see them: (1) the page asked the API for the whole
current month, **future days included**, so the server's date guard refused the entire load with `invalid_date` and the
surface rendered an empty state as if the user had no habits at all; the range is now clamped to today and a test pins
that no requested day is in the future — the page test's stub had never validated the range, which is exactly why the
suite stayed green; (2) a month's day labels truncated to `1..` and `2..`, because 31 columns inside the 708px notes
column leave each about 12.5px while a two-digit label needs more, so the habits surface is now a dashboard container
(`max-w-[1100px]`, columns at 23.5px) and only the 1st and every fifth day are named; (3) the vendored intensity legend
paints as a single blob because it pins every glyph to `1ch`, which the shade blocks are wider than, and since the
vendored file must stay byte-identical the matrix switches its legend off and draws its own key from the component's
own `intensityClass` and `intensityGlyph` helpers. One measurement lesson is worth keeping: `scrollWidth >
clientWidth` does **not** detect a `text-overflow: ellipsis` truncation — it reported “no overflow” while the label was
visibly `1..` — so the honest probe is comparing `Range.getBoundingClientRect().width` against the element's own box,
which is what finally cleared the labels. Final state: web 36 files / 276 tests and `tsc --noEmit` exit 0; the production
build puts the section in its own 56.9 kB chunk (19 kB gzip) with the entry carrying only about 5.7 kB of new route
wiring; and the browser shows the month view with three habits, a checked `45 / 45 min`, and the intensity key.

- **L (fix, check-in panel, 2026-10-19)**: The check-in surface became one panel for both sections: the week
  grid on top and the detail of the selected day below it, with a day switcher between them. A day that has not
  happened yet is reachable (the switcher stops at tomorrow) but every control on it is read-only, and the
  write path itself refuses a future date. The panel lives in `web/src/features/habits/check-in-panel.tsx` and
  both `/habits` and `/books` use it, so the habits and the reading log behave the same way.
- **L (evidence, the future day)**: The server's one-day tolerance (`clientDayTolerance` in
  `server/src/habits/repository.ts`) exists because a browser east of the server's timezone is legitimately a
  day ahead of it, and refusing that day would drop a real today. The server cannot know the client's local
  calendar, so the "no future days" rule is enforced where the local calendar IS known: the client disables
  every control on a future day and the panel's write wrapper rejects the write outright.
- **L (fix, 2026-10-19)**: The `/habits` route was mistakenly nested inside the `<Route element={<AppShell />}>` group, so habits rendered the notes sidebar, page tree, toolbar (Undo/Redo, PageMenu) and breadcrumb chrome. Moved it to a top-level route (sibling of `/`) in `web/src/App.tsx`, and gave `HabitsPage` its own `ThemeToggle` + Home link so it stands as a separate surface. `habits-page.test.tsx` now wraps in `ThemeProvider` + `MemoryRouter`. Pinned memory #3390 records the rule: every new section (books, tasks, …) must be a standalone route outside the notes shell, registered in `sections.ts`, lazy-loaded at the top level, never a child of `<AppShell />`.
