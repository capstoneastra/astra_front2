import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, Bell, Menu, Search } from "lucide-react";
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
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [date] = useState(() =>
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date()),
  );
  const canSearch = canAccessMenu(user.role, "search");
  // 장비 찾기 화면에는 큰 검색창이 따로 있으므로 상단 검색창은 숨긴다.
  const showSearch = canSearch && activeMenu !== "search";
  const isMenuPage = (navigationByRole[user.role] ?? []).some((item) => item.id === activeMenu);
  const showBack = !isMenuPage && canGoBack;

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && searchInput.current) {
        event.preventDefault();
        searchInput.current.focus();
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(query.trim());
    setQuery("");
    searchInput.current?.blur();
  };

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
      {showSearch && <form className="header-searchbar" role="search" onSubmit={submit}>
        <Search size={17} aria-hidden="true" />
        <label className="sr-only" htmlFor="global-equipment-query">장비 검색</label>
        <input id="global-equipment-query" ref={searchInput} type="text" enterKeyHint="search" autoComplete="off"
          value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="장비명·시험항목 또는 '15kg 진동시험'처럼 문장으로 검색" />
        <kbd aria-hidden="true">Ctrl K</kbd>
      </form>}
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
