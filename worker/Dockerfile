# Morax worker - image Cloud Run (Job). scale-to-zero.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /app
# Manifests d'abord pour profiter du cache de couches.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/model-core/package.json packages/model-core/package.json
COPY worker/package.json worker/package.json
RUN pnpm install --frozen-lockfile
# Sources.
COPY packages/model-core packages/model-core
COPY worker worker
RUN pnpm --filter @morax/model-core build && pnpm --filter @morax/worker build
# Élague les devDependencies.
RUN pnpm --filter @morax/worker --prod deploy /out --legacy

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out /app
# Le registre YAML est résolu via packages/model-core/src au runtime.
COPY --from=build /app/packages/model-core/src/models.registry.yaml /app/node_modules/@morax/model-core/src/models.registry.yaml
USER node
CMD ["node", "dist/index.js"]
