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
  database before connecting; credentials and URL query parameters are omitted.
- The runner keeps its advisory lock, filename ordering and per-file transactions.
  `_migrations` records completion in the same transaction as each SQL file.
  Failed files are rolled back, return exit code 1, and may be retried after the
  cause is resolved. Already committed files remain applied. Do not delete
  migration history or production rows to make a retry succeed.
- Failure output intentionally suppresses raw driver errors, SQL and parameter
  values. Use the last logged filename and restricted database diagnostics to
  investigate; do not paste connection strings or raw provider errors into
  public release logs. No automatic database rollback/down migration is provided.

## Scope and outstanding verification

Reference: `codex/issuefy-stabilization` at `72e083c`; its migration script matched
this worktree's baseline. Reviewed chain includes 0001–0016 and 0018; no 0017 file
exists on that reference. The runner sorts filenames and does not require
contiguous numbering. 0016 adds webhook completion/outbox state; 0018 adds the
checkout journal. Neither those files nor any existing SQL was changed.

Tests validate precedence, missing/unreadable files, safe target output,
fail-closed configuration, pending-file ordering, completion recording, rollback
and cleanup behavior with a fake client. They do not validate PostgreSQL SQL
syntax, real transaction behavior, advisory lock concurrency, or migration-chain
compatibility. A full smoke test requires a separately provisioned disposable
PostgreSQL database; configured environments remain untouched.

The public health route was inspected but not edited. It currently returns HTTP
200 even when the database fails and includes the raw exception message in its
JSON response. Its SELECT 1 probe also does not establish schema readiness. A
separate increment should return a failure status (e.g. 503), keep public errors
generic, and define whether schema readiness is required.
