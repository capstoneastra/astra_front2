import {
  CalendarDays,
  ClipboardList,
  Copy,
  Database,
  Inbox,
  LayoutDashboard,
  Send,
  ShieldCheck,
  Telescope,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
  upcoming?: boolean;
}

/*
 * 역할마다 하는 일이 다르므로 메뉴를 역할별로 따로 둔다.
 * - 기업: 시험을 맡기는 쪽 (장비 찾기 → 의뢰 → 결과 받기)
 * - 기관·대학: 시험을 받는 쪽 (받은 의뢰 처리 → 결과 등록, 우리 장비 관리)
 * - 관리자: 승인·데이터 관리·전체 현황
 */
export const navigationByRole: Record<string, NavigationItem[]> = {
  COMPANY_USER: [
    { id: "home", label: "대시보드", icon: LayoutDashboard },
    { id: "request", label: "시험 맡기기", icon: Send },
    { id: "search", label: "장비 찾기", icon: Telescope },
    { id: "sent", label: "내 의뢰", icon: ClipboardList },
  ],
  INSTITUTION_MANAGER: [
    { id: "home", label: "대시보드", icon: LayoutDashboard },
    { id: "received", label: "받은 의뢰", icon: Inbox },
    { id: "calendar", label: "시험 일정", icon: CalendarDays },
    { id: "equipment", label: "우리 장비", icon: Database },
  ],
  ADMIN: [
    { id: "home", label: "대시보드", icon: LayoutDashboard },
    { id: "admin", label: "회원·기관 승인", icon: ShieldCheck },
    { id: "received", label: "전체 의뢰", icon: ClipboardList },
    { id: "equipment", label: "장비 데이터 관리", icon: Database },
    { id: "duplicates", label: "중복·유사 장비", icon: Copy },
    { id: "search", label: "장비 조회", icon: Telescope },
  ],
};

const commonLabels: Record<string, string> = {
  compare: "장비 비교",
  testInfo: "시험 정보 안내",
  simulation: "가상 시뮬레이션",
  calendar: "시험 일정",
  notifications: "업무 알림",
};

/** 화면 이름 (헤더 위치 표시용). 같은 화면도 역할에 따라 이름이 다르다. */
export function menuLabel(role: string, menu: string) {
  return navigationByRole[role]?.find((item) => item.id === menu)?.label ?? commonLabels[menu] ?? "";
}

// 메뉴에 없는 화면이 사이드바에서 어느 메뉴 아래로 표시되는지
export const parentMenu: Record<string, string> = {
  compare: "search",
  testInfo: "request",
  simulation: "equipment",
};

// 예전 해시 주소(#/reservationCheck 등)를 새 화면으로 넘긴다. 북마크가 깨지지 않게 하기 위함.
export const legacyMenus: Record<string, string> = {
  reservationCheck: "sent",
  review: "received",
  manager: "equipment",
  matching: "request",
  reservation: "request",
};
