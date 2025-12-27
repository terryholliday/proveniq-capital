# STAGE 1: BUILDER
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# STAGE 2: RUNNER
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
RUN addgroup -S proveniq && adduser -S capital -G proveniq
USER capital
EXPOSE 3001
CMD ["node", "dist/api/server.js"]
