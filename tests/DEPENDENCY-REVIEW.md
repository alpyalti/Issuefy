# IFY-002 dependency and validation evidence

Revalidated 2026-09-15 against npm's advisory service and the linked upstream
advisories. Baseline: `b443f47`. No force upgrades, overrides, new dependencies,
application feature changes, migrations, or deployment actions.

## Remediation

`npm install next@^16.3.5`, followed by `npm audit fix` (without `--force`),
updated supported versions in the existing dependency graph. The icon package's
`latest` range is now `^4.2.0`, preserving the already locked 4.2.0 version.

| Component | Previous | Locked now | Evidence and applicability |
| --- | --- | --- | --- |
| Next.js | 16.2.7 | 16.3.5 | [AVIF image RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) patches 16.x at 16.3.3. Issuefy accepts arbitrary HTTPS image origins, making untrusted image input relevant. The advisory says AVIF optimization was disabled pending the underlying fix; preview image behavior still needs verification. |
| sharp | 0.34.5 | 0.35.4 | [libheif advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c) patches at 0.35.4 with prebuilt libheif 1.23.2. Relevant to processing untrusted logos. Do not substitute an older globally installed libheif during deployment. |
| OpenTelemetry core/resources/sdk-trace-base | 2.7.1 | 2.11.0 | [Baggage allocation](https://github.com/open-telemetry/opentelemetry-js/security/advisories/GHSA-8988-4f7v-96qf) patches core at 2.8.0; Sentry brings these packages into runtime. Transport header limits affect exploitability. |
| PostCSS | Next's nested 8.4.31; root 8.5.15 | 8.5.23, deduplicated | [Source-map disclosure](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp) patches at 8.5.23. No application import exposing a CSS compilation endpoint was found; build dependency exposure differs from public runtime exposure. |
| browserslist | 4.28.2 | 4.29.0 | [Query cache allocation](https://github.com/browserslist/browserslist/security/advisories/GHSA-c83g-rgw3-j3cx). Present through Sentry's build tooling; no direct app import found. |
| brace-expansion | 5.0.6 | 5.0.12 | [Expansion allocation](https://github.com/advisories/GHSA-rgw5-rvv9-x895), patched 5.x threshold 5.0.9. Present through Sentry's glob tooling; no direct app import found. |
| nanoid | 3.3.12 | 3.3.19 | [Zero-size custom generator loop](https://github.com/advisories/GHSA-2v37-7h3g-55p8), patched 3.x threshold 3.3.18. Transitive through PostCSS; no direct app import accepting generator sizes found. |
| baseline-browser-mapping | 2.10.33 | 2.11.23 | [Invalid-input termination](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv), patched at 2.11.0. Next/build tooling dependency; no direct app import found. |

The separate [Windows-hosted Next.js RCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36)
requires a Windows filesystem. It is not evidence of exploitability on the
intended Vercel deployment; the version is patched regardless. Earlier Next
16.2.11 advisories reported by the audit are also outside the new locked version.
Advisory entries overlap and include dependency effects; the baseline's 10
entries are not 10 independently exploitable application flaws.

## Validation

Local verification on macOS arm64, Node **22.23.2**, npm **10.9.2**:

- `npm ci`: passed with the committed lockfile.
- `npm test`: **10 passed, 0 failed**. Both bearer guards fail closed without
  configuration, reject absent/malformed/wrong/multibyte credentials and accept
  the configured token; URL normalization merges tracking variants while
  preserving article identity and handles invalid URLs; sharp decodes generated
  PNG/WebP/AVIF inputs, resizes them and preserves alpha in WebP output.
- `npm run typecheck`: passed, including clean-checkout Next route generation.
- `npm run build`: passed; compiled and generated all **26** static pages.
  Used an environment allowlist (PATH/HOME), CI mode, disabled Next telemetry,
  and the synthetic public Clerk key documented in README. No database or paid
  provider configuration was supplied.
- `npm audit --omit=dev`: **0 vulnerabilities** (baseline: 1 critical, 5 high,
  4 moderate affected package entries).
- `npm audit`: **0 vulnerabilities**, including development dependencies.
- `npm ls` of affected packages: valid dependency tree, no peer conflicts.
- `git diff --check`: passed.

CI reproduces installation, tests, typecheck, build and production audit on
Ubuntu with Node 22. The workflow is added but has not run on GitHub yet.
Test authoring and isolation conventions are in [README](README.md).

## Release limits and rollback

No unresolved version matches remain in the current npm audit. This does not
establish that every application behavior is secure. Broad image origins remain
as configured; tightening them needs a product-compatible logo source policy.
The image smoke test validates codec compatibility, not a malicious-file exploit.

Build warnings remain for the middleware convention and deprecated Edge runtime,
plus the expected missing Sentry auth token in credential-free CI. Google Fonts
requires public network access at build time. A preview must verify Clerk flows,
public pages, remote logos, and Sentry integration under the actual deployment
configuration before production promotion. There are no schema changes.

The coordinator owns review, integration, preview, deployment and board updates.
Rollback means restoring the prior application deployment/commit; that would
also restore the prior vulnerable dependency versions, so prefer fixing forward
and avoid leaving a security rollback deployed.
