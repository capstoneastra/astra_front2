import { useEffect, useMemo, useRef } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { LinkProvider } from "@astryxdesign/core/Link";

/**
 * 로고(ASTRA) 링크(href="/")를 누르면 페이지를 새로 불러오지 않고 앱 안에서 대시보드로 이동한다.
 * 이동은 기록에 쌓이므로 브라우저 뒤로 가기를 누르면 보던 화면으로 돌아간다.
 * 새 탭으로 열기(Ctrl·Cmd·Shift 클릭, 가운데 버튼)는 브라우저 기본 동작 그대로 둔다.
 */
export default function HomeLinkProvider({ onHome, children }: { onHome: () => void; children: ReactNode }) {
  const homeRef = useRef(onHome);
  useEffect(() => { homeRef.current = onHome; }, [onHome]);
  const HomeLink = useMemo(() => function HomeLink({ href, onClick, children: content, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
    return <a href={href} {...props} onClick={(event) => {
      onClick?.(event);
      if (href !== "/" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      homeRef.current();
    }}>{content}</a>;
  }, []);
  return <LinkProvider component={HomeLink}>{children}</LinkProvider>;
}
