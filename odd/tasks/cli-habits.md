# chub CLI habits layer (step 3)

Complete the habits domain in the CLI: every operation the HTTP API already offers, except the three that need a
product decision first (S12). Builds on `cli-commands.md`, which introduced `ops.ts` and `habits list`/`done`.

## Specs

**S1 — One seam, unchanged.** Every new operation goes through `cli/src/ops.ts` and the in-process `app.fetch`.
No SQL, no repository imports, no socket, no `process.exit`, no printing inside `ops.ts`. Failures throw `OpsError`
with a code: `not_found`, `ambiguous`, `invalid_value`, `invalid_date`, `no_check_field`, `api_error`.
User words: "primero toda la capa de habitos en cli".

**S2 — Name and field resolution, one rule.** Habits resolve case-insensitively: exact match first, otherwise a
unique substring; no match is `not_found`, more than one is `ambiguous` listing the candidates. The same rule
resolves a field by label inside a habit. Archived habits are only visible to the commands that must reach them
(`unarchive`, and `list --archived`).

**S3 — `habits list [--archived] [--section <habits|books>] [--json]`.** Keeps today's behaviour and adds
`--section`, passed through as the API's `section` query. `HabitView` gains `section`, so the `--json` object keeps
its shape plus that field: `{ date, timezone, habits: [{ id, name, icon, section, archived, fields: [...] }] }`.

**S4 — `habits log <name> [--days <n>] [--from <day> --to <day>] [--json]`.** History for one habit. `--days`
defaults to 14 and is measured back from today; giving both `--from` and `--to` wins over `--days`; giving only one
of them is a usage error. Output is the entries of that habit's fields in the window, newest day first, days with
no entries omitted. JSON: `{ habit: { id, name }, from, to, entries: [{ date, fieldId, kind, label, value }] }`.

**S5 — `habits done <name> [--date <day>] [--json]` and `habits undo <name> [--date <day>] [--json]`.** `done` is
unchanged: every non-archived `check` field becomes `true`. `undo` is its mirror: every non-archived `check` field
becomes `false`, which the repository stores by deleting the entry, so the day reads as "not logged" again. JSON for
`undo` matches `done` with `value: false`.

**S6 — `habits set <name> <field> <value> [--date <day>] [--clear] [--json]`.** The general value write. The field
resolves by label. The value is parsed according to the field kind — `check`: `true`/`false`/`yes`/`no`/`1`/`0`;
`number`: a finite number; `text`: the argument as-is — and a value that does not parse for that kind is a usage
error (exit `2`), never silently coerced. `--clear` sends `null`, which removes the entry for that field and day.
JSON: `{ date, timezone, habit: { id, name }, field: { id, kind, label }, value }` with `value: null` for a clear.

**S7 — `habits add <name> [--icon <icon>] [--section <habits|books>] [--json]`.** Creates a habit. The API gives
every new habit one `check` field labelled `Done`, and the JSON reports the created habit in the `HabitView` shape.

**S8 — `habits rename <name> <new-name> [--json]` and `habits archive <name> [--json]` / `habits unarchive <name>
[--json]`.** Thin wrappers over `PATCH /habits/:id`. `archive` acts on a live habit, `unarchive` on an archived
one. All three print the resulting habit in the `HabitView` shape, in human form as `<name>` plus `(archived)` when
it applies.

**S9 — `habits field add <habit> <label> --kind <check|number|text> [--unit <unit>] [--target <n>] [--json]` and
`habits field update <habit> <field> [--label <label>] [--unit <unit>] [--target <n>] [--json]`.** `--kind` is
required to add and rejected to update, because the API's update does not change a field's kind. `unit` and `target`
are optional metadata the web app reads; `target` must be a finite number when given. Both print the habit.

**S10 — Output contract, unchanged from step 2.** stdout carries data only; stderr carries human messages; exit `0`
on success, `1` when the domain says no, `2` on a wrong invocation. Text output stays aligned and colourless.

**S11 — Proven.** `cli/test/smoke.test.ts` keeps its five cases and adds one end-to-end case on an isolated
`CHUB_HOME` that drives the new commands against a habit seeded through the API: `log` on an empty history, `set` on
a number field (including a `--clear` and a wrong-kind value at exit `2`), `undo` after `done`, `rename`, `archive`
followed by `list` hiding it and `list --archived` showing it, `unarchive`, `field add`, `field update`, and the
domain failures (`not_found`, `ambiguous`). Runs with `bun test`; the parent builds and installs, not the worker.

**S12 — Deliberately out of scope, awaiting a user decision.** Three operations stay unbuilt:
1. Deleting a habit (`DELETE /habits/:id/purge`). It drops the habit, its fields and its whole history with no undo.
2. Removing a field (`DELETE /habits/:id/fields/:fieldId`). The API answers `field: "deleted" | "archived"`, so the
   caller must pick a policy and the CLI must say which one it applied.
3. Streaks, completion rate and per-day levels. The logic already exists as pure functions in
   `web/src/features/habits/level.ts`, which the CLI cannot import (web-only paths and aliases). Copying it would
   duplicate domain math that will drift; the honest options are a shared module and a web refactor, or leaving it
   to the web UI.

## Tasks

| ID | Specs | Route | Commit | Task |
| --- | --- | --- | --- | --- |
| T1 | S1, S2, S6 | worker | none | `ops.ts`: value parsing, field resolution, `setHabitValue`, `logHabit`, `undoHabit`, create/rename/archive, `addField`, `updateField` |
| T2 | S3, S4, S5 | worker | none | `index.ts`: `section` on list, `log`, `undo` |
| T3 | S6, S7, S8, S9 | worker | none | `index.ts`: `set`, `add`, `rename`, `archive`, `unarchive`, `field add`, `field update` and the usage text |
| T4 | S10, S11 | worker | none | Extend `cli/test/smoke.test.ts` with the end-to-end case |
| T5 | S11 | parent | none | Typecheck, build and run `bun test`; report, without installing |

## Log

L1 (user, verbatim): "genial ahora haz la capa de habitos de cli, simple si tenemos funciones complicadas dime que
propones o si mejor las dejamos fuera y yo decido, primero toda la capa de habitos en cli, esta vez hazlo, bueno
mandas al subagente y y me das un resumen, no lo instales de una, primero reviso tu resumen"

L2 (parent decision, S12): the three deferred operations are the ones where a wrong default destroys data or forks
domain logic. Everything the API can do safely is in scope; these three are proposed, not built, per the user's
"dime que propones o si mejor las dejamos fuera y yo decido".

L3 (parent decision, routing): `gentle-ai-worker` was launched first and returned `status: blocked` with no file
changes: its sandbox forbids writing `cli/dist` and `web/dist` and forbids the temporary-directory deletion the
smoke test performs, so it cannot build or test the CLI. Same limitation recorded in `cli-commands.md` L6. The parent
implemented T1-T5 inline.

L4 (not done on purpose): no commit and no install. The user asked for a summary to review first, and `AGENTS.md`
forbids committing unless the user asks.

L5 (evidence, T1-T5). The worker wrote T1-T4 and reported `pnpm --filter @chub/cli typecheck` exit `0`; it could not
build or run the smoke test (L3), so the parent verified: `bun run build:binary` exit `0`, then `bun test` →
6 pass / 0 fail, 66 assertions. The five earlier cases still pass, and the new case covers the seeded habit, an empty
`log`, `set` with a value, a wrong-kind value at exit `2`, `--clear` emptying the day, `done` then `undo` leaving no
entry, `rename`, `archive` hidden from `list` and shown by `list --archived`, `unarchive`, `field add`, `field update`,
and the `not_found`/`ambiguous` failures at exit `1`. Parent cleanup on top of the worker's diff: removed a dead
`habitsUsage = usage` alias, so `chub habits` prints the full usage. Nothing was installed; the installed binary is
still the 0.1.0 build from step 2.
