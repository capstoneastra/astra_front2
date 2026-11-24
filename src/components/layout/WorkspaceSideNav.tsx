import { useEffect, useMemo, useRef } from "react";
import type { AnchorHTMLAttributes } from "react";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { LinkProvider } from "@astryxdesign/core/Link";
import { Satellite } from "lucide-react";
import { useAuth } from "../../auth/context";
import { navigationByRole, parentMenu } from "../../data/navigation";

const roleSection: Record<string, string> = {
  COMPANY_USER: "시험 맡기기",
  INSTITUTION_MANAGER: "시험 받기",
  ADMIN: "플랫폼 운영",
};

/** 역할별 메뉴(data/navigation.ts)를 Astryx SideNav로 그린다. */
export default function WorkspaceSideNav({ activeMenu, onNavigate }: {
  activeMenu: string;
  onNavigate: (menu: string) => void;
}) {
  const { user } = useAuth();
  const highlighted = parentMenu[activeMenu] ?? activeMenu;
  const items = navigationByRole[user.role] ?? [];
  // 왼쪽 위 ASTRA(로고)를 누르면 대시보드로. 페이지를 새로 불러오지 않고 앱 안에서 이동한다.
  // 이동은 기록에 쌓이므로 브라우저 뒤로 가기를 누르면 보던 화면으로 돌아간다.
  const navigateRef = useRef(onNavigate);
  useEffect(() => { navigateRef.current = onNavigate; }, [onNavigate]);
  const HomeLink = useMemo(() => function HomeLink({ href, onClick, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
    return <a href={href} {...props} onClick={(event) => {
      onClick?.(event);
      if (href !== "/" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      navigateRef.current("home");
    }}>{children}</a>;
  }, []);
  return (
    <LinkProvider component={HomeLink}>
      <SideNav
        collapsible={{ hasButton: true, buttonLabel: "메뉴 접기" }}
        header={<SideNavHeading heading="ASTRA" headingHref="/" subheading={user.organization?.name ?? "플랫폼 관리자"}
          icon={<Satellite size={22} aria-hidden="true" />} />}
      >
        <SideNavSection title={roleSection[user.role] ?? "메뉴"}>
          {items.map(({ id, label, icon: Icon }) => (
            <SideNavItem key={id} label={label} icon={<Icon size={20} aria-hidden="true" />}
              isSelected={highlighted === id} onClick={() => onNavigate(id)} />
          ))}
        </SideNavSection>
      </SideNav>
    </LinkProvider>
  );
}
