FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY src ./src

RUN addgroup -S pairpad && adduser -S pairpad -G pairpad
USER pairpad

EXPOSE 7000
CMD ["node", "src/server.js"]
