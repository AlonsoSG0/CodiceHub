# AGENTS.md

Instructions for agents working in this repository. The goal is that new work **reuses what is already here**
instead of rebuilding it. Read this before writing code, and read `README.md` for prerequisites, ports, Docker and
environment variables — this file does not repeat them.

## What this project is

`chub` is a personal, Notion-like workspace. It is a pnpm workspace with three packages:

- `web/` (`@chub/web`) — React 19, React Router 7, Vite 6, Tailwind CSS 4, shadcn/ui on the `base-nova` style
  (**Base UI**, not Radix), Tiptap 3 editor, Vitest 3 + Testing Library + jsdom.
- `server/` (`@chub/server`) — Hono 4 on Node, SQLite through better-sqlite3, Drizzle ORM, Vitest.
- `cli/` (`@chub/cli`) — the `chub` binary: one Bun build that embeds the API, the web app and the migrations and
  serves them from the user's own data directory. Also the subcommand CLI (`chub search`, `chub todo`, `chub habits`).

Planned product areas, none of them built yet except the notes editor: notes, habits, books, tasks/Kanban, and a
customizable home with widgets. The UI foundation for those areas already exists — see the inventory below.

## Commands

Root (runs across both packages):

```sh
pnpm dev          # web on :1574, API on :3000; Vite proxies /api and /uploads
pnpm build        # server tsc + web vite build
pnpm test
pnpm typecheck
```

One package, or one test file:

```sh
pnpm --filter @chub/web build
pnpm --filter @chub/server test
cd web && pnpm vitest run src/components/ui-kit/ui-kit.test.tsx
```

## The CLI

`cli/` is how the app is actually used; `pnpm dev` is how it is developed. The binary is the product: it carries the
API, the web build and the migrations, and it answers subcommands against the same data home.

```sh
pnpm --filter @chub/cli build:binary   # web build + asset archive + compile → cli/dist/chub
pnpm --filter @chub/cli test           # builds, then runs the suite against the compiled binary
pnpm --filter @chub/cli typecheck
```

- `cli/src/index.ts` is a dispatcher: a `commands: Command[]` registry plus `serve()`. A new command is a new file in
  `cli/src/commands/` exporting `{ name, lines, run }`, plus one line in the registry.
- `cli/src/server-state.ts` is the lifecycle seam: it records `server.json` (pid, url, version, started at), probes
  `GET /api/server` before signalling any pid, and owns the log path. `chub status|start|stop|restart` live in
  `cli/src/commands/server.ts`, and `start` spawns this binary detached with its stdio on `logs/server.log` — that
  detachment is what frees the terminal, so it is not a detail to rearrange. `chub update` lives in `cli/src/update.ts`,
  replaces the installed binary and never restarts it.
- `cli/src/ops.ts` is the **only** data seam. Commands call the Hono app in process — `call`, `callText` — never SQL,
  never a repository, never a socket, so a command works whether or not `chub` is running. Do not bypass it.
- `cli/src/resolve.ts` holds the hybrid addressing rule: an id-shaped argument is an id, anything else is a title,
  matched exactly and then by unique substring; ambiguity is an error listing the candidates, never a guess.
- `cli/src/command.ts` holds the shared option parsing and helpers. Do not copy that logic into a module.
- The binary writes to `CHUB_HOME` (`~/.local/share/chub` by default), never inside the repository.
- Bun is required for `cli/` only. Root `pnpm build`, `pnpm test` and `pnpm dev` stay on Node, which is what
  better-sqlite3 and Vitest expect.
- Every test spawns `cli/dist/chub`, so the build has to run first — which is why `test` builds before testing.
  `cli/test/helpers.ts` pins `CHUB_HOME` to a temporary directory, so a test can never touch real data.

## Reuse first — the component inventory

**Search `web/src/components/` and `web/src/features/` before creating anything.** Everything below is installed,
tested and available; do not re-implement a primitive that already exists.

| Where | Exports | Use it for |
| --- | --- | --- |
| `web/src/components/ui/` | `Button`, `Select*`, `MenuPopup`, `menuPopupClassName`, `menuItemClassName`, `Card`, `ScrollArea`, `ScrollBar`, `Input`, `Textarea` | Base UI primitives already styled for this app; menus go through this wrapper |
| `web/src/components/ui-kit/` | `DataTable`, `DataTableColumn`, `MiniChart`, `SortableList`, `BoardCanvas` | The four npm projects: TanStack Table v9, TanStack Charts v1, dnd-kit React, Excalidraw |
| `web/src/components/magicui/` | `BlurFade`, `NumberTicker`, `Marquee`, `DotPattern` | Entrance animation, animated numbers, scrolling lists, background patterns |
| `web/src/components/motion-primitives/` | `ProgressiveBlur`, `InView`, `AnimatedNumber` | Blur overlays, viewport-triggered reveals, spring-animated numbers |
| `web/src/components/kibo-ui/` | `CodeBlock`, `CodeBlockHeader`, `CodeBlockFiles`, `CodeBlockFilename`, `CodeBlockSelect*`, `CodeBlockCopyButton`, `CodeBlockBody`, `CodeBlockItem`, `CodeBlockContent` | Code display with Shiki highlighting; the lab shows the shape (`data` + `defaultValue`) |
| `web/src/components/kibo-ui/mini-calendar/` | `MiniCalendar`, `MiniCalendarDay`, `MiniCalendarDays`, `MiniCalendarNavigation`, `useMiniCalendar` | A short strip of days; the books section picks its reading day with it |
| `web/src/components/kibo-ui/kanban/` | `KanbanProvider`, `KanbanBoard`, `KanbanCards`, `KanbanCard`, `KanbanHeader` | A drag-and-drop board; the projects section is built on it |
| `web/src/components/kibo-ui/calendar/` | `CalendarProvider`, `CalendarHeader`, `CalendarBody`, `CalendarItem`, `CalendarDate*`, `CalendarMonthPicker`, `CalendarYearPicker` | A month grid of dated items; the projects calendar is built on it |
| `web/src/components/amicro/` | `FadeIn`, `TiltCard`, `presets` | Micro-interactions and hover cards |
| `web/src/components/mdxcn/` | `Callout` | Callouts inside rendered MDX documents |
| `web/src/mdx/` | `mdxComponents` | The provider map every `.mdx` document resolves components from |
| `web/src/components/editor/` | the Tiptap editor and its block extensions | Notes content; the vendored `block-editor` comes from the editorcn registry |

`web/src/features/ui-lab/ui-lab-page.tsx` renders one example of each project; it is the fastest way to see how a
component is meant to be wired. It is a development-only route.

## Decisions already made — do not re-litigate them

- **Primitives**: Base UI through the shadcn `base-nova` style. Never add Radix. If a vendored registry item needs a
  Radix primitive, port it to the local Base UI convention instead (see `kibo-ui/use-controllable-state.ts`).
- **Icons**: `lucide-react` only.
- **Animation**: the `motion` package only. `motion`'s root entry is the DOM API and exports no `motion` binding; the
  React API is `motion/react`. `framer-motion` is a direct dependency because Amicro's vendored sources import that
  specifier and `motion` hard-depends on it at the same version, so both resolve to one implementation —
  `web/src/components/amicro/amicro.test.tsx` asserts that identity.
- **Styling**: Tailwind 4 utilities plus the CSS variables in `web/src/styles/tokens.css`; merge classes with `cn`
  from `@/lib/utils`. The `@/` alias maps to `web/src/`.
- **Excalidraw**: reachable only through the `React.lazy` boundary in `ui-kit/board-canvas.tsx`. Never import it
  statically, and keep its stylesheet import inside the lazy callback, or it lands in the entry chunk and in the
  production CSS. Keep the `/* @__PURE__ */` annotation on that boundary.
- **MDX**: compiles at build time and is for rendered documents (docs, changelogs, READMEs). It is never the storage
  format of a note; notes are Tiptap documents in SQLite.
- **New dependencies**: check the licence before adding one — this UI stack is all MIT, and
  `web/src/dependency-licences.test.ts` asserts that for the packages the stack added. Add a deliberate update to
  that test if you introduce something with a different licence.

## Adding a component from a registry

The namespaces are registered in `web/components.json` (`@editorcn`, `@magicui`, `@motion-primitives`, `@kibo-ui`,
`@mdxcn`, `@amicro`), with these endpoints:

| Namespace | Endpoint |
| --- | --- |
| `@magicui` | `https://magicui.design/r/{name}.json` |
| `@motion-primitives` | `https://motion-primitives.com/c/{name}.json` (note `/c/`, not `/r/`) |
| `@kibo-ui` | `https://www.kibo-ui.com/r/{name}.json` |
| `@mdxcn` | `https://mdxcn.dev/r/{name}.json` |
| `@amicro` | `https://amicro.vercel.app/r/{name}.json` |
| `@editorcn` | `https://editorcn.vercel.app/r/{name}.json` |

Two hostname quirks are deliberate: `https://amicro.dev/` sits behind a Vercel bot checkpoint that answers `429` to
non-browser clients while `amicro.vercel.app` serves the registry, and MDXCN answers on both `mdxcn.dev` and
`www.mdxcn.dev`.

**The vendoring method**: fetch the item's JSON and write its `files[].content` to the target path yourself. Do
**not** run `shadcn add` for a new component — it rewrites `web/package.json` and will fight the lockfile. Declare
the dependency deliberately instead.

Rules for vendored code:

- Keep the upstream source byte-identical except for documented substitutions, and write the substitution down.
- Know the traps per registry: Magic UI declares the Next-only `next-themes` in some items (never vendor those);
  every MDXCN item drags its shared `graph-frame` trio; Kibo UI's `code-block` declares a Radix state hook and
  `react-icons`; Amicro declares `framer-motion`.
- After vendoring: a focused test, `pnpm typecheck`, and — if it touches the initial module graph — a `pnpm build`
  and a look at `web/dist`.

## Testing rules this repository learned the hard way

- **A focused run is not a green light, and neither is a green file.** When you are the only writer working, run the
  whole `pnpm test` for the package you touched before handing work back. This repository has already shipped a change
  whose focused runs were green while thirteen tests in two other files failed, because those tests mount the app shell
  and the change had moved a route out of it.
- **Vitest does not typecheck.** A green focused run says nothing about types. Run `pnpm typecheck` before calling
  work done.
- **A green suite says nothing about the bundle.** When your change touches an import graph, build and inspect
  `web/dist`.
- jest-dom matchers are registered globally in `web/src/test-setup.ts` (wired through `test.setupFiles`), so
  `toBeInTheDocument` and `toBeVisible` work in every file.
- jsdom is missing `ResizeObserver`, `IntersectionObserver`, `matchMedia` and real `requestAnimationFrame`. Existing
  tests show the local shim pattern; follow it instead of inventing another.
- Server migrations are hand-written SQL files under `server/drizzle/` plus an entry in
  `server/drizzle/meta/_journal.json`; `server/src/db/client.ts` applies them at startup and
  `server/test/migrations.test.ts` is the safety net.

## Bundling discipline

The production build is **22 JavaScript chunks, about 1.90 MB total**, of which the entry `index-*.js` is
about 1.61 MB (≈530 kB gzip) and holds Tiptap and the vendored block editor. Every other chunk is a route
that loads on demand. Two rules keep the entry where it is:

- Anything heavy loads through `React.lazy` (Excalidraw, and the dev-only lab), and every section route —
  habits, books, the notebook, the projects section and the board of one project — is one of those routes.
  The `settings` route is the one deliberate exception: it is small and renders from the preference registry, so
  it stays static in the entry rather than paying a chunk for itself.
- The development-only lab route must stay behind a dynamic import with `/* @__PURE__ */`. A static import of it
  emits roughly 7.6 MB of unreachable Excalidraw and Mermaid chunks into `dist/` — that was measured, not guessed.

A section that pulls in a drag-and-drop stack or a date library has to keep it behind its own route. The projects
board is the reason `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` and `tunnel-rat` cost 81 kB in a
chunk of their own and nothing in the entry.

## Where things live

- `web/src/features/<domain>/` — product surfaces (today: `editor`, `pages`, `search`, `trash`, `projects`, `ui-lab`).
- `web/src/components/**` — reusable pieces. `web/src/app/` — routing and providers. `web/src/lib/api.ts` — the API
  client.
- `server/src/routes/**` — Hono routes. `server/src/pages/**` — the page repository. `server/src/db/**` — schema and
  migrations. Also `search/`, `export/`, `uploads/`, `static/`.
- `cli/src/commands/**` — one file per product module; `cli/src/{ops,command,resolve,context,server-state}.ts` — the data
  seam, the helpers, the addressing rule, the data home and the server state. `cli/test/**` — the suite, run with
  `bun test` from `cli/`.
- `odd/tasks/<feature>.md` — the feature document for any large piece of work. Read the existing one before
  continuing a feature, and stop before its `## Log` section, which is evidence rather than spec.

## Working agreements

- **Nothing is committed unless the user explicitly asks.** The working tree carries several uncommitted waves by
  design.
- Code, tests, comments and documentation are written in English. Conversation with the user is in Spanish.
- For large work, follow Organic Driven Development: a feature document in `odd/tasks/`, a visible task list,
  work-unit commits only if the user asks for them, and independent verification for high-risk changes.
- **Tests are minimal.** The user reviews front-end behaviour themselves and will ask for a review only if
  something fails. Write only the tests needed to prove a behaviour or catch a regression; do not add exhaustive
  UI/E2E coverage, visual snapshots, or redundant cases. Prefer fewer, focused assertions over breadth.
- **Prioritise good code over test volume.** Invest the saved effort in clear naming, simple control flow,
  reuse of existing primitives (see the inventory), small cohesive modules, and correct typing. A small, readable
  change with one or two focused tests beats a large test suite on top of tangled code.

## Traps that already cost time here

- A block comment that contains the glob `**/*.mdx` closes itself at `*/` and makes `tsc` fail with a cascade of
  nonsense errors. Use line comments when documenting globs.
- TanStack Table v9 is not v8: `useTable` plus an explicit feature set. `getVisibleCells()` needs
  `columnVisibilityFeature`; `coreFeatures` alone does not provide it. The `/legacy` entry exists for migration
  only — new code targets the native API.
- `motion` root ≠ `motion/react`. An ambient `declare module "framer-motion"` is harmful: `motion/react`'s own types
  re-export `framer-motion`, so the declaration makes it re-export itself and every export disappears.
- `pnpm install` prints "Agent skills awaiting approval" for the TanStack packages. It does not block anything.
