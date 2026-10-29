# UI kit foundations: nine MIT projects wired into `web/`

Status: in progress. Feature document for the dependency and component infrastructure for the nine UI/UX projects
requested for CHUB's frontend. Subagents read this file in order and stop before `## Log`.

## Specs

**S1 — Nine additional MIT projects are incorporated into the frontend.** The user's words: "Quiero preparar el
frontend de CHUB para incorporar nueve proyectos adicionales de UI/UX, todos open source con licencia MIT." A rule: each
of the nine is reachable from code in `web/`, and each one's licence is MIT, verified before it is added.

**S2 — The nine, exactly as named.** The user's words, verbatim, with the URL given for each:
"TanStack Table — https://tanstack.com/table/latest", "TanStack Charts — https://tanstack.com/charts/latest",
"dnd kit React — https://dndkit.com/react/quickstart/", "Magic UI — https://magicui.design/docs",
"Motion Primitives — https://motion-primitives.com/docs/progressive-blur",
"Excalidraw — https://github.com/excalidraw/excalidraw", "Kibo UI — https://www.kibo-ui.com/components/code-block",
"Amicro — https://amicro.dev/", "MDXCN — https://www.mdxcn.dev/". A rule: no tenth project is added, and no named
project is silently swapped for a different one.

**S3 — "Preparar" means dependencies plus component infrastructure.** The user's words: "Preparar las dependencias y la
infraestructura de componentes". A rule: the four npm projects are declared in `web/package.json`; the five registry
projects are registered as namespaces in `web/components.json` and vendored under `web/src/components/<registry>/`;
and a wrapper for each project lives under `web/src/components/ui-kit/` behind one import surface.

**S4 — The purpose is later use in five domains.** The user's words: "para utilizarlos posteriormente en notas,
hábitos, libros, tareas/Kanban y una home personalizable con widgets". A rule: nothing of those five domains is built
now; the lab proves each project in a shape that domain can consume, and each wrapper takes its data through props so a
future feature supplies it.

**S5 — The agreed scope is the smoke-proof middle option.** The user's choice: "Deps + registro + humo verificable". A
rule: a route at `/ui-lab` renders one vendored or wrapped piece per project, and one test per project renders it, so
"prepared" is observed rather than asserted.

**S6 — MDX pipeline now.** The user's choice: "Sí, instalar el pipeline MDX ahora". A rule: `vite.config.ts` compiles
`**/*.mdx` with `@mdx-js/rollup` and `providerImportSource: "@mdx-js/react"`, with the components map in
`web/src/mdx/mdx-components.tsx`; `.mdx` is a rendered-content format, never the storage of a note.

**S7 — Excalidraw loads lazily, always.** The user's choice: "Instalar ahora, lazy obligatorio". A rule: no static
import of `@excalidraw/excalidraw` exists anywhere in `web/src`; it is reachable only through `React.lazy` inside the
wrapper, and `web/src/vite-config.test.ts`-style assertions plus a production build must show it outside the entry
chunk.

**S8 — Kibo UI without Radix and without `react-icons`.** The user's choice: "Solo ítems sin Radix". A rule: no
`radix-ui` or `@radix-ui/*` package is added to `web/package.json`; the vendored Kibo item resolves its primitives
dependency with a local hook following the repository's Base UI convention; and its upstream `react-icons` imports —
both the type-only one and the runtime `react-icons/si` filename icons — are replaced locally, with `lucide-react`
(the project's icon library) supplying the default filename icon and the caller's optional `icon` prop still winning
over it. The vendored source contains no `react-icons` import and no new package is installed for it. The local hook
keeps Radix's controlled/uncontrolled semantics — a defined `prop` wins, and an undefined one falls back to the hook's
own state — with two documented deviations: an uncontrolled change is reported synchronously inside the setter instead
of from a post-commit effect, and the setter's identity is not stable across value changes.

**S9 — One animation runtime, by construction.** This one is the feature's own rule, not a quote of the user: exactly
one copy of the animation core is in the tree, and keeping it that way needs no alias and no shim. `motion/react` is a
literal re-export of `framer-motion` (its module is `import * as fm from 'framer-motion'` followed by
`export * from 'framer-motion'`), and `motion` declares `framer-motion` as a hard dependency at the same version, so
both specifiers reach one implementation. `framer-motion` is declared directly in `web/package.json` because the
vendored Amicro sources import that specifier, and one executed assertion pins that importing `motion` from either
specifier yields the same module value.

**S10 — The new surface never breaks the existing one.** A rule: the previous suite keeps passing unchanged, the lab
is the only new route, it is reachable only while `import.meta.env.DEV` is true, and neither the lab's code nor the
Excalidraw boundary it renders appears in a production build: the lab is reached through a dynamic import and the
Excalidraw chunk and its stylesheet load inside the lazy boundary, so a production build emits no Excalidraw or Mermaid
chunk and no Excalidraw stylesheet.

## Tasks

- **T1** — Declare the npm dependencies, register the five registry namespaces, add the MDX plugin, and pin the
  `vite.config.ts` assertions. — S1, S3, S6, S8, S9 — parent — `web/package.json`, `pnpm-lock.yaml`,
  `web/components.json`, `web/vite.config.ts`, `web/src/vite-config.test.ts`, `web/src/mdx-modules.d.ts`,
  `web/src/test-setup.ts`, `web/src/components/ui/select.tsx` — no commit
- **T2** — Wrappers for the four npm libraries: `data-table.tsx`, `mini-chart.tsx`, `sortable-list.tsx`,
  `board-canvas.tsx`, with the lazy Excalidraw boundary. The table targets TanStack Table v9's native `useTable` plus an
  explicit feature set, never the package's `legacy` compatibility entry. — S1, S2, S3, S4, S7 — worker (2 runs) +
  parent follow-up — `web/src/components/ui-kit/**` — no commit
- **T3** — Vendor the Magic UI items and their tests. — S1, S2, S3 — worker —
  `web/src/components/magicui/**` — no commit
- **T4** — Vendor the Motion Primitives items and their tests. — S1, S2, S3 — worker —
  `web/src/components/motion-primitives/**` — no commit
- **T5** — Vendor the Kibo UI code block with the local controllable-state hook, no Radix. — S1, S2, S3, S8 —
  worker — `web/src/components/kibo-ui/**` — no commit
- **T6** — Vendor the Amicro pieces, resolving `framer-motion` to `motion`. — S1, S2, S3, S9 — worker —
  `web/src/components/amicro/**` — no commit
- **T7** — Vendor the MDXCN item with its shared core, plus the MDX components map and an `.mdx` fixture. — S1, S2, S3,
  S6 — worker — `web/src/components/mdxcn/**`, `web/src/mdx/**` — no commit
- **T8** — The `/ui-lab` route and its test, wiring one piece per project. — S3, S4, S5, S10 — parent —
  `web/src/features/ui-lab/**`, `web/src/App.tsx` — no commit
- **T9** — Verification: full suite, typecheck, production build chunk check, and a real-browser pass on `/ui-lab`.
  — S1-S10 — parent — none — no commit
- **T10** — Independent verification of S1-S10. — S1-S10 — verify — none — no commit
- **T11** — Close what T10 surfaced: `BoardCanvas` takes its data through props, the Kibo hook's contract is documented
  and pinned by tests, and the MIT licence premise is asserted by a test. — S1, S4, S8 — worker (1 run) —
  `web/src/components/ui-kit/**`, `web/src/components/kibo-ui/**`, `web/src/dependency-licences.test.ts` — no commit

## Log

- **L1** (user, verbatim): "Quiero preparar el frontend de CHUB para incorporar nueve proyectos adicionales de UI/UX,
  todos open source con licencia MIT." followed by the current stack ("Frontend: React 19, React Router 7, Vite 6.",
  "UI: Tailwind CSS 4, shadcn/ui 4, Base UI, Lucide React y CVA.", "Editor: Tiptap 3 ...", "Tests: Vitest 3, Testing
  Library y jsdom.", "Backend: Hono 4, SQLite, better-sqlite3 y Drizzle ORM.", "Gestor de paquetes: pnpm.",
  "Directorio frontend: web/ (@chub/web)."), the nine projects with their URLs, and the objective: "Preparar las
  dependencias y la infraestructura de componentes para utilizarlos posteriormente en notas, hábitos, libros,
  tareas/Kanban y una home personalizable con widgets."
- **L2** (user's choices, verbatim answers to the four scope questions): scope "Deps + registro + humo verificable
  (recomendado)"; MDX pipeline "Sí, instalar el pipeline MDX ahora (recomendado)"; Excalidraw "Instalar ahora, lazy
  obligatorio (recomendado)"; Kibo/Radix "Solo ítems sin Radix (recomendado)".
- **L3** (evidence, verified before designing, licences from the npm registry and the repository READMEs): every one of
  the nine is MIT — `@tanstack/react-table@9.3.1` (peer react >=18), `@tanstack/charts@1.1.0` (peer react ^18 || ^19),
  `@dnd-kit/react@0.5.1` (peer react ^18 || ^19, `/sortable` subpath exists), `@excalidraw/excalidraw@0.18.1` (peer
  react ^19), Magic UI, Motion Primitives, Kibo UI, MDXCN and Amicro (the last one also confirmed as a shadcn trusted
  registry in shadcn-ui/ui commit 5202b52).
- **L4** (evidence, registry transport): all five registries answer with a valid `registry.json` — Magic UI 250 items,
  Motion Primitives 33, Kibo UI 41, MDXCN 51, Amicro 176 — and every item inspected carries `files[].content`, so the
  vendoring is done by fetching the item JSON and writing its files, never by letting `shadcn add` mutate
  `web/package.json` concurrently.
- **L5** (evidence, per-project traps found before choosing items): Magic UI declares `next-themes` (Next-only) in 8
  items, so only items without it are vendored; Kibo UI's `code-block` declares `@radix-ui/react-use-controllable-state`
  (a state hook, not a primitive) plus a type-only `react-icons` import, both replaced locally to honour S8; Amicro
  declares `framer-motion`, resolved to `motion` by a pnpm alias per S9; MDXCN pulls its shared `graph-frame` trio
  (about 35 KB) into every item, accepted once for the single vendored item.
- **L6** (evidence, repository conventions): `web/components.json` already uses this exact mechanism for `@editorcn`, so
  the five new namespaces are additive; the active shadcn style is `base-nova`, whose `button.tsx` is built on
  `@base-ui/react`, which is what makes the local-hook substitution in S8 consistent; `web/src/vite-config.test.ts`
  already asserts on the parsed Vite config, which is the precedent the Excalidraw and MDX assertions reuse.
- **L7** (decision, commit policy): the working tree already carries the previous waves uncommitted and the user's
  standing instruction is that nothing is committed unless he asks, so no branch and no commit is created by this
  feature; the pending commit decision stays with the user.
- **L8** (evidence, correction of my own research): T5's writer found that Kibo UI's `code-block` imports
  `react-icons/si` at runtime for its filename icons, not just the `IconType` type — my earlier grep over that item only
  matched the type import, so the brief was wrong. Amended S8 to name both substitutions, and the parent chose the
  lucide fallback (option 1 of the writer's three) because `react-icons` would enter the app for decoration only while
  `lucide-react` is already the project's icon library.
- **L9** (evidence, my own design defect, found by a writer that refused to paper over it): S9 originally aliased the
  **package** `framer-motion` to `motion` through pnpm. That is wrong: `motion`'s root entry is the DOM API and exports
  no `motion` binding (`typeof (await import("motion")).motion === "undefined"`), while `motion/react` exports
  `motion`, `useMotionValue`, `useSpring` and `AnimatePresence`. T6 measured exactly that and correctly reported the
  counter-example instead of editing the vendored sources. Fixed by removing the aliased package entirely, alias the
  **specifier** in Vite to `motion/react`, and re-export its types from `web/src/framer-motion.d.ts`; the vendored
  Amicro sources stay byte-identical to upstream and the identity assertion now passes.
- **L10** (evidence, pre-existing infrastructure gap found while closing T6): `web/tsconfig.json` lists
  `@testing-library/jest-dom` in `types`, so the type system has always promised matchers such as `toBeInTheDocument`
  and `toBeVisible`, but no test file and no Vitest setup ever registered them at runtime — any test that reached for
  them failed with "Invalid Chai property". Closed in the root rather than in one test: `web/src/test-setup.ts` imports
  `@testing-library/jest-dom/vitest` and `vite.config.ts` registers it through `test.setupFiles`, which
  `web/src/vite-config.test.ts` asserts. Verified against 16 tests across the five files written so far, with no
  regression in the suites that already passed.
- **L11** (evidence, my second design defect on S9, caught only by the project-wide typecheck): the L9 fix was itself
  wrong. Removing the `framer-motion` package and adding an ambient `declare module "framer-motion"` created a circular
  type resolution — `motion`'s own `dist/react.d.ts` is `import * as fm from 'framer-motion'; export * from
  'framer-motion'`, so my declaration made `motion/react` re-export itself and `tsc` reported `TS2305: Module
  '"motion/react"' has no exported member ...` for every single export (`Variants`, `HTMLMotionProps`, `useInView`,
  `useSpring`, `useTransform`, `SpringOptions`). Every focused Vitest run stayed green throughout, because Vitest does
  not typecheck: the writers' RED/GREEN evidence could not see this and only the parent's project-wide gate did.
  Resolution: `motion@14.3.0` declares `framer-motion@14.3.0` as a hard dependency and `motion/react` is a literal
  re-export of it, so one runtime was never in danger; the ambient declaration and the Vite alias were both deleted,
  `framer-motion` is declared directly because the vendored Amicro sources import that specifier, and S9 now states the
  real mechanism. Verified: `pnpm typecheck` exits 0 and 25 tests pass across the seven files.
- **L12** (evidence, T2 audit): the T2 retry delivered working wrappers but built the table on
  `@tanstack/react-table/legacy` (`useLegacyTable`). The parent rejected that for new code — these wrappers are what the
  notes, habits, books and task-board features will build on — and migrated `data-table.tsx` to the native v9 API:
  `useTable({ features, columns, data })` with `coreFeatures` plus `columnVisibilityFeature`, because v9 makes
  `getVisibleCells()` a feature and it is absent from the core row. The feature set stays internal behind an exported
  `DataTableColumn<TData>` alias, so consumers never restate it, and the test proves the wrapper renders through
  `table.FlexRender`.
- **L13** (evidence, a real bundle defect found by the parent's build gate, not by any test): T8's lab was registered
  with a static `import { UiLabPage }` inside a `import.meta.env.DEV` gate. The gate removed the route in production,
  and the lab's JSX strings were tree-shaken, but the module graph was still retained, so `board-canvas`'s module-level
  `lazy(() => import("@excalidraw/excalidraw"))` and its module-level stylesheet import survived. The measured effect:
  a production `dist/` of **9,114,974 bytes of JavaScript across 74 chunks**, including Excalidraw's core in a 1.12 MB
  `percentages-*.js`, every Mermaid diagram chunk (Mermaid appears nowhere in `web/src`; it arrives through
  `@excalidraw/mermaid-to-excalidraw`) and Excalidraw's styles inside the production CSS. Fixed by reaching the lab
  through a `/* @__PURE__ */ lazy(() => import(...))` boundary and by moving both the Excalidraw package import and its
  stylesheet import inside `board-canvas`'s lazy callback, so the whole subtree is droppable when nothing renders a
  board. Re-measured after the fix: **1,465,765 bytes across 2 chunks**, with `ExcalidrawApp`, `mermaid` and the
  Excalidraw stylesheet absent from every asset. The entry chunk is unchanged in size, which shows the lab's component
  sets were never the cost — the 7.6 MB of unreachable dynamic chunks were. Recorded in S10 as a rule so a future
  static import of the lab cannot reintroduce it.
- **L14** (outcome, T10 independent verification and the parent's triage of it): the verifier returned per-spec
  verdicts — S5 and S9 satisfied; S3, S4, S6 and S8 "not satisfied"; S1, S2, S7 and S10 "unverifiable" — after running
  25 tests across five files and `tsc --noEmit` (both green), while respecting the no-write, no-install and no-build
  constraints it was given. Triage of its four defects:
  1. **S8 refuted, with two real deviations found instead.** Its claim was that the local
     `use-controllable-state.ts` deviates from Radix by keeping its initial state when a controlled `prop` later
     becomes `undefined`. The parent compared it against the real Radix implementation, which is present in the tree as
     a transitive dependency at `node_modules/.pnpm/@radix-ui+react-use-controllable-state@1.1.0_*/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs`,
     and that file computes `value = isControlled ? prop : uncontrolledProp` from `useState(defaultProp)` — the same
     behaviour. The comparison did surface two genuine deviations, both accepted and now documented in the hook and
     pinned by tests: an uncontrolled change is reported synchronously inside the setter rather than from a post-commit
     effect, and the setter's identity is not stable. A verifier's "not satisfied" is a claim to check, not a verdict
     to implement on faith.
  2. **S4 gap accepted and fixed.** `BoardCanvas` accepted only `fallback` and rendered with no data, leaving a future
     feature no way to supply or receive board content; it now takes `initialData` and `onChange`, typed from the
     package's own types and imported with `import type` so no runtime import escapes the lazy boundary (T11).
  3. **S6 objection answered with evidence, not with a change.** The verifier said the MDX test can pass even if the
     lab's setup is wrong because it supplies the map itself. `web/src/mdx/mdx.test.tsx` imports the **shared** map from
     `web/src/mdx/mdx-components.tsx`, and `web/src/mdx/fixture.mdx` has no local import, so dropping `Callout` from the
     map makes MDX unable to resolve the tag and the test fails. The lab's separately, locally imported `Callout` is a
     second direct example, not the mechanism S6 tests.
  4. **S3 answered with the parent's own evidence.** All five endpoints were fetched and counted before any item was
     vendored (L4). The two hostnames that differ from the URLs the user pasted are deliberate and verified:
     `https://amicro.dev/` sits behind a Vercel bot checkpoint that answers 429 to non-browser clients while
     `https://amicro.vercel.app/r/{name}.json` serves the registry (and is the endpoint shadcn trusts), and MDXCN
     answers on both `mdxcn.dev` and `www.mdxcn.dev`, with the non-www form registered.
  5. **S1 moved from a Log claim to an executed check.** `web/src/dependency-licences.test.ts` asserts that the six
     packages this feature added resolve to an installed package whose `license` is MIT. The five registry projects
     have no installed package to read, so their MIT evidence remains the upstream repositories recorded in L3 and
     cannot be machine-checked offline; the verifier was right that the Log is not evidence of licensing, which is why
     it is now a test for the half that can be one.
  The remaining "unverifiable" verdicts (S2, S7, S10) are honest scope limits, not defects: that verifier cannot fetch
  remote registries, cannot run a production build because it writes `dist/`, and correctly declined to attribute the
  repository's large pre-existing uncommitted working tree to this feature.
- **L15** (closure): T11 closed the three follow-ups and the gates were re-run after its last edit, because
  `board-canvas.tsx` changed again. Final state of this feature: server 90/90 tests, web 197/197 across 25 files,
  `pnpm typecheck` exits 0 in both packages, and the production build is unchanged at **1,465,765 bytes of JavaScript in
  2 chunks** with the same entry hash, zero chunks containing `ExcalidrawApp`, zero containing `mermaid`, and no
  Excalidraw styles in the CSS. The S4 gap is closed by `BoardCanvas` taking `initialData`/`onChange` through props typed
  with a type-only import (so nothing runtime escapes the lazy boundary, and the static-import guard now distinguishes a
  type-only import from a runtime one), the Kibo hook's Radix semantics and its two deviations are documented and pinned
  by four tests, and `web/src/dependency-licences.test.ts` asserts MIT for the six installed packages the feature added.
  What remains unverified on purpose, rather than by omission: real pointer dragging in the sortable list (the
  accessible keyboard path is what is tested and was seen in the browser), Kibo's syntax-highlighting path, drawing
  interaction inside Excalidraw, and the internals of MDXCN's shared `graph-frame` beyond the callout. Nothing is
  committed — the whole feature, like the waves before it, lives in the working tree at the user's decision.
