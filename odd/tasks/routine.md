# Routine: a day built from time blocks, repeated across the week, with its own record

Status: prototype in progress. The deliverable of this wave is **the view with mocked functions** — no server, no
database, no API — so the shape can be judged before a migration is written. Subagents read this file in order and
stop before `## Log`, which is evidence rather than spec.

## Specs

**S1 — This wave is a mocked view, not the module.** The user's words: "que te parece si haces el modulo en /routine,
pero solo la vista y con funciones mock ... vemos que si aplica que no y despues terminamos ese modulo". A rule:
`/routine` exists as a real, lazily-loaded section route and renders from an in-memory store in
`web/src/features/routine/routine-mock.ts`. No migration, no Hono route, no `fetch`, no persistence, no new npm
dependency. Every mocked function returns a promise already, so replacing it with the real client later is mechanical.
The page says in one visible line that it is a prototype over mocked data.

**S2 — The day is built from time blocks, and time is not optional.** The user's words: "la aprte de hora es
indispensable ... digamos que de 7am a 8am despertar y desayunar, luego de 8 a 8:30 am leer". A rule: a `RoutineBlock`
is `{ start, end, title, intent, link, note }` where `start` and `end` are local `HH:MM` with minute precision and
`start < end`. Blocks inside one day never overlap and are rendered in start order.

**S3 — Settings own the week and the waking window.** The user's words: "que dia empieza la semana? horarios de inicio
y fin del dia, las horas fuera de eso se marcan como para dormir". A rule: `RoutineSettings` is
`{ weekStartsOn, dayStart, dayEnd }`; every hour outside `dayStart..dayEnd` renders as a sleep band and cannot hold a
block; the week grid starts on `weekStartsOn`.

**S4 — A block may link to nothing, and often does.** The user's words: "en otros horarios solo texto o notas de que es
lo que se hara no todo tiene que tener algo ligado". A rule: `link` is `null` for a plain block, or `{ kind, id }` for
`habit`, `task` or `goal`. A plain block is a first-class block: it is editable, markable and counted like any other.

**S5 — One day is the template; repeating it is how the week is created.** The user's words: "primero crear un dia
... luego poder repedir ese dia en toda la semana y poder eliminar y editar los demas, ese se queda como plantilla". A
rule: the builder edits one day at a time; "Repeat this day across the week" copies its blocks onto the other six and
marks it `isTemplate`; every other day stays independently editable and clearable, and the template keeps that badge.

**S6 — The routine is a guide: see what is next and mark from there.** The user's words: "que sea tu guia, para verla
ver que sigue poder marcar desde ahi". A rule: the Today surface renders the day as a timeline from `dayStart` to
`dayEnd`, marks the block that contains the current minute, and names the next block. Marking happens on that surface
and in the week grid; the builder never records.

**S7 — Five states, one note.** The user's words: "poder marcar desde ahi o solo dar hecho o no, o los estados que me
diste que me gustarion". A rule: a block on a date is `pending`, `done`, `missed`, `excused` or `skipped`, plus a free
`note`. A closed day with no record reads as `missed`; today with no record reads as `pending`. A note accompanies any
state and never changes which one it is — the state excuses, the note explains.

**S8 — Only "must" counts.** The user's decision: "Dos tipos, solo 'tengo que' cuenta". A rule: `intent` is `must` or
`want`; the weekly rate is `done / expected` over `must` blocks on closed days only, and `want` blocks are visible and
markable but never scored. `excused` and `skipped` leave the denominator. Today never counts as a miss.

**S9 — The routine keeps its own record, and the link is a mirror.** The user's words: "que rutina tenga su propio
registro aparte para no afectar la independencia ... es doble registro? si pero para el sistema no para el usuario,
marcar una tarea como hecha llenar en 2 lados, que la desmarcamos, igual en los dos". A rule: `setOccurrence` always
writes the routine occurrence first, then mirrors the same state into the linked habit, task or goal. The mirror is
best-effort: when the target is gone the mirror reports `written: false` and **the routine occurrence stands**. A
deleted or archived target never erases routine history. The mirror outcome is shown next to the block so the
double write is visible, not magic.

**S10 — Reuse, no new dependency, no chart library.** The rule the other sections already follow: `Button`, `Input`,
`Select*`, `Menu*` from `web/src/components/ui`, `lucide-react` icons, `cn` from `@/lib/utils`, the CSS variables in
`web/src/styles/tokens.css`, and the local-day helpers in `web/src/features/habits/date.ts` (`dayKeyOf`, `addDays`,
`todayKey`, `DayKey`). `toISOString().slice(0, 10)` never appears. No Radix, no `framer-motion` root, no `ui-kit`
chart import.

**S11 — The prototype is disposable and labelled as such.** A rule: every file of this wave opens with a
`PROTOTYPE` comment naming the question it answers (`odd/tasks/routine.md`), the page shows one line saying data is
mocked, the store exposes `resetRoutine()` behind a "Reset prototype" action, and nothing about the mock reaches a
server, a preference key or a migration. Adding it to the real module later means replacing `routine-mock.ts` with an
API client, not refactoring the surfaces.

**S12 — Tests are minimal and prove the mock, not the pixels.** A rule: one focused test file for the pure model
(`routine-model.ts`: segments, current/next block, weekly rate, closed-day rule) and one smoke render per surface that
proves the action it owns reaches the store. No visual snapshots, no exhaustive UI coverage.

**S13 — The entry chunk does not grow.** A rule: the route is registered through a `lazy` dynamic import with the same
`/* @__PURE__ */` annotation the other sections use, and `pnpm --filter @chub/web build` still emits the route as its
own chunk.

## Tasks

No commits: the working tree carries this wave uncommitted, as the repository's agreement states.

- **T1 — Scaffold and contract.** Feature document, `types.ts`, `routine-model.ts`, `routine-mock.ts`, `use-routine.ts`,
  the page shell with its mode switch, the lazy route in `web/src/App.tsx` and the entry in `web/src/app/sections.ts`.
  Route: parent, inline. Specs: S1, S2, S3, S8, S10, S11, S13.
- **T2 — Builder surface** (`routine-builder.tsx`). Settings (week start, day window), block editing with time ranges,
  link pickers, repeat-day, clear-day. Route: delegated worker. Specs: S2, S3, S4, S5.
- **T3 — Week surface** (`routine-week.tsx`). Seven days from `weekStartsOn`, template badge, compact blocks, per-day
  states and the weekly rate. Route: delegated worker. Specs: S5, S6, S7, S8, S9.
- **T4 — Today surface** (`routine-today.tsx`). Timeline from day window to day window, sleep bands, current block,
  next block, state controls with note and the mirror line. Route: delegated worker. Specs: S6, S7, S8, S9.
- **T5 — Integration and checks.** Parent wires the three surfaces into the page, then
  `pnpm --filter @chub/web test`, `pnpm --filter @chub/web typecheck` and `pnpm --filter @chub/web build` with a look
  at `web/dist`. Specs: S12, S13.

## Log

**L1 — The user's original request.** "tengo una super idea, pero necesito que la platiquemos porque no tengo idea de
como crearla o como configurarla Quiero un modulo de Rutina, principalmente que sea eso, tener los dias de la semana
metes que vas a hacer o que quieres, pero a veces uno si cumple o no,, entiendes? ayudame a desarrollar la idea, aun no
escribas nada de codigo"

**L2 — The user corrects the ownership of the record.** "mira me gusta el modelo pero en los habitos y tareas se que se
pueden borrar, podemos usarlos como conectados, pero que rutina tenga su propio registro aparte para no afectar la
independecian ... si rutina tiene su propio registro inmutable lo demas queda conectado e independiente, es doble
registro? si pero para el sistema no para el usuario, marcar una tarea como hecha llenar en 2 lados, que la
desmarcamos, igual en lso dos, para no depender totalmente"

**L3 — The user replaces the item model with time blocks and authorizes the mocked view.** "la aprte de hora es
indispensable ... Una pantalla para crear tu rutina, que dia empeiza la semana? horarios de inicio y fin del dia, las
horas fuera de eso se marcan como para dormir, primero crear un dia, poder dividir entre minutos y horas ... luego
poder repedir ese dia en toda la semana y poder eliminar y editar los demas, ese se queda como plantilla ... que te
parece si haces el modulo en /routine, pero solo la vista y con funciones mock, que lo hagan los sub agentes, vemos que
si aplica que no y despues terminamos ese modulo?"

**L4 — Decisions taken in the design conversation.** Template plus per-week adjustments; the metric counts and a note
can explain; connected to habits and tasks; two intents with only `must` scored; marking a task from the routine
completes it in both directions; the past is editable for a few days and then freezes. Evidence read from the code that
shaped the model: `server/src/db/schema.ts` (habit entries keyed by habit, field and local date;
`project_columns.is_completed` is a per-column flag that a project may lack) and
`web/src/features/tasks/retention.ts` (completed tasks can be purged by preference, which is why the routine never
derives its own record from a task).

**L6 — The note rule had a hole, and the delegated surfaces each found something.** The T4 worker reported that a note
written before a state was chosen vanished: `setOccurrence` deleted the occurrence row whenever the status was
`pending`, and `pending` was how the mock represented "no record". S7 says a note accompanies *any* state, so the mock
now keeps the row when a note exists, and `statusOf` ignores a stored `pending` so a closed day still reads as `missed`
underneath the note. `routine-model.test.ts` gained that case, which the parent had to fix once for reading a Tuesday
block off Wednesday. The T3 worker's guessed `6/6` and the T1 seed defect are in L5. T5's first verifier invocation
verified nothing: it tried `cp --exclude` (rsync's flag, not cp's) to build an isolated copy and stopped on the failure.
The unit was relaunched to run in place, since test, typecheck and build mutate no tracked source.

**L7 — The wave's final evidence, as measured.** `typecheck` clean. `pnpm --filter @chub/web build` exit 0, and the
routine route is its own chunk (`routine-page-*.js`, 34.26 kB): the string `Untitled block` appears zero times in the
entry `index-*.js` (1,684.52 kB, 530.98 kB gzip) and once in the routine chunk, which is the bundle-level proof S13 asks
for. The build emits 25 JavaScript chunks and 2.03 MB total against the 22 chunks and 1.90 MB `AGENTS.md` documents; the
gap belongs to this tree's other uncommitted waves as much as to this route, and the entry carried no routine code
before or after. The package suite is **not** green and was never made green by this wave: 395 passed, 1 failed, and
the failure is `books-page.test.tsx`, "records checks, minutes and pages, reverts failed checks and blocks future-day
writes". That test clicks the day button for `addDays(today, 1)` and the strip only renders the week containing today,
so it fails whenever the suite runs on a Sunday — this run happened on Sunday 25 October 2026 and the assertion looked
for "Monday, October 26" while the rendered button was "Monday, October 19". It is a pre-existing, calendar-dependent
test defect unrelated to this feature: `web/src/features/books/` imports nothing from `routine`, and the 18 routine
tests passed in that same run.

## Wave 2 — the real module, plus three additions

The user's words, verbatim, opening this wave: "Es genial, me encanta, solo le agregaria 2 cosas ... En la vista de
Today poder hacer next o prev para ver el dia siguiente o el dia anterior igual en timeline / en Week agregar una vista
de 3 dias para revisar desde hoy y 3 dias mas para tener una vista mas amplia / y build poder agregar inicio y fin
independiente por dia o igual para todos como ahora, pero tener esa posibiblidad de que sea difentente en cada dia,
dale, ya ha contruirlo de verdad, tu orgnizas y delegas, las verificaciones acotadas, pero bien hechas y yo me encargo
de la revidion final".

**S14 — The module becomes real; the mock stops being the source.** A rule: `web/src/features/routine/routine-api.ts`
replaces the in-memory store as what `use-routine.ts` calls, backed by a Hono route and SQLite. `RoutineStore` keeps its
current shape, so no surface is rewritten to go real. `routine-mock.ts` survives only as a test fixture
(`routine-fixture.ts`, marked test-only) that `stubRoutineApi()` uses behind a stubbed `fetch`, so the surface tests
exercise the real client path and change two lines each. The prototype banner and its Reset button leave the page.

**S15 — Data model.** One migration, `0004_routine.sql` or the next free number, hand-written like the others, with its
`_journal.json` entry and the `user_version` bump that `server/test/migrations.test.ts` asserts:

- `routine_settings(id text pk, week_starts_on integer not null default 1, day_start text not null default '07:00',
  day_end text not null default '23:00', updated_at text not null)`, seeded with one row `id = 'routine'`.
- `routine_day_windows(weekday integer pk, start text not null, end text not null)` — the per-day window of S17; a
  missing row means the day follows the global window.
- `routine_days(weekday integer pk, is_template integer not null default 0)` — seven rows, seeded.
- `routine_blocks(id text pk, weekday integer not null, title text not null default '', start text not null, end text
  not null, intent text not null default 'must', link_kind text, link_id text, note text not null default '',
  position integer not null, created_at text not null, updated_at text not null)`, index on `(weekday, position)`, and
  `link_kind` XOR `link_id` (both null or both set).
- `routine_occurrences(block_id text not null references routine_blocks(id) on delete cascade, date text not null,
  status text not null, note text not null default '', created_at text not null, updated_at text not null,
  primary key (block_id, date))`, index on `date`.
- `routine_mirrors(block_id text not null, date text not null, target text not null, target_id text not null,
  written integer not null, reason text, primary key (block_id, date))`, no foreign key: a mirror outlives the block it
  described, because its whole purpose is to record that the routine record stood when the target was gone.

**S16 — API, one call per store function.** All under `/api/routine`, mounted in `server/src/app.ts`, errors by a
`RoutineError` carrying a code (`invalid_body` 400, `block_not_found` 404, `block_overlap` 400, `outside_day_window` 400,
`invalid_time` 400), and every mutating call answers with the whole snapshot the client then renders:

- `GET /api/routine` → `{ settings, days, blocks, occurrences, mirrors }`.
- `PUT /api/routine/settings` `{ weekStartsOn?, dayStart?, dayEnd?, dayWindows? }` where `dayWindows` is
  `Array<{ weekday, start, end } | { weekday, start: null }>` → snapshot. A `null` start deletes the override.
- `POST /api/routine/days/:weekday/blocks`, `PATCH /api/routine/blocks/:id`, `DELETE /api/routine/blocks/:id`,
  `POST /api/routine/days/:weekday/repeat`, `DELETE /api/routine/days/:weekday` → snapshot.
- `PUT /api/routine/blocks/:id/occurrences/:date` `{ status?, note? }` → snapshot, and this is the one call that also
  writes the mirror (S9): `done` on a habit-linked block writes the habit field's entry for that date, `done` on a
  task-linked block moves the task to the first `is_completed` column by position, and leaving `done` clears the same
  thing. A project with no completed column is **not** an error: the request succeeds, the mirror is stored with
  `written: false, reason: "no_completed_column"`, and the routine occurrence stands. A deleted or archived target
  answers `written: false, reason: "target_missing"`. Nothing a link can do is allowed to lose the routine record or
  fail the request, because that record belongs to the user and not to the target — an error response that rolled the
  occurrence back would be the exact failure this example exists to prevent. The mirror therefore runs in a
  **transaction of its own**, after the occurrence is committed: a mirror failure of any kind, including a database
  error while writing it, is recorded as `written: false, reason: "mirror_failed"` and the occurrence stands. The routine row
  is written first and in the same transaction, so a failed mirror never loses the record. A `goal` link is
  informational and is never mirrored: a goal has no per-day completion to write, so a block names the goal it serves
  and the record stays in the routine, with no mirror row and no change to the goal.

**S17 — Each day may carry its own waking window.** The user's words: "poder agregar inicio y fin independiente por dia
o igual para todos como ahora, pero tener esa posibiblidad de que sea difentente en cada dia". A rule: the global
`dayStart`/`dayEnd` stay the default, `dayWindows` overrides a weekday, and the builder offers both ("Same for every
day" versus "Set for this day", where the latter writes or clears that weekday's override). `windowOf(state, weekday)`
becomes the only place the window is resolved, and `segmentsOfDay` reads it, so Today, Week and the builder follow the
per-day window without any of them knowing about it.

**S18 — Today steps to the previous and next day in the same timeline.** The user's words: "En la vista de Today poder
hacer next o prev para ver el dia siguiente o el dia anterior igual en timeline". A rule: `RoutineToday` takes the day
it renders plus a callback, and the page owns that day; previous/next move one day, a "Today" action returns, and the
surface stays the same timeline for any date. Recording follows the day being shown, so a past day can be corrected
while the past is still open, and future days render disabled and writable by nothing. The current-block and next-block
regions only appear when the shown day is today.

**S19 — Week gains a three-day range from today.** The user's words: "en Week agregar una vista de 3 dias para revisar
desde hoy y 3 dias mas para tener una vista mas amplia". A rule: a range control on the Week surface switches between
the seven-day week and a three-day range that starts at today and covers the two days after it — three days literally,
behind one `RANGE_DAYS = 3` constant so widening it is a one-line change. The range keeps the same block rows, states
and marking as the week, and today is still marked.

## Tasks of wave 2

Still no commits: the repository's agreement is that nothing is committed unless the user asks, and the user asked for
the module, not for commits.

- **T6 — Server.** Migration, `server/src/db/schema.ts` entries, `server/src/routine/repository.ts`,
  `server/src/routes/routine.ts`, mounting in `server/src/app.ts`, `migrations.test.ts` update, and repository tests.
  Route: delegated. High risk: item 1 (migration) and item 3 (the mirror writes into habits and tasks).
  Specs: S15, S16, S9.
- **T7 — Web client and the real hook.** `routine-api.ts`, `use-routine.ts` pointed at it, the fixture move to
  `routine-fixture.ts`, `stubRoutineApi()`, and the three surface tests re-pointed. Route: delegated. Specs: S14.
- **T8 — Today: prev/next.** `routine-today.tsx` plus the page-owned date. Route: delegated. Specs: S18.
- **T9 — Week: three-day range.** `routine-week.tsx`. Route: delegated. Specs: S19.
- **T10 — Builder: per-day windows.** `routine-builder.tsx` over the shared `windowOf`. Route: delegated. Specs: S17.
- **T11 — Integration and verification.** Parent wires the page, then focused tests, `typecheck`, `build`, and one
  independent verification of T6 alone, because a migration and a cross-module write are the two things a green
  focused run cannot vouch for. Specs: S12, S13.

**L8 — Wave 2 opens.** The user approved the prototype and asked for it to be built for real with three additions. The
ambiguity in "vista de 3 dias ... desde hoy y 3 dias mas" is resolved as three days total from today and recorded in S19
with the constant that makes it four if that reading was wrong.

**L9 — The migration moved a pinned version, and that is integration work.** `0020_routine.sql` took the schema to
`user_version` 21. `server/test/projects-data-integrity.test.ts` pinned 20 in a literal assertion, so the full server
suite failed with one test even though every routine test passed; that file was outside T6's surfaces and the worker
stopped rather than reaching for it, which is the right call. The parent bumped the literal to 21 as part of
integration. A migration that adds a table is still schema change, which is why T6 gets its own independent
verification before this wave is called done.

**L10 — Independent verification found the one thing the tests could not.** T6 came back with 179/179 server tests and
typecheck green, an additive migration with a unique, consecutive journal index and coherent `user_version`, and
block validation that really honours the per-weekday window. It also found the defect the green suite hid: marking a
task-linked block `done` inside a project with no completed column threw `project_has_no_completed_column` inside the
transaction, so the rollback took the routine occurrence with it. S16 was wrong, not the implementation's intent — the
case is not an error any more: the occurrence lands, the task stays put, and the mirror is stored as
`written: false, reason: "no_completed_column"`. A 400 that persists half its effect would have been worse than the
bug. The web package measured 404 passed and 1 failed, and that failure is the pre-existing books Sunday test
(`Unable to find an accessible element with the role "button" and name "Monday, October 26"`), reproduced in isolation,
not a regression from this wave.

**L11 — The second verification found the same bug one floor down, so the guarantee was made structural.** After the
`no_completed_column` fix the re-check answered its closing question with a plain "no": the specific rollback was gone,
but any SQL failure while mirroring — a foreign-key violation, a failed lookup, the mirror insert itself — still rolled
back the occurrence, because the two writes shared one transaction. "Written first, in the same transaction" was never
the same promise as "persisted". The occurrence now commits alone and the mirror runs afterwards in its own
transaction, reporting `written: false, reason: "mirror_failed"` when it cannot; the request still succeeds. The test
that proves it raises a real SQLite `BEFORE INSERT` trigger with `ABORT` on `habit_entries` instead of stubbing an
error, because a stubbed failure only proves the stub. The remaining `snapshot()` read can fail on its own, which
costs a response and never a record. Server suite: 182 tests.

## Wave 3 — the four problems the user found by using it

The user's words, verbatim: "1. a yo querer ingresar (en el build) un bloque en una hora que ya esta usada que la
notificacion sea un toast porque ahora no me mostro el erro hasta que hice scroll, agregar los errores aviso y eso en
toast con colores para identificar y lo de retry o dismmiss ahi en los toast / 2. en el select de Week starts on en
lugar de ver el nombre de los dias solo veo numeros, en el select si se ven los nombres de los dias, pero al
seleccionar uno lo pone como numero / 3. mejoremos el Day starts - Day ends, haganoslos como alarma de celular, ponemos
los dias y seleccionamos los dias que aplique ese horario, y debajo ponemos la hora para ver que ya esta seteado y no /
4. el build lo podemos mejorar para ux, porque me gusta, pero me pierdo ... 2 columnas, izquierda el bloque
constructor que en automatico al dar en el boton de siguiente selecciona el siguiente bloque de hora ... agregar botones
de + o -, +10 -10 minutos ... al tratar de selecionar link a un habito parece que sigue teniendo los datos mock y no la
conexion real y por eso falla ... en la columna de la derecha con menos espacio un resumen visual para tener en cuenta
que ya se ingreso en ese dia".

**S20 — A failure is announced where the user is looking.** A rule: a toast system lives in
`web/src/components/ui/toast.tsx` — a provider, a `useToast()` hook and one viewport — built from the primitives and
tokens this repository already has, with **no new npm dependency**. A toast carries a tone (`error`, `success`,
`info`), a title, an optional description, and up to two actions of which one may be `Retry` and one `Dismiss`. Errors
are announced with `role="alert"`; success and info with `role="status"`. The page-level error banner disappears and
every write failure that used to land there is raised as a toast instead, so an overlap is visible without scrolling.
Because the tones must be distinguishable, `--success` is added to `web/src/styles/tokens.css` and mapped in both
themes, next to the existing monochrome values. The viewport sits above the content on small screens and bottom-right
from `sm` up.

**S21 — A weekday is a name, never a number.** The user's words: "en el select de Week starts on ... solo veo numeros
... al seleccionar uno lo pone como numero". A rule: the trigger of that Select renders the weekday's label for the
current value, so `1` never reaches the screen. The same rule applies to every Select in the section whose value is an
id or an index.

**S22 — The waking window becomes a schedule, like a phone alarm.** The user's words: "haganoslos como alarma de celular,
ponemos los dias y seleccionamos los dias que aplique ese horario, y debajo ponemos la hora para ver que ya esta seteado
y no". A rule: the settings panel shows a list of windows. The first one is the base, "Every day", backed by
`dayStart`/`dayEnd`. Any other entry owns a set of weekdays and its own start and end, backed by the existing
`dayWindows` overrides, which is why no new storage is needed. Creating an entry takes the days first and then the
times; deleting an entry returns exactly those days to the base; editing an entry rewrites the override for its days
only. Under the list, every weekday is listed with the window that actually resolves for it, so "already set or not" is
answerable at a glance.

**S23 — The build surface is two columns, and the next block is primed.** The user's words: "2 columnas, izquierda el
bloque constructor que en automatico al dar en el boton de siguiente selecciona el siguiente bloque de hora, por
ejemplo si el bloque anterior es de 7am a 8am, en automatico el siguiente es de 8am a 9am; agregar botones de + o -,
+10 -10 minutos ... en la columna de la derecha con menos espacio un resumen visual". A rule: the day selector stays
where it is, on top. Below it, a two-column layout from `lg` up: the block constructor on the left, and a narrower
right column showing what that day already has — the blocks in order with their times, and what is linked — so the user
can see the shape of the day while typing. Saving a block primes the next one to start where the previous ended and to
end one hour later, and a `Next` action advances to the next free slot. Start and end each get `+10` and `−10` minute
buttons. Nothing in the constructor may silently clamp a time: a rejection is a toast (S20).

**S24 — The link picker reads the real workspace.** The user's words: "al tratar de selecionar link a un habito parece
que sigue teniendo los datos mock y no la conexion real y por eso falla". A rule: `GET /api/routine/link-targets`
answers `{ habits, tasks, goals }` from the database — active habits each with the field a check would write, tasks with
their project name, and goals — and the builder loads it once, shows a loading and an empty state, and never offers an
id that came from a fixture. A block linked to a habit writes that habit's first trackable field, which is why the
habit entry carries `fieldId`. `routine-fixture.ts` keeps serving the web tests, but the production path stops
mentioning it. A target that disappears after the fact still reports `target_missing` (S16), which is what the user was
seeing before this wave.

## Tasks of wave 3

Still no commits.

- **T12 — Toasts.** `toast.tsx`, the `--success` token, and the page wired to it. Route: delegated. Specs: S20.
- **T13 — Real link targets.** The server endpoint with its repository function and tests, plus the client function.
  Route: delegated. Specs: S24.
- **T14 — The builder.** S21, S22, S23 and the picker half of S24, over the toast API and the link-targets endpoint.
  Route: delegated, after T12 and T13. Specs: S21, S22, S23, S24.
- **T15 — Integration and verification.** Parent: focused tests, both suites, both typechecks, build, and one
  independent verification of the surface the user will actually judge.

**L12 — Wave 3: the user's four complaints, and what verification found behind them.** Toasts replaced the banner
(S20), a weekday label replaced the raw index in the trigger (S21), windows became a schedule of day-sets (S22), and
the builder became two columns with a primed next block and a workspace-backed picker (S23, S24). The picker's failure
was exactly the user's diagnosis: the surface offered fixture ids, so every habit link pointed at a row that did not
exist and every mirror answered `target_missing`. Verification of the rewrite then found two blockers the five green
tests could not: a saved block ending after 23:00 primed a draft whose start equalled its end, and a block whose target
had since disappeared rendered as a blank selector instead of an unavailable one. Fixing them produced three red tests
of two different diseases — one real component bug (choosing "No link" changed the draft but the trigger still rendered
the raw value) and two assertions (one searched the whole surface, one never waited for the settings write). The rules
that came out of it are recorded in the memory entry "Routine UX rules": never prime an impossible slot, never hide a
stored link, never offer a retry that cannot work.

## Wave 4 — what using it revealed

The user's words: "1. el boton de Add Block no funciona no me deja dar click o no muestra si hay un error, ya lo inten vaias veces revisalo / 2. pasar el bloque de contructor como el primero y debajo los que ya estan progrmados / 3. numerar los bloques para ver el orden y que el bloque contructor tenga el numero que estas editando / 4. el contenedor del inicio de Weeks start ohn y lo de Waking windows es genial, me gusta como funciona, pero no su diseño, creo que lo podemos reducir para que use menos espacio".

**S25 — The add form is never born invalid.** Reproduced before fixing, exactly as the repository's rule demands. The form's draft started at a hardcoded `07:00–07:30`, so on any day that already had a block there every attempt was rejected with `block_overlap: "Stretch" already runs 07:00-07:15` — the button worked and the toast fired, but the default was pre-broken, which reads as "the button does nothing". The user also pointed at the second half: after a successful create the title and note were never cleared, so the next attempt repeated the same block. A rule: the draft is primed to the first free slot of the selected day, on mount, when the weekday changes, after a create and after a delete; when no slot fits it is left empty with the existing "no further slot" message; and a successful create clears the title and the note. A rejection still surfaces as a toast carrying the server's own message (S20).

**S26 — The constructor is first.** The user's words: "pasar el bloque de contructor como el primero y debajo los que ya estan progrmados". A rule: inside a day, the add form comes before the list of programmed blocks, so the thing you came to do is at the top and the history grows underneath it.

**S27 — Blocks are numbered, and the constructor owns the number it writes.** The user's words: "numerar los bloques para ver el orden y que el bloque contructor tenga el numero que estas editando". A rule: every block of a day shows its ordinal in start-time order, and the constructor shows the ordinal the new block will occupy — the number it is "editing" into the day. The numbering is derived from the day's block order, never stored.

**S28 — The settings container gets compact.** The user's words: "es genial, me gusta como funciona, pero no su diseño, creo que lo podemos reducir para que use menos espacio". A rule: the same controls, in less vertical space — the weekday selector and the waking-window schedule stay exactly as they behave today, including the resolved per-day list, but compressed. This is a design task and it is done with the `ui-ux-pro-max` skill, whose guidance wins over any layout preference stated elsewhere in this document.

## Tasks of wave 4

Still no commits.

- **T16 — The constructor: birth, order and numbers.** `routine-builder-add.test.tsx` is the failing reproduction already committed to the tree; it must go green. Route: delegated. Specs: S25, S26, S27.
- **T17 — The settings container, compact.** Route: delegated with the `ui-ux-pro-max` skill, after T16 because it is the same file. Specs: S28.
- **T18 — Integration and verification.** Parent: focused tests, both suites, both typechecks, build, and one independent verification of the surface the user will judge.

**L13 — "The button does nothing" was a form born invalid, and the reproduction had to be fixed before the code.** The
submit path was correct: the toast fired with the server's own words, `block_overlap: "Stretch" already runs
07:00-07:15`. The defect was that the draft started at a hardcoded `07:00–07:30`, so on any day that was already
planned every attempt was rejected, and the title was never cleared after a create, so it repeated. The reproduction
written first selected the seeded Monday, which is deliberately full from 07:00 to 23:00 — so it demanded a creation
that S25 forbids. The test's scenario was the bug: it moved to a day with a real gap, and a second case now pins the
opposite behaviour, that a day with no room says so and creates nothing. The three red tests that followed were of
three different kinds and were named as such: a scenario bug (the full Monday), an assertion bug (a guessed ordinal
where the surface derives another), and a real component bug (the priming searched from the start of the day instead
of from the end of the block just created). Nothing in this wave changed the fixture: when a test disagrees with
realistic data, the test adapts.

**L14 — Verification of wave 4 confirmed three of four specs and found the hazard the user would have hit next.** S25, S26
and S28 were met; S27 was implemented but unproven, and the missing proof was exactly the claim that matters — that the
ordinal the constructor announces is the ordinal the created block ends up holding. It also found `Next` searching from
the start of the waking window instead of from the draft's position, so pressing it could hand back an earlier, already
occupied hour and read as "nothing happened", with the explanation parked in the other column. And it found the silent
half of the user's original complaint still alive in the time inputs: a cleared time field was discarded without a word,
because the guard was `event.target.value && …`. All three were fixed with RED-first tests, the ordinal turned out to be
correct and is now pinned by a test that moves a block and watches its neighbours renumber. The lesson worth keeping is
that "no visible message" was not one bug but a family: a rejected write, a backwards search and a discarded edit all
look identical from the chair.

## Wave 5 — freezing the past, and a redesign the parent does itself

**S29 — The past freezes after a window the user chooses.** The user's words: "si congelar el pasado, en las
configuraciones pon la opcion de 7 dias o 3 dias, de default pongamos 7 despues de eso ya no". A rule: a routine
setting `editWindowDays` accepts exactly `3` or `7`, defaults to `7`, and lives in the database so the server can
enforce it. A date is editable while it is inside the window — today and the `editWindowDays − 1` days before it — and
frozen once it falls out of it; future days stay unwritable as they already are. The **server** refuses a write to a
frozen date with 400 `date_frozen`, because a client-side guard is a suggestion; the client shows that refusal as a
toast and the Today surface disables recording on a frozen day while still letting the user look at it. The server
compares against its own local date, which for a personal workspace on one machine is the user's date; that assumption
is written down here rather than left implicit. Only the user's own record is frozen — reading, navigation and the
mirror history stay untouched.

**S30 — The waking-window container is redesigned by the parent, from a screenshot of the real thing.** The user's
words: "mejor tu haz el rediseño Waking windows porque el sub agente no me gusto su trabajo y siento que se puede
reducir mas o quitar cosas para mejorar todo ... es muy alto y no es necesario tanto y hay espacio desperdiciado, puede
que sea en 3 columnas o no se". What the screenshot shows: the left column holds a single control and then roughly two
hundred pixels of nothing; every window is a full-width card with 44px inputs; and the resolved list spends four rows
repeating the same range seven times. A rule: the base window moves into the left column under the week-start control so
that column stops being empty; each window entry becomes one dense row with inline times and icon actions; the seven
resolved days collapse into a single row of small chips that distinguishes an inherited window from one the day owns;
and every behaviour of S22 survives. Accessible names stay stable where they can, and where the markup changes shape the
tests are updated to the new truth rather than the design being bent to old assertions.

## Tasks of wave 5

Still no commits.

- **T20 — The freeze.** Migration `0021`, the setting, server-side refusal and its tests. Route: delegated. Specs: S29.
- **T21 — The freeze in the interface.** The setting control and the disabled frozen day. Route: delegated after T20.
  Specs: S29.
- **T22 — The container.** Parent, inline. Specs: S30.
- **T23 — Gate.** Both suites, both typechecks, build.

**L15 — Wave 5 opens.** The user authorised fixing the two date-dependent tests, and both are now fixed: the tasks test
built its due dates from `toISOString()` — a UTC day — and now uses the local `dayKeyOf`; the books test assumed
tomorrow always sits inside the rendered week, which is false on Sundays, and now pins the clock to a Wednesday so it
keeps testing the future-day guard instead of the calendar. The freeze arrives as a server-enforced setting, and the
waking-window redesign is done by the parent rather than delegated, at the user's explicit request.

**L16 — Wave 5 closes: the suite is green for the first time.** The two date-dependent tests are fixed at the cause and
not by loosening them: the tasks test now builds its due dates with the local `dayKeyOf` instead of a UTC
`toISOString()` day, and the books test pins its clock to a Wednesday so it keeps testing the future-day guard rather
than depending on which weekday the suite happens to run. The freeze landed on both sides with one rule and one
comparison — today and the `editWindowDays − 1` days before it are editable, everything older refuses with
`date_frozen` **before** anything is written, and the client's `isFrozenDay` is tested at the same boundary with both
values. A frozen day is still navigable and readable; only recording goes away, because burying the past would lose the
one thing the module exists to keep. The waking-window container was redesigned by the parent instead of a worker: the
base window moved under the week-start control into a column that was previously two hundred pixels of nothing, each
window entry became a dense row with icon actions, and seven repeated resolved lines became one row of chips that shows
at a glance which days own a window and which inherit the base.

## Wave 6 — one zone for the workspace

The user's words: "Creo que tenemos un problema con la DB y las horas, hagmos esto, en setting agregar zona horaria, para
que sobre eso todo se calcule, y en el select de sona horaria pon principalmente los de mecico cdmx y los de EU y que se
pueda buscar".

The suspicion is well founded, and the mechanism was found before writing anything: `editableFromDay` in
`server/src/routine/repository.ts` derives the freeze boundary from `new Date()` read with **the server's own local
getters**. On one machine that is the user's date; inside a container, whose zone defaults to UTC, it is six hours off
for this workspace — the same UTC-versus-local defect that the books and tasks tests were hiding, except this one
decides whether a historical record can be written.

**S31 — The workspace has a time zone, and every derived date uses it.** A rule: `workspace.timezone` is a workspace
preference in the existing registry (no migration, no new table), defaulting to `America/Mexico_City` and validated by
`Intl`. Which day is "today", which days are still editable, and every day key the routine derives come from that zone —
on the client *and* on the server, each computing it from the same stored value. Blocks keep storing local wall-clock
`HH:MM` and are never converted, because 07:00 in a routine means 07:00 where the person lives. The server keeps its own
small helper so the two packages stay independent, and the rule is asserted on both sides so they cannot drift. The
device zone is only ever used as an initial suggestion on the settings screen; it never silently becomes the rule.

**S32 — The picker is searchable and starts with Mexico and the US.** A rule: the settings screen renders
`kind: "timezone"` through one searchable control — a query field over a filtered list, grouped so the zones of Mexico
and the United States come first and everything else follows, each labelled `City (GMT±n)` while the stored value
remains the IANA id. Typing filters by id and by label, accents and case insensitive; the list is keyboard navigable and
announces the current selection. Reuse the local primitives and `lucide-react`; no new dependency.

## Tasks of wave 6

Still no commits.

- **T24 — The picker and the settings screen.** The searchable control and its rendering for `kind: "timezone"`, plus
  tests. Route: delegated. Specs: S32.
- **T25 — The zone reaches every derived date.** The routine surfaces read the preference, the server reads the same
  stored value through its own helper, and the freeze boundary follows the zone. Route: delegated, in parallel because
  the files are disjoint. Specs: S31.
- **T26 — Gate.** Both suites, both typechecks, build.

**L17 — The workspace zone now governs every derived date, and the diagnosis was confirmed before the fix.** The freeze
boundary in `server/src/routine/repository.ts` read `new Date()` with the server's local getters, which is correct only
while the server happens to share the user's zone — a container defaults to UTC and moves the boundary six hours. That is
the same UTC-versus-local family as the books and tasks tests, except this one decides whether a historical record can
be written. `workspace.timezone` now lives in the existing preference registry (no migration, no new table), defaults to
`America/Mexico_City`, and both sides derive today from it: the client through `web/src/lib/timezone.ts`, the server
through its own small helper, deliberately duplicated so the packages stay independent, with a test that the two agree
across zones west of UTC, in UTC and east of it. Blocks were left alone on purpose: `07:00` in a routine means seven
where the person lives, and converting block times would break every routine the moment its owner travels. The picker
searches by id and by accent-free label, puts Mexico and the United States first, and offers the device's zone in one
click without ever applying it silently, because changing the zone moves the editability boundary.

## Wave 7 — the dock never learned about a new section

The user's words: "no esta routine en el dock donde estan todos los demas, solo puyedo acceder si pongo la ulr /routine".

The cause, found before touching anything: `global-dock.tsx` computes
`canonicalSectionOrder(moduleIds).filter((id) => moduleIds.includes(id))`. `canonicalSectionOrder` deliberately appends
sections registered after the preference was saved, and the `.filter` on the next line discards exactly those. Any
module added after a workspace saved its navigation is therefore invisible in the dock, reachable only by URL — which is
what the user hit the moment Routine shipped.

**S33 — Visibility becomes explicit, so a new section can arrive visible.** The reason the one-line fix is not enough is
that `nav.modules` stores *only the visible ids*: "hidden by the user" and "did not exist when the preference was saved"
are the same absence, and no read-time logic can tell them apart. A rule: the preference's value becomes
`{ order: string[], hidden: string[] }`, where `order` is the canonical order the user arranged and `hidden` lists what
they switched off. A registered section is visible when it is not in `hidden`; order is `order` first and then anything
registered but not yet mentioned, so a section added later appears at the end without an edit. The old array shape is
migrated on read to `{ order: <the array>, hidden: [] }`, and the one-time consequence is stated rather than hidden:
**a section the user had switched off before this change appears once and must be switched off again**. The modules
control keeps working as it does — reorder and toggle — writing both halves, and the dock stops filtering by membership
of a list that cannot express absence.

## Tasks of wave 7

No commits.

- **T27 — The dock learns new sections.** The preference shape, its migration, the control and the dock. Route:
  delegated. Specs: S33.
- **T28 — Gate.** Both suites, both typechecks, build.

**L18 — The dock had never learned about any section added after a workspace saved its navigation.** The defect was two
lines apart: `canonicalSectionOrder` appends newly registered sections on purpose, and the very next `.filter`
(`moduleIds.includes(id)`) discarded them, so Routine was reachable only by URL. The one-line fix was refused on
purpose, because the preference stored only the visible ids: "the user switched this off" and "this did not exist when
the preference was saved" were the same absence, and no read-time logic can separate two identical states. `nav.modules`
now carries `{ order, hidden }`, visibility is explicit rather than membership-based, and a section registered later
appears at the end without an edit. The old array migrates to `{ order: <array>, hidden: [] }`, which means a section
that had been switched off reappears exactly once — stated rather than hidden, because the old shape never recorded the
difference. The dock test proves the new case against a preference that predates the section list, which is the only
version of that test that would have failed before this change.
