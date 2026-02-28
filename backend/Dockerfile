FROM node:20-alpine
RUN apk add --no-cache openssl openssl-dev libc6-compat
WORKDIR /app

COPY package.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY .env.example ./.env.example

EXPOSE 3000

CMD ["sh", "-c", "npm run db:push && npm run start"]
