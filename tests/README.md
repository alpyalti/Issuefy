# Local checks and test conventions

Use Node 22 LTS and the committed npm lockfile:

```sh
npm ci
npm test
npm run typecheck
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsuZXhhbXBsZS5jb20k npm run build
npm run audit:production
```

The synthetic Clerk key is only for a build without application credentials.
CI runs these checks without database/provider secrets or migrations. Google
Fonts are fetched during the build, so building requires public network access.
`npm run check` combines tests, typecheck and build; it uses your build environment.

Tests use `node:test` and `node:assert/strict`, named `tests/**/*.test.cjs` or
`tests/**/*.test.mjs`. Discovery is recursive, including `tests/billing` and
`tests/entitlements`. Each file runs in a separate Node process. The launcher
passes only basic OS environment variables, `NODE_ENV=test` and `TZ=UTC`;
it does not load dotenv files or inherit provider credentials. Use synthetic
configuration and restore any environment changes with `t.after`.

For TypeScript application modules, use the existing compiler through
`require('../helpers/load-ts.cjs').loadTs('lib/example.ts', mocks)`. Supply
substitutes keyed by exact import specifier, e.g. `{'@/lib/db': {sql: fakeSql}}`.
Only Node builtins load automatically; all other imports fail unless supplied.
You can explicitly supply a harmless real dependency such as `zod` with
`{'zod': require('zod')}`, or compose another `loadTs` result. Each call evaluates
fresh module state. No additional runner/transpiler dependency is required.

This helper is for mocked server/unit tests, not an ESM/Next runtime emulator or
security sandbox. Test observable success, failure, retries and concurrency;
await async work and use bounded fake-provider behavior. Never load real paid
providers, database connections, migrations, or local env files into unit tests.
TypeScript is transpiled for execution; `npm run typecheck` separately checks
the application and generates Next route types from a clean checkout.
