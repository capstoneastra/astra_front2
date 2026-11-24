import { TopNav } from "@astryxdesign/core/TopNav";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { HStack } from "@astryxdesign/core/HStack";
import { Avatar } from "@astryxdesign/core/Avatar";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { ArrowLeft, Bell, LogOut, Moon, Sun, UserRoundPen } from "lucide-react";
import { menuLabel, navigationByRole } from "../../data/navigation";
import { canAccessMenu } from "../../auth/permissions";
import { useAuth } from "../../auth/context";
import { useTheme } from "../../theme/useTheme";
import { useApiQuery } from "../../hooks/useApiQuery";
import { notificationService } from "../../services/notificationService";
import { roleLabels } from "../../domain/constants";
import { notificationTypeLabels, useOpenNotification } from "../../domain/notifications";
import SearchAutocomplete from "../ui/SearchAutocomplete";
import type { SearchPick } from "../ui/SearchAutocomplete";
import { formatAgo } from "../../domain/format";

/**
 * 상단 바(Astryx TopNav): 가운데 장비 검색(자동완성), 오른쪽 알림·테마·내 계정.
 * 뒤로가기는 메뉴에 없는 하위 화면(비교·내 정보 등)에서만 보인다.
 */
export default function AppHeader({ activeMenu, onSearch, onBack, canGoBack, onNotifications, onProfile, onOpenRequest }: {
  activeMenu: string;
  onSearch: (query: string, options?: { institutionId?: number; testType?: string; sentence?: boolean; equipmentId?: number }) => void;
  onBack: () => void;
  canGoBack: boolean;
  onNotifications: () => void;
  onProfile: () => void;
  onOpenRequest: (requestId: number) => void;
}) {
  const { user, logout, status } = useAuth();
  const { theme, toggleTheme } = useTheme();
  // 안 읽은 알림 개수는 1분마다 다시 확인한다
  const { data: unreadCount } = useApiQuery(notificationService.unreadCount, `notifications-unread:${user.id}`, true, () => 60_000);
  const recent = useApiQuery((signal) => notificationService.list({ size: 6 }, signal), `notifications-recent:${user.id}`);
  const openNotification = useOpenNotification(onOpenRequest);
  // 기업 대시보드는 큰 탐색창이 검색을 대신하므로 위쪽 검색창을 숨긴다
  const showSearch = canAccessMenu(user.role, "search") && activeMenu !== "search" &&
    !(activeMenu === "home" && user.role === "COMPANY_USER");
  const isMenuPage = (navigationByRole[user.role] ?? []).some((item) => item.id === activeMenu);
  const role = user.organization?.orgType === "UNIVERSITY" && user.role === "INSTITUTION_MANAGER" ? "대학 담당자" : roleLabels[user.role];
  const pick = (choice: SearchPick) => {
    // 목록에서 고른 장비는 이름 그대로 찾고 상세를 연다
    if (choice.kind === "equipment") onSearch(choice.name, { sentence: false, equipmentId: choice.id });
    else if (choice.kind === "text") onSearch(choice.text);
    else if (choice.kind === "testType") onSearch("", { testType: choice.code });
    else onSearch("", { institutionId: choice.id });
  };
  const unread = Number(unreadCount ?? 0);

  return (
    <TopNav
      label="상단 메뉴"
      startContent={<HStack gap={2} vAlign="center">
        {!isMenuPage && canGoBack && <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />}
          label={menuLabel(user.role, activeMenu) || "이전"} onClick={onBack} />}
        {status === "local" && <Badge variant="warning" label="미리보기 모드" />}
      </HStack>}
      centerContent={showSearch ? <SearchAutocomplete autoFocusKey onPick={pick} /> : undefined}
      endContent={<HStack gap={1} vAlign="center">
        <DropdownMenu
          alignment="end"
          menuWidth={360}
          onOpenChange={(isOpen) => { if (isOpen) recent.reload(); }}
          renderTrigger={(props) => <button type="button" className="bell-trigger" {...props}
            aria-label={unread > 0 ? `업무 알림, 읽지 않은 알림 ${unread}건` : "업무 알림"}>
            <Bell size={18} aria-hidden="true" />
            {unread > 0 && <span className="bell-trigger__count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
          </button>}
          items={[
            ...((recent.data?.content ?? []).length
              ? (recent.data?.content ?? []).map((item) => ({
                id: String(item.id),
                label: item.title,
                description: `${notificationTypeLabels[item.type] ?? "알림"}, ${formatAgo(item.createdAt)}${item.isRead ? "" : ", 새 알림"}`,
                onClick: () => void openNotification(item),
              }))
              : [{ id: "empty", label: recent.loading ? "불러오는 중…" : "알림이 없습니다", isDisabled: true }]),
            { type: "divider" as const },
            { id: "all", label: "모든 알림 보기", onClick: onNotifications },
            ...(unread > 0 ? [{ id: "read-all", label: "모두 읽음으로 표시", onClick: () => void notificationService.readAll() }] : []),
          ]}
        />
        <IconButton variant="ghost" icon={theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          label={theme === "dark" ? "밝은 화면으로 바꾸기" : "어두운 화면으로 바꾸기"} tooltip={theme === "dark" ? "밝은 화면" : "어두운 화면"}
          onClick={toggleTheme} />
        <DropdownMenu
          alignment="end"
          menuWidth={240}
          renderTrigger={(props) => <button type="button" className="account-trigger" aria-label="내 계정 메뉴" {...props}>
            <Avatar name={user.name} size="sm" tooltip={false} />
          </button>}
          items={[
            { label: user.name, description: `${role}, ${user.organization?.name ?? "플랫폼"}`, isDisabled: true },
            { type: "divider" },
            { label: "내 정보 수정", icon: <UserRoundPen size={16} />, onClick: onProfile },
            { label: "로그아웃", icon: <LogOut size={16} />, variant: "destructive", onClick: () => void logout() },
          ]}
        />
      </HStack>}
    />
  );
}
