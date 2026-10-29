# chub CLI commands (step 2)

Step 2 of the CLI: turn the single-purpose server binary into a subcommand CLI. `ops.ts` becomes the one seam
between the process and the data, and two data commands plus a version flag are the first proof of it.
Follows `cli-distribution.md`, whose S8 left subcommands, MCP and the curl installer out of step 1.

## Specs

**S1 — One seam for data access.** `cli/src/ops.ts` is the only place that reads or writes chub data. It calls the
existing Hono app **in process** — `await app.fetch(new Request(url), { db })` — and never opens a socket, never
builds SQL, never imports a repository. Every operation is a typed function that throws `OpsError` with a code;
`ops.ts` never calls `process.exit` and never prints. User words: "que puedo llamar funciones sin tener chub
corriendo?"

**S2 — Step 1 keeps working, byte for byte.** With no arguments, or with only flags (`--port`, `--host`,
`--no-open`, `--help`), `chub` starts the server exactly as today. Same defaults, same `PORT`/`HOST` env, same
loopback validation, same browser opening, same SIGINT/SIGTERM WAL checkpoint. The two existing smoke tests keep
passing unmodified in intent.

**S3 — `-v` and `--version`.** Print the version to stdout and exit 0 without opening the database, extracting
assets or listening. The version is `0.1.0`, declared once at the workspace root `package.json` and imported
statically by the CLI, so `bun build --compile` bakes the literal into the binary and there is one number for the
product rather than one per package. User words: "esta es la verision 0.1.0 y tu te vas a encargar de manejar las
version". `-h` is accepted as an alias of `--help`.

**S4 — Subcommand dispatch.** `argv[0]` decides: a token that does not start with `-` is a subcommand; anything
else keeps the S2 server path. Unknown subcommand → usage on **stderr** and exit `2`. `chub habits` with no verb →
a short help listing `list` and `done`, on stdout, exit `0`. `--help` anywhere → the full usage on stdout, exit `0`.

**S5 — `chub habits list [--archived] [--json]`.** Shows today's state, not just the habit definitions: the habit
list merged with today's entries from `GET /api/habits/entries?from=<date>&to=<date>`. Human output is one aligned
line per habit; `--archived` includes archived habits and marks them. `--json` prints exactly this shape, and
nothing else, to stdout:

```json
{
  "date": "2026-10-29",
  "timezone": "America/Mexico_City",
  "habits": [
    {
      "id": "uuid",
      "name": "Reading",
      "icon": null,
      "archived": false,
      "fields": [
        { "id": "uuid", "kind": "check", "label": "Done", "unit": null, "target": null, "value": true }
      ]
    }
  ]
}
```

`value` is `boolean | null` for `check`, `number | null` for `number`, `string | null` for `text`; `null` when the
day has no entry for that field. User words: "la salida en --json a que te refieres".

**S6 — `chub habits done <name> [--date YYYY-MM-DD] [--json]`.** Resolves the habit by name: case-insensitive exact
match first, otherwise a unique case-insensitive substring match. No match → stderr `chub: no habit matches
"<name>"`, exit `1`. More than one match → stderr listing the candidates, exit `1`. It then sets **every
non-archived `check` field** of that habit to `true` for the date through
`PUT /api/habits/:id/entries/:date`; a habit with no check field is an error, exit `1`. `--json` prints:

```json
{
  "date": "2026-10-29",
  "timezone": "America/Mexico_City",
  "habit": { "id": "uuid", "name": "Reading" },
  "entries": [{ "fieldId": "uuid", "kind": "check", "label": "Done", "value": true }]
}
```

Human output is one line: `Reading: Done = true (2026-10-29)`. The live database has a habit named `Reading` with
three fields (`Done` check, `Minutes` number, `Pages` text), so resolving the check field and leaving the others
untouched is the acceptance case.

**S7 — "Today" is the workspace day, never the device day.** The date defaults to the day in the workspace zone:
the `workspace.timezone` preference read through the preferences repository, formatted with the existing
`todayInZone` from `server/src/routine/timezone.ts`; when the preference is missing or invalid, fall back to
`America/Mexico_City`, the default the web app documents in `web/src/lib/timezone.ts`. The device zone is never
consulted, so a cron job or an SSH session cannot mark the wrong day. `--date` overrides it and must be a
`YYYY-MM-DD` day; an invalid value exits `2`. The resolved date and zone appear in all `--json` output.

**S8 — Output contract.** stdout carries data only; stderr carries human messages and diagnostics. Exit `0` on
success, `1` when the domain says no (unknown habit, ambiguous name, no check field, unexpected API error), `2`
when the invocation is wrong (unknown option, unknown subcommand, invalid `--date`, missing positional). No colour
or spinner in this step.

**S9 — Data commands stay cheap.** A data command applies migrations if needed but must not extract `web.tar`;
only the `serve()` path extracts the web assets. Reading a table must not pay for the browser bundle.

**S10 — Proven, not assumed.** `cli/test/smoke.test.ts` keeps its two existing tests and adds: `-v` prints
`-v` prints the workspace version with exit `0` and no listener; an unknown subcommand exits `2`; and one end-to-end
case on an isolated
`CHUB_HOME` — seed the three-field `Reading` habit through the HTTP API, stop the server, then assert
`habits list --json` reports it with `value` null, and `habits done Reading --json` returns the check field and
the habit still lists as done afterwards. Runs with `bun test`.

**S11 — Documented.** The `usage` text in `cli/src/index.ts` lists the subcommands and `-v/--version`. The README
"Personal CLI" section gains the command list and the `--json` contract. Defaults to English, per the repository
convention.

**S12 — Out of scope.** The TUI, MCP, any new server route or behaviour change, dependency upgrades, the Bun/Node
runtime split, the curl installer, `chub upgrade`, and any commit: `AGENTS.md` forbids committing unless the user
asks, so the feature branch and work-unit commits that ODD would add stay out of this step.

## Tasks

| ID | Specs | Route | Commit | Task |
| --- | --- | --- | --- | --- |
| T1 | S1, S7, S9 | parent (worker refused) | none | `cli/src/context.ts` (data home, migrations-only extraction, db handle) and `cli/src/ops.ts` (in-process `app.fetch`, typed operations, `OpsError`) |
| T2 | S2, S3, S4 | parent (worker refused) | none | `cli/src/index.ts`: subcommand dispatch, version from `cli/package.json`, `-v`/`--version`/`-h`, usage text, server path untouched |
| T3 | S5, S6, S7, S8 | parent (worker refused) | none | The `habits` commands: resolution, date, human and `--json` output, exit codes |
| T4 | S10 | parent (worker refused) | none | Extend `cli/test/smoke.test.ts` with the version, dispatch and end-to-end cases |
| T5 | S11 | parent (worker refused) | none | README "Personal CLI" section |
| T6 | S3, S10 | parent | none | Build, run the smoke test, verify by hand, install to `~/.local/bin/chub` |

## Log

L1 (user, verbatim): "entonces vamos con el plan ops.ts y CLI para empezar y probar, manda sub agente para esta
tarea y me das un resumen y lo intalas para yo probarlo y marca esta version como la 0.8.6, porque no se, pero
marcala asi a menos que tengas otra recomendacion"

L2 (user, earlier, verbatim, the intent behind the CLI): "es que aparte mi idea es poer hacer un CLI o un MCP para
conectarlo contigo o con opencode para poder manejar unas cosas o traer info, ese tipo de cosas"

L3 (user, decision on transport, verbatim): "que puedo llamar funciones sin tener chub corriendo?"

L4 (parent decision, S3): version `0.8.6` chosen as instructed. Recommendation on record: `0.1.0` is the honest
first number for a binary that never had a version, since `0.8.6` implies six previous releases and makes
`--version` a poor support key; changing it later is a one-line edit in `cli/package.json`.

L5 (parent decision, S7): fall back to `America/Mexico_City` rather than the device day, even though
`createRoutineRepository` falls back to the local day. The CLI can run from cron or SSH, where the device zone is
arbitrary; the web app's own contract says the device zone is not consulted for date decisions. Changing routine
is out of scope.

L6 (parent decision, T1-T5 route): the delegation was attempted and refused. `gentle-ai-worker` reports
`status: blocked` with `files_changed: []`: its sandbox forbids writing `cli/dist` and `web/dist` and forbids the
temporary-directory deletion that the smoke test performs, so it could not run `build:binary` or `bun test`, and it
would not write blind. The parent implemented T1-T5 inline under its own authority instead of retrying the launch.

L7 (parent decision, T1, `cli/src/db.ts`): `createCliDb` gains an optional third argument,
`{ shutdown?: "checkpoint" | "plain" }`, defaulting to today's behaviour. The data-command path passes
`"plain"` because the old `close()` ran `PRAGMA journal_mode=DELETE`, which would fight a running server that owns
the file in WAL mode. The server path keeps the checkpoint so the existing no-WAL-after-SIGTERM assertion holds.

L8 (parent decision, S8): a wrong invocation now exits `2` everywhere, including an unknown `--port`/`--host`
value on the server path, where step 1 exited `1`. S8 is the specific rule and no test asserted the old code; S2's
list of preserved server behaviour does not mention exit codes for a rejected invocation.

L9 (evidence, T1-T6). Files: `cli/src/context.ts` and `cli/src/ops.ts` (new), `cli/src/index.ts` (dispatch and the
`habits` commands), `cli/src/db.ts` (the `shutdown` option), `cli/package.json` (`version: 0.8.6`),
`cli/tsconfig.json` (`resolveJsonModule`), `cli/test/smoke.test.ts`, `README.md`.

`pnpm --filter @chub/cli typecheck` exit 0. `cd cli && bun run build:binary` exit 0 (93.7 MB binary).
`bun test` 5 pass / 0 fail, 41 assertions: help, `-v`/`--version` (asserting the data home is not created), an
unknown command at exit 2, the step-1 serve/reload case, and the habits end-to-end case (seed through the API,
`habits list --json` with a null value, `habits done Read --json` resolving the substring, the check field true
afterwards, the number field still null, and an unknown name at exit 1 with empty stdout).

By hand against the real data home (read-only) and the installed binary at `~/.local/bin/chub`: `chub -v` prints
`0.8.6`; `chub habits list` prints the four habits with `Reading` showing `✓ Minutes 15 min`; `chub habits --help`,
`chub habits done nope` (exit 1), `chub habits list --nope` (exit 2) and `chub nonsense` (exit 2) all behave as
specified. The previous binary is kept at `/tmp/chub-previous-0.8.6` until the next rebuild.

L10 (defect found and fixed inside T4): the first smoke-test draft let the CLI cases inherit the real
`CHUB_HOME`, because the module-level `run` helper did not pass one; the suite read the developer's own habits.
No data was written — the failure aborted the test before the `habits done` case ran, and the real
`habit_entries` rows are untouched. `run` now defaults `CHUB_HOME` to the isolated home and `start` refuses to run
without one, so the failure mode cannot recur.

L11 (user, verbatim): "es genial, y vale usemos tu versionado, hagamos commit de esto en local para que al menos en
local tengamos todo el arbol correcto, esta es la verision 0.1.0 y tu te vas a encargar de manejar las version,
ok? luego me encargo del repo asi que haz ese cambio haz los commits en local para tener el arbol limpio, y
recuerda que esto sera proximamente un repo publico asi que cuidado con cosas, correo o nombre personals, nada que
no debamos de tener arriba, revisa que debe ir en el git ignore y si no es que borra el .git y empecemos de 0 el
repo, solo el repo no vayas a borrar el proyecto, en la carpeta se llama chub, pero el nombre real es CodiceHub
ok?"

L12 (parent decision, S3): the version moved to `0.1.0` by user instruction, superseding L4. The number now lives
only in the workspace root `package.json`; `cli/package.json` declares none and `cli/src/index.ts` imports the root
one, so there is a single place to bump. S3 was rewritten accordingly and the smoke-test assertion follows it.
