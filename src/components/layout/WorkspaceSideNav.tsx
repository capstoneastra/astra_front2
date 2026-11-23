import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
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
  return (
    <SideNav
      collapsible={{ hasButton: true, buttonLabel: "메뉴 접기" }}
      header={<SideNavHeading heading="ASTRA" subheading={user.organization?.name ?? "플랫폼 관리자"}
        icon={<Satellite size={22} aria-hidden="true" />} />}
    >
      <SideNavSection title={roleSection[user.role] ?? "메뉴"}>
        {items.map(({ id, label, icon: Icon }) => (
          <SideNavItem key={id} label={label} icon={<Icon size={20} aria-hidden="true" />}
            isSelected={highlighted === id} onClick={() => onNavigate(id)} />
        ))}
      </SideNavSection>
    </SideNav>
  );
}
