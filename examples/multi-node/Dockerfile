# syntax=docker/dockerfile:1
# Two images from one build: `collab` (collaboration node) and `exchange` (import/export service).
#   docker build --target collab   -f examples/multi-node/Dockerfile .
#   docker build --target exchange -f examples/multi-node/Dockerfile .

FROM node:24-bookworm-slim AS base
RUN npm install --global pnpm@10.32.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY examples/multi-node/package.json ./examples/multi-node/package.json

# Install every dependency and build the web bundle and both server entry points once.
FROM base AS build
RUN pnpm --filter @univerjs/collaboration-example-multi-node... install --frozen-lockfile
COPY examples/multi-node ./examples/multi-node
ARG UNIVER_LICENSE=""
RUN UNIVER_LICENSE="$UNIVER_LICENSE" pnpm --filter @univerjs/collaboration-example-multi-node build

# Production dependencies only, shared by both runtime images.
FROM base AS runtime
RUN pnpm --filter @univerjs/collaboration-example-multi-node... install --frozen-lockfile --prod
COPY --from=build /app/examples/multi-node/dist ./examples/multi-node/dist
WORKDIR /app/examples/multi-node

# Import/export service: needs @univerjs-pro/exchange-node and its native binding.
FROM runtime AS exchange
ENV PORT=3011
CMD ["node", "dist/server/exchange-main.js"]

# Collaboration node: never imports exchange-node. Both entry points share one package.json, so
# pnpm installs the same dependency set for both images; drop the native binding (about 29 MB per
# platform) and its wrapper, then copy the pruned tree into a fresh layer so the deleted files do
# not remain in the image history. In production, give the exchange service its own package.
FROM runtime AS collab-files
RUN rm -rf /app/node_modules/.pnpm/@univerjs-pro+exchange-node* node_modules/@univerjs-pro/exchange-node

FROM base AS collab
COPY --from=collab-files /app /app
WORKDIR /app/examples/multi-node
CMD ["node", "dist/server/main.js"]
