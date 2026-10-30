# chub lifecycle (status, stop, start, restart) + update

Turn the foreground-only binary into a manageable process: `status`, `stop`, `start`, `restart` over a detached
server with a state file and a log, plus an in-binary `update`. `chub` with no arguments keeps behaving exactly as
it does today.

## Specs

**S1 — `chub status` answers "is it running, where, and since when".** User words: "trabajemos en unos comandos del
cli, status, stop, restart, update". Reads the state file, verifies it against the live server, and reports state,
url, pid, version, started at, uptime, data home and log path. `--json` returns the same fields. Exit `0` when
running, `3` when not running (the `systemctl is-active` convention), `2` on a usage error. A record is removed only
when the process it names is provably gone — dead, or not a chub executable — never merely because it did not answer
in time: a busy server that misses the probe keeps its record so `stop` can still reach it.

**S2 — `chub stop` stops the server, and only that server.** Sends `SIGTERM`, waits up to 10 s for the process to
leave, escalates to `SIGKILL` and waits 2 s more, then removes the state file. Idempotent: stopping when nothing
runs prints "chub is not running" and exits `0`. Identity is never guessed: the pid is acted on only when
`GET /api/server` answers with the same pid recorded in the state file, or, when the server is unreachable but the
pid is alive, when the platform confirms that pid is a `chub` executable (`/proc/<pid>/exe` on Linux, `ps` on
macOS, `tasklist` on Windows). A mismatch cleans the stale file and exits `1` with a message naming the pid it
refused to touch.

**S3 — `chub start` runs the server detached and frees the terminal.** User words: "chub es lo que tenemos ahora,
start igual, pero sin abrir la web pero te impirime la url y que no ocupe la terminal, porque ahora se queda
corriendo, y restratr igual que start". The child runs in its own process group (`detached: true`), does not inherit
the terminal's descriptors (`stdin` ignored, `stdout`/`stderr` to the log file), and the parent `unref()`s it and
exits, so the prompt returns immediately and the server outlives the shell, a closed terminal, `Ctrl+C` and an SSH
disconnect. `start` prints the URL once `GET /api/server` answers for that child, never before. It does **not** open
a browser. `--port` and `--host` are accepted; defaults stay `PORT`/`HOST`/`127.0.0.1:3000`. Starting when a server
is already running prints that server's URL and exits `0` without spawning a second one. A port already in use, or a
child that dies before answering, is a failure: message on stderr, exit `1`, no false URL on stdout.

**S4 — `chub restart` is `stop` then `start`.** Same semantics as `start` (no browser, terminal free). It keeps the
running instance's host and port when no flag is given, so restarting a `:4100` server stays on `:4100`. With nothing
running it simply starts. Exit `0` on success, `1` when the new instance fails to come up.

**S5 — `chub` with no arguments is unchanged.** User words: "chub es lo que tenemos ahora". Foreground, occupies the
terminal, opens the browser unless `--no-open`, and shuts down on `SIGINT`/`SIGTERM` as it does today. The only
addition is invisible to the user: it writes the same state file, so `status` and `stop` also work against a server
someone started by hand in a terminal.

**S6 — `chub update` updates the installed binary itself.** User's chosen scope: in-binary autoupdate, replacing the
earlier decision recorded in `odd/tasks/cli-curl-install.md` S3 ("No: reinstalar con el script"). It resolves the
latest release, compares it with the running version, and when it is newer downloads
`chub-<os>-<arch>.gz` plus `SHA256SUMS` from the project's GitHub releases, verifies the SHA-256 before touching
anything, decompresses, and replaces the executable through a staged copy in the same directory plus an atomic
rename. It reads the downloaded binary's own `--version` and prints the version and the installed path. Already on
the latest version prints that and exits `0` without downloading the asset. `--version <v>` installs a pinned
release instead of the latest (the installer's contract). The release host honours `CHUB_RELEASE_BASE_URL`, the same
override `install.sh` uses, so mirrors and tests never reach GitHub. A staged binary must prove itself before it
replaces anything: it has to run, exit `0` and report exactly the release version being installed. A fallback to
the release tag would install a binary this machine cannot execute, so there is none.

**S7 — `update` does not restart, and stops short of anything unsafe.** User's choice: "Sólo actualizar y avisar"
— it prints that `chub restart` applies the new version and nothing else. Safety, each with its own failure: a
checksum mismatch, a download error or an unparsable `SHA256SUMS` leaves the installed binary byte-identical and
exits `1`; a current executable whose name is not `chub` or `chub.exe` is refused, so running the sources through
`bun` can never overwrite `bun`; on Windows a running server blocks the replacement, so the command refuses with a
message telling the user to run `chub stop` first.

**S8 — Out of scope.** `chub open` (the URL is printed; opening it is the user's browser), `update --check`,
scheduled or silent updates, service managers (`systemd`, `launchd`), autostart at login, a second instance on a
second port, `stop` reaching instances whose state file was deleted, and any change to the data home layout beyond
`server.json` and `logs/`.

**S9 — The state file is the contract.** `CHUB_HOME/server.json` holds `runId`, `pid`, `host`, `port`, `url`,
`version`, `startedAt` and `logPath`, written by the serving process after `Bun.serve` answers and removed on a clean
shutdown. `start` mints a `runId` and passes it to the child in `CHUB_RUN_ID`, so the parent never mistakes an older
instance's file for its own child. The serving process is identified by a new `GET /api/server` → `{"pid":<pid>}`;
`GET /api/health` keeps answering exactly `{"status":"ok"}`, because `server/test/app.test.ts` asserts that body.

**S10 — A detached server logs to `CHUB_HOME/logs/server.log`.** User's choice. The log rotates on every `start`
(`server.log` → `server.log.1`, previous `.1` discarded), so one file covers one run and growth is bounded by that
run. `status` reports the path. A foreground `chub` keeps logging to its terminal, as today.

**S11 — The command surface is documented where it is discovered.** `chub --help` lines, the CLI tables in
`README.md` and `README.es.md`, and the command list in `AGENTS.md` gain the four lifecycle commands and `update`,
in the same voice as the existing rows.

## Tasks

| ID | Specs | What | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1, S9 | State seam (`cli/src/server-state.ts`), `GET /api/server`, `chub status` | parent, inline | — |
| T2 | S2, S3, S4, S5, S10 | Detached `start`, `stop` with identity checks, `restart`, log + rotation, state written by `serve()` | parent, inline | — |
| T3 | S6, S7 | `chub update`: release resolution, download, SHA-256, staged atomic replace, safety guards | `gentle-ai-worker` | — |
| T4 | S11 | Help text and docs (`README.md`, `README.es.md`, `AGENTS.md`) | parent, inline | — |
| T5 | S6, S7 | Harden `update`: prove the staged binary runs and reports the release version before replacing; clear a stale stage | `gentle-ai-worker` | — |
| T6 | S1, S3 | Wait and escalate when the `start` child misses its deadline; one `status --json` shape | `gentle-ai-worker` | — |
| T7 | S6, S11 | Stop the global `--version` from swallowing `update --version <v>` | parent, inline | — |

Risk: item 5 (delivery/environment) — `chub update` replaces the installed executable from a downloaded release
asset, which is this repository's distribution path. That item is what puts an independent verifier on the change.

Commits: none. This repository's `AGENTS.md` states that nothing is committed unless the user explicitly asks, and
the user did not ask.

## Log

**L1 (user, verbatim):** "trabajemos en unos comandos del cli, status, stop, restart, update, tu planeas y mandas
sub agentes"

**L2 (user, verbatim):** "espera, mis respuestas estan bien, pero antes tengo una duda, que pasa si hacemos un
server, no va a abrir la web? y no hablo de automatico que pasa con chub start, eso deberia poder abrir a mano
tambien la url o no?" — answered: the browser opener belongs to whoever starts the process, so `start` prints the
URL and the user opens it; no `chub open` command is added (recorded in S8).

**L3 (user, verbatim):** "hagamoslo simple, chub es lo que tenemos ahora, start igual, pero sin abrir la web pero te
impirime la url y que no ocupe la terminal, porque ahora se queda corriendo, y restratr igual que start, para y dime
si me entiendes lo que dejar la terminal libre con start" — this is S3 and S5; "start igual" reads as "same server
as today", with the three differences named in the same sentence: no browser, prints the URL, frees the terminal.

**L4 (decisions, one batch):** update scope = autoupdate inside the binary (supersedes `cli-curl-install.md` S3);
after updating it only warns, no restart; the surface adds `chub start` alongside `stop` and `restart`; detached
output goes to `CHUB_HOME/logs/server.log` with rotation.

**L5 (evidence, before the first write):** `cli/src/index.ts` serves in the foreground through `serve()`, which calls
`openBrowser()` after `Bun.serve` and holds the terminal; there is no pid file, no log file and no detached path.
`GET /api/health` answers `{"status":"ok"}` and `server/test/app.test.ts:6` asserts that body byte for byte, so the
identity probe needs its own route (S9). `Bun.spawn` in `bun-types@1.4.4:7752` supports `detached` and `Subprocess`
exposes `unref()`, so freeing the terminal needs no helper binary. `install.sh` publishes the release contract this
repository already trusts: `chub-<os>-<arch>.gz` + `SHA256SUMS`, SHA-256 verified before install, staging copy plus
`mv`, and `CHUB_INSTALL_BASE_URL` as the test hook.

**L6 (evidence, first suite run — 47 pass, 1 fail):** the port-in-use test occupied the port with a chub of the same
data home, so `start` correctly reported the instance already running and exited `0`. The defect was the test, not the
command: S3's idempotency rule and S3's bind-failure rule are two rules, and the test conflated them. Rewritten to
hold the port with a process that is not chub, and the idempotency rule is now asserted in its own test. The same run
taught that `bun run test | tail` hides the exit code: the rerun captures `$?` before trimming output.

**L8 (manual check of the compiled binary, defect found by hand):** `chub update --version 0.3.0` printed `0.4.4`
and exited `0`: `main()` scanned all of argv for `--version` before dispatching, so the global flag swallowed the
command's own pin flag and silenced S6. Fixed by reading the version flag only as the first argument (the conventional
CLI grammar) while `--help` keeps being scanned anywhere, so `chub <command> --help` still works. Pinned by a smoke
test that proves `chub update --version not-a-release` reaches the command and exits `2`. The same manual run confirmed
status (exit 3 with nothing running, then the full report), start freeing the prompt, idempotent start, restart on the
same port, stop, and the rotation leaving `server.log` plus `server.log.1`.

**L7 (self-review before handing off):** two defects found by reading the code back, both fixed. (a) `status` deleted
the record whenever the probe did not answer, so a busy server that missed a 1.5 s probe would lose its state file and
`stop` could no longer find it; S1 now says the record survives a missed probe and dies only with its process.
(b) `describe()` built an untyped record and `reportRunning` read it back through `as` casts; replaced with a
`StatusView` type, so the fields are checked where they are produced.

**L9 (independent verifier, `Risk: item 5`):** verdict partially satisfied, with one severe defect and two gaps.
Severe: a staged binary that failed `--version` still replaced `execPath`, so a corrupt or wrong-architecture asset
that matched its own checksum could brick the installation — exactly what item 5 is about. Also: the `start` timeout
killed its child without waiting or escalating, and `status --json` answered two different shapes. Both are fixed in
T5 and T6. The verifier also confirmed the health contract is intact, that a pid is never signalled unverified, and
that the `runId` guard holds.

**L10 (fixes, with TDD evidence):** T5 — `updateBinary` now deletes any stale `.chub.<pid>`, stages exclusively, and
refuses to install unless the staged binary runs, exits `0` and reports exactly the release version. RED first: 6
passed, 5 failed (the four invalid-binary variants installed, and a leftover stage raised `EEXIST`); GREEN: 11 passed.
T6 — `spawnServer` sends `SIGTERM`, waits up to 2 s, escalates to `SIGKILL` and reaps the child before throwing, with
`CHUB_START_TIMEOUT_MS` as the test hook; `status --json` answers the same field shape with nulls when nothing runs.
RED first: 6 passed, 2 failed; GREEN: 8 passed. T7 — see L8. S6 no longer promises a fallback to the release tag,
because that fallback is exactly what the verifier proved unsafe.

**L11 (release 0.5.0):** the user asked to push the work and keep the disclaimer, then chose a release over a
correction: version bumped to 0.5.0, suite re-run before tagging (`cli` 55 pass, exit 0, binary reporting 0.5.0),
`chore: release 0.5.0` committed, and a lightweight tag `v0.5.0` on it, matching how 0.4.4 was cut. The tag run
(41100360461) sat in `queued` for over six minutes with GitHub reporting all systems operational, the repository
public and no other run waiting; the `gh run watch` that was supposed to follow it died on repeated API `502`s, not on
a workflow failure. Nothing was re-tagged, moved or re-dispatched: a delayed release is cheaper than a moved tag.
The Windows disclaimer is untouched, by instruction.
