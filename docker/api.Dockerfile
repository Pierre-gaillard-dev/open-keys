# API: Hono on Node. Build context: repository root (see docker-compose.yml).

FROM node:26.13.1-slim AS build
RUN npm install --global pnpm@12.21.0
WORKDIR /repo
# Dependencies first: this layer is reused as long as the lockfile does not change.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --ignore-scripts \
  && pnpm --filter @open-keys/server build \
  && pnpm --filter @open-keys/server deploy --legacy --prod --ignore-scripts /out \
  && cp -r apps/server/dist /out/dist

FROM node:26.13.1-slim
ARG APP_VERSION=dev
ENV NODE_ENV=production \
  PORT=3000 \
  DATA_DIR=/data \
  APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
# The named volume takes the ownership of the mount point on first use.
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/index.mjs"]
