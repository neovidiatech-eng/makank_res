# ─── Stage 1: Dependencies ───────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && cp -r node_modules /tmp/prod_modules
RUN npm ci

# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# openssl is needed so Prisma generate picks linux-musl-openssl-3.0.x engine
RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate the Prisma client (split-schema folder under prisma/) before compiling.
# With openssl installed, Prisma will use the linux-musl-openssl-3.0.x engine.
RUN npx prisma generate && \
    rm -f node_modules/.prisma/client/libquery_engine-linux-musl.so.node
RUN npm run build

# ─── Stage 3: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache dumb-init openssl

RUN addgroup -g 1001 -S nestjs && adduser -u 1001 -S nestjs -G nestjs

COPY --from=deps /tmp/prod_modules ./node_modules
# The generated Prisma client lives in node_modules/.prisma — a prod-only install
# never produces it, so copy it from the build stage on top of prod_modules.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
# Prisma schema folder (split schema requires the whole directory)
COPY --from=build /app/prisma ./prisma
# i18n translations are loaded at runtime from process.cwd()/i18n (see app.module.ts)
COPY --from=build /app/i18n ./i18n

# The uploads dir is a named volume (docker-compose) mounted at /app/uploads.
# Create it owned by the runtime uid so a fresh volume inherits 1001 ownership;
# otherwise Docker creates the mountpoint as root and multer writes fail (EACCES).
RUN mkdir -p /app/uploads && chown -R 1001:1001 /app/uploads

USER nestjs

# REST API port (PORT env var)
EXPOSE 3031
# Socket.IO gateway port (SOCKET_PORT env var)
EXPOSE 1235

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main"]
