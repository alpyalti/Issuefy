// Mandatory disposable PostgreSQL harnesses, kept out of the unit test launcher.
export const integrationTests = [
  "tests/entitlements/atomic-claims.test.cjs",
  "tests/billing/postgres-concurrency.test.cjs",
  "tests/account/database.test.cjs",
];
