<p align="center">
  <img src="web/public/brand/CodiceHub_Banner_Oscuro_Iconos.png" alt="CodiceHub" width="100%">
</p>

<h1 align="center">CodiceHub</h1>

<p align="center"><strong>English</strong> · <a href="README.es.md">Español</a></p>

<p align="center">
  Notes, habits, books, tasks, goals and a daily routine in one place.<br>
  Everything lives in a single SQLite file, served by one binary you own.
</p>

---

## What it is

CodiceHub is a personal workspace: a Notion-like notebook where the notes sit next to the things you actually do
every day. There is no account, no sync and no server in the cloud — the whole app runs on your machine and the data
is a file you can copy to a USB stick.

It ships as **one Bun binary** that carries the API, the web app and the migrations, and serves them from your own
data directory. Alongside it there is a **CLI** for the terminal, so the same workspace answers `chub search`,
`chub todo` or `chub habits done Reading` without opening a browser.

## What's inside

| Area | What it does |
| --- | --- |
| **Notes** | A Tiptap editor with backlinks, favourites, sections, page icons, a full-text search index, trash with restore, and Markdown export |
| **Habits** | Multiple field types per habit (check, number, text), a day-by-day matrix, levels and streaks, archived habits |
| **Books** | Reading list with status, score and a notebook per book, wired to a reading habit so the pages you read today show up as habit entries |
| **Tasks** | Checklists with due dates, priority, recurrence and a "today" view — plus Kanban project boards with typed columns |
| **Goals** | Goals grouped in periods, with status, tags, categories and due dates |
| **Routine** | A weekly template of time blocks, marked day by day, where a block can mirror into a linked habit or move a linked task to its done column |
| **Home & search** | A dashboard of the day and `⌘K`-style search across every page |
| **Backups** | One command snapshots the database and rotates the newest three |

## Running it

**For development** (Node 25 and pnpm 12):

```sh
pnpm install
pnpm dev          # web on :1574, API on :3000, data in server/data
pnpm test
pnpm typecheck
```

Development keeps its own throwaway database in `server/data`, so experimenting never touches the data you actually
use.

**As the real thing** — build the binary and install it:

```sh
pnpm --filter @chub/cli build:binary     # → cli/dist/chub
cp cli/dist/chub ~/.local/bin/chub
chub                                     # serves the workspace and opens the browser
```

The binary stores everything under `~/.local/share/chub` (override with `CHUB_HOME`): the database, uploads, the
extracted web build and the backups. It listens on `127.0.0.1:3000` and nothing else.

## The CLI

The CLI talks to the same data home, so it works whether or not `chub` is running. Every command that takes an
entity accepts an id **or** a title, and every command has `--json`.

| Command | What it does |
| --- | --- |
| `chub search "orchid"` | Full-text search across pages |
| `chub notes` / `chub note <page>` | The page tree, or one page's metadata |
| `chub note new\|rename\|backlinks\|rm\|restore` | Page operations; the delete is the soft one |
| `chub todo` / `chub todo add` / `chub todo check` | Today's checklist, add an item, tick one off |
| `chub habits list\|done\|undo\|set\|log` | Habits, their values and their history |
| `chub habits add\|rename\|archive\|field` | Habit structure |
| `chub day` / `chub week` / `chub routine status` | The routine, and marking a block done, missed, excused or skipped |
| `chub prefs` / `chub pref set` | Every stored preference, including the workspace time zone |
| `chub backup` / `chub backups` | Snapshot the database, list the snapshots |
| `chub export <page> --out list.md` | A page as Markdown |

```sh
chub todo add "call the dentist #Errands" --due 2025-03-04
chub habits done Reading
chub routine status Gym done
chub search "orchid" --json
```

## How your data lives

```
~/.local/share/chub/
├── chub.db                 SQLite, WAL mode
├── uploads/                images referenced by your notes and covers
├── backups/                chub-YYYYMMDD-HHMMSS.db, newest three kept
└── runtime/<hash>/         the web build and migrations extracted from the binary
```

One file is the whole workspace. Copy it, back it up, or move it to another machine.

## Stack

| Layer | What it uses |
| --- | --- |
| Web | React 19, React Router 7, Vite 6, Tailwind CSS 4, Base UI (shadcn `base-nova`), Tiptap 3, Motion |
| Server | Hono 4 on Node, SQLite through better-sqlite3, Drizzle ORM, hand-written migrations |
| CLI | Bun: one compiled binary carrying the API, the web build and the migrations |
| Tests | Vitest with Testing Library and jsdom for the web, Vitest for the server, `bun test` for the binary |

## Status

This is a personal project, not a product. The v1 and v2 scope is shipped and the CLI is new; expect the shape to keep
moving. There is no multi-user support, no sync and no cloud — that is the point, not a gap.

## Documentation

- [`AGENTS.md`](AGENTS.md) — how the repository is put together and the rules that keep it consistent
- [`odd/tasks/`](odd/tasks) — the feature record behind every area: the specs, the tasks and the evidence
- [`design/`](design) — design sources, including the CodiceHub design system

## License

The code is [MIT licensed](LICENSE). The license covers the source code and nothing else: the **CodiceHub** name, word
mark, logo and the assets in `web/public/brand/` are excluded from the grant and remain reserved. A fork is welcome
as long as it ships under a different name and does not use the CodiceHub marks to identify itself.
