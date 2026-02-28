# Contributing

Thanks for contributing to Blocs.

## Ground Rules

- Be respectful and follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
- Keep pull requests focused; avoid unrelated refactors.
- Include tests for behavior changes whenever possible.
- Do not commit secrets, private keys, or real credentials.

## Local Setup

### Frontend

```bash
cp .env.example .env
npm install
npm run dev
```

### Smart Contract (Anchor)

```bash
cd anchor
yarn install
anchor build
yarn test
```

## Validation Before Opening a PR

Run from repository root:

```bash
npm run lint
npm run typecheck
npm run test -- --run
```

If you changed Anchor code, also run:

```bash
cd anchor
anchor build
yarn test
```

## Pull Request Checklist

- Describe the problem and the solution clearly.
- Link related issues.
- Add/adjust tests and docs.
- Confirm CI is green.

## Commit Guidance

Conventional commits are preferred but not required.

## Signature Policy

- Maintainer commits to `main` must be GitHub-verified signed commits.
- Release tags must be annotated and signed tags.
- Unsigned maintainer commits or unsigned release tags are blocked by CI.
