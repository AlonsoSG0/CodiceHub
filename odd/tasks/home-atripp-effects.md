# Home page: atripp effects and the default theme

Make the atripp home feel like the CogniceHub banner — an orbital field of light — and make atripp the theme a fresh
install lands on.

## Brief (verbatim, the design authority for S3 and S4)

Objetivo: rediseñar el background del Home de CodiceHub manteniendo el estilo oscuro, premium y futurista del sistema
visual de la app, usando como inspiración un fondo abstracto con órbitas de luz, nodos brillantes y líneas suaves en
tonos lila, magenta y coral.

Quiero rediseñar el background del Home de mi app CodiceHub con una estética dark futuristic / midnight neon / orbital
minimalism. El resultado debe sentirse premium, elegante, tecnológico y contemplativo, no recargado. Debe conservar
mucho espacio negativo en el centro para que el reloj grande, el subtítulo y el mensaje de bienvenida sean el foco
principal.

Dirección visual: fondo base en tonos negro azulado / índigo muy oscuro / morado profundo. Composición abstracta con
líneas curvas orbitales finas, fluidas y elegantes. Varias líneas deben recorrer la escena como si fueran trayectorias
o conexiones espaciales. Algunas líneas pueden ser continuas y otras punteadas, pero las punteadas deben ser mucho más
sutiles que en la versión actual. Incluir nodos brillantes pequeños en intersecciones o puntos clave, con glow suave.
Añadir pequeños halos y brillos difusos en algunos nodos para dar profundidad. Usar una paleta basada en lila, violeta,
magenta, rosa y coral cálido, sobre un fondo oscuro. Mantener el centro limpio y oscuro, con muy pocos elementos en esa
zona. Concentrar el peso visual en los bordes, esquinas y laterales, enmarcando el contenido central. La sensación debe
ser como una mezcla entre mapa orbital, cielo digital y red de conexiones.

Composición específica: la parte central debe quedar despejada para el reloj. Las líneas más brillantes deben vivir en
las esquinas y bordes. Pueden existir curvas que crucen el lienzo, pero sin contaminar el área central. Debe haber una
ligera sensación de profundidad por capas. Algunas líneas pueden pasar por detrás de otras con distinta opacidad. El
dock inferior debe seguir siendo visible y no competir con el fondo.

Estilo: minimalista, futurista, oscuro, atmosférico, elegante, con iluminación neón suave. Sin parecer gaming. Sin
parecer wallpaper genérico. Sin exceso de partículas. Sin saturar la pantalla.

Animación: animaciones muy sutiles y lentas. Las líneas pueden tener un movimiento casi imperceptible, como deriva
orbital. Los nodos pueden tener un pulso de brillo muy suave. Si se usan líneas punteadas, deben moverse lentamente y
con baja opacidad. Evitar movimiento excesivo que distraiga del reloj o del contenido. Priorizar una sensación de calma
y sofisticación.

Restricciones: no usar demasiados elementos en el centro. No usar demasiadas líneas gruesas. No usar colores demasiado
saturados en toda la pantalla. No convertir el home en una ilustración recargada. No perder legibilidad del reloj,
subtítulo y mensaje. No romper el estilo premium de CodiceHub.

Paleta sugerida: fondo profundo #050816, #0A0F1F, #120A24; lila #B56AF8; violeta brillante #C586FF; magenta #FB42DB;
rosa #FF63B8; coral suave #FF6B6B; glow coral rgba(255,107,107,.22); glow violeta rgba(181,106,248,.22).

Resultado esperado: un Home que se vea como un espacio personal digital premium, con un fondo abstracto orbital que
acompañe el contenido central y refuerce la identidad visual de CodiceHub.

## Specs

**S1 — Scope.** Only the atripp home decoration and the default theme. No other screen, no server change, no CLI.

**S2 — atripp is the default theme.** `appearance.theme` defaults to `atripp` instead of `system`, and the anti-flash
script in `web/index.html` adds `atripp` when nothing is stored. An explicitly stored value still wins, including
`system`, which keeps following the OS. User words: "atripp debe de ser el tema por default".

**S3 — Visual language, reference not copy.** The reference is
`web/public/brand/CodiceHub_Banner_Oscuro_Iconos.png`: near-black canvas, thin curved lines, small glowing nodes.
Take the *language*: the wordmark, the icon glyphs, the glassy icon tiles and the symmetrical composition of the banner
are not reused. User words: "quita los cuadros flotantes y los ovalos que no sean tan ovalos que sea mas caotico".

**S4 — Composition: orbit as a frame, never through the centre.** The home is the hero screen, so the background must
frame the content instead of competing with it.
1. **Protected centre.** The middle of the canvas — roughly the central 50% of the width and 55% of the height — stays
   free of lines and nodes, and is slightly darkened by a vignette so the clock, the subtitle and the welcome message
   keep full contrast. That zone is the product; the orbit lives around it.
2. **Weight at the edges.** Four corner clusters plus the left and right sides carry the composition. Two or three
   long curves may cross the canvas, but they route through the upper or lower third, never across the clock. The
   bottom centre stays quiet so the dock never competes with it.
3. **Depth in layers.** A back layer of ten to fourteen very thin paths at low opacity, and a front layer of a few
   brighter ones, so lines pass behind each other. Total stays under about sixteen paths; no thick strokes.
4. **Nodes.** Eight to twelve small glowing nodes at intersections near the edges, radius 1.8-3.2, each pulsing on its
   own 6-10s cycle with a distinct delay. Three or four of them carry a soft radial halo, for depth rather than decoration.
5. **Dotted lines, barely there.** Only a couple of dotted paths, dash about `2 12`, opacity at or below 0.14, dash
   travel of 30-45s. Much subtler than the previous version.
6. **Backdrop.** Deep navy and indigo, not flat black: `#050816` to `#120A24`, painted by the decoration itself with
   two or three very large radial gradients in `#B56AF8`, `#FB42DB` and `#FF6B6B` between 0.10 and 0.22 alpha. The
   `.atripp` tokens stay untouched, so no other screen changes.
7. **Motion is nearly imperceptible.** Orbital drift on 40-70s cycles, node pulse on 6-10s, dash travel on 30-45s.
   Nothing that pulls the eye away from the clock.

**S5 — Tokens, with one documented exception.** Lines, nodes and glows resolve from the existing `.atripp`
variables — `--primary`, `--ring`, `--chart-1` through `--chart-5`, `--gradient-brand` — and the new CSS is scoped under
`.atripp` so it can never leak into light or dark. The deep navy and indigo backdrop that S4 asks for is the exception:
those stops are declared once as custom properties on `.atripp .home-orbit` (`#050816`, `#120a24`, `#b56af8`,
`#fb42db`, `#ff6b6b`) and referenced from there, because `tokens.css` is shared by every screen and deepening
`--background` would restyle the whole app.

**S6 — Motion is CSS, not a library.** `@keyframes` plus SVG only. Do not import `motion` on this path and add no
dependency: the home page ships in the entry chunk and the repository's bundling discipline is a documented
constraint. Keep it slow and subtle — nothing faster than about three seconds per cycle, glow opacity never above
about 0.6, no flashing.

**S7 — Accessibility and safety.** The decoration keeps `aria-hidden`, `pointer-events-none`, the `svg` root and the
`data-home-decoration` attribute, is never focusable, causes no layout shift, and collapses to a static frame under
`prefers-reduced-motion: reduce`.

**S8 — The explicit choice still wins.** Choosing light, dark or system from the toggle or from settings behaves
exactly as it does today, and the choice survives a reload.

**S9 — Minimal tests.** `home.test.tsx` keeps proving the decoration renders only in atripp; the preference test
moves its default assertion to `atripp`; one case proves that with nothing stored the document resolves to
`atripp`. Follow the repository rule: few, focused assertions.

## Tasks

| ID | Specs | Route | Commit | Task |
| --- | --- | --- | --- | --- |
| T1 | S1, S3-S7 | worker | none | Rewrite `home-decoration.tsx` and add `web/src/styles/home-atripp.css` |
| T2 | S2, S8, S9 | worker | none | Default theme: `preferences.ts`, the `web/index.html` anti-flash script, and the affected assertions |
| T3 | S9 | parent | none | Typecheck, the web suite, the production build; report for the user to test in `pnpm dev` |
| T4 | S1, S3-S7 | worker | none | Revision: drop the tiles, replace the rings with the chaotic curve field, raise the node count |
| T5 | S1, S3-S7 | worker | none | Second revision: protected centre, weight at the edges, layered depth, a deep navy backdrop and much subtler dotted lines |
| T6 | S1, S3-S7, Brief | worker | none | Redo the decoration from scratch, with the verbatim brief above as the design authority |

## Log

L1 (user, verbatim): "algo final, el /home del tema atrip vez que tiene como unos efectos o no se, quyiero que los
mejores, revisa la imagen de banner que usamos en el readme, para tomar de referencia solo referncia no copia, aparte
atripp debe de ser el tema por default, dale con eso, manda un sub agente y yo lo pruebo"

L2 (parent, state before the change): `home-decoration.tsx` is a static SVG — four thin paths and four circles with a
drop shadow, no motion at all. The theme registry defaults `appearance.theme` to `system`, and `index.html` resolves
an unstored theme to `dark` or `light` from the OS preference, so atripp is never what a fresh profile sees.

L3 (user, verbatim, first review of T1): "me gusta, pero no tanto, preferia las curvas, hagmos eso, quita los cuadros
flotantes y los ovalos que no sean tan ovalos que sea mas caotico, manda un sub agente y yo te digo si me gusta o no"

L4 (parent decision, S3 and S4 rewritten per L3): the tile layer is deleted outright, not restyled; the three
concentric ellipses are replaced by an irregular curve field, because the user's objection was specifically that the
rings read as ovals. The curves are promoted from decoration behind the content to the main motif, and the node count
rises so the crossings stay alive with the tiles gone.

L5 (user, verbatim — the brief for the second revision, abridged only where it repeats itself): "rediseñar el
background del Home manteniendo el estilo oscuro, premium y futurista... dark futuristic / midnight neon / orbital
minimalism. El resultado debe sentirse premium, elegante, tecnológico y contemplativo, no recargado. Debe conservar
mucho espacio negativo en el centro para que el reloj grande, el subtítulo y el mensaje de bienvenida sean el foco
principal... Fondo base en tonos negro azulado / índigo muy oscuro / morado profundo... líneas curvas orbitales finas,
fluidas y elegantes... Algunas líneas pueden ser continuas y otras punteadas, pero las punteadas deben ser mucho más
sutiles que en la versión actual... nodos brillantes pequeños en intersecciones o puntos clave, con glow suave...
Mantener el centro limpio y oscuro, con muy pocos elementos en esa zona... Concentrar el peso visual en los bordes,
esquinas y laterales, enmarcando el contenido central... El dock inferior debe seguir siendo visible y no competir con
el fondo... Animaciones muy sutiles y lentas... Priorizar una sensación de calma y sofisticación. No perder
legibilidad del reloj, subtítulo y mensaje. No romper el estilo premium de CodiceHub."

L6 (parent decision, S4): the centre is protected by construction, not by tuning — the paths are authored to route
around a central safe zone and a vignette darkens it, so the clock keeps contrast even if a line later moves. The
palette stops from the brief are painted by the decoration instead of changing the `.atripp` tokens, because
deepening `--background` would restyle every other screen in the app. The current version's dotted lines were the
loudest element the user objected to, so they are cut to at most two paths at opacity 0.14 or below.

L7 (parent decision, S5, after T5): the worker flagged that S5's literal text forbade the brief's extra colours. The
conflict was real — S4 asks for `#050816`/`#120a24` on the backdrop and S5 banned new hex — so S5 was amended rather
than the implementation changed: lines and nodes keep the chart tokens, and the five backdrop stops live once as
custom properties on `.atripp .home-orbit`. What shipped: 12 back paths and 3 front paths, all authored outside
`x 300-900 / y 200-600`; 10 nodes, every one at `x <= 275` or `x >= 925`; 4 halos; exactly 2 dotted paths at opacity
`.1` with a 40s travel; drift 48-65s; node pulse 6-10s on staggered delays peaking at opacity `.6`; reduced motion
disables all of it. Typecheck `0`, `bun test` equivalent: 445 web tests pass, production build `7.66s`.
