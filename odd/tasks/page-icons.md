# Page icons and emojis

Status: in progress. Feature document for page icons (lucide) and emojis (frimousse) on the sidebar rows and the
page title, requested after the toolbar and sidebar rework. Subagents read this file in order and stop before `## Log`.

## Specs

**S1 — One icon per page, in both places.** The user's words: "a las paginas en el sidebar y en el titulo hay que
agregar poder poner iconos y emojis como en notion". A rule: every page shows the same icon in its sidebar row and
beside its page title; changing it in either place updates both immediately, without a reload and without refetching
the tree.

**S2 — Icons come from lucide, which is already installed.** The user's choice: "lucide (la que ya tenemos)". A rule:
no new icon dependency is added; the picker offers a curated set of lucide icons, and a page whose stored icon name is
not in that set renders the default icon instead of a blank or broken slot.

**S3 — Emojis come from frimousse.** The user's choice: "frimousse". A rule: the picker also offers emojis through
`frimousse`, loaded lazily so the emoji data is only fetched when the picker is opened; choosing an emoji stores it and
renders the emoji character in both places.

**S4 — The default is a notebook icon, not an emoji.** The user's words: "al crearlos o de default tengan una libreta
de icono no emoji", refined to the lucide name "notebook-text". A rule: a page with no stored icon — including every
newly created page — shows `notebook-text`; removing a chosen icon returns the page to that default, never to nothing.

**S5 — Storage contract.** `pages` gains a nullable TEXT column `icon`. The API value is `string | null`:
- a library icon is its lucide kebab name, for example `"notebook-text"`;
- an emoji is prefixed, for example `"emoji:📓"`.

The server validates the value and rejects anything else with `400 {"error":"invalid_icon"}`: `null`; or a name matching
`^[a-z0-9]+(?:-[a-z0-9]+)*$` of at most 40 characters; or `emoji:` followed by 1 to 8 code units containing no
whitespace and no control characters. The icon is part of `PageMeta`, so `/api/pages/tree` carries it and the sidebar
needs no extra request. `POST /api/pages` and `PATCH /api/pages/:id` both accept `icon`.

## Tasks

- **T1** — Add the `icon` column, its hand-written migration, the repository and route support with validation, and server tests. — S5 — worker — `server/**` — no commit
- **T2** — Add the icon glyph, the picker (lucide palette plus frimousse), and the sidebar and title integration, with web tests. — S1, S2, S3, S4 — worker — `web/src/features/pages/**`, `web/src/features/editor/**`, `web/src/lib/api.ts`, `web/package.json`, `pnpm-lock.yaml` — no commit
- **T3** — Integrate, then verify S1-S4 in a real browser on scratch pages and purge them. — S1, S2, S3, S4 — parent — none — no commit
- **T4** — Independent verification of S1-S5 by `gentle-ai-verify`. — S1-S5 — verify — none — no commit

## Log

- **L1** (user, verbatim): "genial ahora a las paginas en el sidebar y en el titulo hay que agregar poder poner iconos y emojis como en notion y al crearlos o de default tengan una libreta de icono no emoji, antes de que lo hagas dime si tenemos libreria de iconos o dame opciones yo las reviso y te digo cual me gusta"
- **L2** (user's choices, verbatim answers): icon library "lucide (la que ya tenemos)"; emoji picker "frimousse"; default icon "notebook-text".
- **L3** (evidence, this session): `lucide-react@^0.577.0` is the only icon library installed and it is a direct dependency (1951 icons in that version, MIT); no emoji library was installed. `frimousse@0.4.0` declares `peerDependencies: { react: "^18 || ^19", typescript: ">=5.1.0" }`, zero runtime dependencies, MIT, single export, so it is safe on this React 19 app.
- **L4** (evidence, this session): `pages` has no icon column, and this repository has no `drizzle-kit generate` script: a migration is a hand-written SQL file under `server/drizzle/` plus an entry in `server/drizzle/meta/_journal.json`, and `server/src/db/client.ts` applies the statements at startup. The column is nullable and additive, so applying it to the running dev database is expected.
- **L5** (decision, feasibility answer): one nullable TEXT column with the `"name"` / `"emoji:<char>"` convention, and shape validation on the server instead of a server-side lucide allow-list, because the server must not depend on a frontend package; the client renders the default for any name it does not know.
- **L6** (decision, feasibility answer): the icon palette is an explicit name-to-component map, never `import * as icons from "lucide-react"`, so the bundle stays tree-shaken; "Remove icon" restores `notebook-text` rather than leaving the page without an icon.
