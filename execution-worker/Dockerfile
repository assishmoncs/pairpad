FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache docker-cli

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

RUN addgroup -S pairpad && adduser -S pairpad -G pairpad
USER pairpad

EXPOSE 7000
CMD ["node", "src/server.js"]
