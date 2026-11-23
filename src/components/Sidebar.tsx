import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { navigation, parentMenu } from "../data/navigation";
import { useAuth } from "../auth/context";
import { canOpenMenu } from "../auth/permissions";
import { roleLabels } from "../domain/constants";
import AstraBrand from "./ui/AstraBrand";

export default function Sidebar({
  ownsEquipment,
  activeMenu,
  setActiveMenu,
  open,
  onClose,
  collapsed,
  onToggleCollapse,
  blocked = false,
}: {
  ownsEquipment: boolean;
  activeMenu: string;
  setActiveMenu: (menu: string) => void;
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  blocked?: boolean;
}) {
  const sidebar = useRef<HTMLElement>(null);
  const hintTimer = useRef<number>();
  const [hint, setHint] = useState<{ label: string; top: number } | null>(null);
  const hideHint = useCallback(() => {
    window.clearTimeout(hintTimer.current);
    setHint(null);
  }, []);
  const { user } = useAuth();
  const collapseLabel = collapsed ? "사이드바 펼치기" : "사이드바 접기";
  const highlighted = parentMenu[activeMenu] ?? activeMenu;
  const visibleNavigation = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canOpenMenu(user.role, item.id, ownsEquipment)),
    }))
    .filter((group) => group.items.length);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const element = sidebar.current;
    element.querySelector("button").focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const items = [
        ...element.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      ].filter((item) => item.getClientRects().length);
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = oldOverflow;
      const returnFocus =
        previous === document.body
          ? document.querySelector(".mobile-menu")
          : previous;
      if (returnFocus instanceof HTMLElement) returnFocus.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!collapsed || open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") hideHint(); };
    window.addEventListener("resize", hideHint);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(hintTimer.current);
      window.removeEventListener("resize", hideHint);
      document.removeEventListener("keydown", onKey);
    };
  }, [collapsed, open, hideHint]);

  const showHint = (button: HTMLButtonElement, label: string, keyboard = false) => {
    if (!collapsed || open) return;
    hideHint();
    const show = () => {
      const { top, height } = button.getBoundingClientRect();
      setHint({ label, top: Math.max(18, Math.min(window.innerHeight - 18, top + height / 2)) });
    };
    if (keyboard) show();
    else hintTimer.current = window.setTimeout(show, 320);
  };

  return (
    <>
      {open && (
        <button
          className="sidebar-backdrop"
          aria-label="메뉴 닫기"
          tabIndex={-1}
          onClick={onClose}
        />
      )}
      <aside
        ref={(node) => {
          sidebar.current = node;
          if (node) node.inert = blocked;
        }}
        id="primary-navigation"
        className={`sidebar ${open ? "sidebar--open" : ""}`}
        aria-label="주 메뉴"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
      >
        <div className="sidebar__brand-row">
          <button
            type="button"
            className="brand"
            onClick={() => setActiveMenu("home")}
            aria-label="ASTRA 대시보드"
          >
            <AstraBrand />
          </button>
          <button
            className="icon-button sidebar__close"
            aria-label="메뉴 닫기"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <div className="sidebar__section">
          <div>
            <div className="workspace-label">
              <span className="workspace-label__icon">A</span>
              <div>시험장비 공동활용<span>통합 워크스페이스</span></div>
              <span className="workspace-label__dot" />
            </div>
          </div>
        </div>
        <nav id="sidebar-navigation" className="sidebar__nav" aria-label="서비스 메뉴" onScroll={hideHint}>
          {visibleNavigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="sidebar__section">
                <div><p className="nav-group__label">{group.label}</p></div>
              </div>
              {group.items.map(({ id, label, icon: Icon, upcoming }) => (
                <button
                  key={id}
                  type="button"
                  disabled={upcoming}
                  onClick={() => { hideHint(); setActiveMenu(id); }}
                  onMouseEnter={(event) => showHint(event.currentTarget, label)}
                  onMouseLeave={hideHint}
                  onFocus={(event) => {
                    if (event.currentTarget.matches(":focus-visible")) showHint(event.currentTarget, label, true);
                  }}
                  onBlur={hideHint}
                  className={`nav-item ${highlighted === id ? "nav-item--active" : ""}`}
                  aria-current={highlighted === id ? "page" : undefined}
                  aria-label={upcoming ? `${label} · 준비 중` : label}
                >
                  <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                  <span>{label}</span>
                  {upcoming && <small>예정</small>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar__bottom">
          <div className="sidebar__footer">
            <span className="status-dot" />
            {roleLabels[user.role] ?? user.role}
            <span>v0.1</span>
          </div>
          <button type="button" className="icon-button sidebar__collapse" aria-label={collapseLabel}
            aria-expanded={!collapsed} aria-controls="sidebar-navigation"
            onClick={() => { hideHint(); onToggleCollapse(); }}>
            {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
        </div>
        {hint && collapsed && !open && (
          <span key={hint.label} className="sidebar__hint" style={{ top: hint.top }} aria-hidden="true">{hint.label}</span>
        )}
      </aside>
    </>
  );
}
