# CodiceHub — Midnight Orchid Design System

**Referencia visual:** `CodiceHub_Banner_Oscuro_Iconos.png` (el banner final elegido por el usuario, negro, logotipo central y mosaico de iconos flotantes conectados).

## ADN visual

Una interfaz de **Personal Command Center** con *Dark Minimalism + Soft Neon Glass + Connected Workspace*. Siente premium, enfocada, ordenada, moderna y ligeramente futurista. La marca no es gamer, cyberpunk ni una fiesta de neón: el contenido gana y el brillo es una recompensa visual sutil.

- **Fondo:** casi negro con profundidad azul-violeta; no negro puro uniforme.
- **Forma:** mosaicos desiguales de esquinas suaves, tarjetas flotantes, arcos de conexión y nodos pequeños.
- **Color:** gradiente violeta → lila → magenta → coral; el magenta y el coral se usan con moderación.
- **Luz:** halo discreto en iconos destacados, controles activos y hitos. El resto de los paneles no brilla.
- **Jerarquía:** 80% neutro oscuro; 15% lila/violeta y 5% magenta/coral intensos, como aproximación visual.
- **Tipografía:** Inter para interfaz (Manrope opcional para titulares); textos largos sin efecto de gradiente.

## Paleta (muestras representativas del banner renderizado)

| Rol | Hex | Uso |
| --- | --- | --- |
| Violeta de marca | `#B56AF8` | Primary, selección, navegación |
| Lila luminoso | `#DB7AFC` | Iconografía, borde destacado, foco |
| Magenta eléctrico | `#FB42DB` | Progreso, hábitos, destellos |
| Rosa transición | `#FC5AA2` | Estados gráficos, interpolación |
| Coral enérgico | `#FC4A5D` | Metas, hitos, extremo del gradiente |
| Negro profundo | `#05080D` | Base profunda, sombras |
| Negro azul nocturno | `#0B0E17` | Fondo principal |
| Superficie | `#151222` | Paneles, tarjetas, kanban |
| Superficie activa | `#281633` | Hover/selección |
| Texto claro | `#F8F7FC` | Lectura y encabezados |
| Texto secundario | `#B6B0C4` | Metadatos, textos secundarios |

> Estos valores son muestras y tonos curados según el banner. El arte generado tiene píxeles variables por iluminación, antialiasing y degradados; no hay un único HEX de origen para cada zona.

## Gradientes e iluminación

```css
--ch-gradient-brand: linear-gradient(110deg, #B56AF8 0%, #DB7AFC 26%, #FB42DB 61%, #FC4A5D 100%);
--ch-gradient-highlight: linear-gradient(105deg, #DB7AFC 0%, #FB42DB 52%, #FC4A5D 100%);
--ch-glow-violet: 0 0 0 1px rgba(219,122,252,.24), 0 0 22px rgba(181,106,248,.15);
--ch-glow-magenta: 0 0 0 1px rgba(251,66,219,.25), 0 0 26px rgba(251,66,219,.18);
```

- **Tarjetas:** `#151222`, borde 1 px `rgba(219,122,252,.17)`, radio 16 px. Hover `#21172F`.
- **Sidebar:** negro más profundo, borde violeta casi invisible; item activo con lila translúcido y una línea lateral violeta.
- **Botón principal:** gradiente; brillo tenue SOLO hover/focus.
- **Acciones secundarias:** gris oscuro con texto claro, sin degradado.
- **Inputs y Notion-like editor:** superficies estables, casi sin destellos; priorizar legibilidad y largos periodos de uso.
- **Progreso y hábitos:** barras degradadas finas y checkpoints magenta.
- **Kanban:** columnas en superficies neutras; tarjetas casi planas; glow sólo para selección/drag.
- **Conectores y arcos:** se usan únicamente en encabezado/dashboard/overview (no detrás de cada editor o lista de tareas).
- **Animación:** ~180–220ms; transformaciones 1px; respetar `prefers-reduced-motion`.

## Aplicación por módulos

| Módulo | Dirección |
| --- | --- |
| Dashboard | Resumen ejecutivo con 3–5 widgets y red de nodos muy sutil como decoración |
| Notas | Editor calmado, lila en acciones y selección |
| Hábitos | Magenta para progreso, checks y rachas |
| Biblioteca | Violeta en libros/etiquetas, evitar efectos alrededor de párrafos |
| Rutina | Coral moderado en indicadores de rutina |
| Metas / Goals | Rosa-coral para hitos y estado de avance |
| Tareas | Checks magenta, contrastes accesibles |
| Proyectos Kanban | Columna neutra, tarjeta destacada violeta al arrastrar o seleccionar |

## Guardrails para el agente

1. Primero inspecciona el framework, variables, componentes y el sistema de temas actual. **No refactorices lógica, rutas, datos ni funcionalidades** para cambiar el aspecto.
2. Construye tokens semánticos reutilizables; no fijes valores HEX arbitrarios en cada vista.
3. Conserva WCAG AA para texto y controles, foco de teclado visible y estados no comunicados solo por color.
4. Evita exceso de degradados, glows, blur y animaciones. Usa `backdrop-filter` excepcionalmente, no por defecto.
5. Mantén la marca `CodiceHub` e isotipo original, no reinterpretar símbolos.
6. El diseño debe escalar en desktop y móvil sin perder legibilidad.
7. Prueba las pantallas: dashboard, notas, hábitos, libros, rutinas, metas, tareas, proyectos y estados vacíos.
8. El diseño oscuro es la versión canónica; si existe tema claro, ajustarlo como variante separada.

## Prompt listo para tu agente

Implementa en mi app CodiceHub un tema llamado **Midnight Orchid**, inspirado en la imagen `CodiceHub_Banner_Oscuro_Iconos.png`, siguiendo el CSS `codicehub-theme.css`. Quiero una interfaz oscura premium tipo personal command center. Reutiliza los tokens y no toques lógica de negocio. Fondo `#0B0E17` a `#05080D`, superficies `#151222`, texto `#F8F7FC`, gradiente `#B56AF8 → #DB7AFC → #FB42DB → #FC4A5D`. Crea una jerarquía sobria: sidebar profunda, tarjetas oscuras con borde violeta translúcido, CTA con gradiente, focus lila, progreso magenta/coral y glows muy suaves solo en elementos protagonistas o activos. Preserva el isotipo de cuadritos desiguales. Usa nodos y líneas delgadas interconectadas solo como detalles del dashboard. Adapta notas, hábitos, biblioteca, rutinas, metas, tareas y kanban con acentos consistentes; prioriza lectura, accesibilidad y rendimiento. Detecta el stack actual y asigna los tokens a su sistema de estilos existente en vez de introducir otra librería sin necesidad. Entrega cambios comprobables y resume los archivos modificados.
