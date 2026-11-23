import type { User } from "../services/authService";

const everyone = ["COMPANY_USER", "INSTITUTION_MANAGER", "ADMIN"];

// 역할로 막는 화면. 장비 보유 여부로 갈리는 화면은 providerMenus에서 한 번 더 거른다.
export const menuPermissions = {
  home: everyone,
  request: everyone,
  search: everyone,
  sent: everyone,
  received: everyone,
  equipment: everyone,
  compare: everyone,
  testInfo: everyone,
  simulation: everyone,
  calendar: everyone,
  notifications: everyone,
  chatbot: everyone,
  assistant: everyone,
  autopilot: everyone,
  duplicates: ["ADMIN"],
  admin: ["ADMIN"],
};

// 장비를 가진 조직(또는 관리자)만 보는 화면
export const providerMenus = ["received", "equipment"];

export const canAccessMenu = (role: string, menu: string) =>
  menuPermissions[menu]?.includes(role) === true;

export const canOpenMenu = (role: string, menu: string, ownsEquipment: boolean) =>
  canAccessMenu(role, menu) &&
  (!providerMenus.includes(menu) || role === "ADMIN" || ownsEquipment);

export function ownsOrganization(user: User, organizationId?: number | null) {
  return organizationId != null && user.organization?.id === organizationId;
}
