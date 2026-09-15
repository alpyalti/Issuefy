# IFY-007: owner-scoped entitlements, first increment

Run `node --test tests/entitlements/*.test.cjs` after installing dependencies.
The Node runner transpiles production TypeScript in isolated VMs with mocked
DB/provider boundaries. No database, credentials, migrations or paid calls are used.

Coverage: owner/editor/viewer against all four plans and nine subscription
states; personal operations cannot inherit team subscriptions; unrelated active
callers cannot entitle lapsed targets; competitor/keyword limits and refresh plan
and usage follow the owner; project reactivation; preserved admin/development
bypasses; missing/inactive worker accounts fail closed; five paid worker entry
points stop before provider calls or writes.

## Validation

- 126 tests pass.
- `tsc --noEmit --incremental false` passes.
- `next build --webpack` passes, with existing middleware/Edge runtime warnings.
- Default Turbopack build cannot use this worktree's symlink to the existing
  installation outside its filesystem root. Integration should run the normal
  build with platform's clean local dependency installation.

## Scope and integration notes

No schema or production data changes. Revert the commit to roll back.

- API role checks remain first; worker billing checks are uncached and resolve
  only the target project's owner. Owner ID and plan are returned together for
  route quotas. Existing workers already meter their project's owner.
- Active, trialing, past_due and paused remain eligible. An admin owner and
  Stripe-unconfigured deployments continue to permit work. These policies can
  allow unpaid provider spend; this increment intentionally does not change them.
- The API's existing admin-caller bypass remains, but a worker still evaluates
  its owner. An admin caller cannot make a lapsed non-admin owner's worker run.
- Enrich and recommend-competitors have no target-project context and now require
  personal entitlement, just like project creation. An unpaid invited editor
  can perform project-scoped operations but cannot use those generic enrichment
  endpoints. A future project-scoped enrichment flow can supply owner usage.
- Worker rejection throws before provider calls/writes. Existing internal route
  wrappers may report that as an error; durable dispatch/skip reporting belongs
  to the worker increment. Draft replies/reclassification also require an active
  project at entry.
- Project/watchlist/invitation/refresh concurrency races and source/signal quota
  accounting remain deferred. This increment does not claim atomic quotas.
- Cancellation during an already-running pipeline is not interrupted; entitlement
  is rechecked when each guarded entry point starts.
- Plan tests explicitly disable BETA_STARTER_LIMITS. Existing default beta mode
  still applies Starter limits to every plan unless configured false.
