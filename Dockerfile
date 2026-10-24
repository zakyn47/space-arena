FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/arena.db PORT=8080
COPY --from=build /app /app
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node_modules/.bin/tsx", "packages/server/src/main.ts"]
