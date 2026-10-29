FROM node:25-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@12.13.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile --allow-build=better-sqlite3

COPY server ./server
COPY web ./web
RUN pnpm --filter @chub/web build \
  && pnpm --filter @chub/server build \
  && pnpm --filter @chub/server deploy --prod /prod/server

FROM node:25-bookworm-slim AS runtime
ENV NODE_ENV=production \
  PORT=3000 \
  CHUB_DB_PATH=data/chub.db \
  CHUB_WEB_DIR=web/dist
WORKDIR /app

COPY --from=build --chown=node:node /prod/server/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/server/drizzle ./server/drizzle
COPY --from=build --chown=node:node /app/web/dist ./web/dist
COPY docker/entrypoint.sh /usr/local/bin/chub-entrypoint
RUN chmod 755 /usr/local/bin/chub-entrypoint \
  && command -v setpriv

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["/usr/local/bin/chub-entrypoint"]
CMD ["node", "server/dist/index.js"]
