# Migration runner safety (IFY-012)

Run `npm test` for the mocked regression suite. Tests create disposable temp
files and inject a fake pg client; they never connect to a database or load the
checkout's environment files. No database migration was executed for this change.

## Operator procedure

- Use the intended release checkout and run from its repository root. Migration
  files are resolved relative to the script; environment files are resolved from
  the current working directory.
- Configuration precedence is explicit shell values > `.env.local` > `.env`.
  An explicit empty shell `DATABASE_URL` fails closed rather than selecting a
  file's database. Missing files are allowed; unreadable files fail closed.
  Dotenv values are parsed literally (no shell/variable expansion).
- Confirm the approved database and backup/recovery plan before `npm run migrate`.
  The command is a write operation, not a dry run. It prints the host, port and
  database from the constructed pg client’s effective connection parameters before
  connecting. Query host/port overrides and pg database-name decoding are reflected;
  userinfo and unrelated query parameters are omitted.
- The runner keeps its advisory lock, filename ordering and per-file transactions.
  `_migrations` records completion in the same transaction as each SQL file.
  Failed files are rolled back, return exit code 1, and may be retried after the
  cause is resolved. Already committed files remain applied. Do not delete
  migration history or production rows to make a retry succeed.
- Failure output intentionally suppresses raw driver errors, SQL and parameter
  values. Use the last logged filename and restricted database diagnostics to
  investigate; do not paste connection strings or raw provider errors into
  public release logs. No automatic database rollback/down migration is provided.

## Verified scope and limits

The additive chain through 0020 was applied in a disposable PostgreSQL18
restore of the production snapshot on 2026-09-16. All22 existing nonjournal
tables retained original-column row fingerprints and counts; journal15→18.
Old-main SQL compatibility probes passed before new lifecycle state existed.
Production migration/deployment evidence is maintained in RELEASE-STATUS.md.
The chain intentionally has gaps (0017/0019); filenames sort in order.

The public health endpoint returns200 on successful SELECT1 and generic503
on failure, always no-store. Three regression cases cover healthy, missing
configuration and query failure. It tests DB connectivity, not schema readiness
or pipeline freshness. Do not interpret health200 as proof of current briefs.

Required rollout order:0016 webhook completion/outbox,0018 checkout journal,
then0020 account deletion guards (depends on both). Retain journals/tombstones
on rollback; after lifecycle operations begin, preserve new handlers or disable
affected entry points while recovering. Local restore validation excludes Neon
roles, ACLs and network configuration. Never use production mutations as QA.
