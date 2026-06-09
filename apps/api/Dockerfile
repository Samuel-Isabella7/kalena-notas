# ---- Build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Dependências do sistema para o Prisma (openssl)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- Runtime ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist

EXPOSE 3334
# Aplica migrações pendentes e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
