# chub

## Prerequisites

- Node.js 25 and Corepack (the workspace uses pnpm 12.13.0).
- Docker Engine with Docker Compose for deployment.

## Development

```sh
pnpm install
pnpm dev
```

The web app runs at `http://localhost:1574`; the API runs at `http://localhost:3000`.

```sh
pnpm test
pnpm typecheck
```

## Personal CLI

Build the self-contained binary with `pnpm --filter @chub/cli build:binary` and run its smoke test with `pnpm --filter @chub/cli test:smoke`. Bun is required only for these two commands, not for root `pnpm build`, `pnpm test`, or `pnpm dev`. The binary stores its database and uploads under `~/.local/share/chub` (override with `CHUB_HOME`), listens on `127.0.0.1:3000`, and can be installed by copying `cli/dist/chub` to `~/.local/bin/chub`.

With no command, `chub` serves the workspace and opens the browser. A few data commands read the same data home
without a server, so they work while `chub` is running and while it is not:

```sh
chub habits list                        # today's habits and the values logged today
chub habits list --archived --json      # machine-readable, including archived habits
chub habits done Reading                # mark the check fields of one habit done for today
chub habits done Reading --date 2025-03-04
chub -v                                 # version
```

"Today" is the workspace day: the `workspace.timezone` preference, falling back to `America/Mexico_City`. The
device zone is never consulted, so a cron job or an SSH session cannot mark the wrong day. stdout carries data
only, stderr carries messages, and the exit code is `0` on success, `1` when the habit is unknown, ambiguous or the
write is refused, and `2` on a bad invocation.

## Docker deployment

```sh
docker build -t chub:local .
docker compose up -d
# Stop the container; host data is retained.
docker compose down
```

The app is served by one container on port `3000` by default. Compose publishes the same port the server listens on. The host directory `./data` is mounted at `/app/data`; it holds `chub.db` and uploaded images in `uploads/`. Compose creates `./data` on first startup if it is absent. The container entrypoint prepares the directory for UID 1000 (`node`) and then starts the server as that non-root user; the database migrations apply automatically on an empty data directory. An existing directory owned by another UID is recursively reassigned to `node` when container root has permission to do so. If Docker's rootless or user-namespace configuration prevents that repair, startup fails instead of running unwritable; correct the host ownership so UID 1000 can write to `./data` and its contents, then start again.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Server and published port |
| `CHUB_DB_PATH` | `data/chub.db` | SQLite file path, relative to the app directory |
| `CHUB_WEB_DIR` | `web/dist` | Built web assets directory |

When the web directory is unset, the server uses `web/dist`. If the selected directory or its `index.html` is missing, web requests return an empty 404; API routes remain available.

## Scope

The v1 and v2 scope is shipped. The Books section is not built.
