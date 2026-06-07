"use client";

import { TARGET_MARKETS, isKnownMarketValue } from "@/lib/markets";

/**
 * Target-market dropdown.
 *
 * Single source of truth for which markets exist is `lib/markets.ts`. This
 * component reads `TARGET_MARKETS` and groups them into <optgroup>s:
 *   - Global       (one entry — "Global")
 *   - Regions      (continents + a couple of business sub-regions)
 *   - Countries    (~50, alphabetical within the registry)
 *
 * Legacy values:
 *   When the saved value isn't in TARGET_MARKETS (because the project was
 *   created before this dropdown existed and the user typed free text),
 *   we surface the saved value as a disabled "(legacy — please re-select)"
 *   option at the top so the user can see what was there before. Picking
 *   any real option replaces it.
 *
 * Style: reuses `.modal-input` from app/dashboard.css to match the surrounding
 * form fields. Native <select> for a11y + iOS picker + zero deps.
 */
interface Props {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  required?: boolean;
  className?: string;
}

export function MarketSelect({
  value,
  onChange,
  id,
  required,
  className = "modal-input",
}: Props) {
  const globals  = TARGET_MARKETS.filter((m) => m.group === "global");
  const regions  = TARGET_MARKETS.filter((m) => m.group === "region");
  const countries = TARGET_MARKETS.filter((m) => m.group === "country");

  // If the saved value is a legacy free-text string, show it as a disabled
  // option so the user understands what's been replaced.
  const known = isKnownMarketValue(value);

  return (
    <select
      id={id}
      className={className}
      value={known ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      style={{ paddingRight: 18, cursor: "pointer" }}
    >
      <option value="" disabled>
        {value && !known ? `Legacy: "${value}" — please re-select` : "Select a target market"}
      </option>
      <optgroup label="Global">
        {globals.map((m) => (
          <option key={m.value} value={m.value}>{m.canonicalName}</option>
        ))}
      </optgroup>
      <optgroup label="Regions">
        {regions.map((m) => (
          <option key={m.value} value={m.value}>{m.canonicalName}</option>
        ))}
      </optgroup>
      <optgroup label="Countries">
        {countries.map((m) => (
          <option key={m.value} value={m.value}>{m.canonicalName}</option>
        ))}
      </optgroup>
    </select>
  );
}
