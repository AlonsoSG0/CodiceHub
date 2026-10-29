# chub-theme

Rebrand the app's visual system as "Chub Theme" from the CodiceHub / Midnight Orchid brand material the user
commissioned, token-first, with component-level accents as a separate follow-up. The user reviews the result
personally at the end of each step.

## Specs

**S1 — Three themes: light, dark and atripp.** User words (verbatim): "no dije que quitaras dark, tenemos
que tener 3 ahora, dark, ligth y atripp, son 3 temas, el nuevo es atripp" and "regresa el tema dark como
estaba". The existing light and dark return to their pre-rebrand values exactly; the rebranded Midnight Orchid
look becomes a third theme named **atripp**, selectable like the others (toggle and settings). No theme is
removed.

**S2 — Token-first, honest adaptation.** Take what fits this app's token architecture
(`web/src/styles/tokens.css`); reject what fights it (the `--ch-*` / `.ch-*` parallel layer, a `[data-theme]`
mount, gradient tokens, the type/radius scale). WCAG AA for text (4.5:1) and 3:1 for UI/graphical objects in
both variants of every theme. `atripp` is dark-family (Midnight Orchid canvas) with visibly stronger brand
accents.

**S3 — User review gate.** User words (verbatim): "yo reviso al final". Each step lands uncommitted; the user
reviews in the browser before the next step is planned.

**S4 — atripp shows more colour.** User words (verbatim): "el tema que hicieron me gusta, pero yo esperaba mas
acentos de colores, apenas y se nota el morado y magenta, lila rosa, me gusta el fondo, pero creo que podemos
poner mas cosas de colores". Keep the Midnight Orchid background family; make the violet / lilac / magenta /
pink brand hues clearly visible (borders, hover surfaces, primary, charts, heatmap accent) without breaking
WCAG AA.

## Tasks

| ID | Specs | Route | Commit | Task |
| --- | --- | --- | --- | --- |
| T1 | S1, S2 | worker | none | (superseded by L7: became the atripp palette) Rebrand every token in `tokens.css`, both variants — done |
| T2 | S3 | parent | none | (superseded by L7) Parent visual pass plus typecheck/build, hand to the user — done |
| T3 | S1, S2 | worker | none | Deferred: component-level brand accents (CTA gradient, focus glow, dashboard node decoration) only if the user asks for them after reviewing |
| T4 | S1, S4 | parent | none | Restore `:root`/`.dark`/system-dark to their exact pre-rebrand values and add the `.atripp` token block with stronger brand accents; restore the literal test pins and add minimal atripp coverage — done |
| T5 | S1 | worker | none | Three-theme plumbing: `Theme` type + `.atripp` class in the provider, preference options, toggle cycle, i18n labels, Tailwind dark variant covering `.atripp`, anti-flash script, affected tests — done |
| T6 | S1-S4 | parent | none | Full suite + typecheck + build + three-theme browser pass, then hand to the user — done |

## Log

L1 (user, verbatim): "ahora te voy a pasar los colores y el tipo taste de los logos que te pase para que hagamos
un nuevo tema que se llame CHub Theme, se lo pedi a una ia asi que ahi ve tu que te sirve y que no, pero lo
ideal es crar un nuevo tema con todo lo que nos de la otra IA / son 3 archivos en una carpeta en la raiz de
proyecto, es la carpeta es /theme, analizalo y manda un sub agento ha acer la aterea, yo reviso al final"

L2 (decision, parent): the source material is three files (design doc, tokens JSON, a full `--ch-*` theme CSS).
Kept under `design/codicehub-theme/` (the root `/theme` folder was moved there; `/theme` at the repo root would
collide with the app's future theming surface). The `.ch-*` utility layer and the gradient/glow tokens are
deferred: colour tokens cannot carry gradients, and a parallel class system would bypass the app's token
architecture. Typography, radius and motion stay as they are; Manrope is not loaded in this app.

L3 (decision, parent): favicon and brand images were already moved to `web/public/brand/` in a previous turn;
this feature starts from the palette only.

L4 (evidence, parent, T1 by worker): both variants rebranded in `web/src/styles/tokens.css`; `.dark` is the
canonical Midnight Orchid (`#0b0e17` canvas, `#151222` card, `#b56af8` primary, `#db7afc` ring, `#896d9b`
border) and `:root` the companion light variant (`#fcfafe` canvas, `#fffdff` card, `#7540a3` primary/ring).
`tokens.test.ts`: the two code-block-surface literal pins became luminance bounds (RED observed against the
old light surface, 0.9288 < 0.95); every other assertion kept. `pnpm --filter @chub/web test` 58 files / 433
tests green. WCAG computed inline for both variants: all text pairs >= 4.5:1, ring/borders/charts >= 3:1 on
their surfaces; the dark sidebar border is deliberately faint (translucent lilac) and is not a control
boundary.

L5 (evidence, parent, T2): `pnpm typecheck` green across cli/server/web; `pnpm --filter @chub/web build`
green, 23 JS chunks, `web/dist` 3.1 MB (no material growth). Browser pass on the dev server: dark and light
both resolve the new tokens on `/`, the notes editor, habits, books and settings; no Vite error overlay on any
section; `--dock-clearance` still publishes 97px. The parent's model cannot view screenshots, so the pass was
structural (computed styles and render checks); the aesthetic verdict belongs to the user, per S3.

L6 (handoff, parent): handed to the user uncommitted for review. Review focus flagged to the user: the light
`--border: #806b8e` is deliberately stronger than a Notion-style hairline (4.59:1) and the dark general border
is an opaque lilac-grey rather than the source's translucent one; both are one-line changes if the user
prefers quieter borders.

L7 (user, verbatim, requirement change): "ok, si pero no / 1. no dije que quitaras dark, tenemos que tener 3
ahora, dark, ligth y atripp, son 3 temas, el nuevo es atripp / 2. el tema que hicieron me gusta, pero yo
esperaba mas acentos de colores, apenas y se nota el morado y magenta, lila rosa, me gusta el fondo, pero creo
que podemos poner mas cosas de colores / 3. regresa el tema dark como estaba". S1 rewritten, S4 added, T4-T6
opened. T1's palette is not lost: it becomes the atripp block, with stronger accents per S4. The pre-rebrand
light/dark values are not in git (they belong to uncommitted waves), so T4 restores them from the parent's
recorded reads of the pre-rebrand file.

L8 (evidence, parent, T4): `tokens.css` rewritten — `:root`, `.dark` and the `prefers-color-scheme` block hold the
exact pre-rebrand values (dark: `#191919`/`#202020`/`#2f2f2f`; light: `#ffffff`/`#f7f7f5`/`#e9e9e7`), restored from
the parent's recorded reads because git never held them (uncommitted waves). New `.atripp` block: Midnight Orchid
base (`#0b0e17`/`#151222`/`#080911`) with the accents pushed per S4 — violet border `#5b4a77`, violet hover
`#2a1b3d`, violet-tinted secondary/muted `#241a35`, primary `#b56af8`, ring `#db7afc`, five-hue chart ramp, and a
magenta `#fb42db` full-cell heatmap accent. RED caught by the new atripp test: `--graph-muted: #b6b0c4` (lum
0.450) was lighter than the magenta accent (0.295), inverting the ramp; fixed with the source's faint tier
`#8f889e` (lum 0.259, 5.45:1 on card). The system-dark selector gained `:not(.atripp)` because its specificity
(0,2,0) would otherwise override the `.atripp` block (0,1,0) on dark-system machines. `tokens.test.ts`: literal
pins restored, system-dark regex updated for the new selector, one minimal atripp describe added; 7/7 green.

L9 (evidence, worker, T5): provider cycles light -> dark -> atripp -> light with exactly one root class at a
time and `colorScheme` dark for dark and atripp; preference offers `light/dark/atripp/system`; toggle icon and
label describe the next theme (`shell.theme.switchToAtripp`, es "Cambiar al tema Atripp"); `@custom-variant dark`
now covers `.atripp` so all 53 existing `dark:` utilities apply; the index.html anti-flash script reads
`chub.settings` `appearance.theme` (atripp -> `.atripp` + dark color scheme) with the legacy key and system
fallbacks kept. Scope addition authorized by the parent mid-task: `web/src/features/home/home.test.tsx` pinned
the old two-theme toggle label and was updated for the new cycle. `pnpm --filter @chub/web test` 58 files / 437
tests green; `tsc --noEmit` clean.

L10 (evidence, parent, T6): root `pnpm typecheck` green across cli/server/web; `pnpm --filter @chub/web build`
green, 23 JS chunks, `web/dist` 3.2 MB. Browser pass on the dev server: atripp resolves its full token set on
the notes editor (`--background #0b0e17`, `--primary #b56af8`, `--border #5b4a77`, `--graph-accent #fb42db`,
sidebar `#080911`, dock clearance still 97px); dark and light resolve their exact original values; the shell
toggle cycles light -> dark -> atripp -> light with correct labels ("Switch to dark mode" -> "Switch to Atripp
theme" -> "Switch to light mode"); the Settings Theme combobox offers light, dark, Atripp, system. No Vite error
overlay anywhere. Handed to the user uncommitted for the S3 review.

L11 (user, verbatim, follow-up): "Creo que si me gusta, ahora el icono del home cambialo por el logotipo". The logotipo
is horizontal (1691x449, mark plus wordmark) and the dock slot is a square 40px DockIcon, so the parent asked;
the user chose the isotipo in the dock. Evidence: ImageMagick flattens solve the opaque mark to a bright magenta
(~#e5599b mean over 25% alpha coverage) — strong on the dark/atripp docks and 3.27:1 on the light dock, above
the 3:1 non-text minimum, so no per-theme filter is needed. `global-dock.tsx`: the home entry drops its lucide
icon and renders `/brand/CodiceHub_Isotipo.png` (`size-6 rounded-[5px] object-contain`, aria-hidden; the label
carries the meaning); one regression assertion added to the existing dock test. Full web suite 58 files / 437
tests green, typecheck green; browser verified the mark loads at the same rendered size as the other icons in
light and atripp. No import-graph change, so no build was needed.

L12 (user, verbatim, T3 authorization): user chose all four deferred accents — "Gradiente en botones CTA",
"Glow de foco", "Decoración en Home", "Color de selección" — and "Sólo Atripp (recomendado)" for the theme.
T3 is now authorized: component-level brand accents, atripp only; light and dark stay exactly as they are.

L13 (evidence, parent, T3 by worker, delivery): all four accents landed scoped under `.atripp` —
`--gradient-brand` defined only in the `.atripp` block (superseding the earlier no-gradient-token decision,
which was about the in-place rebrand), the default Button variant gained `data-variant` and the brand gradient
with `#160c1c` text (6.7:1 on the lightest stop) and a hover glow, the focus glow adds a lilac box-shadow on
`:focus-visible` without replacing outlines, Home renders a static aria-hidden `data-home-decoration` SVG
(4 arcs, 4 nodes) only when the resolved theme is atripp, and `.atripp ::selection` is brand violet. Full
suite 443 tests green, tsc green, build green (23 chunks, 3.2 MB). Browser pass: gradient verified computed on
the default-variant CTA, decoration present only in atripp and absent in light and dark, the `--gradient-brand`
property resolves nowhere outside `.atripp`; the two `!important` flagged by review were the pre-existing
reduced-motion rules, untouched. Handed to the user uncommitted for review.
