# Goals — named groups of rich-text goals with tags and a category

Objective: a seventh top-level section, `/goals`, where goals live inside named groups like the task lists, but
each goal is a rich document written with the editor that already ships in this app, plus `#` tags and one
category drawn from user-created shared vocabularies. Branch: none — the working tree stays uncommitted by the
repository rule; evidence lives here. Delivery: `ask-on-risk`, one slice, no commits unless asked. Test runner:
`pnpm --filter @chub/server test`, `pnpm --filter @chub/web test`, then `pnpm typecheck` and `pnpm build`.

## Specs

**S1 — A new top-level section.** The request: *"crea una parte de Goals&Objetives o como se diga en ingles las
metas y objetivos"*. Section id `goals`, label `Goals`, route `/goals`, icon `Target`, shortcut `G`, lazy route
outside the notes shell, registered in `web/src/App.tsx`, `web/src/app/sections.ts` and
`web/src/components/layout/global-dock.tsx` exactly like `/tasks`.

**S2 — Goals are grouped under a name, like the task lists.** The request: *"poder agrupar como en las
tareas"*. A group is created inline by typing a name, renamed through its kebab, deleted only after
confirmation, and deleting it cascades to its goals. Groups and goals append at `max(position) + 1`; no
reordering in this version.

**S3 — Each goal is a rich document, edited with the editor we already have.** The request: *"va a ser usando
el editor que tenemos en notas o lo de notebook de los libros"*. Use the existing `NoteEditor` the way
`book-notebook-page.tsx` does — controlled `value: JSONContent` + `onChange`, no notes shell, no page id, no
subpage slash item — and persist the Tiptap document as a JSON string exactly like `pages.content` and
`book_notebooks.content`. A goal also has a plain title.

**S4 — Tags, written with `#`, from a shared vocabulary.** The request: *"deben de llevar tags (#) ... yo las
ingreso y si pongo una esta disponible para las demas"*. A goal has zero or more tags. Writing a tag that does
not exist yet creates it in a vocabulary shared by every goal, so it is offered as a suggestion everywhere
afterwards. Removing a tag from a goal never removes it from the vocabulary. Tags display with a leading `#`
and are stored normalized (trimmed, leading `#` stripped, lowercased); duplicates are collapsed.

**S5 — One category per goal, from its own shared vocabulary.** The request: *"y categoria, yo las ingreso y si
pongo una esta disponible para las demas"*. Zero or one category per goal, same create-on-type behaviour and
the same shared suggestion list as tags. Clearing the category is possible and does not delete the vocabulary
entry.

**S6 — A detail surface with autosave.** `/goals/:goalId` shows one goal: back link, group name, title, category,
tags, and the editor. Title, content, category and tags save on their own through the existing autosave
mechanism (`useAutosave`, 700 ms, flush on unmount) with no Save button; a failed save surfaces an error and
keeps the text in the editor.

**S7 — It survives a reload.** Everything persists server-side in SQLite through the existing Drizzle plus
hand-written migration path. Migration `0009_goals.sql` is additive: it creates `goal_groups`, `goals`,
`tags`, `categories` and `goal_tags`, and does not touch any existing table.

**S8 — The API contract is fixed.**

```
GET    /api/goals                              200 { groups: GoalGroup[] }
POST   /api/goals/groups        { name }       201 GoalGroup
PATCH  /api/goals/groups/:id    { name }       200 GoalGroup
DELETE /api/goals/groups/:id                   200 { deleted: id }
POST   /api/goals/groups/:id/goals { title }   201 Goal            // content starts as an empty doc
GET    /api/goals/items/:id                    200 Goal            // includes content
PATCH  /api/goals/items/:id     { title?, content?, categoryName?, tagNames? }  200 Goal
DELETE /api/goals/items/:id                    200 { deleted: id }
GET    /api/goals/vocabulary                   200 { tags: Tag[], categories: Category[] }
```

```
GoalGroup    = { id, name, position, goals: GoalSummary[], createdAt, updatedAt }
GoalSummary  = { id, groupId, title, category: Category | null, tags: Tag[], position, updatedAt }
Goal         = GoalSummary & { content: JSONContent, createdAt }
Tag          = { id, name }        // normalized name, displayed with a leading #
Category     = { id, name }
```

The list endpoint carries no goal content: only `GET /api/goals/items/:id` does. `PATCH .../items/:id` replaces
the tag set when `tagNames` is present, and `null` or `""` clears the category when `categoryName` is present.
Unknown tag and category names are inserted into the vocabulary and reused case-insensitively. Errors are
`{ error: "<code>" }`: `invalid_body`, `invalid_name`, `invalid_title`, `invalid_content`, `invalid_tags`,
`invalid_category` (400), `group_not_found`, `goal_not_found` (404), following `routes/checklists.ts`.

**S9 — Design is constrained to `ui-ux-pro-max`.** The request: *"para el diseño de ahora en adelante solo
puedes usar la skill de ux/ui pro"* (standing instruction). The web worker loads that skill before designing,
reuses the existing tokens and primitives, adds no dependency and no font: flat surfaces, borders and spacing
instead of shadows, Lucide icons only, 44 px targets, visible focus, `prefers-reduced-motion`, 150–200 ms
colour/opacity transitions, one `role="alert"` surface, dark mode checked separately.

**S10 — Tag and category inputs are accessible and keyboard-first.** The tag field shows removable chips
(`aria-label="Remove #name"`), filters the shared vocabulary as you type, adds free text on Enter, removes the
last chip on Backspace in an empty field, and never traps focus. The category control offers the existing
categories and a "New category…" path. Both are labelled fields, not placeholder-only.

**S11 — The editor is mounted once per record, not once per list.** The detail route mounts a single
`NoteEditor`; the list never mounts one. Switching records must remount the editor (keyed by goal id) so the
autosave timer cannot flush one goal's document into another.

**S12 — Checks are proportional, not exhaustive.** One server route test file covering the contract, the
vocabulary reuse and the cascade (RED before implementation); one web test for the list (group and goal
creation, tag suggestion) and one for the detail (title and tag autosave against a stubbed `fetch`). No
snapshots, no E2E, no editor interaction tests beyond mount and save.

**Non-goals:** deadlines, target dates, progress, milestones, checklists inside a goal, tag colours, in-editor
`#` mention marks, a separate vocabulary management screen, reordering or drag and drop, sharing, search.

## Design brief (for the web worker)

- `/goals` mirrors `/tasks`: same container classes, `House` home link, `h1` "Goals", summary line
  (`"3 groups · 12 goals"`, hidden while empty), responsive grid of bordered `bg-card` group blocks, 44 px rows,
  kebab with Rename and Delete (confirmed through `ui/dialog.tsx`), skeleton, `role="alert"` error with retry,
  empty state that names the action, inline "new group" dashed block.
- A goal row is a `Link` to `/goals/:id` with 44 px minimum height: title on one line (truncating), then a
  meta line with `#tag` chips and the category chip in `text-muted-foreground`. Nothing else.
- Each group block has an inline composer at the bottom: `Add a goal…`, Enter creates the goal and navigates
  to its detail.
- `/goals/:id`: reading column `mx-auto w-full max-w-[720px]`, back link (`ArrowLeft`) to `/goals` above the
  group name, title as a borderless `text-[24px] font-semibold` input, the meta row (category select + tag
  chip input) under it, then the editor with the same prose styling the notebook uses. Autosave indicator where
  the notebook puts it.
- Tag chips: `#name` with a trailing X icon button, `aria-label="Remove #name"`, 44 px hit area, suggestion
  popup built from `MenuPopup`/`menuItemClassName` anchored to the input, filtered by the typed text.
- Category: `Select` with the existing categories, a "New category…" item that reveals an input, and a
  "No category" item.

## Tasks

| ID | Scope | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | Server: `goal_groups`, `goals`, `tags`, `categories`, `goal_tags`; migration `0009`; repository with vocabulary reuse; `/api/goals` routes; route + migration tests (S4, S5, S7, S8, S12) | delegated → `gentle-ai-worker` | done | L3, L4, L7 |
| T2 | Web: `/goals` list, `/goals/:id` detail with `NoteEditor`, tag chip input, category select, autosave, registration (S1–S6, S9–S12) | delegated → `gentle-ai-worker` | done | L3, L5, L9 |
| T3 | Independent verification of the whole feature (migration, vocabulary reuse, editor autosave) | delegated → `gentle-ai-verify` | done | L6, L7 |

Risk: item 1 (a new migration and a new persisted document format) and item 3 (`App.tsx`, `app-shell.tsx`,
`global-dock.tsx` are shared by every route).

## Log

**L1** — 2026-10-23. User request, verbatim:

> genial ahora de igual menarea crea una parte de Goals&Objetives o como se diga en ingles las metas y
> objetivos
> Esto de nuevo simple, y va a ser usando el editor que tenemos en notas o lo de notebook de los libros, preo
> poder agrupar como en las tareas, aparte deben de llevar tags (#) y categoria, yo las ingreso y si pongo una
> esta disponible para las demas, entiendes?

**L2** — 2026-10-23. Decisions taken without asking, all reversible:

- Label `Goals`, route `/goals`. The user offered "Goals & Objectives or whatever it is called in English"; one
  short noun beats a compound that would not fit the sidebar or the dock.
- Editor: the **notebook** mount, not the notes shell. `NoteEditor` is already a controlled
  `value: JSONContent` / `onChange` component whose page-only props are optional, and the notebook is the
  proven minimal wrapper: `value` + `onChange` + `useAutosave` + `uploadImage`. Reusing `page-editor.tsx`
  would drag in the page title/icon state, the workspace outlet context and the subpage slash item.
- Editing happens on a detail route, not inline inside the group card: a rich document in a 1/3-width grid
  cell is unusable, and a single mounted editor per record keeps the autosave timer honest (S11).
- Tags and categories both follow "create by typing, share everywhere". The vocabulary is never deleted when a
  goal drops a tag or a category, because the whole point is that what you typed once stays available.
- The list endpoint deliberately omits goal content so the section stays cheap as documents grow.
- The `#` is a display convention on a chip field, not an in-editor mention mark: a mention extension would add
  serialization and keyboard conflict to a feature the user asked to keep simple.

**L3** — 2026-10-23. RED, as reported by the two writers before their implementations existed. Server:
`vitest run test/goals-routes.test.ts` returned 404 where group creation expected 201. Web: the first
authorized suite run failed to resolve the not-yet-created `goal-page` and `tag-input` modules. The web
evidence is import resolution rather than an assertion failure — weaker than the server's, and recorded as
such rather than upgraded.

**L4** — 2026-10-23. Parent verification before the correction, from the workspace root: server 16 files /
143 tests, web 45 files / 319 tests, both typechecks clean, `pnpm build` clean. The `goals-page` and
`goal-page` chunks are separate and neither carries the editor: 10.14 kB and 9.10 kB, while the entry moved
from 1,609.77 kB to 1,610.91 kB (1.14 kB, the new section entry plus route wiring).

**L5** — 2026-10-23. The web worker returned `partial` on two points, and the parent finished both:

- The tag field had wrapped the input in a Base UI `Menu.Trigger`. That handler ran before the input's own
  keydown, constructed a `PointerEvent` jsdom does not implement, and swallowed Enter, so a typed tag was
  never added. Rewritten as a labelled combobox (`role="combobox"`, `aria-expanded`, `aria-controls`) over a
  plain suggestions list: Enter adds the typed text, Backspace on an empty field removes the last chip,
  Escape closes, suggestions add on mouse-down so the blur does not unmount them first. The accessible name is
  the visible "Tags" label, and the two tests now query `combobox` / `button` instead of the Base UI roles.
- The autosave status was `sr-only`; S6 asks for the indicator the notebook shows, so it is now a visible
  `role="status"` line beside the group name, with a reserved height so the header does not shift.

**L6** — 2026-10-23. Independent verifier, on a pristine scratch copy:

- S1–S7 and S9–S11 met, with runtime probes: version 9 → 10 adding exactly the five goals tables and leaving
  every seeded row and every prior schema object unchanged; tag and category vocabularies shared, reused
  case-insensitively, retained after the association is removed or cleared; `tagNames` replacing rather than
  merging; cascade deleting a group's goals and their links while leaving the vocabulary; one rich document
  round-tripped structurally while the list endpoint omits every `content`; checklist and task endpoints
  byte-identical against a scratch baseline.
- One blocker on S8: `PATCH {"content": null}` returned 200 and persisted `null`, because the route only
  tested `JSON.stringify`. That is realistic input for a client bug and it would have left a goal whose
  editor cannot mount.
- It reported S12 unmet only because the historical RED runs were not yet in this document; L3 records them.

**L7** — 2026-10-23. Correction and recheck, one batch. `server/src/routes/goals.ts` now requires `content`
to be a non-null, non-array object before the serializability check, and `server/test/goals-routes.test.ts`
gained a regression test: patch a real document, then send `null`, a string, a number and an array, expect
`400 invalid_content` for each, and assert the stored document is unchanged. The verifier's limited recheck
confirmed all four rejections with an unchanged database hash and an unchanged GET body, a valid document
still returning 200, `vitest run test/goals-routes.test.ts` green, and `tsc` clean. Server suite is now 16
files / 144 tests.

**L8** — 2026-10-23. Incidents. The verifier's first `pnpm` invocation inside its scratch copy downloaded
packages and used `/tmp/.pnpm-store/v11` outside scratch — the same class of breach the previous two features
recorded; the parent removed both scratch directories (`chub-verify.6yytec`, `chub-recheck.dAFZyP`). No
workspace file, build output or scratch path was left behind.

**L9** — 2026-10-23. `pnpm build` after the correction: `goals-page` 10.14 kB, `goal-page` 9.10 kB, `select`
32.82 kB, entry 1,610.91 kB (509.31 kB gzip). The editor itself stays in the shared chunk it already occupied
and is never reached from the list route.
