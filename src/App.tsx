import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@astryxdesign/core/AppShell";
import WorkspaceSideNav from "./components/layout/WorkspaceSideNav";
import Home from "./components/Home";
import EquipmentSearch from "./components/EquipmentSearch";
import ReservationCheck from "./components/ReservationCheck";
import EquipmentManager from "./components/EquipmentManager";
import AppHeader from "./components/layout/AppHeader";
import { AppContext } from "./context/AppContext";
import type { Equipment } from "./services/equipmentService";
import type { MatchRun, RequestBox } from "./services/contracts";
import AuthProvider from "./auth/AuthProvider";
import AuthGate from "./auth/AuthGate";
import { AuthContext, useAuth } from "./auth/context";
import { canOpenLocalWorkspace, localWorkspaceAccounts } from "./auth/localWorkspace";
import type { LocalWorkspaceAccount } from "./auth/localWorkspace";
import { canAccessMenu } from "./auth/permissions";
import { useApiQuery } from "./hooks/useApiQuery";
import { equipmentService } from "./services/equipmentService";
import { queryClient } from "./api/cache";
import { blockLocalWorkspaceRequests } from "./api/client";
import { ApiError } from "./api/errors";
import ApiState from "./components/ui/ApiState";
import RequestFlow from "./components/RequestFlow";
import EquipmentCompare from "./components/EquipmentCompare";
import TestInformation from "./components/TestInformation";
import AiAssistant from "./components/assistant/AiAssistant";
import Simulation from "./components/Simulation";
import AdminManagement from "./components/AdminManagement";
import DuplicateEquipment from "./components/DuplicateEquipment";
import Notifications from "./components/Notifications";
import Profile from "./components/Profile";
import ReservationCalendar from "./components/ReservationCalendar";
import { useWorkspaceNavigation } from "./hooks/useWorkspaceNavigation";

function Workspace() {
  const { user } = useAuth();
  const workspaceNavigation = useWorkspaceNavigation(
    `${user.id}:${user.role}:${user.organization?.id ?? ""}`,
  );
  const activeMenu = workspaceNavigation.route.menu;
  const [requirementId, setRequirementId] = useState<number | null>(null);
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [chatPanelKey] = useState(0);
  const [matchRun, setMatchRun] = useState<MatchRun | null>(null);
  const [draftRequestId, setDraftRequestId] = useState<number | null>(null);
  const [comparisonIds, setComparisonIds] = useState<number[]>([]);
  const [testTypeCode, setTestTypeCode] = useState("VIBRATION");
  const [simulationEquipmentId, setSimulationEquipmentId] = useState<number | null>(null);
  const [autoRunId, setAutoRunId] = useState<number | null>(null);
  const [testCondition, setTestCondition] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantStarted, setAssistantStarted] = useState(false);
  const [assistantMode, setAssistantMode] = useState("chatbot");
  const [smallScreen, setSmallScreen] = useState(
    () => window.matchMedia("(max-width: 700px)").matches,
  );
  const closeAssistant = useCallback(() => setAssistantOpen(false), []);
  const { key: locationKey } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType !== "POP") return;
    const frame = requestAnimationFrame(() => {
      closeAssistant();
    });
    return () => cancelAnimationFrame(frame);
  }, [locationKey, navigationType, closeAssistant]);
  const catalogQuery = useApiQuery(
    (signal) => equipmentService.catalog(signal),
    `catalog:${user.id}:${user.role}`,
    ["request", "equipment", "simulation"].includes(activeMenu) || assistantOpen,
  );
  const equipmentList = catalogQuery.data ?? [];

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setSmallScreen(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const openAssistant = (mode?: string) => {
    if (!canAccessMenu(user.role, mode ?? "assistant")) return;
    if (mode) setAssistantMode(mode);
    setAssistantStarted(true);
    setAssistantOpen(true);
  };

  const navigate = (menu: string) => {
    if (
      ["assistant", "chatbot", "autopilot"].includes(menu) &&
      canAccessMenu(user.role, menu)
    ) {
      openAssistant(menu === "assistant" ? undefined : menu);
      return;
    }
    workspaceNavigation.go(menu);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const searchEquipment = (query: string, options: { institutionId?: number | null; testType?: string; sentence?: boolean; equipmentId?: number } = {}) => {
    workspaceNavigation.go("search", { searchTerm: query, institutionId: options.institutionId ?? null,
      ...(options.testType ? { testType: options.testType } : {}),
      ...(options.sentence !== undefined ? { sentence: options.sentence } : {}),
      ...(options.equipmentId ? { equipmentId: options.equipmentId } : {}) });
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  // 일정 화면은 역할에 맞는 의뢰(기업=내 의뢰, 기관=받은 의뢰)만 보여 준다.
  const openCalendar = () => {
    navigate("calendar");
  };

  const openRequest = (box: RequestBox, requestId?: number, status?: string) =>
    workspaceNavigation.go(box === "RECEIVED" ? "received" : "sent", null, { requestId, requestStatus: status });


  const renderContent = () => {
    if (!canAccessMenu(user.role, activeMenu))
      return (
        <ApiState
          error={
            new ApiError(user.role === "COMPANY_USER" ? "기업 계정에서는 쓰지 않는 화면입니다. 시험 맡기기·내 의뢰를 이용해주세요." : user.role === "INSTITUTION_MANAGER" ? "기관·대학 계정에서는 쓰지 않는 화면입니다. 받은 의뢰·우리 장비를 이용해주세요." : "이 계정으로는 이용할 수 없는 화면입니다.", {
              status: 403,
              code: "FORBIDDEN",
            })
          }
        />
      );
    switch (activeMenu) {
      case "home":
        return <Home setActiveMenu={navigate} openRequest={openRequest}
          openApprovals={(approvalFocus) => workspaceNavigation.go("admin", null, { approvalFocus })} onSearch={searchEquipment} />;
      case "request":
        // 다른 화면(장비 찾기·AI 상담)에서 장비·조건을 넘겨받으면 알맞은 단계로 다시 연다
        return <RequestFlow key={`${draftRequestId ?? ""}:${selectedEquipment?.id ?? ""}:${requirementId ?? ""}`} setActiveMenu={navigate} openRequest={openRequest} />;
      case "search":
        return (
          <EquipmentSearch
            key={workspaceNavigation.route.index}
            initialView={workspaceNavigation.route.search}
            initialSearchTerm={workspaceNavigation.route.search?.searchTerm ?? ""}
            initialInstitutionId={workspaceNavigation.route.search?.institutionId ?? null}
            onViewChange={workspaceNavigation.saveSearch}
            setActiveMenu={navigate}
          />
        );
      case "sent":
      case "received":
        return <ReservationCheck key={`${activeMenu}:${workspaceNavigation.route.index}`} setActiveMenu={navigate} institutionView={activeMenu === "received"}
          initialStatus={workspaceNavigation.route.requestStatus} initialRequestId={workspaceNavigation.route.requestId} openCalendar={openCalendar} />;
      case "calendar":
        return <ReservationCalendar />;
      case "compare":
        return <EquipmentCompare setActiveMenu={navigate} />;
      case "testInfo":
        return <TestInformation setActiveMenu={navigate} />;
      case "simulation":
        return <Simulation setActiveMenu={navigate} />;
      case "admin":
        return <AdminManagement key={workspaceNavigation.route.index} approvalFocus={workspaceNavigation.route.approvalFocus} />;
      case "duplicates":
        return <DuplicateEquipment setActiveMenu={navigate} />;
      case "notifications":
        return <Notifications />;
      case "profile":
        return <Profile />;
      case "equipment":
        return <EquipmentManager setActiveMenu={navigate} />;
      default:
        return (
          <ApiState
            error={
              new ApiError("아직 연결되지 않은 화면입니다.", {
                status: 404,
                code: "NOT_FOUND",
              })
            }
          />
        );
    }
  };

  return (
    <AppContext.Provider
      value={{
        testCondition,
        setTestCondition,
        selectedEquipment,
        setSelectedEquipment,
        equipmentList,
        catalogQuery,
        user,
        resolveEquipment: equipmentService.detail,
        requirementId,
        setRequirementId,
        chatSessionId,
        setChatSessionId,
        matchRun,
        setMatchRun,
        draftRequestId,
        setDraftRequestId,
        comparisonIds,
        setComparisonIds,
        testTypeCode,
        setTestTypeCode,
        simulationEquipmentId,
        setSimulationEquipmentId,
        autoRunId,
        setAutoRunId,
        openSimulation: (id) => {
          setSimulationEquipmentId(id);
          navigate("simulation");
        },
        openTestInfo: (code) => {
          setTestTypeCode(code);
          navigate("testInfo");
        },
      }}
    >
      <AppShell
        variant="section"
        contentPadding={0}
        sideNav={<WorkspaceSideNav activeMenu={activeMenu} onNavigate={navigate} />}
        topNav={<AppHeader
          activeMenu={activeMenu}
          onBack={() => { closeAssistant(); workspaceNavigation.back(); }}
          canGoBack={workspaceNavigation.canGoBack}
          onSearch={searchEquipment}
          onNotifications={() => navigate("notifications")}
          onProfile={() => navigate("profile")}
        />}
      >
        <div id="main-content" className="main-content" tabIndex={-1}>
          {renderContent()}
        </div>
      </AppShell>
        {canAccessMenu(user.role, "assistant") && (
          <AiAssistant
            chatPanelKey={chatPanelKey}
            open={assistantOpen}
            started={assistantStarted}
            mode={assistantMode}
            modal={smallScreen}
            onOpen={() => openAssistant()}
            onClose={closeAssistant}
            onModeChange={setAssistantMode}
            onNavigate={(menu) => {
              closeAssistant();
              navigate(menu);
              requestAnimationFrame(() =>
                document.getElementById("main-content")?.focus(),
              );
            }}
          />
        )}
    </AppContext.Provider>
  );
}

function AuthenticatedWorkspace() {
  const { user } = useAuth();
  return (
    <Workspace key={`${user.id}:${user.role}:${user.organization?.id ?? ""}`} />
  );
}

function WorkspaceEntry() {
  const navigate = useNavigate();
  const [localAccount, setLocalAccount] = useState<LocalWorkspaceAccount | null>(null);
  const [localQueries] = useState(() => new QueryClient({ defaultOptions: queryClient.getDefaultOptions() }));
  const unblockApi = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    localQueries.clear();
    unblockApi.current?.();
  }, [localQueries]);

  useEffect(() => {
    if (localAccount || !unblockApi.current) return;
    localQueries.clear();
    unblockApi.current();
    unblockApi.current = null;
  }, [localAccount, localQueries]);

  const enterLocal = (account: LocalWorkspaceAccount) => {
    if (!canOpenLocalWorkspace() || unblockApi.current) return;
    unblockApi.current = blockLocalWorkspaceRequests();
    setLocalAccount(account);
    navigate("/", { replace: true });
  };

  if (localAccount) return (
    <QueryClientProvider client={localQueries}>
      <AuthContext.Provider value={{
        status: "local", user: localWorkspaceAccounts[localAccount].user, error: null,
        login: async () => false,
        checkSession: async () => {},
        logout: async () => {
          setLocalAccount(null);
          navigate("/auth/login", { replace: true });
        },
      }}>
        <AuthGate><AuthenticatedWorkspace /></AuthGate>
      </AuthContext.Provider>
    </QueryClientProvider>
  );

  return <AuthGate onEnterLocal={canOpenLocalWorkspace() ? enterLocal : undefined}>
    <AuthenticatedWorkspace />
  </AuthGate>;
}

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceEntry />
    </AuthProvider>
  );
}
