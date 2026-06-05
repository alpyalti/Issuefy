import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Silence the "multiple lockfiles" warning by pinning the workspace root.
  turbopack: { root: __dirname },
  images: {
    // Allow remote logos discovered during website enrichment (og:image / favicons).
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
