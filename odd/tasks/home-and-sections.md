# Home as control center, and sections as separate surfaces

Status: in progress. Feature document for the Home wave: the workspace gets a Home that is the entry point to every
section, the notes module moves to its own route, and the section list becomes one source of truth. Subagents read
this file in order and stop before `## Log`.

## Specs

**S1 — Two routes: the Home and the notes module.** The user's words: "direcciones / -> home, /notes -> notas (modulo
tipo notion)". A rule: `/` renders the Home, `/notes` renders the notes module, and a page inside notes lives at
`/notes/:id`.

**S2 — The Home is the chosen prototype, variant A.** The user's choice: "A — Reloj + dock". A rule: the Home is a
clock-centred surface with a dock of section entries, and the dock uses the real registry primitive with hover
magnification — Magic UI's `Dock` vendored from its registry — not the prototype's scale-and-elevation approximation.

**S3 — Every functionality is its own section.** The user's words: "quiero separar cada funcionalidad/seccion asi poder
tener todo mas limpio". A rule: the dock's entries come from a single sections array (id, label, href, icon, shortcut),
so adding habits, books or tasks later is one entry in that array and never a new hardcoded link in several places.

**S4 — MDXCN carries the Home's static prose, never its machinery.** The user proposed leaning on MDXCN heavily; this
is the feature's own rule after review: MDXCN is a document registry whose components are authored in `.mdx` and
compiled at build time, so it renders the Home's static welcome block only. The clock and the dock are React
components, and no `.mdx` file is authored for the Home.

**S5 — The page URL contract keeps working.** Evidence gathered before designing: `/p/:id` is referenced in six places
(`app-shell.tsx:62,93,107`, `breadcrumbs.tsx:25`, `page-tree.tsx:26,259,294`, `command-palette.tsx:149`) and
`page-tree.tsx:26` mints an absolute share URL for "copy link". A rule: `/notes/:id` becomes canonical, `/p/:id`
redirects to it so already-copied links keep working, and the copy-link action emits the new URL.

**S6 — The clock is real and local, and the Home's animation respects reduced motion.** A rule: the clock reads the
browser locale through `Intl.DateTimeFormat` and updates every second, with no new dependency, and renders plain text
that animates nothing — so its digits are never rendered through `NumberTicker` or `AnimatedNumber`, which animate
numbers rather than time, and there is no clock-level motion for a preference to suppress. The `prefers-reduced-motion`
rule therefore binds the Home's only animation, the dock's hover magnification: under a reduced-motion preference the
dock renders at rest and remains usable.

**S7 — The chrome tells the truth about where you are.** Evidence: every prototype variant showed the breadcrumb
"My workspace / Welcome". A rule: every route the app shell serves names itself truthfully — a page under `/notes`
shows the notes section, bare `/notes` does not repeat it, and `/trash` names Trash — and no route falls back to
"Welcome". The Home is deliberately not among them, because it has no shell chrome at all (see S9); this rule scopes to
the routes the shell serves.

**S8 — The new surfaces do not change what already works.** A rule: the existing suite keeps passing, the notes module
keeps every behaviour it has today, and the Home is a real route in production — unlike the development-only lab and
the prototype route, which stays out of the production bundle.

**S9 — The Home and the notes module are two separate screens.** The user's words: "1. entras a la app y lo primero que
ves es es el hombe sobre /, que es una pantalla solo y exclusivamente para el home donde poco a poco meteremos widgets
y cosas 2. al dar click al dock ahora si nos manda a /notes, pero son dos pantallas distintas". A rule: `/` renders
**outside** the shell that serves the notes module, so the Home shows neither the page sidebar nor the notes editor
toolbar and owns its whole viewport; the dock is what takes you to `/notes`, which then carries that chrome; and the
sidebar gives the way back to `/`. Evidence this corrects: `/` was registered *inside* `AppShell`, so the Home rendered
wrapped in the sidebar and the editor toolbar, which is what the user rejected.

## Tasks

- **T1** — Vendor Magic UI's `Dock` and cover it with a focused test. — S2 — worker —
  `web/src/components/magicui/**` — no commit
- **T2** — Move the notes module to `/notes/:id`, redirect `/p/:id`, and update the six referencing places plus the
  breadcrumb. — S1, S5, S7 — worker — `web/src/App.tsx`, `web/src/components/layout/**`, `web/src/features/pages/**`,
  `web/src/features/search/**` — no commit
- **T3** — The sections array and the Home surface: clock, MDXCN welcome block, dock. — S1-S4, S6 — worker —
  `web/src/features/home/**` — no commit
- **T4** — Remove the prototype route now that the decision is folded in; keep its file as reference for the variants
  the user may still want to steal from, and ask about deleting it. — S2 — parent — `web/src/App.tsx` — no commit
- **T5** — Verification: suite, typecheck, production build and chunk check, and a real-browser pass on `/` and
  `/notes/:id`, including that an old `/p/:id` link still lands on the page. — S1-S8 — parent — none — no commit
- **T6** — Independent verification. — S1-S8 — verify — none — no commit
- **T7** — Close what T6 surfaced: truthful breadcrumbs on every route, and the dock honouring reduced motion. — S6,
  S7 — worker (1 run) — `web/src/features/pages/**`, `web/src/components/layout/**`,
  `web/src/components/magicui/**` — no commit
- **T8** — Parent re-verification after T7. — S1-S8 — parent — none — no commit
- **T9** — Take the Home out of the notes shell: `/` renders outside `AppShell`, the Home owns its viewport, the shell
  loses its dead Home branch, and the sidebar gains the way back to `/`. — S1, S2, S7, S9 — worker (1 run) —
  `web/src/App.tsx`, `web/src/components/layout/**`, `web/src/features/home/**`, `web/src/styles/**`,
  `web/src/features/pages/**` — no commit

## Log

- **L1** (user, verbatim): "Vamos a hacer la Home que va a ser de donde accedamos a las notas, habitos y que sea nuestro
  centro de control, me imagino usando mucho ahi el MDXCN tener una pantalla en medio la hora tipo reloj digital y un
  tipo dock con los accesos a los demas secciones en este caso solo seria notas, que opinas? para no tener todo dentro
  de notas, quiero separar cada funcionalidad/seccion asi poder tener todo mas limpio, recuerdo que tenemos una skill
  que genera tipo mockups hasta 4 para yo elegir uno" plus the routes: "direcciones / -> home, /notes -> notas (modulo
  tipo notion)".
- **L2** (user's choice, verbatim answer): "A — Reloj + dock".
- **L3** (evidence, the prototype and how it was judged): the `prototype` skill's UI branch was used in its sub-shape B
  — four structurally different variants on one throwaway development-only route, `/home-prototype?variant=A|B|C|D`,
  mounted inside the real `AppShell`. All four rendered in a real browser and were captured for the user. The chosen
  variant's own limit was measured during the build: the UI kit had no dock primitive with magnification, so the
  prototype approximated it with hover scale and elevation.
- **L4** (evidence, why `@magicui/dock` is the right primitive and what it costs): Magic UI's registry publishes a
  `dock` item whose only dependency is `motion`, which is already installed, so vendoring it adds no dependency. Its
  magnification is the hover behaviour the user described, which the prototype could not fake convincingly.
- **L5** (evidence, the routing cost): the six `/p/:id` references in L6's evidence set are why S5 needs a redirect
  rather than a clean rename: one of them mints a shareable absolute URL, so a silent rename would break links the user
  may already have copied.
- **L6** (the parent's two positions, one accepted and one overridden): (1) the parent argued MDXCN is a document
  registry and cannot carry the clock or the dock — accepted into S4; (2) the parent recommended a hybrid of variants B
  and C, and the user chose A instead. A's one real weakness was recorded rather than argued: a dock holding a single
  tile reads as odd, and the dock earns its place at three or more sections. The sections array in S3 is what makes
  that growth cheap.
- **L7** (closure evidence, parent verification): after T2 and T4 the gates were run and the surfaces observed in a real
  browser. Server 90/90 tests, web 204/204 across 26 files, `pnpm typecheck` exits 0 in both packages. The production
  build emits **1,614,827 bytes of JavaScript in 2 chunks** — 149 KB more than before the Home existed, which is the
  Home itself entering the entry chunk as a real route — with no chunk containing `ExcalidrawApp`, none containing
  `mermaid`, no Excalidraw styles in the CSS, and **no asset from the prototype at all**, which is T4 verified in the
  artifact rather than in the source. The browser pass on the pinned dev port (1574) observed: the Home rendering a live
  local clock, the real Magic UI dock with its Notes entry and the MDXCN welcome block, with the breadcrumb reading
  "My workspace / Home"; `/notes/<id>` rendering the page with the breadcrumb "Notes / Hoja 3.123"; **`/p/<id>` landing
  on `/notes/<id>`**, which is S5's reason for existing; and `/notes` rendering the empty state.
- **L8** (honesty about this closure's own checks): the parent's clock assertion in that pass reported failure and was
  wrong — the regex did not match a snapshot in which the time is split across nodes, while the screenshot shows
  `01:23:09 PM` and the writer's fake-timer test asserts the tick. Two things are therefore *observed* rather than
  *asserted*: the clock ticking in a real browser, and the `prefers-reduced-motion` path, which is implemented but has no
  test of its own. Recorded here instead of being claimed as verified.
- **L9** (outcome, T6 independent verification and the parent's triage): the verifier returned per-spec verdicts — S1,
  S3 and S5 satisfied; S2 and S8 unverifiable; **S4, S6 and S7 not satisfied** — and three of its findings survived
  checking.
  1. **S7 was a real defect, confirmed in the source and fixed.** `breadcrumb.tsx:14` fell back to `"Welcome"` for any
     route without a page, and the section crumb rendered for `Notes` independently of it, so bare `/notes` read
     "My workspace / Notes / Notes" and `/trash` read "My workspace / Welcome". Both were invisible to the parent's
     browser pass, which only looked at the Home and a page route: the verifier's list of *uncovered* routes is what
     found them. Fixed in T7, with the literal `"Welcome"` removed so no route can fall back to it.
  2. **S6 was mispointed by the parent, not broken by the writer.** The clock is plain text and animates nothing, so a
     clock-level reduced-motion branch would have been ceremony. The Home's only animation is the dock's hover
     magnification, and `dock.tsx` had no reference to the preference at all. S6 was rewritten to bind the rule to the
     dock, and the dock now renders at rest under a reduced-motion preference (T7).
  3. **S4's bundle concern was confirmed, after the parent botched the check twice.** The parent first grepped the built
     entry for graph-frame *identifiers*, which minification renames, and then ran that grep through `head -1`, which
     hid the 1.58 MB entry behind a 28 KB sibling chunk and reported a false 0. Matching instead on string literals
     that survive minification — `text-graph-frame`, `graph-title-ink`, `min-w-0 px-5 py-7 sm:px-8 sm:py-8` — shows
     MDXCN's shared graph-frame core **is** in the entry chunk. Its three source files total about 33 KB, so its minified
     share of the 149 KB the Home added is roughly 12-15 KB; that is an estimate from source sizes, not a measurement,
     and the exact split needs a build without the `Callout` import. The decision it informs is the user's, because he
     asked for MDXCN on the Home: keep it and pay for the graph-frame core, or render the welcome block as plain markup
     and drop that import from the entry graph.
  4. **S2's provenance question is unverifiable offline**: nothing available locally establishes whether the vendored
     `dock.tsx` differs from Magic UI upstream. The dock's own test and the documented substitution are the available
     guard, and the verifier said so instead of guessing.
  5. **The verifier violated the constraint it was given and reported it.** Its brief forbade copying the tree and
     installing anything; its own injected addendum required a scratch copy, and the run downloaded dependencies into
     it. It changed nothing in the repository and reported the breach itself, which is the right behaviour — but the
     conflicting instructions are a harness defect worth fixing, not a verifier defect.
- **L10** (closure, after T7): server 90/90 tests, web **210/210** across 28 files, `pnpm typecheck` exits 0 in both
  packages. The production build emits **1,615,115 bytes of JavaScript in 2 chunks**, entry `index-D2fD4U2d.js` at
  1,586,963 bytes, with no chunk containing `ExcalidrawApp`, none containing `mermaid`, no Excalidraw styles in the CSS
  and no prototype asset; the dock's reduced-motion branch cost **288 bytes**. The literal `"Welcome"` no longer exists
  in `breadcrumb.tsx` or `app-shell.tsx`. The browser pass asserted the breadcrumb **positively, on the parsed value**,
  for six routes: `/` → "My workspace / Home"; `/notes` → "My workspace / Notes" with no duplicate; `/trash` →
  "My workspace / Trash"; `/notes/<id>` → "My workspace / Notes / Hoja 3.123"; `/p/<id>` → the same crumb with the URL
  rewritten to `/notes/<id>`; `/ui-lab` → "My workspace / UI Lab". Screenshots were captured for `/trash` and the page.
- **L11** (method, and the parent's own failure mode recorded honestly): three times in this feature the parent's check —
  not the code — produced a misleading verdict. Two were false greens: a grep for graph-frame *identifiers*, which
  minification renames, and that same grep piped through `head -1`, which hid the 1.58 MB entry behind a 28 KB sibling
  and reported zero. One was a false red: `agent_browser_eval` returns its value as JSON, so comparing the raw text
  against a bare expected string failed on all six routes while every value was correct. The rules this produced, now
  part of how this repository is checked: assert **positively on a parsed value** rather than on the absence of a
  string, because an absence check passes vacuously when the check itself is broken; match on literals that survive
  minification rather than on identifier names; and never leave a file under test behind a shell pipeline that can
  select a different file. A broken check that reports "clean" is worse than no check.
- **L12** (user requirement change, verbatim): "mal interpretaste la idea del home, el ahora mismo esta o parece estar
  dentro de del contenedor donde se editan las notas y se esta conservando el sidebar, mi idea y lo que quiero es lo
  siguiente 1. entras a la app y lo primero que ves es es el hombe sobre /, que es una pantalla solo y exclusivamente
  para el home donde poco a poco meteremos widgets y cosas 2. al dar click al dock ahora si nos manda a /notes, pero son
  dos pantallas distintas". Affected specs rewritten: S7 now scopes its breadcrumb rule to the routes the shell serves,
  and S9 was added for the two-screen separation. One task reopened: T9. The parent's verified browser evidence had not
  caught this because the Home *rendered* correctly inside the shell — the defect was in the structure, which is exactly
  what a per-route screenshot does not show.
- **L13** (closure, after T9b): server 90/90 tests, web **211/211** across 28 files, `pnpm typecheck` exits 0 in both
  packages, and the production build emits **1,615,149 bytes of JavaScript in 2 chunks**, entry `index-CUOQahVp.js` at
  1,586,997 bytes, with no chunk containing `ExcalidrawApp`, none containing `mermaid`, and no Excalidraw styles in the
  CSS. The browser pass asserted positively, on parsed values, that `/` has **no** sidebar and **no** canvas toolbar and
  does render the clock, while `/notes` and `/notes/<id>` have both and no clock — which is S9 observed rather than
  argued. **⌘K was measured on both screens**: on `/` the palette never appears, and in the shell its own copy ("Type to
  search your pages") does. That confirms the writer's static reading that `SearchPalette` and its shortcut handler mount
  inside `AppShell`.
- **L14** (incident, and the parent's own fault): T9 delivered the correct structure while leaving **13 tests failing in
  two files it never ran** — `pages.test.tsx` (6) and `command-palette.test.tsx` (7) — because both mount the application
  at the default route and assert shell affordances, and `/` no longer serves the shell. Its focused runs and typecheck
  were green throughout. The cause was the parent's brief: it carried the rule "run only your focused tests, never the
  full suite", which exists to avoid false failures when several writers hold half-written files, into a task where a
  single writer was running, deleting exactly the cross-file safety net that catches this class of regression. T9b fixed
  it by rendering those tests on a route that serves the shell, keeping every assertion, and `AGENTS.md` now requires the
  whole package suite when you are the only writer. The T9 writer also reported, unprompted, that it had not observed a
  RED run — the second honest self-report in this feature, after the T6 verifier disclosing that it had breached its
  no-copy constraint.
- **L15** (open product decisions, none of them blocking): whether the Home regains a theme toggle (it lived in the
  notes toolbar) and whether ⌘K should work there at all, now that the measurement above shows it does not; whether the
  ~12-15 KB of MDXCN's `graph-frame` core stays in the entry chunk or the welcome block becomes plain markup; whether
  the prototype file (route removed, kept on disk for its unchosen variants) should be deleted; and whether `/notes`
  without a page should list pages instead of showing the empty state. Nothing in this feature is committed: it sits in
  the working tree with every wave before it, by the user's standing rule.
- **L16** (user follow-up, verbatim): "genial ahora ya teniendo esta estructura mejoremos esto, en el home agrega un boton
  de theme como en las notas y en las notas en el sidebar a un lado de donde dice \"My Workspace\" agrega un icono de
  una casa que al dar click nos lleve al /home". Both were done by reuse rather than by building anything new: the Home
  renders the existing `ThemeToggle` unchanged in its top-right corner, and the sidebar gained a lucide `House` link
  with `aria-label="Go to Home"`. Because `.sidebar-heading-row` is `justify-content: space-between`, the title and the
  house are wrapped in their own flex group so the icon sits beside the text instead of floating in the middle, with the
  mobile `Close` button still on the right. The title link to `/` from T9 stays, so the row offers two names for the same
  destination rather than one ambiguous one.
- **L17** (evidence, environment trap found while writing the tests test-first): Node 25 ships its own global
  `localStorage` which shadows jsdom's and does not implement the whole `Storage` surface — `clear()` is missing, which
  surfaced as `TypeError: window.localStorage.clear is not a function` and made the first RED run fail for the wrong
  reason. `web/src/features/home/home.test.tsx` therefore installs the same explicit in-memory storage stub
  `App.test.tsx` already used. Both new tests were written before the implementation and observed failing for the right
  reason (`Unable to find ... name "Switch to dark mode"`, `Unable to find ... name "Go to Home"`). Final gates: server
  90/90, web 213/213 across 28 files, `pnpm typecheck` exit 0 in both; in the browser the toggle flips both its label and
  the document's dark class, and the house link navigates to `/`. This closes the theme-toggle decision from L15; the ⌘K
  question on the Home stays open.
