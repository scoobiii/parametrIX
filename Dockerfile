FROM node:24.12.0-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24.12.0-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server.ts ./server.ts
COPY --from=build --chown=node:node /app/serverCadParser.ts ./serverCadParser.ts
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/docs ./docs
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/models ./models
COPY --from=build --chown=node:node /app/firebase-applet-config.json ./firebase-applet-config.json
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /app/data /app/proof && chown -R node:node /app/data /app/proof /app/models

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["./node_modules/.bin/tsx", "server.ts"]
