# Projects kanban

A new top-level chub section: several projects, each with its own kanban board you can rearrange freely, plus a
calendar to review every task at a glance. Route `/projects` (section home) and `/projects/:projectId` (board).
Delivery strategy: `ask-on-risk` (no commits unless the user asks). Test runner: `pnpm test` (web + server),
`pnpm typecheck`, `pnpm build`.

## Specs

### S1 — The section exists, and it is a section of its own

> "Ahora igual que las otras secciones hagamos una nueva"

`/projects` is a standalone route rendered outside `<AppShell />`, sibling of `/notes`, `/habits` and `/books`.
It owns its own chrome: the house link back to Home, the theme toggle, its own title. It appears in
`web/src/app/sections.ts` and in the global dock.

### S2 — Several projects, each with its own kanban

> "donde yo pueda tener varios proyectos cada uno con su kanban"

A project owns its own columns and its own tasks. Two projects never share a column or a task. Creating a project
seeds it with three columns: `Backlog`, `In progress`, `Done`. Columns are per project and can be renamed, added,
reordered and removed. A task lives in exactly one column.

### S3 — Cards move freely

> "yo pueda moverlo a gusto"

A task is dragged between columns and reordered inside a column. The drop is optimistic and persisted. A column
marks itself as a completion column (`Done`), and a task in a completion column reads as finished: muted title,
strikethrough, a check. A column can be made a completion column or not.

### S4 — Tasks can be created

> "y crear mis tareas"

A task has a title (required), a description (optional) and a due date (optional). It is created from an inline
composer at the foot of its column: type, press Enter, the card appears. The task details are edited in a dialog.

### S5 — The kanban is Kibo UI's

> "se que en Kibo UI ese componente de kanban"

The board is built on Kibo UI's `kanban` registry item, vendored at `web/src/components/kibo-ui/kanban/index.tsx`.

### S6 — A calendar reviews everything

> "aparte agrega el calendario para revisar todo"

The section carries a calendar view built on Kibo UI's `calendar` registry item, vendored at
`web/src/components/kibo-ui/calendar/index.tsx`. It shows every task that has a due date, across every project,
on a month grid, and it can be narrowed to a single project. Clicking a task opens it.

### S7 — It looks like chub

> "carga las skills de diseño que tengamos para que lo hagas muy lindo y que sea una UI/UX impresionantes al igual que la funcionalidad"

The board is built with the repository's own design system: the warm paper-and-ink palette in
`web/src/styles/tokens.css`, the Base UI primitives in `web/src/components/ui/`, `lucide-react` icons, `cn` for
class merging. No new hue is introduced: structure comes from tonal steps and hairlines, and the only chromatic
colour is the existing `--destructive` on an overdue task.

## Design direction

**Domain.** Index cards, a workbench, a filing drawer, a wall of pinned notes, a printed docket, a ledger.
**Colour world.** Paper white `#ffffff`, ledger gray `#f7f7f5`, ink `#37352f`, pencil gray `#787774`, hairline
`#e9e9e7`, red pencil `#b42318`. Every one of these already exists in `tokens.css`.
**Signature.** The column rail — a 2px rule at the left edge of a column that fills with ink while a card is
dragged over it. It is the only element in the section that changes weight on interaction.
**Rejected defaults.** (1) Coloured column headers as in Trello → hairline headers and a rail that answers the
drag. (2) A permanently visible "+ Add task" button in every column → an inline composer that appears on hover or
focus and closes on Escape. (3) A modal for every edit → creation is inline in the column, editing is one dialog.

**Depth.** Borders and tonal steps carry the structure; one soft layered shadow is reserved for a lifted card.
**Typography.** 14px base, weight and colour do the hierarchy work: 20/600 board title, 13/500 column header,
14/500 card title, 12/400 muted meta, counts in `tabular-nums`.
**Spacing.** 4px base unit. 16px between columns, 12px inside a card, 8px between cards.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S2, S3, S4 | delegated | done | `server/src/projects/repository.ts`, `server/src/routes/projects.ts`, `server/drizzle/0007_projects.sql`; `server/test/projects-routes.test.ts` 9 tests green |
| T2 | S5, S6 | inline | done | `web/src/components/kibo-ui/kanban/index.tsx`, `web/src/components/kibo-ui/calendar/index.tsx`, `web/src/components/ui/{card,scroll-area,input,textarea}.tsx` |
| T3 | S1, S2, S6 | inline | done | `web/src/features/projects/projects-page.tsx`; `projects-page.test.tsx` 5 tests green |
| T4 | S3, S4, S5 | inline | done | `web/src/features/projects/board-page.tsx`, `board-column.tsx`; `board-page.test.tsx` 4 tests green |
| T5 | S1, S7 | inline | done | `web/src/app/sections.ts`, `web/src/components/layout/global-dock.tsx`, `web/src/App.tsx`, `AGENTS.md` |
| T6 | all | inline | done | `pnpm test` 446 tests green (web 309, server 137); `pnpm typecheck` green; `pnpm build` green; independent verifier found no blocker |

**T1 — Data layer.** `projects`, `project_columns` and `tasks` tables, migration `0007_projects.sql`, the Drizzle
schema, `server/src/projects/repository.ts`, `server/src/routes/projects.ts`, and `server/test/projects-routes.test.ts`.
Deliberately delegated: it is one independent unit of behaviour on a surface (`server/**`) that no other unit
touches, and it is several files of work.

**T2 — Vendored components.** Kibo UI `kanban` and `calendar`, shadcn `base-nova` `card`, `scroll-area`, `input`
and `textarea`, plus the npm packages they declare. Done inline with a script that fetched every registry item
and wrote it with its substitutions applied, so no token was retyped by hand.

**T3 — Section home.** The project grid, the project dialog, and the calendar tab. Inline: it is the surface
where the design direction has to be decided, and the parent owns it.

**T4 — Board.** The kanban board, the inline composer, the task dialog and the layout persistence. Inline, for the
same reason.

**T5 — Navigation and docs.** `sections.ts`, the global dock, `App.tsx` routes, `AGENTS.md`. Inline.

**T6 — Verification.** Full web and server suites, `pnpm typecheck`, `pnpm build`, a look at `web/dist`, and an
independent verifier, because the change carries `Risk: item 1`.

## Log

**L1** — 2026-10-20. "Ahora igual que las otras secciones hagamos una nueva pero que sea un kanban de proyectos,
donde yo pueda tener varios proyectos cada uno con su kanban y yo pueda moverlo a gusto y crear mis tareas, se que
en Kibo UI ese componente de kanban aparte agrega el calendario para revisar todo, carga las skills de diseño que
tengamos para que lo hagas muy lindo y que sea una UI/UX impresionantes al igual que la funcionalidad"

**L2** — 2026-10-20. Decision: a task's finished state is a property of its column, not a second flag on the task.
One source of truth, so a card can never disagree with itself. A column carries `is_completed`; the seeded `Done`
column starts as one.

**L3** — 2026-10-20. Decision: the calendar lives on the section home (`/projects`) and shows every project at
once, because "revisar todo" asks for the whole picture. The board stays per project at `/projects/:projectId`.

**L4** — 2026-10-20. Decision: the Kibo `calendar` ships a month/year combobox built on `cmdk` and a Radix-shaped
popover. This repository forbids Radix, and it already has a Base UI `Select`, so the combobox is ported to that
`Select` instead of vendoring two more primitives. The dependency list shrinks from six packages to four.

**L5** — 2026-10-20. Decision: the layout is persisted with one request per drop
(`PUT /api/projects/:id/layout`), not one request per moved card. The server reindexes both columns.

**L6** — 2026-10-20. The web tests were written after the implementation, not before it: the board's design
was decided while it was built, and the tests pin the behaviour that fell out of it. The server side did
follow RED first — the route tests failed with 404 before the routes existed, and then passed. The
independent verifier's probe was committed afterwards as `server/test/projects-data-integrity.test.ts`.

**L7** — 2026-10-20. Decision: the native review runs over the whole working tree, not over this feature
alone. The repository commits nothing without the user's word, so the candidate is every uncommitted change
in the tree, and the untracked selection has to name this feature's files explicitly. The review was
requested with four lenses (`risk`, `resilience`, `readability`, `reliability`) and escalated on item 1.

**L8** — 2026-10-20. Verification: `pnpm test` is green (web 309, server 137), `pnpm typecheck` is green,
`pnpm build` is green. The entry chunk grew by 2.11 kB (0.58 kB gzip) because of this feature — measured by
building the same tree with the three eagerly-imported files reverted — and the drag-and-drop stack lives in
its own 81 kB chunk.

**L9** — 2026-10-20. The independent verifier reproduced every data invariant and found no blocker. It also
reported a procedural breach of its own: its first `pnpm` run resolved dependencies and wrote to
`/tmp/.pnpm-store/v11` outside its scratch root. The parent has not cleaned that up.

**L10** — 2026-10-20. The native review was declined for this candidate: the human chose "Skip this time".
The choice is candidate-scoped, so no review record was created, the review switch stays on for later
changes, and the delivery of this feature remains an ordinary repository decision. One wrinkle worth
remembering: the workspace moved between the consent request and the answer — the feature document's log
was written after the START — so the captured decline invocation named a stale candidate tree and was
refused. The native remedy is to re-derive the transition with `review.status` and spend the same answer
on the fresh transition, which is what happened.

## Log (redesign wave, 2026-10-24)

**L1** — User's list: apply the light redesign; a kebab on a card starts a drag so tasks in Done cannot be edited;
no priority; no relation to `/tasks` or `/goals`; the calendar looks decorative.

**L2** — Diagnosis. The board's card spreads dnd-kit listeners over the whole card and the sensor listens on
`document`, so the kebab's synthetic `stopPropagation` never reached it. Also found while reading: the task dialog
offered a column select but `handleSaveTask` never sent `columnId`, so a column change was silently lost. The
calendar's chips only call `onOpenTask` when a caller passes it; the list passed none.

**L3** — Model decision (user-approved): each module keeps its own tables. Goals are the shared axis: board tasks
now carry `goal_id` (nullable, `ON DELETE SET NULL`), exactly like checklist items. No `/tasks` ↔ `/projects` link.

**L4** — Data: migrations `0015_project_task_meta` (tasks: `priority`, `goal_id`) and `0016_project_archive`
(projects: `archived_at`); `GET /api/tasks?goalId=` lists a goal's board tasks; `PATCH /api/tasks/:id` accepts
`priority`, `goalId` and `columnId` and reindexes both columns on a move; `GET /api/projects?archived=1` and
`PATCH {archived}` add archiving. Server 155 tests.

**L5** — Web: one shared `PriorityControl` (`components/priority-control.tsx`) now serves `/tasks` and the board; the
kanban sensors gained an activation constraint (`distance: 6`, touch `delay: 150`) so a click is not a drag, and the
card's kebab also stops the native pointer event; the board gained a view switch (Board | Calendar), filters
(search, priority, goal, overdue) that render a non-draggable list while active, card meta (priority, goal, due,
notes), undo after deleting a card, stacked columns under `lg`, and a calendar whose chips open the task dialog. The
list moved to hairlines, and projects can be archived and restored.

**L6** — Incident: a scripted edit wrote the test file's contents over `board-page.tsx` (the file was untracked and
there was no backup). It was rebuilt from scratch against the same helpers and the board tests, which is why the
page was rewritten rather than patched. No other file was affected.

**L7** — Deliberately not done: no "click a day to create a task" in the calendar, and no separate "Move to column"
submenu on the card — the dialog's column selector persists the move and is the keyboard route. The list keeps its
counts and archive but no per-project progress bar.

**L8** — Verification: 334 web tests (board, list, calendar, goal rail), 155 server tests, typecheck and build clean;
`projects-page` 15.03 kB, `board-page` 92.95 kB (it carries the kanban stack), `goal-page` 17.25 kB. Visual passes at
1280 in light mode; the kebab opens the dialog, the column change persists (Backlog → Done, position 0), a calendar
chip opens the task, and archiving moves the project into the disclosure. QA project and goal were deleted; the
user's `Web Test` and `Q4` remain.
