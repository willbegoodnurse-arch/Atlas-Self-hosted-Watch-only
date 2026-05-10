# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:3011
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/bitcoin/package.json packages/bitcoin/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm install

COPY . .
RUN npm run build --workspace @watch-wallet/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
COPY --from=build /app/apps/web/public apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
