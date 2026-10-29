# Editor blocks, mentions and small affordances

Status: in progress. Feature document for the editor gaps found when comparing this editor with Notion, excluding
everything that needs a new data model (comments, version history, people mentions, synced blocks, sharing).
Subagents read this file in order and stop before `## Log`.

## Specs

**S1 — Callout.** The user's words: "Callout (bloque destacado con emoji)". A `callout` block inserted from the slash
menu, holding rich text, with an emoji shown beside the content that can be changed from a small preset palette; the
emoji is part of the document and survives save and reload.

**S2 — Toggle.** The user's words: "Toggle (bloque plegable)". A `toggle` block: a clickable summary line plus a
collapsible body that can hold any blocks. The open or closed state is stored in the document, so it survives reload.

**S3 — Table of contents.** The user's words: "Tabla de contenidos (índice de los headings de la página)". A
`tableOfContents` block that lists the headings of the page (levels 1 to 3), updates as the document changes, and
scrolls to the heading when an entry is clicked.

**S4 — A table you can actually use.** The user's words: "La tabla es inalcanzable... no hay ningún camino en la UI
para insertarla ni para agregar/borrar filas y columnas" and the agreed scope: insert from the slash menu, add and
remove rows and columns. A "Table" slash item inserts a 3x3 table with a header row, and while the cursor sits inside
a table a control bar offers: add row above, add row below, delete row, add column left, add column right, delete
column, toggle header row, and delete table.

**S5 — Mentions and in-content page links.** The user's words: "Menciones @ y páginas dentro del contenido" and
"/página". Typing `@` opens a suggestion list of pages filtered by title and inserts an inline mention that renders the
page's current title; the "/page" slash item creates a subpage of the current page and inserts its mention. When no
page list and no create callback are provided (the bare reusable editor), the `@` trigger and that slash item are
absent, never broken.

**S6 — Word and character count.** The user's words: "Contador de palabras/caracteres". The page header shows the word
and character counts and updates as the document changes, computed from the editor state, with no new dependency.

**S7 — Missing shortcuts.** The user's words: "Atajos que faltan: resaltado y link". `Mod-Shift-h` toggles highlight on
the selection. `Mod-Shift-k` on a selection opens a small URL field and applies the link, and on a selection that is
already a link it removes the link instead. `Mod-k` stays with the command palette.

**S8 — Image by URL.** The user's words: "Insertar imagen por URL (hoy solo subiendo archivo)". A slash item "Image
from URL" opens the same URL field and inserts an image node with that source.

**S9 — The reusable editor keeps its contract.** Mounting `NoteEditor` without optional props must still issue zero
network requests, import nothing from `@/lib` or `@/features`, and render without a page list. Every new capability
arrives through an optional prop or a factory the container supplies.

## Tasks

- **T1** — Callout, toggle and table-of-contents nodes with their slash-item factories and tests. — S1, S2, S3 — worker — `web/src/components/editor/blocks/**` — no commit
- **T2** — Table slash item and the in-table control bar with tests. — S4 — worker — `web/src/components/editor/table/**` — no commit
- **T3** — Page mention node, the `@` suggestion and the `/page` slash item, with tests. — S5 — worker — `web/src/components/editor/mentions/**` — no commit
- **T4** — Pure pieces for the header stats and the URL field, with tests. — S6, S7, S8 — worker — `web/src/components/editor/extras/**` — no commit
- **T5** — Register everything, add the slash items and shortcuts, wire the optional props, and update the editor tests. — S1-S9 — parent — `web/src/components/editor/note-editor.tsx`, `web/src/components/editor/note-editor.test.tsx`, `web/src/features/editor/page-editor.tsx`, `web/src/features/editor/page-editor.test.tsx` — no commit
- **T6** — Verify S1-S8 in a real browser on scratch pages, then purge them. — S1-S8 — parent — none — no commit
- **T7** — Independent verification. — S1-S9 — verify — none — no commit

## Log

- **L1** (user, verbatim): "crees que nos falta algo que tenga notion que nosotros no quitando las cosas obvias de sync DB y cosas de ese estilo? me refiero mas al editor"
- **L2** (user, verbatim): "Haz todo menos lo que es Fuera del editor" — the authorized scope is every gap listed in the answer except comments, version history, people mentions, synced blocks and sharing, which all need a new data model.
- **L3** (evidence, verified before designing): typing in a real page produced `heading` from "# ", `bulletList` from "- ", `blockquote` from "> ", `codeBlock` from a fenced block, so the markdown-style shortcuts already work; typing "@" produced no popup, so mentions are genuinely absent; and `grep` over the vendored block editor found no `insertTable`/`addRowAfter`/`toggleHeaderRow` anywhere, and the slash list has no table entry, which is what makes S4 a real gap rather than a guess.
- **L4** (design decisions): the callout emoji uses a small preset palette instead of the page-icon picker, so the emoji dependency is not loaded twice; the toggle stores its open state in a node attribute so it survives reload; the table of contents derives entries from the document at render time instead of storing them; the in-table controls are our own component because the vendored bubble menu must stay byte-identical; mentions receive data through props (`getPages`, `resolveTitle`, `onCreateSubpage`) so S9 holds; the word and character counts are computed from the editor state instead of adding a `character-count` dependency; and one URL field component serves both S7's link shortcut and S8.
- **L5** (review workload, on the record): this wave is roughly nine features in one uncommitted working tree, on top of the page-icons and toolbar work that is also still uncommitted. The commit shape stays the user's decision, as it was for the previous waves.
