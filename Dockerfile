# ============================================================================
# Dockerfile para el PAC Engine API (Express)
# Deploy en Railway.app
# ============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# Compilar TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Imagen final ---
FROM node:20-alpine

WORKDIR /app

# Solo dependencias de producción
COPY package.json package-lock.json* ./
RUN npm ci --production && npm cache clean --force

# Copiar código compilado
COPY --from=builder /app/dist ./dist

# Variables de entorno por defecto
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
