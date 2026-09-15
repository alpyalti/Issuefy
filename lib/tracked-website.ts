import { safeSocialUrl } from "@/lib/social-url";

/** Preserve path, query and case; use the existing website-link safety policy. */
export function trackedWebsite(raw: string): string {
  const url = safeSocialUrl("website", raw);
  if (!url) throw new Error("Enter a valid website URL. Website tracking is required for competitors.");
  return url;
}
