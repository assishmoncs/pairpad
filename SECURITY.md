# Security Policy

PairPad takes security seriously. This document describes how to report
vulnerabilities and the security posture of the codebase.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security problems.**

Please report vulnerabilities privately by emailing the maintainers
(see the repository owner) with the following details:

- Affected endpoint / module and file path
- Steps to reproduce
- Impact assessment
- Suggested fix (optional)

You will receive an acknowledgement within 3 business days. We aim to publish
a coordinated disclosure and a fix timeline.

## Security Posture

### Critical mitigations in place

- **Code execution isolation:** the Judge0 path runs untrusted code inside
  Judge0's isolated runner. The local fallback runs in a child process with a
  **scrubbed environment** (no app secrets inherited), a 5-second timeout, a
  128 MB heap cap, and a 1 MB output cap — and it is **disabled in production
  unless `ALLOW_LOCAL_EXECUTION=true`** is explicitly set.
- **Authentication:** bcrypt-hashed passwords, JWT with configurable expiry,
  and server-side verification on every protected route and socket handshake.
- **Input validation:** length/format limits on emails, passwords, names, room
  codes, messages, and source code; body-size limits on JSON.
- **Headers:** Helmet security headers, a production Content-Security-Policy,
  and a CORS allowlist.
- **Rate limiting:** per-IP limits on the general API, auth, code execution, and
  socket connections.
- **Error handling:** centralized error handler with stable error `code`s and
  request-id correlation; no stack traces leaked in production.

### Operational hardening we recommend before public deployment

- Run the app in a **container** and terminate TLS at a reverse proxy.
- Prefer a fully isolated code runner (Judge0 / containerized) over the local
  fallback; leave `ALLOW_LOCAL_EXECUTION` unset in production.
- Use a strong random `JWT_SECRET`, enable auth token rotation/revocation, and
  consider moving from `localStorage` bearer tokens to httpOnly `Secure`
  cookies for high-security deployments.
- Add a monitoring/alerting stack (error tracking, structured log shipping).
