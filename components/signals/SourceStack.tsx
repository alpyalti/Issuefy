import type { SourceItem } from "@/lib/types";
import { Favicon } from "./Favicon";

/* Stacked favicons (components.jsx SourceStack). */
export function SourceStack({ sources }: { sources: SourceItem[] }) {
  return (
    <div className="src-stack">
      {sources.slice(0, 3).map((s, i) => (
        <Favicon key={i} s={s} size={24} />
      ))}
      {sources.length > 3 && <span className="favicon more">+{sources.length - 3}</span>}
    </div>
  );
}

export default SourceStack;
