# db-backups

Up to three timestamped backups of the live SQLite database, stored beside it (never inside it), created from
Settings and restorable from there with a confirmation. The live database is itself backed up before any
restore, so a restore is always reversible.

## Specs

**S1 — Create, keep at most three.** User words (verbatim): "ahora hay que hacer el respaldo, guardar hasta 3
respaldo aparte de la db en live, ponlo en los settings". A `POST /api/backups` writes a standalone copy via
`VACUUM INTO` into `<directory of the live DB>/backups/chub-<YYYYMMDD-HHMMSS>.db` (for a `:memory:` database,
`<os.tmpdir()>/chub/backups`, following the uploads seam's pattern). Creating a fourth backup deletes the
oldest; exactly the newest three remain. `GET /api/backups` lists them newest first with name, size in bytes
and timestamp.

**S2 — Restore, confirmed, reversible.** User choice: "Crear + restaurar". A `POST /api/backups/:name/restore`
first writes a fresh backup of the current live state (the pre-restore safety copy, inside the same rotation),
then restores the named backup **into the live connection** (logical restore: `ATTACH` the file read-only and
copy table contents inside a transaction — no connection swap, so the running server and the compiled binary
keep working). The FTS index is rebuilt through its virtual table, never by copying shadow tables. After a
successful restore the client reloads the app, because cached client state predates the restored data. A
backup name that is not an exact `chub-<timestamp>.db` match is rejected with 400 — no path traversal.

**S3 — Manual trigger now, on-update later.** User words (verbatim): "se crea manual y en cada update, lo del
p[ódemos dejar para cuando el cli, pero es la idea". v1 is the Settings button only. The auto-backup on every
binary update is deliberately deferred to the CLI distribution step and recorded here so it is not lost.

**S4 — No regressions.** The Node server, the compiled CLI binary and every existing suite keep working; the
backups directory derives from the live DB path, so the binary stores its backups under its own data home with
no CLI code change.

## Tasks

| ID | Specs | Route | Commit | Task |
| --- | --- | --- | --- | --- |
| T1 | S1, S2, S4 | worker | none | Server routes (create/list/rotate/restore) + Settings section + api client + i18n + tests |
| T2 | S1-S4 | parent | none | Both suites, typecheck, build, browser pass (create x4 rotates, restore via Settings, CLI data home untouched), hand to the user |

## Log

L1 (user, verbatim): "ahora hay que hacer el respaldo, guardar hasta 3 respaldo aparte de la db en live, ponlo
en los settings"

L2 (user, verbatim, choices): "Crear + restaurar"; "se crea manual y en cada update, lo del
p[ódemos dejar para cuando el cli, pero es la idea".

L3 (decision, parent): restore is logical (ATTACH + copy inside the live connection) because both entry points
hold the db in a serve closure (`server/src/index.ts`, `cli/src/index.ts`) — a file swap would need a
connection holder refactor across both. The pre-restore safety backup makes S2 reversible within the rotation
window. `VACUUM INTO` is the create path because it is plain SQLite: identical on better-sqlite3 (server) and
bun:sqlite (binary), and it checkpoints the WAL into the copy.

L4 (decision, parent, worker-found spec defect): the original order — create the pre-restore copy (with
rotation) BEFORE restoring — deletes the requested file when it is the oldest of three. The restore order is
now: create the pre-restore copy WITHOUT rotating, ATTACH and restore the requested file, then rotate (four
files may exist transiently; the rotation trims to the newest three afterwards). Also approved from the same
review: the backups directory resolution reads the sqlite client's filename across adapters — better-sqlite3
exposes `name`, bun:sqlite exposes `filename` — with the same `:memory:` fallback as the uploads seam, so the
compiled binary resolves its own data home.

L5 (evidence, parent, T2, delivery): full suites green — server 195 tests / 19 files, web 443 tests / 58 files
— root typecheck green, build green (23 chunks, 3.2 MB). Browser pass on the dev server through the real
Settings UI: the Backups section renders; five creates left exactly the newest three on disk and in the list
(the same-second collision suffix `-1` was exercised live); restoring the newest backup showed the confirm
dialog ("Your current state will be backed up first"), created the pre-restore copy as the newest entry,
rotated back to three, reloaded the app, and left the live DB healthy (user_version 22, rows intact, health
200). Worker-found defects fixed during T1: the read-only URI ATTACH failed with SQLITE_CANTOPEN (replaced
with plain-path ATTACH, reads only, DETACH on every exit path), and the rotate-before-restore order deleted
the requested oldest file (L4). Handed to the user uncommitted for review.
