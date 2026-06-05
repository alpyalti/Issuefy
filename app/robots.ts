import type { MetadataRoute } from "next";

const SITE = process.env.APP_URL?.replace(/\/+$/, "") || "https://issuefy.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/sign-in", "/sign-up"],
      disallow: [
        "/dashboard",
        "/account",
        "/admin",
        "/upgrade",
        "/onboarding",
        "/api",
        "/unsubscribe",
      ],
    }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
