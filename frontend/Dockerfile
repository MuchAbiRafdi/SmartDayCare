# Tahap 1: pasang dependensi dan bangun
FROM node:20-alpine AS build
WORKDIR /srv/web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# API_URL dipakai saat build untuk rewrite /api → layanan API di jaringan compose
ARG API_URL=http://api:8000
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production NEXT_STANDALONE=1
RUN npm run build

# Tahap 2: citra tipis hanya berisi hasil build
FROM node:20-alpine
WORKDIR /srv/web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /srv/web/.next/standalone ./
COPY --from=build --chown=app:app /srv/web/.next/static ./.next/static
COPY --from=build --chown=app:app /srv/web/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
