# Tracked website preservation

Base: `c866f25`. Onboarding displayed an entered/edited full Website link but serialized the display-only hostname as `competitors.website_url`. The worker reads `website_url`, so Jira's product path was lost. Settings had the same source-of-truth split: Save links PATCHed `socials` without `website_url`.

Changes:
- Seed Website from the entered URL, even if enrichment omits it or offers a homepage. Serialize the edited Website into `website_url` and `socials.website` consistently. Company profile payload also preserves the entered/edited path.
- Reuse the existing website-link safety normalization: canonical HTTPS, preserved case-sensitive path/query, fragment removed, invalid scheme/credentials/ports rejected. Bare domains gain HTTPS.
- Competitor Website tracking is explicitly required, matching the worker. The card cannot switch it off; off/missing/blank website payloads fail before saving. Remove a competitor during onboarding, or pause an existing competitor in Settings, to stop its monitoring. Company website Off stores `track_company=false` and retains the profile URL.
- Settings seeds Website from the actual `website_url` and saves an edited website plus socials in the same existing PATCH. A failed HTTP/network save retains the draft and does not display Saved or optimistically replace state. Existing mismatched rows remain untouched until a user saves.

Coordinator demo correction through normal UI: open project Settings, expand Jira's link editor, set Website to `https://atlassian.com/software/jira`, and Save links. Reload and confirm the listed website includes the product path. No correction was performed by this task.

Validation: six targeted regressions pass (Jira path/query, edited URL and enrichment fallback, Asana bare domain, disabled/invalid links, company tracking, real schema+setup SQL parameters, Settings PATCH success/failure). Full suite: 308 passed, one pre-existing skipped integration test. Typecheck and build passed. No DB/provider calls, migrations, credentials/configuration changes, production edits, or root-checkout edits. Browser preview QA remains for coordinator.

Rollback: revert the code commit. Saved full URLs remain valid for the existing worker; no data rollback is required.
