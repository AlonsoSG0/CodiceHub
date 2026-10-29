# Notes — sidebar redesign and the four defects behind it

Objective: the `/notes` module gets the pass the other sections already had — a sidebar with a real hierarchy
(favourites, recents, pages), touch-sized rows, persisted expansion, and a page menu that can act on a page — and
the four defects found in the analysis are fixed with it. The editor, the FTS search, the markdown export and the
soft-delete flow stay as they are. Branch: none — uncommitted tree. Delivery: no commits. Verification: the
change's own tests, `pnpm typecheck`, `pnpm test` and `pnpm build`; no independent verifier (the user asked for
narrow verification and reviews the UI themselves).

The user's words: *"si haz el bloque A y terminando vamos con el B"*, where Bloque A is the four bugs plus
`favoritos, recientes, fila compacta, persistencia, fila de 40px en touch`.

## Specs

**S1 — Mentions navigate.** Clicking a page mention opens that page in the app, without a full document reload.
Modified clicks (meta/ctrl/shift/alt) keep the browser behaviour and the plain-link fallback.

**S2 — The tree's recency is true.** After a page is created, renamed, written in, re-iconed or trashed, the
sidebar and `/notes` stop showing the timestamp the app loaded at startup. The index's relative time, its
"edited today" count and its newest-first order follow the page that was just edited.

**S3 — The last keystrokes survive a tab close.** A pending autosave is flushed when the tab is hidden or
unloaded, using a keepalive request. The debounce stays 700 ms and the existing status transitions do not change.

**S4 — A page can be moved without a pointer.** The row menu offers `Move to…`, which opens a dialog with a
filter and every valid destination (the page's own subtree and the page itself are never offered) plus
`Top level`. Choosing one issues the same move request the drag uses.

**S5 — Undo/Redo only exist when there is an editor.** The canvas toolbar renders them only while a page editor
is published, as icon-only controls with the accessible names `Undo` and `Redo`. On `/notes`, `/trash` and every
section outside the shell the toolbar no longer carries them.

**S6 — Favourites.** A page carries a `favorite` flag, persisted in SQLite through migration `0017`. The row menu
toggles it (`Add to favourites` / `Remove from favourites`) and the sidebar shows a `Favourites` group above the
tree, alphabetically, each row with its page icon and a hover action that removes it. Toggling a favourite does
not change `updatedAt` and therefore does not reorder recency.

**S7 — Recents.** When the workspace holds more than eight pages, the sidebar shows a `Recent` group with the
five most recently edited pages that are not already in `Favourites`, so the short tree is never duplicated.

**S8 — One compact sidebar header.** One row with the workspace title linking to `/` (the second Home affordance
is gone) and, below it, one 32 px row holding the search control with its keyboard hint and a square `New page`
button. Search keeps the accessible name `Search pages`.

**S9 — Rows and state.** Rows are 30 px tall on a fine pointer and 40 px on touch, with 32 px action targets on
touch. The active row keeps the 12% tint and gains a 2 px left rule. Expansion is persisted in `localStorage`
under `chub-notes-expanded`, degrades silently when storage is unavailable, auto-expands the active page's
ancestors, and offers `Collapse all pages` while anything is expanded.

**S10 — The mobile drawer closes on navigation.** Choosing a page in the sidebar on a phone closes the drawer
instead of leaving it over the page.

**S11 — The index follows the direction.** `/notes` uses hairlines instead of the page card and one compact
outline action instead of the filled `New page` button. Every column, the filter, the empty states and the
timestamps stay.

**S12 — Nothing else changes.** Routes, the editor's extension list, the FTS endpoint, export, trash, and the
five other sections are untouched.

## Tasks

- T1 — server: migration `0017`, `favorite` in schema, repository, route validation, migration test, repository test. (S6) — done. `server/drizzle/0017_page_favorites.sql`, `server/src/db/schema.ts`, `server/src/pages/repository.ts`, `server/src/routes/pages.ts`. Evidence: repository test `stores the favourite flag without touching recency…`, route test `favourites a page through PATCH…`, migration test asserts column + `user_version` 18. 157 server tests green.
- T2 — sidebar chrome: header row, search hint, `New page` icon button, single Home affordance, mobile close on navigate, toolbar controls. (S5, S8, S10) — done. `web/src/components/layout/app-shell.tsx`, `web/src/features/search/command-palette.tsx`, `web/src/features/editor/editor-bridge.tsx`, `web/src/styles/shell.css`. Evidence: App.test pins the hint, the single home link and the absent Undo/Redo; pages.test covers the drawer closing on navigation.
- T3 — tree: row sizes, active rule, persisted expansion, `Collapse all`, favourite toggle, `Move to…`. (S4, S6, S9) — done. `web/src/features/pages/page-tree.tsx`, `page-row.ts`, `sidebar-group.tsx`, `move-page-dialog.tsx`, `shell.css`. Evidence: expansion-across-reload test, move-from-menu test with destination filtering.
- T4 — `Favourites` and `Recent` groups. (S6, S7) — done. `web/src/features/pages/page-shortcuts.tsx`. Evidence: favourites-from-the-menu test, shelf rule test (threshold 8, favourites excluded from recents).
- T5 — defects: mention navigation, recency, keepalive flush. (S1, S2, S3) — done. `web/src/components/editor/mentions/index.ts`, `web/src/features/editor/page-editor.tsx`, `web/src/features/editor/use-autosave.ts`. Evidence: mention-click test, index-recency test, pagehide keepalive test.
- T6 — `/notes` index hairlines and outline action. (S11) — done. `web/src/features/pages/notes-index-page.tsx`. Evidence: visual pass at 1280.

## Log

**L1** (user, verbatim): "si haz el bloque A y terminando vamos con el B"

**L2** — Scope taken from the analysis turn: the four defects listed in `Bugs concretos` (mentions, stale recency,
autosave on close, pointer-only moves) plus the sidebar items (favourites, recents, compact row, persistence,
touch rows). Bug 5 (Undo/Redo) and bug 6 (expansion) ride along because they are the same toolbar and the same
sidebar. The index card was listed as "ruido de consistencia" and is included as S11.

**L3** — Decisions worth remembering. The favourite is data, not a timestamp: `PATCH {favorite}` updates the
column and leaves `updated_at` alone, so pinning never reorders recency (asserted in the repository test). The
sidebar keeps one compact row for search and `New page`; the second Home affordance was removed rather than
restyled. Recents appear only above eight pages and never repeat a favourite. Expansion lives in
`localStorage` under `chub-notes-expanded` behind a `try/catch`, because a sidebar that cannot remember is still
a working sidebar. `Move to…` exists because HTML5 drag does not exist on touch: the dialog lists every valid
destination, computed by `invalidDestinations`, and issues the same move request the drag uses. The autosave
flushes on `pagehide`/`visibilitychange` with `keepalive`, capped below the browser's 64 KiB limit, so a huge
document still saves through the ordinary request. Mentions now carry a real `href`, so modified clicks keep the
browser behaviour while a plain click routes.

**L4** — Verification observed. `pnpm typecheck` clean; `pnpm --filter @chub/server test` 157 passed;
`pnpm --filter @chub/web test` 342 passed; `pnpm build` clean. Visual pass at 1280 over `/notes`: the sidebar
header row, the Favourites shelf appearing and clearing, the row menu order, and the Move dialog. Not eyeballed
at 375/768 (the browser harness would not resize); the touch rules are CSS media queries plus one drawer test.
One real page in the dev database was favourited and unfavourited during the pass, and its `updatedAt` stayed
untouched, which is S6 holding in the live app.

