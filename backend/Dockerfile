FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate --schema prisma/schema.postgres.prisma

COPY src ./src
COPY .env.example ./.env.example

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.postgres.prisma && node src/server.js"]
