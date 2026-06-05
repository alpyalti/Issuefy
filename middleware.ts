import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Clerk middleware.
 *
 * - Protects /dashboard/** and the authenticated /api/** routes.
 * - Leaves the landing page (/), sign-in/sign-up, and webhook-style endpoints public:
 *   /api/cron/** and /api/internal/** are guarded by their own secrets (CRON_SECRET,
 *   INTERNAL_WORKER_SECRET) rather than by Clerk session, so we explicitly exempt them.
 *
 * Per the PRD (§10.4) and validated guidance, `clerkMiddleware()` is the current
 * App Router primitive; route protection is opt-in via createRouteMatcher.
 */
const isProtected = createRouteMatcher([
  "/dashboard(.*)",
  "/onboarding(.*)",
  "/api/projects(.*)",
  "/api/competitors(.*)",
  "/api/keywords(.*)",
  "/api/signals(.*)",
  "/api/enrich(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and all static assets, unless inside an API route.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|mp3|map)).*)",
    // Always run for API and TRPC routes.
    "/(api|trpc)(.*)",
  ],
};
