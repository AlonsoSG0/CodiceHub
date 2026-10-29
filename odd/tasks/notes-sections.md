# Notes — a Notion-shaped sidebar tree with sections the user owns

Objective: replace the one flat page tree with `Favourites`, the default `Pages` shelf and any number of sections
the user creates, and restyle the tree so it reads like Notion instead of a list of rows. Conversation stays in
Spanish, artifacts in English. Branch: none — uncommitted tree. Delivery: no commits. Verification: the change's
own tests, `pnpm typecheck`, `pnpm test`, `pnpm build` and a visual pass; no independent verifier.

The user's words: *"quiero mejorar el sidebar en especifico el Tree, no me gusta, quiero un tree mas como Notion
esa estetica me gusta y poder tener secciones, como favoritos y pages, pero tener otras y poder crearlas yo y asi
organizar mas"*.

## Specs

**S1 — Sections are data, not decoration.** A `page_sections` row is `{ id, name, position }`. Every page carries
`sectionId`; a page without one belongs to the default `Pages` shelf (`null`). A page under a parent inherits its
root's section, so a section owns whole subtrees. Root ordering is per section: two roots in different sections
can both have position `0`. Migration `0018`.

**S2 — The sidebar reads like Notion.** From top to bottom: `Favourites` (computed, only when non-empty),
`Pages`, one shelf per stored section in their order, `New section`, and `Trash` pinned at the bottom. Every shelf
heading is 22 px tall, 11 px muted, with a chevron that collapses its own tree; the collapsed set is persisted
next to the expanded set (`chub-notes-collapsed-sections`).

**S3 — The user owns the sections.** A quiet `New section` row creates one named `New section` and drops straight
into inline rename. A shelf's `⋯` menu renames it (inline) or deletes it; deleting moves its root pages to the top
level of `Pages`, preserving them and their subtrees. `Pages` itself cannot be renamed or deleted.

**S4 — A page can be created in a shelf.** The sidebar header `+` creates a page in `Pages`; every shelf heading
has its own `+` that creates a root page inside that section. `POST /api/pages` accepts `sectionId`.

**S5 — Pages move between sections.** Dragging a page over another shelf's tree highlights it and dropping moves
the page to that shelf's top level; `Move to…` also lists the shelves, so the same move exists without a pointer.
Both sides reindex, and the moved subtree carries the destination section.

**S6 — The tree itself.** Rows are 28 px (40 px on touch) with a 6 px radius, 13 px text, a 16 px indent per
level, a hover/focus fill and the same fill plus medium weight for the current page — no left rule. The chevron
slot is always reserved but its button only appears when the row is expanded, hovered or focused, so a collapsed
tree stays quiet. Row actions (`+`, `⋯`) appear on hover/focus and stay reachable with the keyboard. The drop
indicator stays a 2 px hairline between rows and a 1 px inset ring for "inside", never a colour.

**S7 — Nothing else regresses.** Favourites and Recent keep working, the row menu keeps rename, favourite, move,
copy link and trash, `/notes` still lists every page with its trail, and backlinks, duplicate, export and the
search palette are untouched.

**S8 — Shelves reorder.** The shelf menu offers `Move up` and `Move down`, disabled at the ends, and the order is
persisted: `POST /api/sections/:id/move` reindexes the shelf positions and answers the rows that changed. Deleting
a shelf closes the gap so the order stays contiguous. Page drag stays page drag; shelves move from their menu.

## Tasks

- T1 — migration `0018`, `page_sections` table, `pages.section_id`, section repository (list/create/rename/delete),
  section routes, and section-aware root ordering in the pages repository. (S1, S3) — done.
  `server/drizzle/0018_page_sections.sql`, `server/src/db/schema.ts`, `server/src/pages/repository.ts`,
  `server/src/routes/pages.ts`.
- T2 — `create`/`move`/`restore`/`purge`/`duplicate` respect sections; `MovePageInput.sectionId`. (S1, S5) — done.
  Moving a subtree updates one column for its ids, and those rows come back so both trees redraw.
- T3 — client API: `PageSection`, `fetchSections`, `createSection`, `renameSection`, `deleteSection`, and
  `sectionId` on create/move. (S1, S4, S5) — done. `web/src/lib/api.ts`, `web/src/features/pages/tree.ts`.
- T4 — the sidebar: shelves, per-shelf tree, headings, inline rename, new section, collapsed state. (S2, S3, S4) —
  done. `web/src/features/pages/sidebar-shelf.tsx`, `sidebar-state.ts`, `web/src/components/layout/app-shell.tsx`.
- T5 — cross-shelf drag and `Move to…` with shelves. (S5) — done. `draggedId` lives in the shell so any shelf
  heading accepts the drop; the dialog lists shelves first, then pages.
- T6 — the Notion-flavoured row and section styles. (S6) — done. `page-row.ts`, `page-tree.tsx`,
  `web/src/styles/shell.css`.
- T7 — shelf reordering: `moveSection` in the repository, `POST /api/sections/:id/move`, `moveSection` in the
  client API, `Move up`/`Move down` in the shelf menu, and the gap closed on delete. (S8) — done.

## Log

**L1** (user, verbatim): "me gusta, ahora usando la skill de ux ui pro max quiero mejorar el sidebar en especifico
el Tree, no me gusta, quiero un tree mas como Notion esa estetica me gusta y poder tener secciones, como favoritos
y pages, pero tener otras y poder crearlas yo y asi organizar mas"

**L2** — Scope read: sections are user-created shelves that own root pages and their subtrees, one section per
page; `Favourites` stays computed; nothing is nested inside a section besides the page tree. Not requested: section
reordering, sharing, per-section permissions.

**L3** — Decisions. The section lives on every page instead of only on roots, so filtering a shelf is a filter and
never a walk; moving a subtree updates one column for its ids. The move contract keeps `sectionId` optional and the
client omits it when unchanged, so every existing move body stays byte-identical. `Delete section` is destructive
only to the shelf: pages land at the top of `Pages`, which is why it does not ask for confirmation. Inline rename
rather than a dialog because the shelf is a name you type once.

**L4** — The tree, restyled after Notion. Rows are 28 px (40 px on touch), 6 px radius, 13 px text, 16 px per
level. The disclosure chevron sits in a slot that is always reserved but whose button only appears when the row
is expanded, hovered or focused, so a collapsed tree reads as clean names. The selected row is a 10% fill and
medium weight instead of the old 2 px left rule. Shelf actions (`+`, `⋯`) appear on hover and stay reachable by
keyboard; the `Pages` shelf cannot be renamed or deleted. Per-shelf collapse survives a reload
(`chub-notes-collapsed-sections`) and every tree is named after its shelf for assistive tech.

**L5** — Verification observed. `pnpm typecheck` clean; `pnpm --filter @chub/server test` 165 passed;
`pnpm --filter @chub/web test` 352 passed; `pnpm build` clean. Visual pass at 1280: created a shelf from
`New section`, named it inline, created a page inside it, opened the Move dialog and saw `Pages` and the new shelf
as destinations. The shelf and the probe page were removed afterwards; the dev tree is back to its two pages.
Not eyeballed at 375/768.

**L6** — Reordering added after the user asked for it. `Move up` / `Move down` live in the shelf menu because the
heading already accepts page drops and two drag kinds on one target is a trap; the menu is also the only version
that works on touch and with a keyboard. The server reindexes and answers only the rows whose position changed,
and deleting a shelf closes the hole. Verified: 167 server tests (reorder, no-op move, contiguous after delete,
route contract with `invalid_position` and `section_not_found`), 353 web tests (Move up posts `{position: 0}` and
the headings swap), build clean, and a live pass that reordered `Reading` above an existing shelf and saw the
sidebar follow. The two probe shelves were deleted; the shelf the user had already created was left untouched.


