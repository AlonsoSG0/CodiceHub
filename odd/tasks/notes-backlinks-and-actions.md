# Notes — backlinks, duplicate and a page menu that acts on the page

Objective: the second half of the `/notes` work. Pages stop being islands: a page that is mentioned somewhere
shows who mentions it, a page can be duplicated with its subtree, and the toolbar menu acts on the page instead of
only exporting it. Branch: none — uncommitted tree. Delivery: no commits. Verification: the change's own tests,
`pnpm typecheck`, `pnpm test`, `pnpm build` and a visual pass; no independent verifier.

The user's words: *"vamos con el bloque B, dale"*, after B was defined as `backlinks ("Linked from"), duplicar
página y el PageMenu completo`.

## Specs

**S1 — Backlinks exist.** `GET /api/pages/:id/backlinks` returns every non-deleted page whose Tiptap content holds
a `pageMention` node pointing at `:id`, excluding the page itself, ordered by title, each with `id`, `title`,
`icon` and a `context` string: the text of the first block that mentions it, whitespace collapsed and trimmed.
A missing page answers `page_not_found`.

**S2 — The panel is quiet.** The page shows a `Linked from` section below the editor, on a hairline, one row per
page with its icon, title and context. It renders only when there is at least one backlink; a failed request
hides it instead of putting an error box inside a document.

**S3 — Duplicate copies the subtree.** `POST /api/pages/:id/duplicate` creates one copy of the page and of every
descendant, with fresh ids, the same titles, icons and content, and `favorite` off. The copy lands as the next
sibling of the original, named `<title> (copy)` (an empty title stays empty). It answers `201` with the new root
page and `page_not_found` for an unknown id.

**S4 — The page menu acts on the page.** The toolbar menu carries: page info (word count and last edit), Export as
Markdown, Duplicate, Add to/Remove from favourites, Move to…, Copy link and, separated, Move to trash. Duplicate
refreshes the tree and navigates to the copy; Move to… offers the same valid destinations as the row menu. The
menu does not render on a route without a page (`/notes`, `/trash`), instead of showing dead items.

**S5 — Nothing else moves.** The row menu keeps its items (rename, favourite, move, copy link, trash), the
migration and route contract from Bloque A are untouched, and every other section keeps its own chrome.

## Tasks

- T1 — server: `PageBacklink` + `backlinks()` with context extraction, `duplicate()` with subtree and sibling
  placement, the two routes, repository and route tests. (S1, S3)
- T2 — client API and the `Linked from` panel under the editor. (S1, S2)
- T3 — the full `PageMenu` and the props AppShell has to pass it. (S4)
- T4 — a shared `copyPageLink` and the removal of the dead toolbar control. (S4, S5)

## Log

**L1** (user, verbatim): "vamos con el bloque B, dale"

**L2** — Scope is exactly what the analysis proposed as B: backlinks driven by the mentions that already exist,
duplicate with subtree, and the full page menu. No tags, no templates, no version history.

**L3** — Decisions. Backlinks are resolved in SQL with `json_tree` over `pages.content` (guarded by `json_valid`),
not with `LIKE`, so a body that merely contains the text of an id cannot produce a false backlink. The context
line is extracted from the first enclosing block on the server, because a backlink you cannot place is useless
once twenty pages mention the same page. Duplicate reuses `subtreeRows` and `reindex`, so positions stay
contiguous without new SQL. `PageMenu` does not render without a page: a disabled menu of things you cannot do is
the same dead chrome the Undo/Redo fix removed from the toolbar.

**L4** — Verification observed. `pnpm typecheck` clean; `pnpm --filter @chub/server test` 160 passed;
`pnpm --filter @chub/web test` 345 passed; `pnpm build` clean. Visual pass at 1280: a page shows `Linked from 1`
with the source title and its sentence, the toolbar menu carries the full set with Move to trash in destructive
red, and Undo/Redo appear only now that an editor is open. The probes used for that pass were created and purged;
the dev tree is back to the one page it had.
