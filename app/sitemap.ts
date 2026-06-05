import type { MetadataRoute } from "next";

const SITE = process.env.APP_URL?.replace(/\/+$/, "") || "https://issuefy.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`,         changeFrequency: "weekly",  priority: 1.0 },
    { url: `${SITE}/sign-up`,  changeFrequency: "yearly",  priority: 0.6 },
    { url: `${SITE}/sign-in`,  changeFrequency: "yearly",  priority: 0.4 },
  ];
}
