# Pending sign-in continuation

Base `87ed908`. A non-complete custom password attempt navigated to `/sign-in/continue`, which was handled by the password form catch-all and displayed a blank form again.

A dedicated static continuation page now mounts Clerk's supported `SignIn` component. Hash routing keeps its verification substeps on that page. It shares the existing root ClerkProvider/client attempt, and delegates factor verification and required session tasks to Clerk. The custom form only calls setActive for a complete attempt. Validated plan/billing hints survive both the continuation handoff and configured completion/signup destinations. No verification is disabled or replaced.

Installed SDK types confirm SignIn routing/forceRedirectUrl/signUpForceRedirectUrl props. Primary documentation: https://clerk.com/docs/js-frontend/reference/components/authentication/sign-in and https://clerk.com/docs/guides/how-clerk-works/routing .

Four focused tests pass: non-complete first-factor, second-factor and new-password handoffs never activate a session; the actual continuation page mounts Clerk UI with hash routing and preserved destinations. `npm run typecheck` passes. Tests mock Clerk and do not prove hosted factor delivery or resumed attempt behavior; coordinator must retry the hosted journey before release. No credentials, live provider calls, DB writes or environment changes were used.
