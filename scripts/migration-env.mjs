import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";

// Explicit shell values (including empty values) win; local file wins over base.
// Read both files before changing env so a read failure cannot partially load it.
export async function loadMigrationEnv({ cwd = process.cwd(), env = process.env } = {}) {
  const values = {};
  for (const filename of [".env", ".env.local"]) {
    try {
      Object.assign(values, parse(await readFile(resolve(cwd, filename))));
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error("Migration environment file could not be read");
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (!Object.hasOwn(env, key)) env[key] = value;
  }
  return env;
}

export function validateMigrationUrl(connectionString) {
  let url;
  try { url = new URL(connectionString); } catch { throw new Error("Invalid DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error("DATABASE_URL must specify a PostgreSQL host and database");
  }
}

export function migrationTarget(connectionParameters) {
  // Read the driver's effective destination, including query overrides and
  // decoding. Whitelist only destination fields, never serialize the client.
  const { host, port, database } = connectionParameters;
  return { host, port, database };
}
