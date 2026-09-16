import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { integrationTests } from "./integration-tests.mjs";

function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? discover(path) : /\.test\.[cm]js$/.test(path) ? [path] : [];
  }).sort();
}

const files = discover("tests").filter((file) => !integrationTests.includes(file.replaceAll("\\", "/")));
if (!files.length) throw new Error("No tests found under tests/");

// Do not pass developer/provider credentials or NODE_OPTIONS into unit tests.
// Tests use explicit synthetic configuration and mocked provider modules.
const env = Object.fromEntries(
  ["PATH", "SystemRoot", "TEMP", "TMP", "TMPDIR"].flatMap((key) =>
    process.env[key] === undefined ? [] : [[key, process.env[key]]]),
);
const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  env: { ...env, NODE_ENV: "test", TZ: "UTC" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
