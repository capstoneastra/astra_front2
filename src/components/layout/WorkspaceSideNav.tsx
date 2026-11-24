import { useState } from "react";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { useAuth } from "../../auth/context";
import { navigationByRole, parentMenu } from "../../data/navigation";

const roleSection: Record<string, string> = {
  COMPANY_USER: "시험 맡기기",
  INSTITUTION_MANAGER: "시험 받기",
  ADMIN: "플랫폼 운영",
};

/** 접어 둔 상태는 이 브라우저에 기억한다 (새로고침·다시 로그인해도 유지). 저장소를 못 쓰면 펼친 상태로. */
const COLLAPSE_KEY = "astra.side-nav.collapsed";
const readCollapsed = () => {
  try { return window.localStorage.getItem(COLLAPSE_KEY) === "true"; } catch { return false; }
};
const saveCollapsed = (value: boolean) => {
  try { window.localStorage.setItem(COLLAPSE_KEY, String(value)); } catch { /* 저장 못 해도 동작은 같다 */ }
};

/**
 * 역할별 메뉴(data/navigation.ts)를 Astryx SideNav로 그린다. 로고는 상단 바(AppHeader)에 있다.
 * 맨 아래 버튼으로 접으면 아이콘만 남는 좁은 막대가 되고(본문이 그만큼 넓어짐), 다시 누르면 펼쳐진다.
 */
export default function WorkspaceSideNav({ activeMenu, onNavigate }: {
  activeMenu: string;
  onNavigate: (menu: string) => void;
}) {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const highlighted = parentMenu[activeMenu] ?? activeMenu;
  const items = navigationByRole[user.role] ?? [];
  return (
    // 테마의 메뉴 폭(188px)이 접힌 상태에도 걸리므로, 접힘 여부를 바깥에 표시해 폭을 바꾼다 (display: contents라 배치에는 영향 없음)
    <span className="side-nav-frame" data-collapsed={collapsed}>
      <SideNav collapsible={{
        hasButton: true,
        buttonLabel: collapsed ? "메뉴 펼치기" : "메뉴 접기",
        isCollapsed: collapsed,
        onCollapsedChange: (next) => { setCollapsed(next); saveCollapsed(next); },
      }}>
        <SideNavSection title={roleSection[user.role] ?? "메뉴"}>
          {items.map(({ id, label, icon: Icon }) => (
            <SideNavItem key={id} label={label} icon={<Icon size={20} aria-hidden="true" />}
              isSelected={highlighted === id} onClick={() => onNavigate(id)} />
          ))}
        </SideNavSection>
      </SideNav>
    </span>
  );
}
