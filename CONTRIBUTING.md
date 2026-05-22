# Contributing to GatiMitra

A short guide for working in this monorepo. Long‑form architecture lives in
[`docs/modernization-roadmap.md`](docs/modernization-roadmap.md).

## Layout

```
apps/         Expo mobile apps (customer / merchant / rider)
backend/     Fastify monolith (renamed to services/backend-core in Stage 6)
dashboard/   Internal admin Next.js app
partnersite/ Merchant-facing Next.js app
packages/    Shared libraries — import as @gatimitra/*
docs/        Architecture, runbooks, RFCs
```

## Commands

```bash
# Install once at the root
npm install

# Run a single app
npm run dev:backend          # Fastify on :3000
npm run dev:dashboard        # Next.js on :3001
npm run dev:partnersite      # Next.js on :3002
npm run dev:customer         # Expo
npm run dev:merchant         # Expo
npm run dev:rider            # Expo

# Repo-wide quality gates (Turborepo, scopes to changed workspaces)
npm run typecheck
npm run lint
npm run build

# Fall back to plain npm workspaces (slower, no cache) if needed
npm run typecheck:legacy
```

## Shared configs

Every TypeScript workspace should `extends` from `@gatimitra/shared-config`:

```jsonc
// tsconfig.json
{
  "extends": "@gatimitra/shared-config/tsconfig.node.json",  // backend/services
  // or
  "extends": "@gatimitra/shared-config/tsconfig.next.json",  // dashboard/partnersite
  // or
  "extends": "@gatimitra/shared-config/tsconfig.expo.json",  // mobile apps
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  }
}
```

Same for ESLint:

```js
// .eslintrc.cjs
module.exports = {
  root: true,
  extends: ["@gatimitra/shared-config/eslint-base.cjs"],
};
```

Migration is gradual — existing per-workspace configs continue to work until
they get switched over. We don't force-update them all in one go.

## Adding a shared package

```bash
mkdir -p packages/<name>
cd packages/<name>
npm init -y      # then edit "name" → "@gatimitra/<name>"
```

Add it to a consumer:

```jsonc
// apps/customer_app/package.json
"dependencies": {
  "@gatimitra/<name>": "*"
}
```

Re-run `npm install` at the root.

## Pull request hygiene

- One concern per PR. Refactors and behavior changes go in separate PRs.
- CI must be green before merge — `typecheck` is a hard gate, `lint` is a warning.
- Never bypass `--no-verify` / signing flags on `git commit` without explicit approval.
- Schema migrations under `backend/drizzle/` are additive — never `DROP COLUMN`
  without a 2-week deprecation window documented in the PR description.

## Modernization roadmap

Active plan: [`docs/modernization-roadmap.md`](docs/modernization-roadmap.md).
We're executing stages in order; see that doc for what's done and what's next.
