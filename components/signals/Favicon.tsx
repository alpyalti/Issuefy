"use client";

import { useState } from "react";
import type { SourceItem } from "@/lib/types";

/**
 * Source chip avatar.
 *
 * Tries to render the real favicon via Google's S2 favicon service (free, no
 * key, fast). On image load failure (404 / blocked / no favicon at all), falls
 * back to the color + initials chip — same look as before. The fallback also
 * shows synchronously while the image fetches, so there's no flash of empty.
 *
 * Why Google S2: it follows redirects, returns a valid image for ~every
 * domain, and is CDN-backed. Alternatives (DuckDuckGo's favicon API) work too
 * but S2 has better hit rates on edge domains.
 */
export function Favicon({
  s, size = 22,
}: {
  s: Pick<SourceItem, "color" | "initials" | "name">;
  size?: number;
}) {
  const [imageOk, setImageOk] = useState(true);
  // `s.name` is the domain for real sources (set by /dashboard/[id]/page.tsx).
  // Some legacy paths pass a publication name like "Hacker News" — skip the
  // image attempt for those (no dot = not a domain).
  const isDomain = typeof s.name === "string" && s.name.includes(".");
  const showImage = imageOk && isDomain;

  return (
    <span
      className="favicon"
      style={{
        background: showImage ? "var(--surface-2)" : s.color,
        width: size,
        height: size,
        fontSize: size <= 18 ? 9 : 10,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {showImage && (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.name)}&sz=64`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setImageOk(false)}
          style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
        />
      )}
      {!showImage && s.initials}
    </span>
  );
}

export default Favicon;
