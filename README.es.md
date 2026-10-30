<p align="center">
  <img src="web/public/brand/CodiceHub_Banner_Oscuro_Iconos.png" alt="CodiceHub" width="100%">
</p>

<h1 align="center">CodiceHub</h1>

<p align="center"><a href="README.md">English</a> · <strong>Español</strong></p>

<p align="center">
  Notas, hábitos, libros, tareas, objetivos y una rutina diaria en un solo lugar.<br>
  Todo vive en un único archivo SQLite, servido por un binario que es tuyo.
</p>

---

## Qué es

CodiceHub es un espacio de trabajo personal: un cuaderno tipo Notion donde las notas conviven con las cosas que hacés
todos los días. No hay cuenta, no hay sincronización y no hay servidor en la nube — la aplicación corre en tu máquina y
los datos son un archivo que podés copiar a un pendrive.

Se distribuye como **un solo binario de Bun** que lleva dentro la API, la aplicación web y las migraciones, y las sirve
desde tu propio directorio de datos. Al lado hay una **CLI** para la terminal, así el mismo espacio responde
`chub search`, `chub todo` o `chub habits done Reading` sin abrir el navegador.

## Qué incluye

| Área | Qué hace |
| --- | --- |
| **Notas** | Editor Tiptap con backlinks, favoritos, secciones, iconos de página, índice de búsqueda full-text, papelera con restauración y exportación a Markdown |
| **Hábitos** | Varios tipos de campo por hábito (check, número, texto), matriz día a día, niveles y rachas, hábitos archivados |
| **Libros** | Lista de lectura con estado, puntaje y un cuaderno por libro, conectada a un hábito de lectura para que las páginas leídas hoy aparezcan como entradas del hábito |
| **Tareas** | Listas con fecha límite, prioridad, recurrencia y vista de "hoy" — más tableros Kanban de proyectos con columnas tipadas |
| **Objetivos** | Objetivos agrupados por período, con estado, etiquetas, categorías y fecha límite |
| **Rutina** | Una plantilla semanal de bloques horarios, marcada día a día, donde un bloque puede reflejarse en un hábito vinculado o mover una tarea vinculada a su columna de completadas |
| **Inicio y búsqueda** | Un panel del día y búsqueda estilo `⌘K` sobre todas las páginas |
| **Copias de seguridad** | Un comando respalda la base y rota las tres más recientes |

## Cómo se usa

**Para desarrollo** (Node 25 y pnpm 12):

```sh
pnpm install
pnpm dev          # web en :1574, API en :3000, datos en server/data
pnpm test
pnpm typecheck
```

El modo desarrollo mantiene su propia base descartable en `server/data`, así experimentar nunca toca los datos que
usás de verdad.

**Como producto real** — una línea, sin toolchain:

```sh
curl -fsSL https://raw.githubusercontent.com/AlonsoSG0/CodiceHub/main/install.sh | sh
chub                                     # sirve el espacio y abre el navegador
```

El instalador lee tu sistema y arquitectura (`linux`/`darwin` × `x64`/`arm64`), baja el asset de ese release,
compara su SHA-256 contra el `SHA256SUMS` publicado e instala `chub` en `~/.local/bin` (o `$XDG_BIN_HOME`).
Correrlo otra vez actualiza en el lugar, `--version 0.4.2` fija un release y `--dir` elige otro directorio:

```sh
curl -fsSL https://raw.githubusercontent.com/AlonsoSG0/CodiceHub/main/install.sh | sh -s -- --help
```

**En Windows** — el mismo release, PowerShell en lugar de un shell. Tomalo como experimental: instala y verifica,
pero nadie lo corrió todavía en una máquina Windows de verdad.

```powershell
irm https://raw.githubusercontent.com/AlonsoSG0/CodiceHub/main/install.ps1 | iex
```

Instala `chub.exe` en `%LOCALAPPDATA%\Programs\chub`, verifica el mismo `SHA256SUMS` y avisa si ese directorio no
está en `PATH`. Antes de actualizar, cerrá `chub`: Windows no puede reemplazar un ejecutable en uso. Ahí el data
home es `%LOCALAPPDATA%\chub`.

**Desde el código** — cuando estás trabajando en chub mismo:

```sh
pnpm --filter @chub/cli build:binary     # → cli/dist/chub
install -m755 cli/dist/chub ~/.local/bin/chub
```

El binario guarda todo bajo `~/.local/share/chub` (`%LOCALAPPDATA%\chub` en Windows; se cambia con `CHUB_HOME`):
la base, los archivos subidos, la web extraída y las copias de seguridad. Escucha en `127.0.0.1:3000` y en nada más.

## La CLI

La CLI trabaja sobre el mismo directorio de datos, así que funciona tanto si `chub` está corriendo como si no. Todo
comando que recibe una entidad acepta un id **o** un título, y todos tienen `--json`.

| Comando | Qué hace |
| --- | --- |
| `chub search "orquídea"` | Búsqueda full-text sobre las páginas |
| `chub notes` / `chub note <página>` | El árbol de páginas, o los metadatos de una |
| `chub note new\|rename\|backlinks\|rm\|restore` | Operaciones de página; el borrado es el suave |
| `chub todo` / `chub todo add` / `chub todo check` | La lista de hoy, agregar un ítem, tacharlo |
| `chub habits list\|done\|undo\|set\|log` | Hábitos, sus valores y su historial |
| `chub habits add\|rename\|archive\|field` | La estructura del hábito |
| `chub day` / `chub week` / `chub routine status` | La rutina, y marcar un bloque como hecho, perdido, justificado u omitido |
| `chub prefs` / `chub pref set` | Todas las preferencias guardadas, incluida la zona horaria del espacio |
| `chub backup` / `chub backups` | Respaldar la base, listar los respaldos |
| `chub export <página> --out lista.md` | Una página como Markdown |

```sh
chub todo add "llamar al dentista #Recados" --due 2025-03-04
chub habits done Reading
chub routine status Gym done
chub search "orquídea" --json
```

## Dónde viven tus datos

```text
~/.local/share/chub/
├── chub.db                 SQLite, en modo WAL
├── uploads/                imágenes que referencian tus notas y las portadas
├── backups/                chub-YYYYMMDD-HHMMSS.db, se conservan las tres últimas
└── runtime/<hash>/         la web y las migraciones extraídas del binario
```

Un archivo es todo el espacio de trabajo. Copialo, respaldalo o mudalo a otra máquina.

## Stack

| Capa | Qué usa |
| --- | --- |
| Web | React 19, React Router 7, Vite 6, Tailwind CSS 4, Base UI (shadcn `base-nova`), Tiptap 3, Motion |
| Servidor | Hono 4 sobre Node, SQLite con better-sqlite3, Drizzle ORM, migraciones escritas a mano |
| CLI | Bun: un binario compilado que lleva la API, la web y las migraciones |
| Tests | Vitest con Testing Library y jsdom para la web, Vitest para el servidor, `bun test` para el binario |

## Estado

Es un proyecto personal, no un producto. El alcance v1 y v2 está entregado y la CLI es nueva; esperá que la forma siga
moviéndose. No hay multiusuario, ni sincronización, ni nube — eso es la decisión, no una carencia.

## Documentación

- [`AGENTS.md`](AGENTS.md) — cómo está armado el repositorio y las reglas que lo mantienen consistente
- [`odd/tasks/`](odd/tasks) — el registro de cada área: las especificaciones, las tareas y la evidencia
- [`design/`](design) — fuentes de diseño, incluido el sistema de diseño de CodiceHub

## Licencia

El código está bajo [licencia MIT](LICENSE). La licencia cubre el código fuente y nada más: el nombre **CodiceHub**, la
marca, el logo y los assets de `web/public/brand/` quedan excluidos de la cesión y reservados. Un fork es bienvenido
siempre que salga con otro nombre y no use las marcas de CodiceHub para identificarse.
