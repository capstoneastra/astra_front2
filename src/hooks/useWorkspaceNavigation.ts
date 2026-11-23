import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { menuPermissions } from "../auth/permissions";
import { legacyMenus } from "../data/navigation";

export interface SearchView {
  searchTerm: string;
  institutionId: number | null;
  sentence?: boolean;
  page?: number;
  regions?: string[];
  testType?: string;
  equipmentType?: string;
  availability?: string;
  externalOnly?: boolean;
  accreditedOnly?: boolean;
  includeMock?: boolean;
  sort?: string;
}

export type ApprovalFocus = "members" | "organizations";

interface WorkspaceDestination {
  requestStatus?: string;
  approvalFocus?: ApprovalFocus;
  requestId?: number;
}

interface WorkspaceRoute extends WorkspaceDestination {
  scope: string;
  menu: string;
  index: number;
  search: SearchView | null;
}

const isPage = (menu: string) =>
  Object.hasOwn(menuPermissions, menu) &&
  !["assistant", "chatbot", "autopilot"].includes(menu);
const hashFor = (menu: string) => (menu === "home" ? "" : `#/${menu}`);
export function useWorkspaceNavigation(scope: string) {
  const { hash, state } = useLocation();
  const navigate = useNavigate();
  const saved: WorkspaceRoute | undefined = state?.astraWorkspace;
  const sameAccount = saved?.scope === scope;
  const hashName = hash.startsWith("#/") ? hash.slice(2) : "";
  const resolved = legacyMenus[hashName] ?? hashName;
  const hashMenu = isPage(resolved) ? resolved : "home";
  const menu = saved && !sameAccount ? "home" : hashMenu;
  const restore = sameAccount && saved.menu === menu;
  const route = useMemo<WorkspaceRoute>(
    () => restore ? saved : { scope, menu, index: 0, search: null },
    [restore, saved, scope, menu],
  );

  const persist = useCallback((next: WorkspaceRoute, replace: boolean) => {
    navigate(`/${hashFor(next.menu)}`, { replace, state: { astraWorkspace: next } });
  }, [navigate]);

  useEffect(() => {
    if (hash !== hashFor(menu) || (!restore && menu === "home"))
      persist(route, true);
  }, [hash, menu, restore, route, persist]);

  const go = useCallback((target: string, search: SearchView | null = null, destination: WorkspaceDestination = {}) => {
    const nextMenu = legacyMenus[target] ?? target;
    if (!isPage(nextMenu)) return;
    if (route.menu === nextMenu && JSON.stringify(route.search) === JSON.stringify(search) &&
      route.requestStatus === destination.requestStatus && route.approvalFocus === destination.approvalFocus &&
      route.requestId === destination.requestId) return;
    persist({ scope, menu: nextMenu, search, index: route.index + 1, ...destination }, false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [persist, route, scope]);

  const saveSearch = useCallback((search: SearchView) => {
    if (route.menu === "search" && JSON.stringify(route.search) !== JSON.stringify(search))
      persist({ ...route, search }, true);
  }, [persist, route]);

  const back = useCallback(() => {
    if (route.index > 0) navigate(-1);
    else go("home");
  }, [go, navigate, route.index]);

  return { route, go, back, saveSearch, canGoBack: route.index > 0 || route.menu !== "home" };
}
