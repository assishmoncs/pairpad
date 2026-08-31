# PairPad Deployment Guide

This guide covers reproducible local deployment and production deployment of the backend and frontend.

## 1. Prerequisites

For manual deployment:

- Node.js 20+ (18+ supported)
- MongoDB (local, Atlas, or managed)
- Judge0 CE — self-hosted or RapidAPI for production code execution

For the containerized stack:

- Docker Engine 24+
- Docker Compose v2+

## 2. Fastest reproducible start

The repository now includes a Docker Compose stack for the application, MongoDB, health checks, and reverse-proxied frontend/API traffic.

```bash
export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
docker compose up --build
```

Open `http://localhost` after the frontend health check passes.

For Judge0-backed execution, additionally provide:

```bash
export JUDGE0_API_KEY="your-key"
export JUDGE0_BASE_URL="https://judge0-ce.p.rapidapi.com"
export JUDGE0_RAPIDAPI_HOST="judge0-ce.p.rapidapi.com"
```

The Compose stack explicitly sets `ALLOW_LOCAL_EXECUTION=false`.

## 3. Manual environment configuration

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
| `JUDGE0_API_KEY` | A real Judge0 key |
| `ALLOW_LOCAL_EXECUTION` | Leave empty; disabled in production |
| `LOG_LEVEL` | `info` |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 4. Manual build & start

### Backend

```bash
cd backend
npm ci
npm start
```

Probes:

- Liveness: `GET /health`
- Readiness: `GET /ready` (returns 503 until MongoDB is connected)

### Frontend

```bash
cd frontend
npm ci
npm run build
```

Serve `dist/` from a CDN/static host or the included Nginx container. Requests to `/api/` and `/socket.io/` must reach the backend.

## 5. Included container architecture

```text
Browser
  |
  v
Nginx / frontend
  |
  +---- /api/* ------> PairPad backend
  |
  +---- /socket.io/* -> PairPad backend
                           |
                           +---- MongoDB
                           +---- Judge0 (external/self-hosted)
```

The frontend image serves the SPA and reverse proxies the API and Socket.IO paths to the backend service. The backend image runs as the unprivileged `node` user.

## 6. Reverse proxy (standalone Nginx example)

```nginx
server {
  listen 443 ssl http2;
  server_name pairpad.example.com;

  root /var/www/pairpad/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
  }

  location /socket.io/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
  }
}
```

## 7. Process management & health

Use a process supervisor or container orchestrator and wire liveness/readiness probes.

```ini
[Service]
WorkingDirectory=/opt/pairpad/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
EnvironmentFile=/opt/pairpad/backend/.env
```

## 8. Production security checklist

- [ ] `NODE_ENV=production` and a strong `JWT_SECRET`
- [ ] `ALLOW_LOCAL_EXECUTION` unset/false
- [ ] TLS termination and exact CORS origin in `CLIENT_URL`
- [ ] Rate limiting confirmed for auth, execute, and socket connections
- [ ] Readiness probe wired into the orchestrator/load balancer
- [ ] Structured logs shipped to an aggregation/error-tracking service
- [ ] MongoDB backups and monitoring configured
- [ ] Judge0 or an isolated execution worker used for untrusted code
- [ ] Application images run as non-root users

## 9. Scaling note

The current collaboration presence layer is single-instance. Once Redis-backed Socket.IO and shared collaboration state are implemented, run multiple backend replicas behind a load balancer and use Redis for cross-instance event propagation.
