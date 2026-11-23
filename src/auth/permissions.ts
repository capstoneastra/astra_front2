import type { User } from "../services/authService";

const company = ["COMPANY_USER"];
const institution = ["INSTITUTION_MANAGER"];
const admin = ["ADMIN"];
const everyone = [...company, ...institution, ...admin];

/*
 * 역할별로 쓰는 화면만 연다. 메뉴에 없는 화면도 여기서 막는다.
 * 기업 = 맡기는 쪽, 기관·대학 = 받는 쪽, 관리자 = 승인·데이터 관리.
 */
export const menuPermissions: Record<string, string[]> = {
  home: everyone,
  notifications: everyone,
  // 맡기는 쪽 (기업)
  request: company,
  sent: company,
  testInfo: company,
  compare: company,
  chatbot: company,
  assistant: company,
  autopilot: company,
  // 장비 조회: 기업은 의뢰할 장비 찾기, 관리자는 데이터 확인
  search: [...company, ...admin],
  // 받는 쪽 (기관·대학) + 관리자는 전체
  received: [...institution, ...admin],
  equipment: [...institution, ...admin],
  simulation: [...institution, ...admin],
  // 일정: 기업은 내 의뢰의 일정, 기관은 받은 의뢰의 일정
  calendar: everyone,
  // 관리자
  admin,
  duplicates: admin,
};

export const canAccessMenu = (role: string, menu: string) =>
  menuPermissions[menu]?.includes(role) === true;

export function ownsOrganization(user: User, organizationId?: number | null) {
  return organizationId != null && user.organization?.id === organizationId;
}
