# PairPad Authentication

PairPad uses a split-token session model.

## Access token

The access token is a short-lived JWT (15 minutes by default). It is kept in frontend memory and sent as a Bearer token to protected REST endpoints and during the Socket.IO handshake.

Access tokens are not persisted in browser storage.

## Refresh token

The refresh token is stored only in an HttpOnly cookie:

- `HttpOnly` prevents JavaScript from reading the token.
- `Secure` is enabled automatically in production.
- `SameSite` is controlled by `REFRESH_COOKIE_SAMESITE` and defaults to `lax`.
- The cookie path is restricted to `/api/auth`.

The refresh token contains a unique `jti` and session-family identifier. A hashed token identifier is persisted in MongoDB rather than the raw token.

## Rotation and reuse detection

Every successful refresh invalidates the current refresh session and issues a new refresh token in the same session family.

If an already-revoked refresh token is presented again, PairPad treats it as reuse of a potentially stolen credential and revokes the remaining sessions in that family. The browser must authenticate again.

## Logout

`POST /api/auth/logout` revokes the current refresh session and clears the browser cookie.

`POST /api/auth/logout-all` revokes all active refresh sessions for the authenticated user and clears the browser cookie.

## Browser lifecycle

1. Login/register creates a refresh session and returns only the short-lived access token.
2. The frontend keeps the access token in memory.
3. On page reload, the frontend calls `/api/auth/refresh`; the HttpOnly cookie is sent automatically.
4. When an API request receives a 401, Axios performs a single coordinated refresh and retries the original request.
5. On refresh failure, the access token is cleared and the user returns to the login state.

## Production requirements

- Use a unique high-entropy `JWT_SECRET`.
- Serve the frontend and API over HTTPS.
- Keep `REFRESH_COOKIE_SAMESITE=lax` for same-site deployments where possible.
- Use `REFRESH_COOKIE_SAMESITE=none` only when a cross-site deployment genuinely requires it, and only over HTTPS.
- Do not enable unsandboxed local code execution in production.
- Review refresh-session retention and MongoDB TTL behavior as part of operational monitoring.
