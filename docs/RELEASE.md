# PairPad Release Runbook

This runbook defines the release path from a reviewed change to immutable container artifacts.

## 1. Pre-release gates

A release candidate must have green results for:

- backend lint and tests
- frontend lint, formatting, tests, and build
- API security tests
- Playwright collaboration tests
- accessibility browser gate
- performance budgets
- CodeQL and dependency checks
- OpenAPI contract tests

Do not release from a branch with a failing or unknown required check.

## 2. Source and version

Create an annotated Git tag using semantic versioning:

```text
vMAJOR.MINOR.PATCH
```

The release workflow uses the tag as the immutable application version and also records the source commit in its provenance artifact.

## 3. Container artifacts

The release workflow builds and publishes three images to GitHub Container Registry:

- `backend`
- `frontend`
- `execution-worker`

Each image receives the release tag and a source-SHA tag. Production should deploy the immutable release tag or digest, never an unpinned floating tag.

## 4. Promotion

PairPad separates image publication from production promotion. A release may be built and smoke-tested before a deployment target is selected.

Recommended promotion flow:

```text
main / reviewed PR
  -> green quality gates
  -> version tag
  -> publish immutable images
  -> deployment smoke test
  -> staging
  -> manual approval
  -> production
```

## 5. Rollback

Rollback means redeploying the previous known-good immutable image version. Do not rebuild old source into a new image during an incident.

Keep at least the previous production image tag available.

## 6. Provenance

Every release should record:

- repository
- source commit SHA
- release tag
- image names/tags
- verification state
- deployment timestamp

The GitHub Actions release workflow uploads a provenance artifact containing the source commit and release reference.

## 7. Dependency-lock limitation

The current application manifests include Redis dependencies that require the backend lockfile to be regenerated with `npm install` in a network-enabled environment before switching CI from `npm install` to `npm ci`. Do not fabricate lockfile entries. Once regenerated, prefer `npm ci` for deterministic builds.
