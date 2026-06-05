"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";

/* Keyword chip input with suggestions (modals.jsx ChipInput). */
export function ChipInput({
  items,
  setItems,
  suggestions,
  placeholder,
}: {
  items: string[];
  setItems: (next: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [val, setVal] = useState("");
  function add(label: string) {
    const l = (label || "").trim();
    if (!l) return;
    if (!items.includes(l)) setItems([...items, l]);
    setVal("");
  }
  function remove(l: string) {
    setItems(items.filter((x) => x !== l));
  }
  const rest = suggestions.filter((s) => !items.includes(s));
  return (
    <div className="chipin">
      <div className="chipin-field">
        {items.map((it) => (
          <span className="chip-tok" key={it}>
            {it}
            <button onClick={() => remove(it)} aria-label="Remove"><Icon name="Cancel01Icon" size={12} stroke={2.2} /></button>
          </span>
        ))}
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(val);
            }
          }}
          placeholder={items.length ? "Add another…" : placeholder}
        />
      </div>
      {rest.length > 0 && (
        <div className="chipin-sugg">
          <span className="chipin-sugg-l">Suggested</span>
          {rest.map((s) => (
            <button className="sugg-chip" key={s} onClick={() => add(s)}><Icon name="Add01Icon" size={12} stroke={2.2} />{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ChipInput;
