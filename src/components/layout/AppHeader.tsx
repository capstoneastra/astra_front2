import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, Command, Menu, Search, X } from "lucide-react";
import { menuLabel } from "../../data/navigation";
import { canAccessMenu } from "../../auth/permissions";
import { Button } from "../ui";
import { useAuth } from "../../auth/context";
import ThemeToggle from "../ui/ThemeToggle";
import { useApiQuery } from "../../hooks/useApiQuery";
import { notificationService } from "../../services/notificationService";
import ProfileMenu from "./ProfileMenu";

export default function AppHeader({ activeMenu, menuOpen, onMenu, onSearch, onBack, canGoBack, onNotifications, onProfile }) {
  const { user, logout, status } = useAuth();
  const { data: unreadCount } = useApiQuery(notificationService.unreadCount, `notifications-unread:${user.id}`);
  const searchDialog = useRef(null);
  const [query, setQuery] = useState("");
  const [date] = useState(() =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).format(new Date()),
  );

  useEffect(() => {
    const shortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && canAccessMenu(user.role, "search")) {
        event.preventDefault();
        if (!searchDialog.current.open) searchDialog.current.showModal();
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [user.role]);

  const submit = (event) => {
    event.preventDefault();
    searchDialog.current.close();
    onSearch(query.trim());
    setQuery("");
  };

  return (
    <header className="app-header">
      <div className="app-header__location">
        <button type="button" className="icon-button workspace-back" aria-label="이전 화면으로" title="이전 화면으로" disabled={!canGoBack} onClick={onBack}><ArrowLeft size={19} /></button>
        <button
          className="icon-button mobile-menu"
          onClick={onMenu}
          aria-label="메뉴 열기"
          aria-controls="primary-navigation"
          aria-expanded={menuOpen}
        >
          <Menu size={21} />
        </button>
        <span className="app-header__workspace">{status === "local" ? "로컬 화면" : "워크스페이스"}</span>
        <span className="breadcrumb-separator">/</span>
        <span>{menuLabel(user.role, activeMenu)}</span>
      </div>
      <div className="app-header__tools">
        {canAccessMenu(user.role, "search") && <button
          className="header-search"
          onClick={() => searchDialog.current.showModal()}
        >
          <Search size={15} />
          <span>장비 검색</span>
          <kbd>
            <Command size={10} /> K
          </kbd>
        </button>}
        <span className="header-date">{date}</span>
        <span className="header-divider" />
        <button
          type="button"
          className="icon-button header-notifications"
          aria-label={unreadCount > 0 ? `업무 알림, 읽지 않은 알림 ${unreadCount}건` : "업무 알림"}
          aria-current={activeMenu === "notifications" ? "page" : undefined}
          title="업무 알림"
          onClick={onNotifications}
        >
          <Bell size={18} aria-hidden="true" />
          {unreadCount > 0 && <span aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </button>
        <ThemeToggle />
        <ProfileMenu user={user} onLogout={logout} onProfile={onProfile} />
      </div>
      <dialog
        className="dialog search-dialog"
        ref={searchDialog}
        onClick={(event) => {
          if (event.target === searchDialog.current)
            searchDialog.current.close();
        }}
        aria-labelledby="search-dialog-title"
      >
        <div className="dialog__heading">
          <div>
            <span className="eyebrow">QUICK SEARCH</span>
            <h2 id="search-dialog-title">어떤 장비를 찾고 계신가요?</h2>
          </div>
          <button
            className="icon-button"
            aria-label="검색 닫기"
            onClick={() => searchDialog.current.close()}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="global-equipment-query">
            장비명, 시험항목 또는 보유기관
          </label>
          <div className="search-field">
            <Search size={19} />
            <input
              id="global-equipment-query"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="장비명, 시험항목, 보유기관을 입력하세요"
            />
          </div>
          <p className="field-hint">
            장비명·모델·시험항목은 서버 q 검색, 기관은 목록에서 선택하거나 검색
            화면의 기관 필터를 사용합니다.
          </p>
          <Button type="submit" icon={Search}>
            장비 검색하기
          </Button>
        </form>
      </dialog>
    </header>
  );
}
