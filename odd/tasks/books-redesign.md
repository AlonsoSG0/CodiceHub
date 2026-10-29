# Books — full UI/UX redesign in the light direction, cards kept

Objective: rebuild the `/books` interface with the same direction the habits redesign settled on — open ground,
hairlines instead of boxes, compact controls, less visual weight — while keeping every function and **keeping the
book-card concept**. The user's words: *"tomemos este rediseño que hiciste y ahora con esta direccion rediseña
/books, lo mismo re hacer ui y solo tomar las funciones, lo unico que si me gustaria conservar es los libros tipo
cards, pero si puedes mejorar la card que tenemos genial"*. Branch: none — uncommitted tree. Delivery: no commits.
Verification is scoped: the change's own tests, typecheck, build and a visual pass; no independent verifier.

## Specs

**S1 — The mandate.** Recreate the interface, not restyle it: new page architecture, new card, new dialog and
notebook framing. Every item in S2 still works afterwards.

**S2 — Parity contract.**

- **F1 Reading history.** The reading habit's matrix stays the first block on the page, read-only, with its period
  control (Month/Quarter/Year), previous/next window and the Mono/Activity view switch.
- **F2 Reading log.** The day strip plus the reading habit's rows (`Done` check, `Minutes` number, `Pages` text
  where the book title goes) remains the only place a reading entry is written, with the same optimistic check,
  blur/Enter commits, future-day block and error surface.
- **F3 Library.** Every book renders as a card; clicking it opens the edit dialog; the card's notebook action
  creates the notebook if needed and navigates to `/books/:bookId/notebook`.
- **F4 Add and edit.** The header's add control opens the dialog empty; clicking a card opens it with the book's
  data and its last-edited time. Title is required, score is 0–10, the draft resets on open, and saving creates or
  patches through the existing API.
- **F5 Cover.** A book carries either an uploaded image or a pasted URL; the card shows it as the face with the
  title, author, status and score over a scrim; without one the card keeps a typographic cover. Upload, preview and
  remove keep working in the dialog.
- **F6 Delete.** A book can be deleted from the dialog. The redesign adds the confirmation the old flow lacked,
  because a book owns a notebook.
- **F7 Notebook.** `/books/:bookId/notebook` loads the book and its notebook, keeps the autosave (700 ms, status
  line, failure keeps the text), and keeps the "No notebook yet" and load-failure states plus the back links.
- **F8 Section isolation.** The books reading habit stays out of the habits page (`section: "books"`).
- **F9 Status and score.** `reading`, `completed`, `wishlist`, `abandoned` and a 0–10 score are preserved, shown on
  the card and editable in the dialog.
- **F10 Routes and bundle.** `/books` and `/books/:bookId/notebook` stay standalone lazy routes outside
  `AppShell`, each with its own `ThemeToggle`/back links, and the notebook's editor stays out of the books list
  chunk.
- **F11 States.** Loading, load failure with retry, empty library, empty history and empty log.

**S3 — Page architecture.** Same skeleton as the habits page: header with title, one-line summary and a compact
add action; a three-stat band computed on the client from the books and the entries; a hero grid with the reading
history wide on the left and the reading log as a sticky rail on the right (stacked, log first, below `lg`); then
the library as the main body.

```
Books · "6 on the shelf, 2 finished this year"          [+ Add book]
┌ Reading now 2 ──────┬ Finished 2026 3 ─┬ Reading streak 5 days ┐
┌ Reading history (matrix) ──────────────┐ ┌ Reading log (rail) ┐
│ Month Quarter Year   Mono Activity     │ │ Fri, Oct 23        │
│ [ matrix ]                             │ │ day strip          │
└────────────────────────────────────────┘ │ Done/Minutes/Pages │
Library                                     └────────────────────┘
[All] [Reading] [Completed] [Wishlist] [Abandoned]      6 books
┌card┐ ┌card┐ ┌card┐ ┌card┐
```

**S4 — The card, improved.** The concept survives: a portrait card that reads as a physical book, with the spine
on the left and a typographic or photographic face. What changes is its weight:

- Width follows the grid (`minmax(10rem,1fr)`), `aspect-[3/4]`, `rounded-lg`, `border border-border/70`, **no drop
  shadow**; hover is a 2 px lift and `border-foreground/25`, not a floating slab.
- The spine is a 4 px band whose tone still comes from the title, at reduced opacity; the second edge line goes.
- No-cover face: `bg-muted`, title 14 px semibold, author 12 px muted, vertically centred, with the spine and a
  hairline at the bottom carrying status and score.
- Cover face: image, a bottom scrim only (no full-height gradient), title 13 px and author 11 px in white.
- Status is a dot plus an 11 px label, not a bordered pill; the score is `8.5` in 11 px tabular at the far right.
- The notebook action is a 32 px icon button revealed on `group-hover` and `focus-within`, always present in the
  DOM with an `aria-label`, and always visible on touch widths.
- The 3D tilt survives at a reduced `maxTilt={4}`; no custom shadows.

**S5 — Filter chips.** The library gains a compact segmented filter — All / Reading / Completed / Wishlist /
Abandoned — computed on the client from the loaded books, with counts, defaulting to All. No API change, no sort,
no search, no new field.

**S6 — Dialog.** Same fields, less chrome: a two-column grid on wide screens (identity on the left, reading data
on the right), visible labels, 36 px inputs, the cover block as a framed preview with Upload/Remove, and a
separated destructive action that asks for confirmation before deleting.

**S7 — Notebook framing.** Reading column `max-w-[720px]`: back link to `/books`, book title 20 px and author
13 px muted on one line group, autosave status on the right, then the editor. No card, no box.

**S8 — Visual system.** `ui-ux-pro-max` is mandatory for design decisions. Reuse `tokens.css`; no new dependency,
no new font, no new CSS variable, no hardcoded colour, Lucide only, 8 px rhythm, 150–200 ms colour/opacity
transitions, `prefers-reduced-motion`, dark mode from tokens. Controls stay at least 36 px tall and icon-only
controls at least 44 px on touch.

**S9 — Boundaries.** No server change, no API change, no schema change. `books-api.ts`, `reading-calendar.tsx`'s
behaviour, `features/habits/*` and `components/amicro/tilt-card.tsx` are off limits except for the class names a
caller passes. Touches `web/src/features/books/`, `web/src/App.tsx` only if a route must change (it should not),
and `web/src/styles/shell.css` only if a class is genuinely needed.

**S10 — Tests.** `book-notebook-page.test.tsx` is rewritten against the new framing and keeps its three
behaviours; `books-page.test.tsx` and `reading-calendar.test.tsx` are rewritten against the new page and card and
must cover F1–F6, F9 and F11. No snapshots, no E2E, no exhaustive UI coverage.

**Non-goals:** pages-read tracking, ratings aggregation, sort/search, a second route for book detail, changing the
reading habit's fields, and touching the server.

## Design brief

- Reuse the habits page's exact rhythm: `mx-auto max-w-[1240px]`, `gap-6 sm:gap-7`, `px-4 sm:px-6`,
  `py-6 sm:py-8`; panel labels 13 px muted normal case; stat values 18 px semibold `tabular-nums`; hairline
  separators (`border-y`, `border-t`, `divide-y`); no cards around sections.
- The hero mirrors habits: `lg:grid-cols-[minmax(0,1fr)_340px]`, the rail `lg:sticky lg:top-6
  lg:border-l lg:border-border lg:pl-6`.
- Library grid: `grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`.
- Filter chips: `h-8 rounded-md px-2.5 text-xs`, active `bg-muted text-foreground`, inactive `text-muted-foreground`.
- Empty library: one sentence plus the add action, no dashed box.

## Tasks

| ID | Scope | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | Web redesign: page architecture, stat band, card, filters, dialog, notebook framing, rewritten DOM tests (S3–S10) | delegated → `gentle-ai-worker` | done | L4, L5 |

Risk: item 6 — the DOM tests are rewritten, so parity rests on the F checklist. Verification is the change's own
suite plus a visual pass, by the user's instruction.

## Log

**L1** — 2026-10-23. User request, verbatim:

> ahorita nada de reviews en nada,
> Exactamente este resultado es el que busco, es genial ahora tomemos este rediseño que hiciste y ahora con esta
> direccion rediseña /books, lo mismo re hacer ui y solo tomar las funciones, lo unico que si me gustaria
> conservar es los libros tipo cards, pero si puedes mejar la card que tenemos genial lo que quiero conservar es
> el concepto/idea de que quiero cards, dale y recuerda verificacion acotada para ir mas rapido

**L2** — 2026-10-23. Receipt-driven development was turned off clone-local at the user's instruction ("nada de
reviews en nada"), so no review lifecycle runs for this or later changes until the user turns it back on.

**L3** — 2026-10-23. Decisions taken while designing:

- The page copies the habits skeleton instead of inventing a third layout: two sections of one app should feel
  like one product, and the habits page is the one the user just approved.
- The reading history stays first because the books feature document already decided that; it becomes a panel
  without a box, not a smaller block.
- The card keeps the tilt at 4 degrees and its spine, because they are the "book" idea the user asked to keep; it
  loses the drop shadow, the second edge line and the bordered status pill, which were the weight.
- A status filter is added because a shelf without grouping is unusable past a dozen books; it is client-side
  over already-loaded data, so nothing new reaches the server.
- Deleting a book gains a confirmation. The old flow deleted instantly from a dialog, and a book owns a notebook.

**L4** — 2026-10-23. Writer result: `books-page.test.tsx`, `reading-calendar.test.tsx` and `book-notebook-page.test.tsx`
rewritten (3 files / 16 tests), full web suite green, typecheck and build clean. `books-page` is its own 26.98 kB
chunk, `book-notebook-page` 3.16 kB, entry unchanged at 1,610.98 kB. The writer reported `partial` only because it
could not do a pixel or mobile pass.

**L5** — 2026-10-23. Parent pass at 1280 px in light and dark, and what looking found:

- Two regions and two headings called "Reading history" were stacked (the page wrapper plus the matrix's own
  "Consistency" plate). `HabitMatrix` gained an optional `heading` prop, defaulting to "Consistency" for habits, so
  books names the same view "Reading history" and the wrapper is now a plain `div`. One named region, one heading.
- Pluralisation: "1 books" and "1 shown · 1 books" became "1 book".
- The 340 px reading rail broke when a habit has three fields: check, `0/2`, `Minutes`, the input and `Pages` fought
  for one line. The row in `today-strip.tsx` is now two lines — identity, streak and the check cluster on the first;
  number and note fields indented under it. This is shared with `/habits`, where it reads better too.
- A book with no author rendered "Unknown author" twice; the line is now omitted.
- Also fixed while reviewing: the delete flow now confirms before removing a book that owns a notebook (F6).

Verification for this pass, per the user's instruction, was the parent's own: 45 files / 315 tests, typecheck,
build, and the two browser passes above. No independent verifier and no review lifecycle.
