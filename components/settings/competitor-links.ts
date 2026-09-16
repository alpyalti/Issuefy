import { trackedWebsite } from "@/lib/tracked-website";

export function competitorLinksDraft(competitor: { website_url: string; socials?: Record<string, string> | null }) {
  // Display what the worker actually tracks, even for legacy mismatched rows.
  return { ...(competitor.socials || {}), website: competitor.website_url };
}

export async function saveCompetitorLinks(id: string, socials: Record<string, string>) {
  const website_url = trackedWebsite(socials.website || "");
  const patch = { website_url, socials: { ...socials, website: website_url } };
  const res = await fetch(`/api/competitors/${id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Couldn't save those links. Please try again.");
  return patch;
}
