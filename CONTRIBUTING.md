# Contributing

## Development setup

1. Install dependencies:
```bash
pnpm install
```
2. Copy env:
```bash
cp .env.example .env.local
```
3. Run app:
```bash
pnpm dev
```

## Required checks

Before opening a PR, run:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
bash ./scripts/template-audit.sh
```

## Commit style

Use Conventional Commits:
- `feat:`
- `fix:`
- `docs:`
- `test:`
- `refactor:`
- `chore:`

## Pull Requests

Include:
- Problem statement
- Approach and key tradeoffs
- Test evidence (commands + results)
- Compatibility and migration impact
- Documentation changes when behavior is user-visible

AI-assisted contributions follow the same acceptance contract as other work. Contributors remain responsible for correctness, licensing, security, and understanding every submitted change.

Do not include credentials, personal data, private deployment details, or unrelated local paths in code, fixtures, screenshots, or test output.
