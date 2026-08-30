# Contributing to PairPad

Thanks for contributing. PairPad is a real-time collaborative coding platform, so changes to sockets, persistence, authentication and execution need careful testing.

## Development setup

1. Install Node.js 18+ and MongoDB.
2. Copy `backend/.env.example` to `backend/.env` and configure the required values.
3. Run the backend with `npm run dev` from `backend/`.
4. Run the frontend with `npm run dev` from `frontend/`.

## Before opening a PR

Run the relevant checks in both applications:

```bash
npm run lint
npm run format:check
npm test
npm run build
```

When changing shared behavior, also add or update integration tests. Socket changes should include reconnect, authorization and room-lifecycle coverage where applicable.

## Commit style

Prefer small, descriptive Conventional Commit-style messages:

- `feat(scope): add ...`
- `fix(scope): correct ...`
- `refactor(scope): simplify ...`
- `test(scope): cover ...`
- `docs(scope): document ...`
- `security(scope): harden ...`

## Pull requests

PRs should describe:

- what changed
- why it changed
- security implications
- test coverage and commands run
- deployment/configuration impact

Do not commit secrets, `.env` files, generated credentials, build output, or private datasets.

## Reporting security issues

Do not file public issues for vulnerabilities. Follow `SECURITY.md` instead.
