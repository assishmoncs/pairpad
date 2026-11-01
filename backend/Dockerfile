FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/src ./src
COPY backend/.env.example ./.env.example
COPY docs/openapi.yaml ./docs/openapi.yaml

USER node
EXPOSE 5000

CMD ["node", "src/server.js"]
