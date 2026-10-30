# chub CLI modules (step 4)

Fill the CLI with the product modules that carry real terminal value, after the habits layer. One file per module, so
several modules can be written at once without touching the same file. Follows `cli-commands.md` and `cli-habits.md`.

## Specs

**S1 — One file per module, one registry.** Every module lives in `cli/src/commands/<name>.ts` and exports
`export const <name>: Command` from `cli/src/command.ts`. Only the parent edits `cli/src/index.ts`, which imports the
module and adds it to `commands`. A module may use `withData`, `parseOptions`, `countArgs`, `dateOption`, `finite`,
`print` and `UsageError` from `command.ts`, `call` and `OpsError` from `ops.ts`, and `resolveNamed`/`looksLikeId` from
`resolve.ts`. No new dependencies, no SQL, no repository imports, no socket.

**S2 — Output contract.** stdout carries data only, stderr carries human messages. Exit `0` on success, `1` when the
domain says no (thrown `OpsError`, including `not_found` and `ambiguous`), `2` on a wrong invocation (thrown
`UsageError`). The parent's `fail` already maps both; modules must not call `process.exit`.

**S3 — Hybrid addressing.** Every command that takes an entity takes `<id-or-title>`: an id-shaped argument is used as
an id; anything else is a title matched exactly first and by unique substring after that, with ambiguity reported as
an `OpsError` listing the candidates. Use `resolveNamed` rather than writing another matcher.

**S4 — `chub search <text> [--json]`.** `GET /api/search?q=` → `{ results: [{ id, title, snippet }] }`. Read-only,
server-side `LIMIT 20`, no pagination, the query is already FTS-safe on the server. Human output shows the title, the
id and the snippet when non-empty; the id must be visible because other commands address pages by id. Empty results
print nothing and exit `0`. A missing query is a `UsageError`.

**S5 — `chub prefs [--json]`, `chub pref get <key> [--json]`, `chub pref set <key> <value> [--json]`.**
`GET /api/preferences` → `{ preferences: { "<key>": value } }`; `PUT /api/preferences/<key>` takes `{ value }`. `set`
parses the value as JSON and falls back to the plain string when it does not parse, so both
`pref set appearance.theme dark` and `pref set x '{"a":1}'` work. `workspace.timezone` is the preference every date
command depends on, so it must be reachable from here.

**S6 — `chub backups [--json]` and `chub backup [--json]`.** `GET /api/backups` lists them; `POST /api/backups` runs
`VACUUM INTO` and rotates to the newest three. `backup` prints the file name and where it was written. Restoring is
deliberately not exposed: it overwrites the live database and needs a running server, so it stays a user decision.

**S7 — `chub export <page> [--out <file>] [--json]`.** `GET /api/pages/:id/export.md` returns markdown. `<page>` uses
S3 against `GET /api/pages/tree`. Without `--out` the markdown goes to stdout; with `--out` the file is written and
the path goes to stderr, leaving stdout empty so the command stays pipeable. `--json` prints
`{ page: { id, title }, format: "markdown", markdown }`.

**S8 — `chub todo [--json]`, `chub todo add <text> [--list <name>] [--due <day>] [--priority <p>]`,
`chub todo check <item> [--json]`, `chub todo lists [--json]`.** The checklists module, served at `/api/checklists`.
`todo` shows what is open and relevant now: open items whose `dueDate` is today or earlier, plus open items with no
due date created today, grouped by list name. `add` appends to a list, which is resolved by name and is **not**
auto-created: an unknown list is a `UsageError` listing the known ones. A trailing `#Lista` in the text is a
convenience that routes to that list. `check` resolves the item by its text with S3 and sets `done: true`; note that
the server spawns the next occurrence when the item recurs, so the human line says so when `recurrence` is not `none`.

**S9 — `chub notes [--json]`, `chub note <page> [--json]`, `chub note new [--title <t>] [--parent <page>]`,
`chub note rename <page> <title>`, `chub note backlinks <page>`, `chub note rm <page>`, `chub note restore <page>`.**
The pages module. `notes` prints the tree indented by depth, `Untitled` for an empty title. `note` prints the page's
metadata and its id; `--json` returns the API page as-is. `new` takes an optional parent resolved with S3. `rm` is the
soft delete the API already performs, and `restore` resolves against `GET /api/pages/trash`. Editing the Tiptap
`content` from a terminal is out of scope (S12).

**S10 — `chub day [--date <day>] [--json]` and `chub week [--json]`.** Read-only views of the routine snapshot from
`GET /api/routine`. `day` prints the blocks for the date's weekday with their time range, title, intent, link target
and the **stored** occurrence status, or `not recorded` when there is no row. `week` prints one line per day of the
week, using the snapshot's own `settings.weekStartsOn` and counting stored occurrence statuses. Neither command may
compute a level, a score or a "missed because the day passed" verdict: that logic lives in
`web/src/features/routine/routine-model.ts` and duplicating it would drift. Recording a status is out of scope (S12).

**S11 — One test file per module.** `cli/test/<module>.test.ts`, importing `isolate`, `run`, `start`, `stop`,
`cleanup` and `seed` from `cli/test/helpers.ts`, with `cleanup()` in `afterEach`. `run` already pins `CHUB_HOME` to the
isolated home so nothing can reach the real data. Existing tests must keep passing untouched.

**S13 — `chub routine status <block> <status> [--date <day>] [--note <text>] [--json]`.** Records one block's
occurrence through `PUT /api/routine/blocks/:id/occurrences/:date` with `{ status, note? }`. `<status>` is exactly
`pending`, `done`, `missed`, `excused` or `skipped`; anything else is a `UsageError`. The date defaults to the
workspace day (`resolveDay`) and must fall on the block's weekday, which the API enforces. `<block>` resolves with S3
against the blocks of that weekday only, and an ambiguity reports each candidate with its time range, so two blocks
sharing a title stay distinguishable. The API refuses a day older than the edit window (`date_frozen`); that surfaces
as an `OpsError` at exit `1`. Recording a status mirrors into a linked habit or task, and a mirror failure never fails
the request: the human line reports what was recorded and what the mirror did, read from the `mirrors` of the response.

**S12 — Out of scope.** Restoring a backup, purging pages, editing rich content, recording routine statuses, the
projects, books and goals modules, and any change to `server/`, `web/` or `README.md`. No commits: `AGENTS.md` forbids
them unless the user asks.

## Tasks

| ID | Specs | Route | Commit | Task |
| --- | --- | --- | --- | --- |
| T1 | S1-S5, S11 | worker | none | `commands/search.ts` + `commands/prefs.ts` + their tests |
| T2 | S1-S3, S6, S7, S11 | worker | none | `commands/backup.ts` + `commands/export.ts` + their tests |
| T3 | S1-S3, S8, S11 | worker | none | `commands/todo.ts` + its test |
| T4 | S1-S3, S9, S11 | worker | none | `commands/notes.ts` + its test |
| T5 | S1, S2, S10, S11 | worker | none | `commands/routine.ts` + its test |
| T6 | S1, S2 | parent | none | Register every module in `index.ts`, build, run `bun test`, fix what fails, update the README |
| T7 | S1-S3, S11, S13 | worker | none | `commands/routine.ts`: the `status` verb, plus its test |

## Log

L1 (user, verbatim): "vamos por C y vamos con tu recomendacion, manda de 2 en 2 sub agentes y al final me sresumes
que si entro y que no entro, dale"

L2 (parent decision, S1): the dispatcher was refactored first — `command.ts` for the shared helpers, `commands/habits.ts`
for the existing module, `index.ts` reduced to a registry plus `serve()`, `call` exported from `ops.ts`, and
`resolve.ts` + `test/helpers.ts` added. Verified before any delegation: typecheck `0`, build `0`, `bun test` 6 pass.
Without that split, two parallel writers would collide on `index.ts`, `ops.ts` and `smoke.test.ts`.

L3 (incident): the first delegation of T1 and T2 referenced this document before it existed; both workers stopped
without touching a file, one of them asking which document was authoritative. Correct behaviour on their side. The
document was written and both tasks relaunched with the same content.

L4 (user decision, S3 and S12): option (c), hybrid addressing, approved. Restoring a backup, purging pages, recording
routine statuses and the projects/books/goals modules stay out until the user picks them from the menu.

L5 (evidence, T1-T5). Five worker delegations, two at a time, each writing only its own files; the parent registered
every module in `index.ts` and verified. `pnpm --filter @chub/cli typecheck` exit `0`, `bun run build:binary` exit
`0`, `bun test` → 20 pass / 0 fail across 8 files, 186 assertions, with the six earlier habit cases still green.

Parent fixes on top of the worker diffs: `callResponse`/`callText` added to `ops.ts` so the Markdown export keeps the
single seam instead of calling `app.fetch` itself; `export --out` combined with `--json` now exits `2` instead of
silently ignoring the flag; `todo add` with no `--list` and several lists now exits `2` listing them, instead of
silently choosing the first one.

Not done, on purpose: nothing was installed and nothing was committed (L4 of `cli-habits.md` still applies), and the
README's command list is the only documentation change.

L6 (evidence, T7). `chub routine status <block> <status> [--date] [--note]` shipped in 22 pass / 0 fail, 212
assertions across 9 files; `day` and `week` keep their own case. The worker flagged that it could not register the
`routine` command in `index.ts` (outside its surfaces); the parent added the import and the registry entry, as S1
requires. The bilingual READMEs (`README.md`, `README.es.md`) landed with the dark brand banner, and the repository
was published **privately** to `AlonsoSG0/CodiceHub` at 0.3.0 with the three tags. Publishing exposed one operational
trap: the machine's `~/.ssh/config` reaches GitHub through the `github.com-alonso` host alias, not plain
`github.com`, so `origin` uses the alias URL and a plain `git@github.com:` remote is rejected with
`Permission denied (publickey)`.
