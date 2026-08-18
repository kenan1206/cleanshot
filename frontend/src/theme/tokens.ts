// Design tokens for CleanU — Apple Glass Design System
// All colors, spacing, radius, shadow, typography live here. Never hardcode hex in components.

export type ColorMode = "light" | "dark";

type Duo = { light: string; dark: string };

export const palette: Record<string, Duo> = {
  surface: { light: "#F2F2F7", dark: "#000000" },
  onSurface: { light: "#000000", dark: "#FFFFFF" },
  surfaceSecondary: { light: "#FFFFFF", dark: "#1C1C1E" },
  onSurfaceSecondary: { light: "#1C1C1E", dark: "#F2F2F7" },
  surfaceTertiary: { light: "#E5E5EA", dark: "#2C2C2E" },
  onSurfaceTertiary: { light: "#3A3A3C", dark: "#EBEBF5" },
  surfaceInverse: { light: "#000000", dark: "#FFFFFF" },
  onSurfaceInverse: { light: "#FFFFFF", dark: "#000000" },
  brand: { light: "#007AFF", dark: "#0A84FF" },
  brandPrimary: { light: "#007AFF", dark: "#0A84FF" },
  onBrandPrimary: { light: "#FFFFFF", dark: "#FFFFFF" },
  brandSecondary: { light: "#E5F0FF", dark: "#004080" },
  onBrandSecondary: { light: "#007AFF", dark: "#66B2FF" },
  brandTertiary: { light: "#F0F8FF", dark: "#00264D" },
  onBrandTertiary: { light: "#005BB5", dark: "#99CCFF" },
  success: { light: "#34C759", dark: "#30D158" },
  onSuccess: { light: "#FFFFFF", dark: "#FFFFFF" },
  warning: { light: "#FF9500", dark: "#FF9F0A" },
  onWarning: { light: "#FFFFFF", dark: "#FFFFFF" },
  error: { light: "#FF3B30", dark: "#FF453A" },
  onError: { light: "#FFFFFF", dark: "#FFFFFF" },
  info: { light: "#5AC8FA", dark: "#64D2FF" },
  onInfo: { light: "#FFFFFF", dark: "#000000" },
  border: { light: "#C6C6C8", dark: "#38383A" },
  borderStrong: { light: "#AEAEB2", dark: "#48484A" },
  divider: { light: "#E5E5EA", dark: "#2C2C2E" },
  categoryBlue: { light: "#007AFF", dark: "#0A84FF" },
  categoryPurple: { light: "#AF52DE", dark: "#BF5AF2" },
  categoryOrange: { light: "#FF9500", dark: "#FF9F0A" },
  categoryTeal: { light: "#5AC8FA", dark: "#64D2FF" },
  categoryPink: { light: "#FF375F", dark: "#FF375F" },
  categoryGreen: { light: "#34C759", dark: "#30D158" },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const type = {
  hero: { fontSize: 44, lineHeight: 48, fontWeight: "800" as const, letterSpacing: -1.5 },
  h1: { fontSize: 34, lineHeight: 40, fontWeight: "800" as const, letterSpacing: -1 },
  h2: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, letterSpacing: -0.6 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700" as const, letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "500" as const },
  bodyRegular: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "500" as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const, letterSpacing: 0.4 },
};

export function resolveColor(name: keyof typeof palette, mode: ColorMode): string {
  return palette[name][mode];
}

// Soft, wide shadow (iOS style)
export function softShadow(mode: ColorMode, level: 1 | 2 | 3 = 2) {
  const opacityLight = level === 1 ? 0.05 : level === 2 ? 0.08 : 0.12;
  const opacityDark = level === 1 ? 0.35 : level === 2 ? 0.5 : 0.65;
  return {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: level * 4 },
    shadowOpacity: mode === "light" ? opacityLight : opacityDark,
    shadowRadius: level * 8,
    elevation: level * 3,
  };
}
