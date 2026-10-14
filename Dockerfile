# syntax=docker/dockerfile:1
# ---- build: typecheck, bundle the web client and the server ----
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts ./
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts
RUN npm run build && npm run build:server

# ---- runtime: just node, the bundle and the static files ----
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8737 \
    CAT_DATA_DIR=/app/data
WORKDIR /app
RUN mkdir -p /app/data && chown node:node /app/data
COPY --from=build --chown=root:root /src/dist ./dist
COPY --from=build --chown=root:root /src/build/server.mjs ./server.mjs
COPY --from=build --chown=root:root /src/scripts/admin.mjs ./scripts/admin.mjs
USER node
VOLUME ["/app/data"]
EXPOSE 8737
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8737/healthz >/dev/null || exit 1
CMD ["node", "server.mjs"]
