import { useEffect, useId, useRef, useState } from "react";
import { LogOut, UserRoundPen } from "lucide-react";
import { roleLabels } from "../../domain/constants";
import type { User } from "../../services/authService";

/** 아바타를 누르면 '내 정보 수정'과 '로그아웃'이 나온다. 정보 수정은 별도 화면(#/profile)에서. */
export default function ProfileMenu({ user, onLogout, onProfile }: {
  user: User;
  onLogout: () => Promise<void>;
  onProfile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const account = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const role = user.organization?.orgType === "UNIVERSITY" && user.role === "INSTITUTION_MANAGER"
    ? "대학 담당자" : roleLabels[user.role];

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !account.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return <div className="header-account" ref={account}
    onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}
    onKeyDown={(event) => {
      if (event.key !== "Escape" || !open) return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }}>
    <button type="button" ref={trigger} className="user-avatar" title="내 계정" aria-label="내 계정 메뉴"
      aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>
      {user.name?.slice(0, 1) || "A"}
    </button>
    <div className="header-account__panel" id={menuId} hidden={!open}>
      <div className="header-account__who">
        <strong>{user.name}</strong>
        <span>{user.email}</span>
        <span>{role} · {user.organization?.name ?? "플랫폼"}</span>
      </div>
      <div className="header-account__actions">
        <button type="button" className="header-account__action" onClick={() => { setOpen(false); onProfile(); }}>
          <UserRoundPen size={16} aria-hidden="true" />
          내 정보 수정
        </button>
        <button type="button" className="header-account__action header-account__action--logout" onClick={() => {
          setOpen(false);
          void onLogout();
        }}>
          <LogOut size={16} aria-hidden="true" />
          로그아웃
        </button>
      </div>
    </div>
  </div>;
}
