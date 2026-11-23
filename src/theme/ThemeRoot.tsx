import type { ReactNode } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import koKR from "@astryxdesign/core/locales/ko-KR.generated.js";
import { themes, defaultThemeSlug } from "../astryx-themes";
import { useTheme } from "./useTheme";

/**
 * ASTRA 테마(Astryx) + 기존 라이트/다크 토글을 한곳에서 맞춘다.
 * Astryx 컴포넌트 안의 기본 문구(필수/선택, 본문으로 건너뛰기 등)는 한국어로.
 */
export default function ThemeRoot({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <InternationalizationProvider locale="ko-KR" messages={{ "ko-KR": koKR }}>
      <Theme theme={themes[defaultThemeSlug]} mode={theme === "light" ? "light" : "dark"}>{children}</Theme>
    </InternationalizationProvider>
  );
}
