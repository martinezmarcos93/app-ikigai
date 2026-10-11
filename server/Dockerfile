# syntax=docker/dockerfile:1
# Imagen del API de Ikigai Training. Multi-stage: compila TypeScript, instala solo las
# dependencias de produccion y corre como el usuario sin privilegios `node`.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npx tsc -p tsconfig.json

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# El migrador resuelve ../migrations respecto de dist/scripts.
COPY migrations ./dist/migrations
COPY package.json ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/index.js"]
