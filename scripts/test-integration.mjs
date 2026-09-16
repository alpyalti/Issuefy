import { accessSync, constants } from "node:fs";
import { isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { integrationTests } from "./integration-tests.mjs";

// Explicit local-binary opt-in only. Never accept service URLs or inherited PG,
// provider credentials, NODE_OPTIONS, HOME config or dotenv files.
const pgBin = process.env.ISSUEFY_TEST_PG_BIN;
if (!pgBin || !isAbsolute(pgBin)) {
  throw new Error("Set ISSUEFY_TEST_PG_BIN to an absolute PostgreSQL 17 binary directory; integration tests are mandatory.");
}
const env = {
  PATH: process.env.PATH || "/usr/bin:/bin",
  NODE_ENV: "test", TZ: "UTC", LANG: "C", LC_ALL: "C",
  ISSUEFY_TEST_PG_BIN: pgBin,
};
for (const binary of ["postgres", "initdb", "pg_ctl"]) {
  accessSync(join(pgBin, binary), constants.X_OK);
}
const version = spawnSync(join(pgBin, "postgres"), ["--version"], { env, encoding: "utf8" });
if (version.status !== 0 || !/\(PostgreSQL\) 17\./.test(version.stdout)) {
  throw new Error("PostgreSQL 17 binaries are required; integration tests were not run.");
}
for (const file of integrationTests) accessSync(file, constants.R_OK);
const reporter = fileURLToPath(new URL("./integration-reporter.mjs", import.meta.url));
const result = spawnSync(process.execPath, [
  "--test", "--test-concurrency=1", `--test-reporter=${reporter}`, ...integrationTests,
], { env, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
