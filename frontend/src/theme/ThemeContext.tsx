import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { palette, spacing, radius, type as typography, softShadow, ColorMode } from "./tokens";

type Colors = { [K in keyof typeof palette]: string };

type ThemeContextValue = {
  mode: ColorMode;
  colors: Colors;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof typography;
  shadow: (level?: 1 | 2 | 3) => ReturnType<typeof softShadow>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const mode: ColorMode = scheme === "dark" ? "dark" : "light";

  const value = useMemo<ThemeContextValue>(() => {
    const colors = Object.keys(palette).reduce((acc, key) => {
      acc[key as keyof typeof palette] = palette[key as keyof typeof palette][mode];
      return acc;
    }, {} as Colors);

    return {
      mode,
      colors,
      spacing,
      radius,
      type: typography,
      shadow: (level: 1 | 2 | 3 = 2) => softShadow(mode, level),
    };
  }, [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
