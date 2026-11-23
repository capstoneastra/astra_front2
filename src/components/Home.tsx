import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, Building2, CalendarDays, ClipboardCheck, ClipboardList, Database, MessageSquareText, Plus, RefreshCw, Search, Users } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { useAuth } from "../auth/context";
import { useApiQuery } from "../hooks/useApiQuery";
import { dashboardService } from "../services/dashboardService";
import type { DashboardRequest, DashboardView, RequestStatus } from "../services/dashboardService";
import type { RequestBox } from "../services/contracts";
import type { ApprovalFocus } from "../hooks/useWorkspaceNavigation";
import { dateLabel, seoulDate, timeLabel } from "../domain/calendar";
import { requestStatusLabels } from "../domain/constants";
import { Badge, Button, PageHeader, Panel, TextLink } from "./ui";
import ApiState from "./ui/ApiState";
import type { ApiStateProps } from "./ui/ApiState";
import MetricCard from "./dashboard/MetricCard";
import RequestDetailDialog from "./workflow/RequestDetailDialog";
import "../styles/dashboard.css";

interface HomeProps {
  ownsEquipment: boolean;
  setActiveMenu: (menu: string) => void;
  onSearch: (query: string, options?: { institutionId: number }) => void;
  openRequest: (box: RequestBox, requestId?: number, status?: string) => void;
  openApprovals: (focus: ApprovalFocus) => void;
  openChat: (id: number) => void;
}

function DashboardSection({ title, action, empty, ready, loading, error, children }: {
  title: string;
  action?: ReactNode;
  empty: string;
  ready: boolean;
  children?: ReactNode;
} & ApiStateProps) {
  return <Panel className="work-dashboard__panel" title={title} action={action}>
    {children ?? <p className="work-dashboard__message" aria-live="polite">
      {loading ? "불러오는 중입니다." : error?.code === "LOCAL_WORKSPACE" ? "백엔드 연결 후 표시됩니다." :
        error ? "목록을 불러오지 못했습니다." : ready ? empty : "데이터 연동 준비 중입니다."}
    </p>}
  </Panel>;
}

function DashboardRow({ title, detail, onClick, status, tone }: {
  title: string;
  detail?: string;
  onClick: () => void;
  status?: string;
  tone?: string;
}) {
  return <li><button type="button" className="work-dashboard__row" onClick={onClick}>
    <span><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
    {status && <Badge tone={tone}>{status}</Badge>}
    <ArrowUpRight size={17} aria-hidden="true" />
  </button></li>;
}

function defaultView(role: string, ownsEquipment: boolean): DashboardView {
  if (role === "ADMIN") return "ADMIN";
  return ownsEquipment ? "PROVIDER" : "REQUESTER";
}

function readTime(value?: string | null) {
  return value ? Date.parse(value) : NaN;
}

function requestOrder(a: DashboardRequest, b: DashboardRequest) {
  return (readTime(a.dueDate) || Infinity) - (readTime(b.dueDate) || Infinity) ||
    (readTime(a.submittedAt) || Infinity) - (readTime(b.submittedAt) || Infinity) || a.requestId - b.requestId;
}

function requestMeta(request: DashboardRequest) {
  const due = Number.isFinite(readTime(request.dueDate)) && `기한 ${request.dueDate.slice(0, 10)}`;
  const submitted = Number.isFinite(readTime(request.submittedAt)) && `접수 ${seoulDate(request.submittedAt)}`;
  return [request.requestNo, request.institutionName, due || submitted].filter(Boolean).join(" · ");
}

function scheduleLabel(startAt: string, endAt: string) {
  const startDate = seoulDate(startAt);
  const endDate = seoulDate(endAt);
  const start = `${dateLabel(startDate)} ${timeLabel(startAt)}`;
  return startDate === endDate ? `${start}–${timeLabel(endAt)}` : `${start} – ${dateLabel(endDate)} ${timeLabel(endAt)}`;
}

export default function Home({ ownsEquipment, setActiveMenu, onSearch, openRequest, openApprovals, openChat }: HomeProps) {
  const { user: owner } = useWorkspace();
  const [view, onViewChange] = useState<DashboardView>(() => defaultView(owner.role, ownsEquipment));
  const openRequests = (box?: RequestBox, status?: string) => openRequest(box ?? "SENT", undefined, status);
  const openCalendar = (_box?: RequestBox) => setActiveMenu("calendar");
  const { user, setDraftRequestId, setSelectedEquipment, setRequirementId, setTestCondition } = useWorkspace();
  const localWorkspace = useAuth().status === "local";
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<{ id: number; box: RequestBox } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const requester = view === "REQUESTER";
  const provider = view === "PROVIDER";
  const admin = view === "ADMIN";
  const university = provider && user.organization?.orgType === "UNIVERSITY";
  const box = provider ? "RECEIVED" : "SENT";
  const organizationKey = user.organization?.id ?? "none";
  const summaryQuery = useApiQuery(
    (signal) => dashboardService.summary(user, view, signal),
    `summary:${user.id}:${organizationKey}:${view}`,
  );
  const summary = summaryQuery.data;
  const requestsReady = summary?.dataAvailable.requests === true;
  const chatsReady = summary?.dataAvailable.chats ?? Boolean(summary?.recentChats);
  const confirmed = requestsReady ? summary.requestCounts.CONFIRMED : null;
  const taskRows = requestsReady ? [...(provider ? summary.pendingReview ?? [] : summary.actionRequired ?? [])].sort(requestOrder).slice(0, 5) : [];
  const recentChats = chatsReady ? (summary?.recentChats ?? []).slice(0, 5) : [];
  const schedules = requestsReady ? (summary.upcomingReservations ?? [])
    .filter((item) => Date.parse(item.endAt) > now).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)).slice(0, 5) : [];
  const verification = [...(summary?.institutionVerification ?? [])]
    .sort((a, b) => (b.equipmentCount - b.verifiedCount) - (a.equipmentCount - a.verifiedCount)).slice(0, 5);
  const updates = summary?.equipmentNeedsUpdate;
  const count = (...statuses: RequestStatus[]) => requestsReady ? statuses.reduce((sum, status) => sum + summary.requestCounts[status], 0) : "—";
  const managerAccess = ownsEquipment;
  const orgName = user.organization?.name ?? summary?.institution?.name;
  const title = admin ? "플랫폼 운영 대시보드" : university ? "대학 장비 운영 대시보드" : provider ? "장비 운영 대시보드" : "시험 의뢰 대시보드";

  const upcoming = provider && <DashboardSection title="다가오는 시험 예약" ready={requestsReady && summary.upcomingReservations !== undefined}
    loading={summaryQuery.loading} error={summaryQuery.error}
    action={<TextLink onClick={() => openCalendar("RECEIVED")}>예약 캘린더</TextLink>} empty="예정된 시험이 없습니다.">
    {schedules.length > 0 ? <ul className="work-dashboard__list">{schedules.map((item) =>
      <DashboardRow key={item.reservationId} title={item.equipmentName} detail={`${scheduleLabel(item.startAt, item.endAt)} · ${item.requestNo}`}
        onClick={() => setSelectedRequest({ id: item.requestId, box })} />
    )}</ul> : null}
  </DashboardSection>;

  const startRequest = () => {
    setDraftRequestId(null);
    setSelectedEquipment(null);
    setRequirementId(null);
    setTestCondition("");
    setActiveMenu("request");
  };

  const changeView = (next: DashboardView) => {
    setSelectedRequest(null);
    onViewChange(next);
  };
  const canSwitchView = !admin && (user.organization != null || provider);
  const refreshButton = <Button variant={canSwitchView ? "ghost" : "secondary"} icon={RefreshCw}
    className={canSwitchView ? "work-dashboard__refresh" : undefined}
    aria-label={canSwitchView ? "새로고침" : undefined} title={canSwitchView ? "새로고침" : undefined}
    disabled={localWorkspace || summaryQuery.loading || summaryQuery.refreshing} onClick={summaryQuery.reload}>
    {canSwitchView ? null : "새로고침"}
  </Button>;

  return <div className="work-dashboard page-enter">
    <PageHeader eyebrow={null} title={title} description={orgName}>
      {!canSwitchView && refreshButton}
      {requester && <Button icon={Plus} onClick={startRequest}>새 시험 의뢰</Button>}
      {university && <Button icon={CalendarDays} onClick={() => openCalendar("RECEIVED")}>예약 캘린더</Button>}
      {provider && !university && <Button icon={ClipboardCheck} onClick={() => openRequests("RECEIVED")}>받은 의뢰</Button>}
    </PageHeader>

    {canSwitchView && <div className="work-dashboard__toolbar">
      <div className="work-dashboard__switch" role="group" aria-label="대시보드 업무 범위">
        <button type="button" aria-pressed={requester} onClick={() => changeView("REQUESTER")}>시험 의뢰</button>
        <button type="button" aria-pressed={provider} onClick={() => changeView("PROVIDER")}>장비 운영</button>
      </div>
      {refreshButton}
    </div>}

    {summaryQuery.error && <Panel><ApiState error={summaryQuery.error} onRetry={summaryQuery.reload} /></Panel>}

    <div className="work-dashboard__metrics" aria-label="주요 업무 현황">
      {requester && <>
        <MetricCard label="보완 요청" value={count("SUPPLEMENT_REQUESTED")} unit="건" description="내 답변이 필요한 의뢰" icon={ClipboardList} tone="amber" onClick={() => openRequests("SENT", "SUPPLEMENT_REQUESTED")} />
        <MetricCard label="작성 중" value={count("DRAFT")} unit="건" description="이어서 작성할 의뢰" icon={ClipboardCheck} tone="violet" onClick={() => openRequests("SENT", "DRAFT")} />
        <MetricCard label="예약 확정" value={confirmed ?? "—"} unit="건" description="확정된 시험 일정" icon={CalendarDays} onClick={() => openCalendar("SENT")} />
      </>}
      {provider && <>
        <MetricCard label="검토 대기" value={count("SUBMITTED", "RESUBMITTED")} unit="건" description="신규 접수 및 재제출 의뢰" icon={ClipboardCheck} tone="amber" onClick={() => openRequests("RECEIVED", "REVIEW_QUEUE")} />
        <MetricCard label="일정 협의 중" value={count("SCHEDULING")} unit="건" description="일정을 조율할 의뢰" icon={CalendarDays} tone="blue" onClick={() => openRequests("RECEIVED", "SCHEDULING")} />
        <MetricCard label="갱신 필요 장비" value={updates?.total ?? "—"} unit="대" icon={Database} tone="violet"
          description={updates ? `기관 확인 전 ${updates.notConfirmed}대 · 정보 오래됨 ${updates.outdated}대` : "사양·가용 정보 상태 확인"}
          onClick={managerAccess ? () => setActiveMenu("equipment") : undefined} />
      </>}
      {admin && <>
        <MetricCard label="회원 승인 대기" value={summary?.pendingUsers ?? "—"} unit="건" description="가입 신청 검토" icon={Users} tone="amber" onClick={() => openApprovals("members")} />
        <MetricCard label="기관·대학 승인 대기" value={summary?.pendingInstitutions ?? "—"} unit="건" description="신규 소속 조직 확인" icon={Building2} tone="violet" onClick={() => openApprovals("organizations")} />
        <MetricCard label="등록 시험장비" value={summary?.equipmentStats.total ?? "—"} unit="대" description="플랫폼 전체 활성 장비" icon={Database} onClick={() => onSearch("")} />
      </>}
    </div>

    {!admin && <div className="work-dashboard__grid">
      {university && upcoming}
      <DashboardSection title={provider ? "검토할 의뢰" : "내가 처리할 의뢰"} ready={requestsReady} loading={summaryQuery.loading} error={summaryQuery.error}
        action={<TextLink onClick={() => openRequests(box)}>전체 의뢰</TextLink>} empty={provider ? "검토 대기 중인 의뢰가 없습니다." : "지금 처리할 의뢰가 없습니다."}>
        {taskRows.length > 0 ? <ul className="work-dashboard__list">{taskRows.map((item) =>
          <DashboardRow key={item.requestId} title={item.title} detail={requestMeta(item)} status={requestStatusLabels[item.status]}
            tone={item.status === "SUPPLEMENT_REQUESTED" ? "amber" : "cyan"} onClick={() => setSelectedRequest({ id: item.requestId, box })} />
        )}</ul> : null}
      </DashboardSection>
      {!university && upcoming}
      {requester && <>
        <DashboardSection title="최근 상담" ready={chatsReady} loading={summaryQuery.loading} error={summaryQuery.error}
          action={<TextLink onClick={() => setActiveMenu("chatbot")}>AI 시험 상담</TextLink>} empty="최근 상담이 없습니다.">
          {recentChats.length > 0 ? <ul className="work-dashboard__list">{recentChats.map((item) =>
            <DashboardRow key={item.id} title={item.title} detail={Number.isFinite(readTime(item.updatedAt)) ? seoulDate(item.updatedAt) : undefined} onClick={() => openChat(item.id)} />
          )}</ul> : null}
        </DashboardSection>
        <Panel className="work-dashboard__panel work-dashboard__discover" title="시험장비 찾기"
          action={<TextLink onClick={() => onSearch("")}>전체 장비</TextLink>}>
          <form className="work-dashboard__search" onSubmit={(event) => { event.preventDefault(); onSearch(searchTerm.trim()); }}>
            <label className="sr-only" htmlFor="dashboard-search">장비명 또는 시험유형</label>
            <input id="dashboard-search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="장비명 또는 시험유형" />
            <Button type="submit" variant="secondary" icon={Search}>검색</Button>
          </form>
          <Button variant="secondary" icon={MessageSquareText} onClick={() => setActiveMenu("request")}>조건 분석·장비 매칭</Button>
        </Panel>
      </>}
    </div>}

    {admin && <DashboardSection title="기관별 장비 정보 검증" ready={summary?.institutionVerification !== undefined}
      loading={summaryQuery.loading} error={summaryQuery.error} empty="표시할 기관 검증 현황이 없습니다.">
      {verification.length > 0 ? <ul className="work-dashboard__list">{verification.map((item) => (
        <li className="work-dashboard__verification" key={item.id}>
          <span><strong>{item.name}</strong>{item.region && <small>{item.region}</small>}</span>
          <progress value={item.verifiedCount} max={item.equipmentCount || 1} aria-label={`${item.name} 장비 정보 검증`} />
          <span className="work-dashboard__verified-count">{item.verifiedCount.toLocaleString("ko-KR")} / {item.equipmentCount.toLocaleString("ko-KR")}대 검증</span>
          <TextLink aria-label={`${item.name} 시험장비 보기`} onClick={() => onSearch("", { institutionId: item.id })}>장비 보기</TextLink>
        </li>
      ))}</ul> : null}
    </DashboardSection>}

    {selectedRequest && <RequestDetailDialog key={selectedRequest.id} requestId={selectedRequest.id}
      requestBox={selectedRequest.box} onClose={() => setSelectedRequest(null)} />}
  </div>;
}
