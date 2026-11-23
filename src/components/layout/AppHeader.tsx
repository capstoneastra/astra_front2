import { useState } from "react";
import { ArrowLeft, Bell, Menu } from "lucide-react";
import SearchAutocomplete from "../ui/SearchAutocomplete";
import { menuLabel, navigationByRole } from "../../data/navigation";
import { canAccessMenu } from "../../auth/permissions";
import { useAuth } from "../../auth/context";
import ThemeToggle from "../ui/ThemeToggle";
import { useApiQuery } from "../../hooks/useApiQuery";
import { notificationService } from "../../services/notificationService";
import ProfileMenu from "./ProfileMenu";

/**
 * 상단 바: 넓은 장비 검색창 + 알림·테마·내 계정.
 * '워크스페이스 / 화면이름' 경로 표시는 없앴고, 뒤로가기는 메뉴에 없는 하위 화면(비교·내 정보 등)에서만 보인다.
 */
export default function AppHeader({ activeMenu, menuOpen, onMenu, onSearch, onBack, canGoBack, onNotifications, onProfile }) {
  const { user, logout, status } = useAuth();
  const { data: unreadCount } = useApiQuery(notificationService.unreadCount, `notifications-unread:${user.id}`);
  const [date] = useState(() =>
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date()),
  );
  const canSearch = canAccessMenu(user.role, "search");
  // 장비 찾기 화면에는 큰 검색창이 따로 있으므로 상단 검색창은 숨긴다.
  const showSearch = canSearch && activeMenu !== "search";
  const isMenuPage = (navigationByRole[user.role] ?? []).some((item) => item.id === activeMenu);
  const showBack = !isMenuPage && canGoBack;

  return (
    <header className="app-header">
      <div className="app-header__location">
        <button className="icon-button mobile-menu" onClick={onMenu} aria-label="메뉴 열기"
          aria-controls="primary-navigation" aria-expanded={menuOpen}>
          <Menu size={21} />
        </button>
        {showBack && <button type="button" className="header-back" onClick={onBack} title="이전 화면으로">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{menuLabel(user.role, activeMenu) || "이전"}</span>
        </button>}
        {status === "local" && <span className="header-local">미리보기 모드</span>}
      </div>
      <div className="app-header__center">
        {showSearch && <SearchAutocomplete autoFocusKey onPick={(pick) => {
          // 목록에서 고른 장비는 이름 그대로 찾는다(문장 해석 안 함)
          if (pick.kind === "equipment") onSearch(pick.name, { sentence: false, equipmentId: pick.id });
          else if (pick.kind === "text") onSearch(pick.text);
          else if (pick.kind === "testType") onSearch("", { testType: pick.code });
          else onSearch("", { institutionId: pick.id });
        }} />}
      </div>
      <div className="app-header__tools">
        <span className="header-date">{date}</span>
        <button type="button" className="icon-button header-notifications"
          aria-label={unreadCount > 0 ? `업무 알림, 읽지 않은 알림 ${unreadCount}건` : "업무 알림"}
          aria-current={activeMenu === "notifications" ? "page" : undefined} title="업무 알림" onClick={onNotifications}>
          <Bell size={18} aria-hidden="true" />
          {unreadCount > 0 && <span aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </button>
        <ThemeToggle />
        <ProfileMenu user={user} onLogout={logout} onProfile={onProfile} />
      </div>
    </header>
  );
}
