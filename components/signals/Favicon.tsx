import type { SourceItem } from "@/lib/types";

export function Favicon({ s, size = 22 }: { s: Pick<SourceItem, "color" | "initials">; size?: number }) {
  return (
    <span
      className="favicon"
      style={{ background: s.color, width: size, height: size, fontSize: size <= 18 ? 9 : 10 }}
    >
      {s.initials}
    </span>
  );
}

export default Favicon;
