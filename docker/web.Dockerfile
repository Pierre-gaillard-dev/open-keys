# Web: the built PWA served by nginx. Build context: repository root (see docker-compose.yml).

FROM node:26.13.1-slim AS build
RUN npm install --global pnpm@12.21.0
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --ignore-scripts \
  && pnpm --filter @open-keys/web build

# Unprivileged image: nginx runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/"]
