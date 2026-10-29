# chub CLI distribution (step 1)

Ship `chub` as one self-contained Bun binary that serves the API and the embedded web UI from the user's
own data directory, while the repository keeps running under `pnpm dev` with throwaway data.

## Specs

**S1 — Two data homes, never crossed.** `pnpm dev` keeps using `server/data/` (its own throwaway DB). The
installed `chub` binary never reads or writes inside the repository: its DB is `<data home>/chub.db` and its
uploads `<data home>/uploads/`. User words: "para poder tener este repo corriendo en pnpm dev para desarrollo y
asi no tener problemas de datos"; "no tener que perder datos por migraciones en desarrollo, no tener que estar
desarrollando con info mia".

**S2 — One command, foreground, local-only.** `chub` starts the daemon and opens the browser; it listens on
`127.0.0.1:3000` by default and never on `0.0.0.0`; `--port`, `--host`, `--no-open` override; `PORT`/`HOST`
env respected; Ctrl+C and SIGTERM close the SQLite connection so the WAL is checkpointed before exit.

**S3 — The web travels inside the binary.** `web/dist` is embedded as a single tar and extracted once into
`<data home>/runtime/<assets-hash>/web/`; the hash changes when the assets change so a stale extraction is never
served; `/` and any unknown non-API path return `index.html`; `/api/*` and `/uploads/*` are handled by the Hono
app exactly as today.

**S4 — Migrations travel too.** `server/drizzle/` is embedded and extracted next to the web assets;
`createDb(path, migrationsDir?)` accepts an explicit migrations directory, and the default keeps today's
behaviour so the 25 existing test call sites are untouched.

**S5 — Distribution is the binary, not npm.** Build with `bun build --compile`; the artifact is
`cli/dist/chub`. Step 1 installs it by copying to `~/.local/bin/chub`. No npm publication, no registry, no
`install.sh` yet. User words: "quiero curl porque no me quiero pelear con npm y sus publicaciones ya lo hice
antes y no quiero no ahora y si es por lindo, me gusta".

**S6 — No regressions on the Node path.** `server/src/db/client.ts` keeps exporting `createDb` and
`ChubDatabase` with today's shape; every existing server test keeps running on Node + better-sqlite3; `pnpm dev`,
`pnpm build`, `pnpm typecheck` and `pnpm test` keep working at the root.

**S7 — The binary is proven by a smoke test.** With `CHUB_HOME` pointed at a temp dir: `/api/health` returns
200; `/` and a deep link return HTML; a page can be created and appears in `/api/pages/tree`; the DB file exists
under the temp home; after SIGTERM the WAL is checkpointed. Run with `bun test`.

**S8 — Out of scope for step 1.** Agent endpoints, MCP, `chub upgrade`, the curl `install.sh`, any subcommand
other than starting the server, and authentication.

## Tasks

| ID | Specs | Route | Commit | Task |
| --- | --- | --- | --- | --- |
| T1 | S4, S6 | worker | none | Extract the shared client seam and migration runner into `server/src/db/core.ts`; `client.ts` keeps its public API |
| T2 | S1, S2, S6 | worker | none | `cli/src/db.ts`: `bun:sqlite` client + drizzle `bun-sqlite` over the shared core |
| T3 | S3, S4 | worker | none | `cli/scripts/build-assets.ts` and the generated imports: embed and extract `web.tar` + `drizzle.tar` |
| T4 | S1, S2, S3 | worker | none | `cli/src/index.ts`: data home, flags, `Bun.serve`, embedded web, clean shutdown |
| T5 | S7 | worker | none | `cli/test/smoke.test.ts` proves S7 against the built binary |
| T6 | S5 | parent | none | Build, run the smoke test, verify by hand, then install to `~/.local/bin/chub` |

## Log

L1 (user, verbatim): "quiero curl porque no me quiero pelear con npm y sus publicaciones ya lo hice antes y no
quiero no ahora y si es por lindo, me gusta / olvidemos lo agentes es plan a futuro, ahora solo quiero 2 cosas,
tener este repo corriendo en pnpm dev para desarrollo y asi no tener problemas de datos y un comando chub para
mi uso real, ya quiero usarlo / la web que viva dentro, aparte no queiro un curl ahorita para todo, con que pueda
descargarlo en mi compu linux, tenga paths propios separados de este repo genial"

L2 (user, verbatim): "Vamos por A"

L3 (decision, parent): option A — the web ships embedded. Spike evidence on this machine, Bun 1.3.14:
`import tar from "./web.tar" with { type: "file" }` resolves to `/$bunfs/root/web-*.tar` inside a compiled
binary and stays readable through `Bun.file`; `Bun.Archive` exists, so extraction needs no dependency and no
subprocess; `bun build --compile --target=bun-linux-x64` produced a 91 MB binary in 360 ms, and cross-compiling
to `bun-darwin-arm64` from Linux worked too (61 MB), so one runner can emit every platform in step 2.

L4 (decision, parent): development isolation already holds by construction — `pnpm dev` runs with cwd
`server/`, so its DB is `server/data/chub.db` (5 pages, 2 live, 1 upload). The repo-root `data/` directory
(9.2 MB) was seeded by the Docker measurement and is deleted as part of this feature. No `CHUB_*` variable is
shared between dev and the installed binary.

L5 (evidence, parent): better-sqlite3 13.0.3 is N-API with prebuilds for 8 platforms and `install: none`, so no
compiler and no ABI pinning is needed on the Node side. Outside `server/src/db/client.ts` the native surface is
only `$client.name`, `prepare().run/get/all`, `exec`, `transaction().immediate()` and `pragma`, with no `.raw`,
`.pluck`, `.columns` or `.iterate`; `bun:sqlite` exposes the same synchronous surface and FTS5, and drizzle
0.45.4 ships a `bun-sqlite` driver. `uploadsDirectory()` already resolves `<dir of the DB>/uploads`. The port is
a seam, not a rewrite.

L6 (evidence, parent): T1-T5 verified by the parent. `pnpm --filter @chub/cli test:smoke` 2 tests / 18 assertions.
The binary serves `/api/health` 200, `/` and a deep link as HTML, creates a page that appears in `/api/pages/tree`,
and a SIGTERM leaves no `-wal`/`-shm`. The data home holds `chub.db`, `uploads/` and `runtime/<hash>/{web,drizzle}`
with 22 migration files. `pnpm --filter @chub/web test` 58 files / 432 tests green, so the root-suite SIGKILL was
resource contention from running both packages at once, not a regression. `pnpm build` at the root still excludes
the CLI and does not require Bun.

L7 (pre-existing failure, diagnosed not caused): `server/test/routine.test.ts` > "allows occurrence writes inside
the edit window and on its last editable day" fails on this machine. It fails in isolation, it passes with
`TZ=UTC`, and the cause is an earlier test in the same file seeding `workspace.timezone = Pacific/Kiritimati`
(UTC+14) while the failing test derives its dates from the process-local zone; between 18:00 and midnight local
the two days differ by one and the write is refused as frozen. `src/routine/**` and `test/routine.test.ts` are
outside this feature and were not touched.

L8 (defect found by parent verification, fixed): the first full run of the installed binary created a database
with 29 tables but `user_version = 0`, and the second start died with "table `pages` already exists". Root cause:
the Bun adapter's `pragma()` matched `source.startsWith("user_version")`, so the write `user_version = N` took the
read branch and never persisted. Fixed by comparing the trimmed source exactly, so reads go to the query API and
every other pragma goes to `exec`. `cli/test/smoke.test.ts` now boots twice on the same data home and asserts the
second start is healthy and still holds the page created before the restart; restoring the old check makes that
test fail, so the regression is covered.

L9 (independent verification, after the fix): four review defects were confirmed and fixed before this point — the
runtime hash now covers both embedded archives, the root `pnpm build`/`pnpm test` no longer include Bun work, the
shutdown awaits `server.stop(true)` before closing SQLite, and the smoke script builds the binary first. A second
verification pass over the migration path returned PASS on pragma routing, migration idempotence, adapter semantic
fidelity, shutdown ordering and Node-path parity, with no remaining defect in scope.

L10 (delivery): `cli/dist/chub` is 93 MB; it was copied to `~/.local/bin/chub` (already on `PATH`). The
container created by the earlier Docker measurement was stopped and the repo-root `data/` it had seeded (9.2 MB)
was removed. The real data home `~/.local/share/chub` still holds the empty database left by the pre-fix run
(29 tables, 0 rows, `user_version = 0`); it needs either `PRAGMA user_version = 22` on that file or removal of the
directory so the fixed binary recreates it. That step is outside the project root and waits on the user's
explicit permission.

L11 (delivery, repair): the user authorized removing `~/.local/share/chub`. The harness safety policy blocked the
destructive command even with that authorization, so the directory was renamed to
`~/.local/share/chub.broken-pre-fix` instead of deleted — the same effect for the user, reversible, and it holds
no data (0 rows). The fixed binary then created a fresh data home: `/api/health` 200 and `/` 200 on the first
boot, and 200 again on a second boot over the same database, which is exactly the case the `user_version` defect
broke. Final state: `chub.db` with `user_version = 22`, `integrity_check` ok, 0 pages, no `-wal` after shutdown,
plus `runtime/<hash>/` and `uploads/`.
