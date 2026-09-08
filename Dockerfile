# Official Node 22 multi-platform index, resolved from Docker Hub on 2026-09-08.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund && node node_modules/prisma/build/index.js generate
COPY . .
RUN npm run build

FROM build AS production-deps
# Prisma CLI and Playwright's JS library are deliberate runtime dependencies.
# Test runners, TypeScript, Tailwind and build tooling are removed here.
RUN node scripts/prune-runtime.mjs && npm prune --omit=dev --ignore-scripts --no-audit --no-fund && node scripts/prune-runtime.mjs --drop-build-peers && npm cache clean --force

FROM base AS runtime-base
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310 DATABASE_URL=file:/app/data/boatscout.db PLAYWRIGHT_BROWSERS_PATH=/opt/boatscout-browsers
COPY --from=production-deps /app/package*.json ./
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/runtime-build-inputs.json ./runtime-build-inputs.json
COPY --from=build --chown=node:node /app/out ./out
COPY --from=build /app/server ./server
COPY --from=build /app/lib ./lib
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/config ./config
RUN mkdir -p data logs && chown -R node:node /app/data /app/logs /app/config
USER node
EXPOSE 4310
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 CMD node -e "fetch('http://127.0.0.1:4310/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","scripts/docker-start.mjs"]

# Opt in with --target rendered when reviewed sources need JavaScript rendering.
FROM runtime-base AS rendered
USER root
RUN node -e "const f=require('fs'),p='/etc/apt/sources.list.d/debian.sources';f.writeFileSync(p,f.readFileSync(p,'utf8').replaceAll('http://','https://'));f.writeFileSync('/etc/apt/apt.conf.d/80boatscout-retry','Acquire::Retries \"3\"; Acquire::http::Timeout \"20\"; Acquire::https::Timeout \"20\";');" && node node_modules/playwright/cli.js install --with-deps chromium && chmod -R a+rX /opt/boatscout-browsers && rm -rf /var/lib/apt/lists/* /root/.cache
USER node

# The default image omits browser binaries and browser-only operating-system packages.
FROM runtime-base AS runtime
