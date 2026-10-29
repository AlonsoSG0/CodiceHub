# Tasks & Goals — one direction, two designers

Objective: redesign `/tasks` and `/goals` under the approved light direction **without reusing the habits/books page
skeleton**. The user set it up as a comparison: the orchestrator designs `/tasks`, a delegated worker designs
`/goals` blind, and the user judges the results. Branch: none — uncommitted tree. No commits. Reviews are off
clone-local; verification is scoped (the change's own tests, typecheck, build and a visual pass).

## The direction (pinned memory #3555)

Open ground, hairlines over boxes, compact controls, quiet type scale, one enclosure where it earns it, colour and
opacity transitions only, tokens only. **Explicitly not a template:** the habits and books pages share a stat band +
wide hero + 340 px rail; both new sections must find their own composition.

## /tasks — orchestrator

**Concept: a single sheet.** Tasks are a list you read top to bottom, not a dashboard. The page is a narrow document
column (760 px) with exactly one bordered element — the capture bar — and groups rendered as sections in a flow, each
with its own hairline header.

```
        ⌂  Tasks                                    2 groups · 4 open
┌──────────────────────────────────────────────────────────────┐
│ What needs doing?                        [ Errands ▾ ]  [+]  │   ← sticky, the only box
└──────────────────────────────────────────────────────────────┘

  Errands   3 open                                        [+] [⋯]
  ───────────────────────────────────────────────────────────────
  ○  Buy coffee beans
  ○  Call the dentist
  ○  Return the parcel

  Work   1 open                                           [+] [⋯]
  ───────────────────────────────────────────────────────────────
  ●  Send the invoice          (struck through)
  ○  Review the PR

  ───────────────────────────────────────────────────────────────
  + New group
```

Why this and not the hero layout: the frequency is one keystroke and the reading order is the order of work. The
capture bar is sticky and carries the destination group, so adding never requires opening a group; the `+` in a group
header opens a contextual composer when you are already down there; the group composer is a disclosure, not a
permanently visible input row, which keeps the sheet quiet.

Parity: groups list, create/rename/delete with confirmation, per-check toggle with optimistic revert and the error
line, delete check, add check to a named group, append order, summary count, loading/empty/error states, the API
contract untouched.

**Added after the first pass (2026-10-24): a Today view, a debt view and retention.**

- **Today is a view, not a storage group.** A check keeps its named group; the Today tab aggregates every check whose
  `createdAt` falls on the local today or yesterday and shows the group name as a muted tag on the row. No schema
  change, no synthetic group, no extra fetch.
- **Older is the debt view.** Everything older than yesterday sits behind `Show older (N)`, grouped by day, and the
  default filter is **Pending** — that is the user's "tareas del periodo que no se cerraron". `All` shows the closed
  ones too.
- **Retention is opt-in and runs on open.** `localStorage` holds `{ days: null | 7 | 15 | 30, scope: "completed" | "all" }`,
  defaulting to Never so nothing is deleted unasked. When a window is set, the page prunes once per mount before
  loading and reports what it removed. `Completed only` is the default scope because it is the one that keeps the
  unclosed work visible; a group left with no checks is deleted with its last check.
- **Server:** `POST /api/checklists/prune { olderThanDays, scope }` → `{ deletedItems, deletedGroups }`, one
  transaction, `invalid_retention` / `invalid_scope` on 400, groups with no checks removed after the item delete.
- Tests: `server/test/checklists-routes.test.ts` gained two cases (scope behaviour, empty-group removal, idempotence,
  and every validation error) and the web page test went from one to four (Today window, older/Pending, capture +
  groups, cleanup policy). Honest note: the server route was written before its test, so no RED was observed there;
  the web tests were written against the new page and observed failing first.

Decisions: the group selector labels itself with the group name (`Select.Value` render function, not the raw id); the
delete action reveals on hover but stays visible below `sm`; 32 px header controls, 36 px row controls, 18 px visual
checkbox inside a 36 px target; no per-row hover fill; group sections separated by whitespace only.

## /goals — delegated

**Concept: an editorial register.** The index is a two-column table of contents: numbered chapter labels on the
left (number, "Group", name, goal count), open goal rows on the right with tags and category inline, and a
per-group "New goal" field that is always visible instead of a disclosure.

```
Goals   3 groups · 4 goals                                   [+ New group]
A place for the plans behind the work.
──────────────────────────────────────────────────────────────────────────
01 Group   Q4            Ingles                            #me        ↗
   1 goal                ─────────────────────────────────────────────
                         New goal [ Name a goal… ]        + Add goal
02 Group   Work          Ship the redesign          #focus #q4 design ↗
   2 goals               Write the launch note          #launch writing ↗
                         New goal [ Name a goal… ]        + Add goal
```

The detail keeps a metadata line (category, tags) above a broad editor canvas with the autosave status.

## Comparison

| | `/tasks` (orchestrator) | `/goals` (delegated) |
| --- | --- | --- |
| Composition | One 760 px sheet, tab switch Today/Groups | Two-column register with numbered chapters |
| Adding | One sticky capture bar with a destination picker; per-group composer on demand | A permanently visible "New goal" field in every group |
| Empty state | Message plus the create control inline | Own empty handling in the register |
| Chrome | Exactly one bordered element on the page | No boxes, hairlines between chapters |
| Distinctiveness | Reads as a paper checklist | Reads as a table of contents |

Where the delegated design is stronger: the index has a stronger editorial identity than a plain list, and the
always-visible composer is faster when you are writing many goals in a row. Where the orchestrator design is
stronger: one composer and one destination instead of three repeated fields, and the Today/debt model gives the
page a job beyond listing. Both honour the direction — no section cards, hairlines, compact controls, tokens only.
Rough edges left in place on purpose, because the user is judging: the word "Group" repeats under every number,
the category reads like a tag (it has no `#` but no other marker either), and "Home" is a text link where the other
sections use an icon.

## Log

**L1** — 2026-10-24. User request, verbatim:

> ahora haz el rediseño con esta misma direccion en /task y /goals, ojo aqui, he notado que usasnte un formato muuuy
> parecido sino es que igual en notes y habits en la distribucion, no me desagrada, pero no quiero que hagas lo mismo
> con estos, cuando te digo que me gusta no es que me gusta exactemente la ui y que quiero la misma plantilla en todos
> lados, hablo de que la direccion, el pensamiento de menos tosco, menos contenedores o ese tipo de cosas me gusta, asi
> que quiero ver que haras con esto, de nuevo es rediseño completo, con la skill de ux ui pro max, tu haz una y manda
> a un sub agente a hacer otra quiero ver quien lo hace mejor y como resuelven

**L2** — 2026-10-24. The experiment: `/goals` was delegated in the background with the parity contract, the pinned
direction, an explicit ban on copying the habits/books skeleton, and freedom over the composition. The orchestrator
worked on `/tasks` only, with disjoint edit surfaces (`features/tasks/` versus `features/goals/` + `App.tsx`), so the
two designs were produced without seeing each other.

**L3** — 2026-10-24. The user asked for the Today section, the older/debt view and configurable retention while the
goals worker was still running. Decisions taken:

- The window is local calendar days computed from `createdAt`, using the dataset's existing rule that a day is never
  derived from `toISOString().slice(0, 10)`; a task written at 23:50 belongs to that day.
- "Today" reads today and yesterday only. Yesterday is included because a check written last night is still today's
  work, which is what the user asked for.
- Nothing is deleted by default. Retention has to be turned on, and the dialog states that it runs on every open,
  because a silent destructive default would be indefensible.
- Cleanup is a server transaction, not a burst of DELETEs from the browser, so a half-finished run cannot leave
  orphaned checks or empty groups behind.
- The run reports "Cleaned N old checks and M empty groups" in the page instead of vanishing silently.

Cleanup during the visual pass: the browser session had two stray empty groups (`t1`, `tt2`) from earlier manual
poking; they were deleted, and every group created for the screenshots was removed afterwards, leaving the user's
task database empty again.

**L4** — 2026-10-24. The delegated `/goals` redesign landed as described above: 321 web tests at the time, chunks of
10.65 kB (`goals-page`) and 10.97 kB (`goal-page`), typecheck and build clean. Its own report claims S1–S6 and S9–S12
with tests; S7–S8 (persistence/API) were explicitly out of its web-only scope and were not touched.

**L5** — 2026-10-24. Parent pass after both landed: `pnpm --filter @chub/web test` 45 files / 322 tests, typecheck
and build clean; the page chunks are 20.82 kB (`tasks`, grown by the Today/older/cleanup work), 21.49 kB (`habits`),
26.98 kB (`books`), 10.65 and 10.97 kB (`goals`). A visual pass on both sections at 1280 px.

**L6** — 2026-10-24. Bug found by the user, not by the tests: with an empty task database the page rendered the
header and the empty sentence but **no way to create the first group**, because the tabs and the capture bar were
gated on `groupCount > 0` and the "New group" control lived inside the Groups tab. Fixed by rendering the control in
the empty state, keeping the footer control only when the list exists, and switching to the Groups tab after
creating a group so its composer is visible. A fifth test now pins that path.

**L7** — 2026-10-24. The user reported the empty database still showed only a "New group" button. Correct diagnosis: the
first fix only added the control to the empty state; the interface itself (tabs, capture bar, Today) was still gated
behind `groupCount > 0`, so a new user had to invent a group before they could write a check. Fixed properly: the
tabs, the capture bar and the Today section render regardless of the group count, and the first check with no groups
creates an `Inbox` group behind the scenes and lands there. The group selector only appears once a second group
exists, and the Groups tab explains where an ungrouped capture goes. Verified end to end in the browser on a truly
empty database: typed a check, `Inbox` was created, the check appeared in Today tagged `Inbox`. The test now pins
that path (322 tests, typecheck clean). Test data was deleted afterwards; the user's task database is empty again.

**L8** — 2026-10-24. The user asked for the unclosed work to live inside Today as an always-visible column rather than
a tab or a filter. Restructured accordingly:

- Today is a two-column section: the last two days on the left, and `Not closed` on the right — task, group and date
  per row, oldest first, with the checkbox in place so the debt can be closed without leaving the page.
- The column replaces the old `Pending | All` filter. `Show older closed (N)` on the left now covers only closed older
  checks, so nothing is shown twice: debt on the right, history on demand on the left.
- The column is capped at 420 px with its own scroll so a long backlog never pushes the page down, and on phones it
  stacks under Today.
- Date formatting: `shortDayLabel` renders "Oct 12", adding the year only across a year boundary; the `time` element
  carries the ISO day.
- Tests: the Today test now asserts the debt list by its accessible name, that the debt row carries group and date,
  that a closed old check stays out of it, and that the toggle reveals the closed history. 322 web tests, typecheck
  and build clean; `tasks-page` is 22.30 kB.

Visual pass with seeded data (two open items at 12 and 3 days old, one closed at 18): the column read correctly, oldest
first. The seed was deleted afterwards; the task database is empty again.

**L9** — 2026-10-24. Third pass on `/tasks`, on the user's list.

Server: migration `0010_task_meta.sql` adds `due_date` (nullable) and `priority` (`text not null default 'none'`) to
`checklist_items`; the repository validates a real calendar day (the `2026-02-31` roundtrip) and the five priority
values; the route maps `invalid_due_date` / `invalid_priority`; both user-version assertions moved to 11. 147 server
tests.

Today:

- Today and Yesterday are separate, collapsible day blocks; Today always first, and each keeps its own written order.
- **Past days** replaces "Show older closed": it holds every older check, closed *and* open, grouped by day, each day
  collapsible. That is what the user asked — the hide view should not filter the unclosed out.
- The debt column gained an `Oldest first / Newest first` toggle and a priority dot per row.
- Priority (None / Low / Medium / High / NOW) is editable from every row; NOW is violet, High amber, Medium sky,
  Low slate, and `none` collapses to a faint hollow dot so the list does not fill with the word NONE.

Groups: collapsible sections; each row now carries the priority control and a due-date control that reveals a native
`date` input and shows `Oct 30` (red when overdue).

Decision the user delegated — group vs Today: **a check always belongs to a group, and Today is a view over the local
creation day.** A check with no owner would have no name to rename, no place to delete it from, and would need a
second storage shape; "only Today" would duplicate the model. The Inbox fallback keeps zero-group use working.
323 web tests, typecheck and build clean; `tasks-page` is 27.32 kB. The month-long simulation dataset stays in place
for the user's review.

**L10** — 2026-10-24. The six recommendations landed.

- **Today by due date.** A check belongs to the day it was written or, when that lands outside the window, to the day
  it is due: `bucketOf` returns the creation day when it is today/yesterday, else the due day when it is, else null
  (past/debt). Each check appears in exactly one bucket.
- **Overdue count** in the header, in the destructive colour, when anything open is past its due date.
- **Undo after delete**: an 8 s `role="status"` toast restores the check. The restore re-creates it (new id, appended
  position) and re-applies priority, due date, recurrence and done state.
- **Bulk actions** in the group menu: `Close all open` and `Delete completed`, both through a new
  `POST /api/checklists/:id/bulk` that runs in one transaction (`invalid_action` on 400) and returns the group.
- **Capture routing**: a trailing `#Group` token routes the check and is stripped from the text; an unknown name creates
  the group. Only the trailing token counts, so `#` inside a task text is safe.
- **Recurrence** (`none | daily | weekly`, migration `0011`): setting it requires a due date (`invalid_recurrence`
  otherwise); completing a repeating check spawns the next occurrence at +1/+7 days and the finished one stops
  repeating, so the chain continues through the clone. Bulk completion spawns for every repeating check it closes.

Verification: server 149 tests (recurrence spawn, bulk, validation), web 327 (due-date membership, overdue count,
capture routing, undo, bulk, priority/due patches), typecheck and build clean; `tasks-page` is 31.33 kB.

**L11** — 2026-10-24. Visual pass on the new row metadata only ("se sienten toscos"), nothing else touched:

- Priority lost its tinted pill and its uppercase/tracking: a 6 px dot in the level colour plus a 10 px label in
  normal case, on a 24 px hit box with no background. `none` is a faint hollow dot at 50% opacity.
- Due date is plain 10 px text with a 10 px calendar icon, coloured only when overdue; the display chip lost its
  `bg-muted` block.
- Recurrence control is a 24 px icon button, and the duplicate `D`/`W` chip now only appears where the control does
  not (Today and past-day rows).
- The group tag dropped to 10 px, and every row in Today is now a single 40 px line (the earlier 75 px wrapped row is
  gone) because the text got a 12 rem minimum column so chips wrap under it instead of squeezing it.

**L12** — 2026-10-24. Two small requests after living with it:

- The debt column went from 300 to 240 px; it is a glance list, not a workspace, and the extra width belonged to
  Today.
- Groups gained a badge row under the capture bar: every existing group as a 24 px chip, click to lift it to the top
  for the session, click again to release. Positions in the database are untouched, so the order returns by itself.
  The selected chip takes `bg-muted` + a stronger border; the rest stay hairlines. A newly created group lands focused.

**L13** — 2026-10-24. Goals gained the three requested changes, on the redesigned index.

Server: migration `0012_goal_group_meta.sql` adds `period_start`, `period_end` and `archived_at` to `goal_groups`; the
repository validates a real calendar day and a start ≤ end (`invalid_period`), exposes `updateGroup` for name/period/
archive in one call, filters the list by archive (`GET /api/goals?archived=1`), and refuses a new goal inside an
archived group (`group_archived`). 150 server tests.

Web: the group menu is now Rename / Set period… / Archive group / Delete group; the period is set in a small dialog
with two date inputs and a Clear, and renders under the goal count as `Oct 1 – Dec 31` (year only across a year
boundary). Archived groups live in a disclosure at the bottom with Restore and delete. The always-visible per-group
composer is gone: a `New goal` button reveals the input, escapes back, and the new goal still opens its detail.

329 web tests, typecheck and build clean; `goals-page` 15.80 kB. The user's own `Q4` and `T1` groups were left
untouched; the sample groups used for the visual pass were deleted.

**L14** — 2026-10-24. The five improvements plus the detail redesign.

Data: migrations `0013_goal_meta` (goals get `due_date`, `status` default `todo`) and `0014_task_goal`
(`checklist_items.goal_id` → `goals.id` on delete set null). Goal status is `todo | doing | done` with
`invalid_status` / `invalid_due_date`; linking a check validates the target with `invalid_goal`; 152 server tests.

Index: each goal row carries a status dot and label, its tags and category, and its due date (red when overdue and
not done); a done goal is struck through. Each group line shows `3 goals · 1/3 done` next to its period. A filter bar
under the header offers All/Open/Done plus tag and category selects fed by the vocabulary, with a Clear and an
"X of Y shown" count; groups with no match disappear while a filter is active.

Detail: the old left column (a labelled title input over a boxed category Select and a boxed tag field) is gone. The
page is now a masthead — title, then one quiet line with the status chips, the due date, the category menu and the
tag chips — over a two-column body: the document and a 260 px `Tasks` rail that lists the checks linked to this goal,
lets you tick them, unlink them, or link an unlinked open check from a menu. The tag field lost its box and label.

Caught by measuring instead of trusting the screen: the title rendered at 12.25 px because `Input` ships `md:text-sm`
and the arbitrary `text-[26px]` only applied below `md`; adding `md:text-[26px]` restored it.

331 web tests (status filter and counters, status/due/link on the detail), typecheck and build clean; `goals-page`
18.51 kB and `goal-page` 14.73 kB in their own chunks. Sample groups used for the visual pass were deleted; `Q4` is
the user's own.

**L15** — 2026-10-24. The five follow-ups plus a title search in the link picker.

1. **The link is visible from the task side.** Tasks reads the goal summaries once (`/api/goals`) and a linked check
   carries a `◎ Goal title` chip in its row, on every surface that uses `TaskRow`. A failed goals read is swallowed:
   the name is context, not data the page owns.
2. **Sort by due date.** A `Sort` select offers `By position` and `By due date`; by due date the soonest come first,
   undated goals last, positions breaking ties, so overdue work leads inside each group.
3. **The view persists.** Status, tag, category, the `Due soon` toggle (due within 7 days and not done) and the sort
   live in `localStorage` under `chub.goals.view`; the search text deliberately does not persist.
4. **Search by title** in the filter bar, matched case-insensitively against the loaded summaries.
5. **Groups reorder** from the kebab: `Move up` / `Move down` swap positions with the neighbour (two PATCHes of the new
   `position` field, `invalid_position` on 400) and update the list locally without a reload.

The link picker is now a dialog with its own search box over the unlinked open checks, instead of a menu.

334 web tests (goal chip, search, persisted filter, reorder, link-by-title), 153 server tests (position), typecheck and
build clean; `goals-page` 21.64 kB, `goal-page` 16.03 kB, `tasks-page` 31.52 kB. The QA group and list used for the
visual pass were deleted; the user's `Q4` group and its own task link were left untouched.
