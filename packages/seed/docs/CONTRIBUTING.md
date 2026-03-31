# Contributing to @cocapn/seed

Thanks for your interest in contributing. This guide covers setup, code style, testing, and the PR process.

## Setup

**Requirements:** Node.js 18+

```bash
cd packages/seed
npm install
```

## Development

```bash
npm run build       # Compile TypeScript to dist/
npm test            # Run all tests with vitest
npm run typecheck   # Type-check without emitting
```

## Code Style

- **ESM only** — all files use `"type": "module"` and `.js` extensions in imports
- **TypeScript strict** — `"strict": true` in tsconfig, no `any` without justification
- **No runtime dependencies** — keep the zero-dep guarantee
- **No JSX** — use template literals or HTM for any HTML generation

## Testing

- **Vitest** is the test framework
- Tests live in `tests/` alongside `src/`
- All tests must pass before a PR is merged
- Aim for meaningful coverage on new code

```bash
npm test                        # Run full suite
npx vitest run tests/soul.test.ts  # Single file
```

## Commit Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(seed): add voice input support
fix(seed): handle missing soul.md gracefully
docs(seed): update contributing guide
test(seed): add memory store tests
refactor(seed): extract theme loader
```

Scopes: `seed` for all changes in this package.

## Pull Requests

1. Fork or branch from `main`
2. Make focused changes — one concern per PR
3. Include tests for new behavior
4. Ensure `npm run typecheck && npm test` pass
5. Write a clear PR description explaining the *why*

## Reporting Issues

Open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
