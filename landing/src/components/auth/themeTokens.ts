/**
 * Single source of truth for whitelabel theme tokens used by the login screen.
 *
 * Adding a new color is a one-line change here — the form, the CSS variable
 * map, and consumer components all iterate over this list.
 */

export type ThemeTokenGroup = "Backgrounds" | "Text" | "Inputs" | "Buttons";

export interface ThemeTokenDef {
  /** Stable key persisted inside home_config.colors */
  key: string;
  /** Human label shown in the customisation form */
  label: string;
  /** CSS custom property name (without --) exposed on the login wrapper */
  cssVar: string;
  /** Default hex color */
  default: string;
  /** UI grouping in the form */
  group: ThemeTokenGroup;
}

export const THEME_TOKENS: readonly ThemeTokenDef[] = [
  // ── Backgrounds ──────────────────────────────────────────────────────────
  { key: "leftPanelBg",   label: "Left panel",   cssVar: "lp-bg-left",   default: "#000000", group: "Backgrounds" },
  { key: "rightPanelBg",  label: "Right panel",  cssVar: "lp-bg-right",  default: "#000000", group: "Backgrounds" },
  { key: "cardBg",        label: "Feature card", cssVar: "lp-bg-card",   default: "#0a0a0a", group: "Backgrounds" },

  // ── Text ─────────────────────────────────────────────────────────────────
  { key: "headlineText",  label: "Headline",       cssVar: "lp-text-headline",   default: "#ffffff", group: "Text" },
  { key: "cardTitleText", label: "Card title",     cssVar: "lp-text-card-title", default: "#ffffff", group: "Text" },
  { key: "cardBodyText",  label: "Card body",      cssVar: "lp-text-card-body",  default: "#9ca3af", group: "Text" },
  { key: "footerText",    label: "Footer text",    cssVar: "lp-text-footer",     default: "#9ca3af", group: "Text" },

  // ── Inputs ───────────────────────────────────────────────────────────────
  { key: "inputLabel",  label: "Input label",      cssVar: "lp-input-label",  default: "#d1d5db", group: "Inputs" },
  { key: "inputBg",     label: "Input background", cssVar: "lp-input-bg",     default: "#0f0f0f", group: "Inputs" },
  { key: "inputBorder", label: "Input border",     cssVar: "lp-input-border", default: "#262626", group: "Inputs" },
  { key: "inputText",   label: "Input text",       cssVar: "lp-input-text",   default: "#ffffff", group: "Inputs" },
  { key: "dropdownBg",  label: "Dropdown bg",      cssVar: "lp-dropdown-bg",  default: "#0f0f0f", group: "Inputs" },
  { key: "dropdownText",label: "Dropdown text",    cssVar: "lp-dropdown-text",default: "#ffffff", group: "Inputs" },

  // ── Buttons ──────────────────────────────────────────────────────────────
  { key: "primaryButtonBg",   label: "Primary button bg",   cssVar: "lp-btn-primary-bg",   default: "#4f46e5", group: "Buttons" },
  { key: "primaryButtonText", label: "Primary button text", cssVar: "lp-btn-primary-text", default: "#ffffff", group: "Buttons" },
  { key: "secondaryButtonBg",   label: "Secondary button bg",   cssVar: "lp-btn-secondary-bg",   default: "#1a1a1a", group: "Buttons" },
  { key: "secondaryButtonText", label: "Secondary button text", cssVar: "lp-btn-secondary-text", default: "#ffffff", group: "Buttons" },
] as const;

export type ThemeColorKey = typeof THEME_TOKENS[number]["key"];
export type ThemeColors = Record<ThemeColorKey, string>;

/** Build the default colors map from the registry. */
export function defaultThemeColors(): ThemeColors {
  return THEME_TOKENS.reduce((acc, t) => {
    acc[t.key as ThemeColorKey] = t.default;
    return acc;
  }, {} as ThemeColors);
}

/** Merge persisted colors with defaults so missing keys are filled in. */
export function resolveThemeColors(persisted?: Partial<ThemeColors> | null): ThemeColors {
  const base = defaultThemeColors();
  if (!persisted) return base;
  for (const t of THEME_TOKENS) {
    const v = persisted[t.key as ThemeColorKey];
    if (typeof v === "string" && v.length > 0) {
      base[t.key as ThemeColorKey] = v;
    }
  }
  return base;
}

/** Generate the inline `style` map of CSS custom properties for the wrapper. */
export function themeCssVars(colors: ThemeColors): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of THEME_TOKENS) {
    out[`--${t.cssVar}`] = colors[t.key as ThemeColorKey];
  }
  return out;
}

/** Convenience: `var(--lp-bg-left)` etc. */
export function v(key: ThemeColorKey): string {
  const def = THEME_TOKENS.find((t) => t.key === key);
  return def ? `var(--${def.cssVar})` : "";
}
