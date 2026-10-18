FROM oven/bun:1.4.3 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/core/package.json apps/core/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --production --frozen-lockfile --filter @tfl/core

FROM oven/bun:1.4.3 AS core
WORKDIR /app
COPY --from=dependencies --chown=bun:bun /app /app
COPY --chown=bun:bun apps/core apps/core
COPY --chown=bun:bun packages packages
COPY --chown=bun:bun migrations migrations
USER bun
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD bun -e 'const r=await fetch("http://127.0.0.1:"+(process.env.PORT||8080)+"/api/v1/health/ready");process.exit(r.ok?0:1)'
CMD ["bun", "apps/core/src/index.ts"]
