FROM node:24-bookworm-slim

RUN npm install --global pnpm@10.32.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY examples/multi-node ./examples/multi-node
RUN pnpm --filter @univerjs/collaboration-example-multi-node... install --frozen-lockfile

ARG UNIVER_LICENSE=""
RUN UNIVER_LICENSE="$UNIVER_LICENSE" pnpm --filter @univerjs/collaboration-example-multi-node build
WORKDIR /app/examples/multi-node
CMD ["node", "dist/server/main.js"]
