# Settings — one contract for preferences, one place to change them

Objective: give chub a settings module: a typed preference registry, one store that splits device and workspace
scope, a `/settings` route outside the notes shell, and the migration of the preference keys already scattered
through the code. Explicitly out of scope: "delete everything" and the Pomodoro/widget work. Conversation stays in
Spanish, artifacts in English. Branch: none. Delivery: no commits — AGENTS.md and repeated user instruction.
Verification: bounded — focused tests per unit, one independent verifier for the stored-data migration and the
retention fallback, then `pnpm typecheck`, both package suites, `pnpm build` and a look at `dist`.

The user's words: *"Espera, mejor trabajemos en un modulo de configuracion que agregarias al modulo de config para
que y porque?"*, then *"borrar todo no lo agrgues, y lo del pomodoro dejalo fuera enfocate en los settings, dale con
todo menos lo mencionado de borrar todo y pomodoro, tu planeas y mandas a los sub agentes a ejecutar, y las
verificaciones acotadas, para el sub agente que se encargue de la ui debes cargarle la skill de ux ui pro maz"*.

## Specs

**S1 — One registry, and it is the only list of settings.** `web/src/features/settings/preferences.ts` exports
`preferences`: entries of `{ key, group, scope: "device" | "workspace", kind: "toggle" | "select" | "modules" |
"options", label, description, default, options? }`, plus `preference(key)` and `defaultOf(key)`. Groups are
`Appearance`, `Navigation`, `Notes`, `Modules`. The delivered keys, each with a live consumer — a setting with no
consumer is not shipped:

| key | scope | kind | default | consumer |
| --- | --- | --- | --- | --- |
| `appearance.theme` | device | select | `system` | theme provider |
| `appearance.density` | device | select | `compact` | `.page-row` height |
| `appearance.motion` | device | select | `system` | document attribute, CSS |
| `nav.dockPinned` | device | toggle | `false` | global dock |
| `nav.modules` | device | modules | every section, canonical order | global dock |
| `notes.recent` | device | toggle | `true` | sidebar recent shelf |
| `modules.retention` | workspace | options | `never` | retention policy |
| `modules.retentionScope` | workspace | select | `completed` | retention policy |
| `modules.readingHabit` | workspace | select | `Reading` | the habit Books records into |

Dropped with reasons, recorded so nobody re-adds them by accident: `modules.weekStart` has no consumer (no view
reads a week start yet), `notes.confirmDelete` would be new UI nobody asked for, `appearance.type`/palette/radius
are the approved visual direction, not preferences, and "delete everything" was excluded by the user.

**S2 — One store, two scopes, and it never throws.** Device-scoped values live in one namespaced key,
`window.localStorage["chub.settings"]`, as a single JSON object (one key convention: `chub.`). Workspace-scoped
values live in SQLite: table `preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
served by `GET /api/preferences` → `{ preferences: Record<string, unknown> }` and
`PUT /api/preferences/:key` with `{ value }` → the stored row, `400 invalid_value` for a non-JSON body and
`404` never used. `usePreference(key)` returns `[value, setValue]`; a write is optimistic, cross-tab through the
`storage` event, and a storage that throws (private window, full quota) keeps the session working in memory
instead of failing the UI. A stored value that fails the entry's validation resolves to the registry default.
Components read and write through the store only; the legacy adoption in S3 is the one place that touches an old
key directly.

**S3 — Legacy keys are adopted once, and nothing is deleted.** When `chub.settings` is absent, the first read
adopts `chub-theme` → `appearance.theme` and `chub.tasks.retention` (`{ days, scope }`) → `modules.retention`, in
that order, and writes the merged object. An adopted value wins over the default; a legacy value that fails
validation falls back to the default. The legacy keys stay in place, so a rollback loses nothing. The tree's own
view state (`chub-notes-expanded`, `chub-notes-collapsed-sections`) is view state, not a setting: it keeps
working exactly as it does today and stays out of the registry and out of the settings page. `retention.ts` keeps
exporting `defaultRetention`, `retentionChoices`, `readRetention`, `writeRetention` and the types, now over the
store, so the tasks dialog keeps working from one source.

**S4 — A `/settings` route of its own.** Top-level route rendered outside `<AppShell />`, like every other
section, reachable from the dock's Home and by URL, English copy, no new dependency, only the existing primitives
(`Button`, `Select`, `Input`, `Menu`, `Card` if it earns its place) and `lucide-react` icons. The page title is
`Settings`; one hairline group per registry group; one row per setting with its label, a one-line description and
the control to the right; a failed workspace fetch degrades the affected rows to the default and never blocks the
page. Direction as pinned: light open ground, hairline separators, compact controls, no oversized boxes.

**S5 — The dock reads one registry and the user's order.** `global-dock.tsx`'s hardcoded `dockItems` is deleted;
`web/src/app/sections.ts` becomes the single registry (today it is dead code: nothing imports it). `nav.modules`
stores the visible section ids in the user's order; `Home` is not orderable and stays in the middle, and hiding a
module hides only its dock entry — its route stays reachable by URL and from the command palette. A section added
to the registry later appends to the end without resetting the order the user chose. `nav.dockPinned` replaces the
hardcoded "peek on every route but Home" behaviour.

**S6 — Existing surfaces read the preference; they do not keep a copy.** The theme provider resolves
`appearance.theme` (`light`, `dark`, `system`) and the header toggle keeps its two-state quick action while
`system` remains selectable from Settings. `page-shortcuts.tsx` reads `notes.recent` from the registry;
`RECENT_LIMIT` and `RECENT_THRESHOLD` stay constants because list length is a layout decision, not a preference.
`books-page.tsx` resolves the habit name from `modules.readingHabit` and never renames an existing habit — it only
changes which name Books looks for. `appearance.density` and `appearance.motion` are exposed as
`data-density` / `data-motion` attributes on `document.documentElement`, with CSS in `shell.css` and `index.css`;
`motion: "reduced"` is a CSS-level reduction only, and that limit is stated in the code comment rather than
pretending it reaches the motion library hooks.

**S7 — Bounded verification.** Every writer runs its focused tests. Before the delivery closes, the parent runs
`pnpm typecheck`, `pnpm --filter @chub/server test`, `pnpm --filter @chub/web test` and `pnpm build`, then checks
`web/dist`: `/settings` must not pull charts, Excalidraw or the dnd-kit stack into the entry chunk. Independent
verifier covers exactly two things: the legacy adoption (S3) and that every retention fallback resolves to
`never` (a corrupt or missing policy must never delete habit entries). No 375/768 visual pass in this delivery.

## Tasks

| ID | Covers | Route | Commit |
| --- | --- | --- | --- |
| T1 | S2 (workspace half) | writer: `server/` preferences table, migration `0019`, repository, routes, tests | none |
| T2 | S1, S2, S3, S5 (registry only) | writer: `web/src/features/settings/` engine, `lib/api.ts`, `app/sections.ts` | none |
| T3 | S4 | writer + `ui-ux-pro-max` skill: `/settings` route and page, modules control | none |
| T4 | S5 | writer: dock wired to the registry and to `nav.modules` / `nav.dockPinned` | none |
| T5 | S6 (appearance) | writer: theme provider three states, density and motion attributes | none |
| T6 | S6 (notes, modules) | writer: recents, retention through the store, Books reading habit | none |
| T7 | S7 | parent + independent verifier | none |

Rounding out of scope for this delivery, named so it is a decision and not an oversight: the Data group. Its one
remaining item after the user excluded "delete everything" is an export-all contract, which needs its own format
decision. It is deferred, not forgotten.

## Log

**L1** — User request, verbatim: *"Espera, mejor trabajemos en un modulo de configuracion que agregarias al modulo
config para que y porque?"*

**L2** — Parent correction after T2. The retention policy has two dimensions, and S1's day-only row silently
narrowed what the tasks dialog already lets the user choose: T2 mapped the legacy `{ days, scope }` to the window
and dropped the scope. `modules.retentionScope` (`completed` | `all`, workspace, default `completed`) was added and
the legacy adoption now carries both fields; a corrupt window still keeps the user's wider scope. Reason recorded
so nobody folds it back into one key: the tasks dialog exposes the scope, and a preference that cannot represent an
existing capability is a regression, not a simplification. The registry therefore ships nine keys, not eight.

**L3** — Independent verifier, three claims. *Holds*: Books no longer writes a habit on a guessed name — the effect
awaits `whenWorkspacePreferencesLoaded()` and reads the store afterwards, and the single `createHabit` path is gated
by `mayCreate`. *Partially holds*: adoption is lossless for valid input, but a corrupt `chub.settings` object skipped
adoption entirely. *Broken*: adopted workspace values were mirrored in memory only and never uploaded, so the first
reload — with `chub.settings` present and adoption therefore skipped — read `modules.retention` back as `never`. A
preference reset, in the safe direction, but still the user's choice silently lost.

Fixed in the store: a corrupt namespaced object is treated as absent so adoption still runs; workspace reads fall
back to the device object as an offline mirror; and on the first successful fetch, a workspace key the server does
not have is uploaded once. The finite-window path was re-checked by the parent and is not a regression: a finite
window can only reach `pruneChecklists` from a value the user actually chose, and the mount-time cleanup refuses
`days: null` by construction.

**L4** — Bounded verification observed. `pnpm typecheck` clean for both packages; server 17 files / 174 tests; web
49 files / 375 tests; `pnpm build` clean. `web/dist`: 22 JS chunks, 1.90 MB total, entry 1.61 MB (≈530 kB gzip) with
no Excalidraw, dnd-kit, Shiki or Mermaid in it; the `settings` route is the one deliberate static route. `AGENTS.md`'s
bundling paragraph was updated to the measured numbers because the old ones were stale.
