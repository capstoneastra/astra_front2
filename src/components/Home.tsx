import type { ReactNode } from "react";
import { ArrowUpRight, Building2, Database, RefreshCw, Send, Users } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { useAuth } from "../auth/context";
import { useApiQuery } from "../hooks/useApiQuery";
import { invalidateData } from "../api/cache";
import { dashboardService } from "../services/dashboardService";
import type { DashboardRequest } from "../services/dashboardService";
import { requestService } from "../services/requestService";
import type { RequestBox, RequestSummary } from "../services/contracts";
import type { ApprovalFocus } from "../hooks/useWorkspaceNavigation";
import { seoulDate } from "../domain/calendar";
import { requestStatusLabels } from "../domain/constants";
import { Badge, Button, PageHeader, Panel, TextLink } from "./ui";
import ApiState from "./ui/ApiState";
import type { ApiStateProps } from "./ui/ApiState";
import MetricCard from "./dashboard/MetricCard";
import "../styles/dashboard.css";

interface HomeProps {
  ownsEquipment: boolean;
  setActiveMenu: (menu: string) => void;
  onSearch: (query: string, options?: { institutionId: number }) => void;
  openRequest: (box: RequestBox, requestId?: number, status?: string) => void;
  openApprovals: (focus: ApprovalFocus) => void;
}

interface TaskRow {
  id: number;
  title: string;
  meta: string;
  status: string;
}

const statusTone = (status: string) =>
  status === "SUPPLEMENT_REQUESTED" ? "amber" : status === "COMPLETED" ? "green" : status === "REJECTED" ? "red" : "cyan";

const fromDashboard = (item: DashboardRequest): TaskRow => ({
  id: item.requestId,
  title: item.title,
  status: item.status,
  meta: [item.requestNo, item.institutionName, item.dueDate ? `기한 ${item.dueDate.slice(0, 10)}` :
    item.submittedAt ? `접수 ${seoulDate(item.submittedAt)}` : null].filter(Boolean).join(" · "),
});

const fromSummary = (item: RequestSummary): TaskRow => ({
  id: item.id,
  title: item.title || item.equipment?.name || item.requestNo,
  status: item.status,
  meta: [item.requestNo, item.equipment?.name, item.institution?.name].filter(Boolean).join(" · "),
});

/** 처리할 일 목록. 비어 있으면 한 줄 안내만 보여 준다. */
function TaskList({ title, rows, empty, onOpen, more, loading, error, onRetry }: {
  title: string;
  rows: TaskRow[];
  empty: string;
  onOpen: (id: number) => void;
  more?: ReactNode;
} & ApiStateProps) {
  return <Panel className="work-dashboard__panel" title={<>{title} <span className="small-note">{loading ? "" : rows.length}</span></>} action={more}>
    {error ? <ApiState error={error} onRetry={onRetry} /> :
      loading ? <p className="inline-empty">불러오는 중…</p> :
      rows.length === 0 ? <p className="inline-empty">{empty}</p> :
      <ul className="work-dashboard__list">{rows.map((row) => (
        <li key={row.id}><button type="button" className="work-dashboard__row" onClick={() => onOpen(row.id)}>
          <span><strong>{row.title}</strong><small>{row.meta}</small></span>
          <Badge tone={statusTone(row.status)}>{requestStatusLabels[row.status] ?? row.status}</Badge>
          <ArrowUpRight size={15} aria-hidden="true" />
        </button></li>
      ))}</ul>}
  </Panel>;
}

function RequesterTasks({ openRequest, setActiveMenu }: Pick<HomeProps, "openRequest" | "setActiveMenu">) {
  const { user } = useWorkspace();
  const summary = useApiQuery((signal) => dashboardService.summary(user, "REQUESTER", signal), `summary:${user.id}:REQUESTER`);
  const results = useApiQuery((signal) => requestService.list({ box: "SENT", status: "COMPLETED", size: 5 }, signal),
    `home-results:${user.id}`);
  const action = (summary.data?.actionRequired ?? []).map(fromDashboard);
  return <div className="grid-2">
    <TaskList title="답변이 필요한 의뢰" rows={action} loading={summary.loading} error={summary.error} onRetry={summary.reload}
      empty="지금 답변할 의뢰가 없습니다." onOpen={(id) => openRequest("SENT", id)}
      more={<TextLink onClick={() => setActiveMenu("sent")}>내 의뢰</TextLink>} />
    <TaskList title="도착한 결과" rows={(results.data?.content ?? []).map(fromSummary)} loading={results.loading}
      error={results.error} onRetry={results.reload} empty="아직 도착한 결과가 없습니다."
      onOpen={(id) => openRequest("SENT", id)}
      more={<TextLink onClick={() => openRequest("SENT", undefined, "COMPLETED")}>전체 결과</TextLink>} />
  </div>;
}

function ProviderTasks({ openRequest, setActiveMenu }: Pick<HomeProps, "openRequest" | "setActiveMenu">) {
  const { user } = useWorkspace();
  const summary = useApiQuery((signal) => dashboardService.summary(user, "PROVIDER", signal), `summary:${user.id}:PROVIDER`);
  const confirmed = useApiQuery((signal) => requestService.list({ box: "RECEIVED", status: "CONFIRMED", size: 5 }, signal),
    `home-to-report:${user.id}`);
  const updates = summary.data?.equipmentNeedsUpdate;
  return <>
    <div className="grid-2">
      <TaskList title="검토할 의뢰" rows={(summary.data?.pendingReview ?? []).map(fromDashboard)} loading={summary.loading}
        error={summary.error} onRetry={summary.reload} empty="검토를 기다리는 의뢰가 없습니다."
        onOpen={(id) => openRequest("RECEIVED", id)}
        more={<TextLink onClick={() => setActiveMenu("received")}>받은 의뢰</TextLink>} />
      <TaskList title="결과를 올릴 의뢰" rows={(confirmed.data?.content ?? []).map(fromSummary)} loading={confirmed.loading}
        error={confirmed.error} onRetry={confirmed.reload} empty="결과를 올릴 의뢰가 없습니다."
        onOpen={(id) => openRequest("RECEIVED", id)} />
    </div>
    {updates && updates.total > 0 && <p className="content-note">
      <Database size={14} aria-hidden="true" />
      <span>정보 갱신이 필요한 장비 {updates.total}대 (확인 전 {updates.notConfirmed} · 오래됨 {updates.outdated}){" "}
        <TextLink onClick={() => setActiveMenu("equipment")}>우리 장비</TextLink></span>
    </p>}
  </>;
}

function AdminOverview({ onSearch, openApprovals }: Pick<HomeProps, "onSearch" | "openApprovals">) {
  const { user } = useWorkspace();
  const query = useApiQuery((signal) => dashboardService.summary(user, "ADMIN", signal), `summary:${user.id}:ADMIN`);
  const summary = query.data;
  const verification = [...(summary?.institutionVerification ?? [])]
    .sort((a, b) => (b.equipmentCount - b.verifiedCount) - (a.equipmentCount - a.verifiedCount)).slice(0, 8);
  return <>
    {query.error && <ApiState error={query.error} onRetry={query.reload} />}
    <div className="grid-3">
      <MetricCard label="회원 승인 대기" value={summary?.pendingUsers ?? "—"} unit="건" description="가입 신청 검토" icon={Users} tone="amber" onClick={() => openApprovals("members")} />
      <MetricCard label="기관·대학 승인 대기" value={summary?.pendingInstitutions ?? "—"} unit="건" description="신규 소속 조직 확인" icon={Building2} tone="violet" onClick={() => openApprovals("organizations")} />
      <MetricCard label="등록 시험장비" value={summary?.equipmentStats.total ?? "—"} unit="대" description="플랫폼 전체 활성 장비" icon={Database} onClick={() => onSearch("")} />
    </div>
    <Panel title="기관별 장비 정보 검증">
      {verification.length === 0 ? <p className="inline-empty">{query.loading ? "불러오는 중…" : "표시할 검증 현황이 없습니다."}</p> :
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>기관</th><th>검증</th><th /></tr></thead>
          <tbody>{verification.map((item) => <tr key={item.id}>
            <td>{item.name}<small>{item.region}</small></td>
            <td><progress value={item.verifiedCount} max={item.equipmentCount || 1} aria-label={`${item.name} 장비 정보 검증`} />{" "}
              {item.verifiedCount} / {item.equipmentCount}대</td>
            <td className="cell-actions"><TextLink onClick={() => onSearch("", { institutionId: item.id })}>장비 보기</TextLink></td>
          </tr>)}</tbody>
        </table></div>}
    </Panel>
  </>;
}

export default function Home({ ownsEquipment, setActiveMenu, onSearch, openRequest, openApprovals }: HomeProps) {
  const { user } = useWorkspace();
  const local = useAuth().status === "local";
  const admin = user.role === "ADMIN";
  return <div className="work-dashboard page-enter">
    <PageHeader title="대시보드" description={user.organization?.name}>
      <Button variant="ghost" icon={RefreshCw} aria-label="새로고침" title="새로고침" disabled={local}
        onClick={invalidateData} />
      {!admin && <Button icon={Send} onClick={() => setActiveMenu("request")}>시험 맡기기</Button>}
    </PageHeader>
    {admin ? <AdminOverview onSearch={onSearch} openApprovals={openApprovals} /> : <>
      {ownsEquipment && <h2 className="section-label">맡긴 시험</h2>}
      <RequesterTasks openRequest={openRequest} setActiveMenu={setActiveMenu} />
      {ownsEquipment && <>
        <h2 className="section-label">받은 시험</h2>
        <ProviderTasks openRequest={openRequest} setActiveMenu={setActiveMenu} />
      </>}
    </>}
  </div>;
}
