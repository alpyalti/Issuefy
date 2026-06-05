import type { Config } from "tailwindcss";

/**
 * Tailwind is used for layout + net-new components only. It references the same
 * CSS custom properties defined in app/globals.css (ported from the design
 * system's tokens.css), so utilities stay visually native to the provided design.
 * The prototype's component CSS classes (.btn, .card, .signal, .pill, …) live in
 * the global stylesheets and are NOT re-expressed as utilities.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        "ink-4": "var(--ink-4)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        "line-strong": "var(--line-strong)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        "accent-700": "var(--accent-700)",
        "accent-bg": "var(--accent-bg)",
        "accent-bg-2": "var(--accent-bg-2)",
        pos: "var(--pos)",
        "pos-bg": "var(--pos-bg)",
        "pos-line": "var(--pos-line)",
        warn: "var(--warn)",
        "warn-bg": "var(--warn-bg)",
        "warn-line": "var(--warn-line)",
        neg: "var(--neg)",
        "neg-bg": "var(--neg-bg)",
        "neg-line": "var(--neg-line)",
        info: "var(--info)",
        "info-bg": "var(--info-bg)",
      },
      borderRadius: {
        xs: "var(--r-xs)",
        sm: "var(--r-sm)",
        DEFAULT: "var(--r)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
        pill: "var(--r-pill)",
      },
      fontFamily: {
        serif: "var(--serif)",
        sans: "var(--sans)",
        mono: "var(--mono)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        lg: "var(--shadow-lg)",
      },
      maxWidth: {
        wrap: "var(--maxw)",
      },
    },
  },
  plugins: [],
};

export default config;
