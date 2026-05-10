# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/bitcoin/package.json packages/bitcoin/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm install

COPY . .
RUN npm run build --workspace @watch-wallet/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist

EXPOSE 3011
CMD ["node", "apps/api/dist/index.js"]
