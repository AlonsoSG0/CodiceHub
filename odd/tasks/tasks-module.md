# Tasks — quick checks grouped under a name

Objective: a sixth top-level section, `/tasks`, holding named groups of simple checks for "cosas rápidas o
pendientes del día". No board, no columns, no drag. Branch: none — the working tree stays uncommitted by
the repository rule (`AGENTS.md`); evidence is recorded here instead. Delivery: `ask-on-risk`, one work-unit
slice, no commits unless the user asks. Test runner: `pnpm --filter @chub/server test`,
`pnpm --filter @chub/web test`, then `pnpm typecheck` and `pnpm build` at the root.

## Specs

**S1 — A new top-level section.** The request: *"agreguemos una seccion/modulo nuevo de task"*. It is its own
route `/tasks`, reachable from the global dock and from the section registry, and renders outside the notes
shell like the other sections.

**S2 — The unit is a named group of checks.** The request: *"solo checks que se puedan agrupar bajo un nombre"*.
A group has a user-given name, holds an ordered list of checks, and is created, renamed and deleted by the
user. Its checks are created, toggled and deleted inside it.

**S3 — A check is a checkbox line.** The request: *"una lista simple con checks"* and *"no necesito un
kanban"*. Each check renders as one line with a real checkbox control (`role="checkbox"`, `aria-checked`)
and its text. Done checks stay in place, struck through and muted; toggling never re-sorts the list. There are
no columns, lanes, drag targets, priorities, due dates, assignees, labels or reminders in this version.

**S4 — Capture is one keystroke away.** The request: *"es para anotar cosas rapidas o pendientes del dia"* and
*"me gustaria algo tipo post-its ... mas que la ui me refiero al uso"*. Every group carries an always-visible
inline composer: type, press Enter, the check appears, the input clears and keeps focus. Creating a group is
a single inline name field as well. No modal, no multi-field form, no submit round-trip before the text is
visible. The post-it reference is about usage speed, not about sticky-note visuals.

**S5 — It survives a reload.** Groups and checks are persisted server-side in SQLite through the existing
Drizzle + hand-written migration path, and every mutation is durable before the next load.

**S6 — No name collision with the project board.** `tasks` is already a project-scoped table
(`server/src/db/schema.ts:170`) and `/api/tasks` is already the calendar endpoint
(`server/src/routes/projects.ts:255`). The new module therefore uses the `checklists` and `checklist_items`
tables and the `/api/checklists` namespace. The web route stays `/tasks`, the label stays `Tasks`, and the
shortcut is `T` (free, and already reserved by the comment in `web/src/app/sections.ts:12`).

**S7 — Design is constrained to the `ui-ux-pro-max` skill.** The request: *"para el diseño de ahora en
adelante solo puedes usar la skill de ux/ui pro"*. The web work loads that skill before designing, reuses the
existing tokens and primitives, adds no dependency and no font, and follows its rules: flat, no heavy shadows
or gradients, Lucide icons only (never emoji), 44×44 px check targets, visible focus, `prefers-reduced-motion`
respected, 150–200 ms colour/opacity transitions only, one `role="alert"` surface for load and mutation
errors, dark mode checked separately.

**S8 — The API contract is fixed.** Shapes below; list endpoints wrap, single resources are bare, errors are
`{ error: "<code>" }`, matching `server/src/routes/habits.ts` and `projects.ts`.

```
GET    /api/checklists                       200 { checklists: Checklist[] }   // each with items[]
POST   /api/checklists        { name }       201 Checklist
PATCH  /api/checklists/:id    { name }       200 Checklist
DELETE /api/checklists/:id                   200 { deleted: id }
POST   /api/checklists/:id/items { text }    201 ChecklistItem
PATCH  /api/checklists/items/:id { text?, done? }  200 ChecklistItem
DELETE /api/checklists/items/:id             200 { deleted: id }
```

`Checklist = { id, name, position, items: ChecklistItem[], createdAt, updatedAt }`
`ChecklistItem = { id, listId, text, done, position, createdAt, updatedAt }`

Error codes: `invalid_body`, `invalid_name`, `invalid_text`, `invalid_done` (400),
`checklist_not_found`, `item_not_found` (404). Ordering: groups by `position, id`; items by `position, id`.
New records append at `max(position) + 1`. `done` is `integer(..., { mode: "boolean" })`, default `false`.

**S9 — Checks are proportional, not exhaustive.** One server route test file covering the contract and the
error codes (RED before implementation), one focused page test covering group creation and the check toggle,
plus the full package suites and a typecheck. No visual snapshots, no E2E.

**Non-goals:** due dates, recurrence, reminders, filters, search, reordering, drag and drop, nesting groups,
project linkage, sharing, keyboard shortcuts per item.

## Design brief (for the web worker)

- Section header mirrors `/projects`: `House` home link, `h1` "Tasks" (`text-[24px] font-semibold
  tracking-tight`), and one summary line (`"3 lists · 7 open"`) that is hidden while empty.
- Body: responsive grid of group blocks, `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`. A block is a bordered
  `bg-card` surface with `rounded-xl border border-border p-4` — elevated by border and spacing, not shadow.
- Block header: group name (truncating), open count in `text-muted-foreground text-[13px] tabular-nums`, and a
  kebab `MenuPopup` with `Rename` and `Delete list` (delete confirms with the existing `ui/dialog.tsx`).
- Rows: 44 px minimum height; checkbox button is a 44×44 target with a 20 px box and a `Check` icon when done;
  done text is `line-through text-muted-foreground`. Item delete is an icon button with
  `aria-label="Delete <text>"`, always visible below `sm`, revealed on `sm:group-hover` / `focus-within`.
- Composer: `Input` + `Plus` submit button, placeholder `Add a check…`, Enter submits, Escape clears.
- New group: a dashed-border block at the end of the grid that turns into a name field on click.
- States: skeleton while loading (`LoadingSkeleton` shape), `role="alert"` banner with a retry for load
  failures and for failed mutations, and an empty state that names the action ("No lists yet — create one to
  start writing checks").

## Tasks

| ID | Scope | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | Server: `checklists` + `checklist_items` schema, migration `0008`, repository, `/api/checklists` routes, route + migration tests (S5, S6, S8, S9) | delegated → `gentle-ai-worker` | done | L4, L6 |
| T2 | Web: `/tasks` section, dock + registry + route registration, API client, page, focused test (S1–S4, S7, S9) | delegated → `gentle-ai-worker` | done | L4, L6 |
| T3 | Independent verification of the whole feature diff (migration and data invariants) | delegated → `gentle-ai-verify` | done | L7, L8 |

Risk: item 1 (a new SQLite migration and a new persisted format) and item 3 (`web/src/App.tsx`,
`app-shell.tsx` and `global-dock.tsx` are shared by every route).

## Log

**L1** — 2026-10-23. User request, verbatim:

> Genial ahora agreguemos una seccion/modulo nuevo de task, una lista simple con checks, me gustaria algo
> tipo post-its, entiendes? mas que la ui me refiero al uso, es para anotar cosas rapidas o pendientes del
> dia, no necesito un kanban solo checks que se puedan agrupar bajo un nombre, para el diseño de ahora en
> adelante solo puedes usar la skill de ux/ui pro, dale, planeala y delegas

**L2** — 2026-10-23. Assumptions taken without asking, all reversible:

- The label is `Tasks` and the route is `/tasks`, matching the reserved comment in `app/sections.ts`, while
  the persisted resources are named `checklists` to avoid the existing `tasks` table and `/api/tasks`
  calendar route (see S6).
- "Agrupar bajo un nombre" means user-created named groups, not a fixed "Today" bucket. No dates are stored:
  a check that matters today is a check you wrote today, and adding `dueDate` would grow the module into
  something the user explicitly did not ask for.
- Done checks keep their position (no sinking, no re-sorting) so the list does not jump under the pointer.
- The post-it reference is usage, not styling; the user said so explicitly.

**L3** — 2026-10-23. Design system queried with `ui-ux-pro-max --design-system "quick daily tasks checklist
sticky notes productivity"`: Flat Design, warm ink `#78716C` + amber `#D97706` on cream `#FFFBEB`, no
gradients or shadows, 150–200 ms transitions. The palette is advisory only: this repository already owns its
tokens in `web/src/styles/tokens.css`, and re-theming the app is out of scope. What is adopted is the flat,
shadow-free treatment, warm accents through the existing tokens, and the skill's accessibility rules.

**L4** — 2026-10-23. RED, observed by the two delegated writers before their implementations existed:

- Server: `pnpm --filter @chub/server exec vitest run test/checklists-routes.test.ts` failed with both tests
  receiving 404 where creation expected 201, because the routes did not exist yet.
- Web: `pnpm vitest run src/features/tasks/tasks-page.test.tsx` failed with `./tasks-page` missing.

S9 is satisfied by those two observed runs, not by test presence alone.

**L5** — 2026-10-23. Parent correction outside the writers' surfaces: `server/test/projects-data-integrity.test.ts`
asserted `user_version` 8 and failed once migration `0008` was appended. The expectation was bumped to 9. That
file belongs to the projects feature, which is why it was not in T1's allowed surfaces.

**L6** — 2026-10-23. Parent verification from the root of the workspace:

- `pnpm test` — web 43 files / 314 tests passed; server 15 files / 139 tests passed at that moment (140 after
  the migration-preservation test in L8).
- `pnpm typecheck` — both packages clean.
- `pnpm build` — clean. The entry chunk is 1,609.77 kB (509.14 kB gzip); `tasks-page` is its own 11.88 kB
  chunk (3.60 kB gzip), so the section stayed behind its lazy boundary and did not join the entry.

**L7** — 2026-10-23. Independent verifier, on a pristine scratch copy:

- S1–S8 met, with runtime probes rather than source reading: a version-8 database was built from the journal
  minus entry 8, seeded with `pages`, `projects`, `project_columns`, `tasks` and `habits` rows, then opened
  with the real client. It became version 9, exactly `checklists` and `checklist_items` were added, every
  seeded row and every pre-existing table schema were unchanged, and `foreign_key_check` was empty.
- The `/api/checklists` contract matched S8 endpoint by endpoint, including the 400/404 bodies; rejected
  requests left the checkpointed database byte-identical; item order survived a toggle and a reopen; append
  positions were `max + 1`; group deletion cascaded to exactly its own items; `GET /api/tasks?from=&to=` and
  the project-scoped `tasks` table were untouched.
- It reported S9 unmet only because the historical RED runs were not yet in this document; L4 records them.

**L8** — 2026-10-23. Parent added one regression test before the verification retry, because the migration is
the high-risk item: `server/test/migrations.test.ts` now builds a version-8 database from journal entries
`0..7`, seeds a page, project, column, project task and habit, opens it with the current client, and asserts
version 9, exactly the two new tables, every seeded row intact, and an empty `foreign_key_check`. The probe the
verifier proposed for rejected-mutation byte equality was not added: `checklists-routes.test.ts` already
asserts that a run of rejected requests leaves `/api/checklists` unchanged, and the byte-level proof belongs to
the verifier, not to the permanent suite.

**L9** — 2026-10-23. Incidents and cleanup. The first verifier attempt aborted because the scratch parent
`/tmp/gp4aXGUk/opencode` named in the delegation did not exist — the parent's provisioning error, not a defect
in the candidate; it was created and the verification rerun once. The verifier's first `pnpm` invocation
resolved 890 packages and wrote to `/tmp/.pnpm-store/v11` outside its scratch root, and one of its cleanup
commands read ambient `$TMPDIR`; the same class of breach the previous feature recorded. The scratch directory
`/tmp/gp4aXGUk/opencode/chub-verify.gwUHet` was removed by the parent. The workspace itself was left with no
probe files, no build output and no scratch paths.

**L10** — 2026-10-23. Native review, candidate-scoped decision. `gentle-ai review assess` reported `high` with
reason `unassessable`, because the untracked population needed an explicit declaration; after declaring this
feature's ten untracked paths, the canonical candidate was the whole uncommitted tree: 47 files, 6,788 changed
lines, risk `medium`. The consent envelope was relayed as given, with its two choices and their effects. The
human chose **"Skip this time"**. The captured decline invocation was run once: `action: "declined"`,
`consent: "declined_this_candidate"`, target `sha256:df0f3895...` matched, no review record or authority was
created, and the review switch stays on. A follow-up `review.status` reports `action: start` with
`intended_untracked_selection_required`, so the next candidate asks again. Delivery stays an ordinary
repository decision: nothing is committed.
