# Books — a reading log with its own reading habit

Objective: a `/books` section, standalone like every other section (never inside the notes shell), that holds a
book registry and its own reading habit with a heatmap.
Branch: `main` (uncommitted)
Delivery strategy: `single-pr`
Test runner: `pnpm --filter @chub/server test`, `pnpm --filter @chub/web test`, `pnpm typecheck`

## Specs

- **S1 — Standalone section.** `/books` is a top-level route, a sibling of `/`, outside `<AppShell />`. It carries
  its own `ThemeToggle` and a link back to Home, exactly like the habits section.
- **S2 — Reading heatmap first.** The page opens with the reading habit's month heatmap, above everything else,
  always visible even with no habits at all. The habits section and the books section never show each other's
  habits: a habit carries a `section` (`habits` | `books`), the habits list reads `section=habits` and the books
  section reads `section=books`.
- **S3 — The reading habit's fields.** `Done` (check), `Minutes` (number, unit `min`) and `Pages` (text, where the
  book title is written so a day can be tied to a registered book). The habit is created on first visit.
- **S4 — Book registry.** Title, author, score, status, start date, completed date, link, expectation and a last
  edited time. `status` is one of `reading`, `completed`, `wishlist`, `abandoned`.
- **S5 — Add in a modal.** A `+` button in the page header that expands to `+ Add Book` on hover opens a dialog
  with every field.
- **S6 — Edit in a modal.** Clicking a book opens the same dialog with its data already loaded, and it carries the
  last edited time in its description.
- **S7 — Books as books.** Each book is a card drawn like a physical book: a spine band down the left edge whose
  graphite tone comes from the title, the cover carrying the title and author, and the status and score on the
  bottom edge. The card tilts in 3D on hover.
- **S8 — Cover image.** A book carries a cover: either a URL pasted into the dialog, or a local image uploaded
  through the existing `/api/uploads` route. The card shows the image as the face of the book, with the title,
  author, status and score riding on a scrim over it; without a cover the card keeps its typographic cover.
- **S9 — One notebook per book.** The book has a notebook: the same editor the notes use, but a single page with
  no tree of its own. It is created on the spot by a button in the bottom-right corner of the book card, and it
  lives at `/books/:bookId/notebook`.

## Tasks

- **T1** — `0003_books.sql`, the Drizzle table, the books repository and the Hono routes. — S4 — parent —
  `server/drizzle/0003_books.sql`, `server/src/db/schema.ts`, `server/src/books/repository.ts`,
  `server/src/routes/books.ts` — done, uncommitted
- **T2** — The web client and the `/books` page with the reading heatmap and the registry. — S1, S2, S3 — parent —
  `web/src/features/books/books-api.ts`, `web/src/features/books/books-page.tsx` — done, uncommitted
- **T3** — The `+ Add Book` expanding control, the add/edit dialog and the book cards. — S5, S6, S7 — parent —
  `web/src/components/ui/dialog.tsx`, `web/src/features/books/book-dialog.tsx`,
  `web/src/features/books/book-card.tsx` — done, uncommitted
- **T4** — The `section` column that keeps the reading habit out of the habits list. — S2 — parent —
  `server/drizzle/0004_habit_sections.sql`, `server/src/habits/repository.ts`, `server/src/routes/habits.ts`,
  `web/src/features/habits/habits-api.ts` — done, uncommitted
- **T6** — The book notebook: the table, the routes, the editor page and the card's notebook button. — S9 — parent —
  `server/drizzle/0006_book_notebooks.sql`, `server/src/books/repository.ts`, `server/src/routes/books.ts`,
  `web/src/features/books/books-api.ts`, `web/src/features/books/book-notebook-page.tsx`,
  `web/src/features/books/book-card.tsx`, `web/src/App.tsx` — done, uncommitted
- **T5** — The cover image: a URL or an uploaded file, shown on the card. — S8 — parent —
  `server/drizzle/0005_book_covers.sql`, `server/src/books/repository.ts`, `server/src/routes/books.ts`,
  `web/src/lib/api.ts`, `web/src/features/books/book-dialog.tsx`, `web/src/features/books/book-card.tsx` —
  done, uncommitted

## Log

- **L1** (user, verbatim): "ahora mejoremoas totalmente este de books / carga las skills de deiseño que tengamos para
  ahcer un rediseño de esta pagina / 1. para agregar un libro quiero un boton tipo + que al hacer hover con aniumacion
  aparexca a + Add Book / 2. para agregar Books tiene que ser en un modal / 3.la manera de mostrar los libros revisa que
  librerias tenemos, creo que amicron tiene tarjetas 3D, esas las usaremos para mostrar los libros, o tipo libro con el
  no,bre del libro / adelante"
- **L2** (user, verbatim): "en /books tendremos ese habito fijo con su heatmap y debemos tener el check de Done, uno de
  Minutes que sea solo numero, y otro de Texto que sea Pages y poder tenerlo ligado a un libro que tengamos registrado /
  tener el registro de libro con lo normal, titutlo, autor,Score, estatus, start, completed, link, Expectation y un last
  edited time, primero haz eso y despues pulimos"
- **L3** (decision, section separation): the reading habit needed its own storage, but duplicating the whole habit
  stack was not worth it. A `section` column on `habits` keeps one implementation and two isolated lists, and the
  books section's habit never appears in `/habits`.
- **L4** (evidence, the heatmap animation): `GraphHeatmap` revealed its rows with `whileInView` and
  `viewport={{ once: true }}`, so a habit added after the first paint stayed invisible until a reload. The gate
  became `animate="show"`, and the vendored component's shape is overridden from the call site with `!` modifiers
  rather than by editing the vendored file.
- **L5** (bug, the stub not the app): the books page test failed with the new book rendered twice. The cause was
  the test's own stub handing out the live `books` array, so the POST's `push` mutated the state React already
  held. The stub now returns copies. Nothing in the app was wrong.
- **L6** (evidence, the hover control): `group-hover` in Tailwind v4 compiles inside `@media (hover: hover)`, so the
  expanding `+` button needs a `@media (hover: none)` fallback to stay readable on a touch device, and a
  `group-focus-visible` variant so a keyboard user sees the label too.
- **L7** (decision, cover storage): the cover is a plain `cover_url` column holding either an absolute URL or the
  `/uploads/…` path the server already serves images from, so an uploaded cover and a linked one need no second
  mechanism. The image upload itself reuses `/api/uploads` through a new `uploadImage` helper in `web/src/lib/api.ts`.
- **L8** (bug, the score on create): the books repository validated the score and the status only on update, so a
  malformed book was accepted by `POST /api/books`. The create path now validates both, and
  `server/test/books-routes.test.ts` covers the whole registry contract.
- **L9** (decision, the notebook's shape): the notebook is a separate table with one row per book rather than a
  page in the notes tree, because a book is not a note and the notes tree belongs to the notes section. The editor
  is the notes one, reused as is: it is mounted without `onCreateSubpage`, so the slash menu offers no sub-page
  command, and without the page list, so it offers no page mentions either.
- **L10** (evidence, the card's notebook button): the card is a button, so the notebook button cannot live inside
  it. The card's own button became an absolutely positioned layer and the notebook button is its sibling, which
  keeps both reachable by keyboard and keeps the HTML valid.
- **L11** (decision, creation on demand): the notebook is created by the card's button, so a book that was never
  opened has no notebook row and the API reports `notebook_not_found` until it is created. `POST` on the notebook
  is idempotent: asking twice returns the same notebook.
- **L12** (user, verbatim): "vamos a usar kibo-ui , mira en books tenemos el tipo habito ese componente hay que
  cambiarlo por https://www.kibo-ui.com/components/mini-calendar que es muy parecifdo"
- **L13** (decision, what the mini-calendar replaces): books rendered two surfaces from the habits stack — the
  month heatmap (`HabitMatrix`, which S2 keeps) and the check-in panel (the week grid plus the day switcher).
  The mini-calendar is a day picker, not a heatmap, so it replaces the panel's day picking: the week grid and the
  day switcher become one strip of day chips, and the day detail below still edits the selected day. S2 is
  untouched, and `/habits` keeps the grid and the switcher exactly as they were.
- **L14** (decision, the panel's seam): `CheckInPanel` grew an optional `dayPicker` slot instead of a second
  panel. Without it the panel still renders the week grid and the day switcher, so `/habits` changes nothing; with
  it, both are replaced by the slot's own picker. The panel's write guard and its reachable-day bounds are
  shared either way, so a day that has not happened is still never recorded.
- **L15** (evidence, the vendored file): Kibo UI's mini-calendar declares `@radix-ui/react-use-controllable-state`,
  `date-fns` and `radix-ui`. None of them was added. The controllable-state hook is the port this repository
  already keeps in `web/src/components/kibo-ui/use-controllable-state.ts`, `date-fns` is replaced by four local
  helpers that follow the habits section's own local-noon calendar rule, and Radix's `Slot.Root` is replaced by
  `cloneElement`, which merges the trigger's props into the caller's element and composes the handlers exactly
  like the Slot does. Every substitution is written down at the top of the vendored file.
- **L16** (evidence, the month label): the upstream chip labels every day with its month, which is what a picker
  straddling a month boundary needs. A week strip does not: the heatmap above already says which month this is,
  and what a reader needs is the day of the week. The vendored component keeps the upstream chip, and the books
  composition draws its own on the project's button, with the reading state as one dot under the day.
