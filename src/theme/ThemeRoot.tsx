import type { ReactNode } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { themes, defaultThemeSlug } from "../astryx-themes";
import { useTheme } from "./useTheme";

/** ASTRA 테마(Astryx) + 기존 라이트/다크 토글을 한곳에서 맞춘다. */
export default function ThemeRoot({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <Theme theme={themes[defaultThemeSlug]} mode={theme === "light" ? "light" : "dark"}>{children}</Theme>;
}
