# PairPad Deployment Guide

This guide covers production deployment of the backend and frontend.

## 1. Prerequisites

- Node.js 20+ (18+ supported)
- MongoDB (local, Atlas, or managed)
- (Recommended) Judge0 CE — self-hosted or RapidAPI

## 2. Environment Configuration

Create `backend/.env` from the template:

```bash
cp backend/.env.example backend/.env
```

Set at minimum:

| Variable | Recommended value |
|----------|-------------------|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Your MongoDB connection string |
| `JWT_SECRET` | A long, high-entropy random string |
| `CLIENT_URL` | The frontend origin, e.g. `https://pairpad.example.com` |
| `JUDGE0_API_KEY` | A real Judge0 key (or self-hosted Judge0 URL + host) |
| `ALLOW_LOCAL_EXECUTION` | Leave empty (local runner is disabled in production) |
| `LOG_LEVEL` | `info` |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 3. Build & Start

### Backend

```bash
cd backend
npm ci
npm start            # runs `node src/server.js` (NODE_ENV=production)
```

Probes:
- Liveness: `GET /health`
- Readiness: `GET /ready` (returns 503 until MongoDB is connected)

### Frontend

```bash
cd frontend
npm ci
npm run build        # emits static assets to dist/
```

Serve `dist/` from a CDN or static host (Nginx, S3 + CloudFront, Netlify,
Vercel, etc.). Configure the host to proxy `/api` and `/socket.io` to the
backend, or set `VITE_SOCKET_URL` and use absolute API URLs.

## 4. Reverse Proxy (Nginx example)

```nginx
server {
  listen 443 ssl http2;
  server_name pairpad.example.com;

  # Frontend static assets
  root /var/www/pairpad/dist;
  index index.html;

  location / {
    try_files $uri /index.html;
  }

  # API
  location /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Request-Id $request_id;
  }

  # Socket.IO (long-lived WebSocket + long-polling)
  location /socket.io/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

> If you run **multiple backend instances**, enable sticky sessions for the
> Socket.IO HTTP long-polling transport (Socket.IO's WebSocket transport is
> already sticky via the Upgrade header).

## 5. Process Management & Health

Use a process supervisor (systemd, pm2, or a container orchestrator) and wire
liveness/readiness probes:

```bash
# systemd example
[Service]
WorkingDirectory=/opt/pairpad/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
EnvironmentFile=/opt/pairpad/backend/.env
```

## 6. Running with Docker (recommended)

We recommend containerizing the backend and running it in an isolated,
disposable environment — especially for code execution. Example:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 5000
CMD ["node", "src/server.js"]
```

Use `ALLOW_LOCAL_EXECUTION` gating (leave unset) and prefer a containerized
Judge0 instance for all execution.

## 7. Security checklist before go-live

- [ ] `NODE_ENV=production` and a strong `JWT_SECRET`
- [ ] `ALLOW_LOCAL_EXECUTION` unset (local runner disabled)
- [ ] TLS termination and correct CORS origin in `CLIENT_URL`
- [ ] Rate limiting confirmed (auth, execute, socket connection)
- [ ] Readiness probe wired into the orchestrator/load balancer
- [ ] Structured logs shipped to an aggregation/error-tracking service
- [ ] Backups and monitoring for MongoDB
