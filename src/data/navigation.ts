import {
  LayoutDashboard,
  Send,
  Telescope,
  ClipboardList,
  Inbox,
  Database,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
  upcoming?: boolean;
}

// 메뉴는 사용자가 하려는 일 기준으로 나눈다. 누가 볼 수 있는지는 auth/permissions.ts가 정한다.
export const navigation: { label: string; items: NavigationItem[] }[] = [
  {
    label: "시험 맡기기",
    items: [
      { id: "home", label: "대시보드", icon: LayoutDashboard },
      { id: "request", label: "시험 맡기기", icon: Send },
      { id: "search", label: "장비 찾기", icon: Telescope },
      { id: "sent", label: "내 의뢰", icon: ClipboardList },
    ],
  },
  {
    label: "시험 받기",
    items: [
      { id: "received", label: "받은 의뢰", icon: Inbox },
      { id: "equipment", label: "우리 장비", icon: Database },
    ],
  },
  {
    label: "운영",
    items: [{ id: "admin", label: "관리", icon: ShieldCheck }],
  },
];

export const menuLabels: Record<string, string> = {
  ...Object.fromEntries(navigation.flatMap((group) =>
    group.items.map((item) => [item.id, item.label]),
  )),
  compare: "장비 비교",
  testInfo: "시험 정보 안내",
  duplicates: "중복·유사 장비 조회",
  simulation: "가상 시뮬레이션",
  calendar: "일정 보기",
  notifications: "업무 알림",
};

// 메뉴에 없는 화면이 사이드바에서 어느 메뉴 아래로 표시되는지
export const parentMenu: Record<string, string> = {
  compare: "search",
  testInfo: "request",
  duplicates: "admin",
  simulation: "equipment",
  calendar: "sent",
};

// 예전 해시 주소(#/reservationCheck 등)를 새 화면으로 넘긴다. 북마크가 깨지지 않게 하기 위함.
export const legacyMenus: Record<string, string> = {
  reservationCheck: "sent",
  review: "received",
  manager: "equipment",
  matching: "request",
  reservation: "request",
};
