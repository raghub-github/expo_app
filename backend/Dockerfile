# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm -ws run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /repo/backend/dist ./dist
COPY --from=build /repo/backend/package.json ./package.json
COPY --from=build /repo/backend/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/index.js"]


