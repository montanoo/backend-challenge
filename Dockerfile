# dev environment
FROM node:24-alpine AS base
WORKDIR /app

RUN corepack enable
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["pnpm", "start:dev"]

FROM deps AS build
COPY . .
RUN pnpm prisma generate && pnpm build

# prod only
FROM base AS prod
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
CMD ["node", "dist/main"]