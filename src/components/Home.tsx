import { useState } from "react";
import type { ReactNode } from "react";
import { Database, Inbox, RefreshCw } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { useAuth } from "../auth/context";
import { useApiQuery } from "../hooks/useApiQuery";
import { invalidateData } from "../api/cache";
import { dashboardService } from "../services/dashboardService";
import type { RequestBox } from "../services/contracts";
import type { ApprovalFocus } from "../hooks/useWorkspaceNavigation";
import { requestStatusLabels } from "../domain/constants";
import { Button, PageHeader, Panel, TextLink } from "./ui";
import ApiState from "./ui/ApiState";
import CompanyDashboard from "./dashboard/CompanyDashboard";
import InstitutionDashboard from "./dashboard/InstitutionDashboard";

interface HomeProps {
  setActiveMenu: (menu: string) => void;
  onSearch: (query: string, options?: { institutionId: number }) => void;
  openRequest: (box: RequestBox, requestId?: number, status?: string) => void;
  openApprovals: (focus: ApprovalFocus) => void;
}

interface Tab {
  id: string;
  label: string;
  count: number | null;
  tone?: string;
  hint?: string;
  body: ReactNode;
  more?: ReactNode;
}

/**
 * 숫자 칸이 곧 탭이다. 누른 칸의 목록이 아래 한 덩어리 안에 나온다(섹션을 여러 개로 나누지 않음).
 */
function TabbedBoard({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  return <Panel className="dash-board">
    <div className="dash-tabs" role="tablist" aria-label="현황">
      {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={tab.id === current.id}
        className={`dash-stat dash-stat--${tab.tone ?? "cyan"}`} onClick={() => setActive(tab.id)}>
        <span>{tab.label}</span>
        <strong>{tab.count == null ? "—" : tab.count.toLocaleString("ko-KR")}</strong>
        {tab.hint && <small>{tab.hint}</small>}
      </button>)}
    </div>
    <div className="dash-board__body" role="tabpanel" aria-label={current.label}>
      {current.more && <div className="dash-board__more">{current.more}</div>}
      {current.body}
    </div>
  </Panel>;
}

/* ───────── 관리자 ───────── */
function AdminDashboard({ onSearch, openApprovals, setActiveMenu, openRequest }: HomeProps) {
  const { user } = useWorkspace();
  const query = useApiQuery((signal) => dashboardService.summary(user, "ADMIN", signal), `summary:${user.id}:ADMIN`);
  const summary = query.data;
  const counts = summary?.requestCounts;
  const verification = [...(summary?.institutionVerification ?? [])]
    .sort((a, b) => (b.equipmentCount - b.verifiedCount) - (a.equipmentCount - a.verifiedCount));
  const activeCount = counts ? ["SUBMITTED", "UNDER_REVIEW", "SUPPLEMENT_REQUESTED", "RESUBMITTED", "SCHEDULING", "CONFIRMED"]
    .reduce((total, status) => total + counts[status], 0) : null;
  if (query.loading || query.error) return <Panel><ApiState loading={query.loading} error={query.error} onRetry={query.reload} /></Panel>;
  const tabs: Tab[] = [
    { id: "approvals", label: "승인 대기", tone: "amber", count: (summary?.pendingUsers ?? 0) + (summary?.pendingInstitutions ?? 0),
      hint: `회원 ${summary?.pendingUsers ?? 0}건, 기관 ${summary?.pendingInstitutions ?? 0}건`,
      body: <div className="dash-actions">
        <Button onClick={() => openApprovals("members")}>회원 승인 {summary?.pendingUsers ?? 0}건 처리</Button>
        <Button variant="secondary" onClick={() => openApprovals("organizations")}>기관·대학 승인 {summary?.pendingInstitutions ?? 0}건 처리</Button>
      </div> },
    { id: "requests", label: "진행 중 의뢰", tone: "blue", count: activeCount,
      more: <TextLink onClick={() => setActiveMenu("received")}>전체 의뢰</TextLink>,
      body: <ul className="status-counts">{Object.entries(requestStatusLabels).map(([status, label]) =>
        <li key={status}><button type="button" onClick={() => openRequest("RECEIVED", undefined, status)}>
          <span>{label}</span><strong>{counts?.[status] ?? 0}</strong>
        </button></li>)}</ul> },
    { id: "equipment", label: "장비 정보 검증", count: summary?.equipmentStats.total ?? null, hint: "등록 장비",
      more: <TextLink onClick={() => setActiveMenu("equipment")}>장비 데이터 관리</TextLink>,
      body: verification.length === 0 ? <p className="inline-empty">표시할 검증 현황이 없습니다.</p> :
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>기관</th><th>검증</th><th /></tr></thead>
          <tbody>{verification.map((item) => <tr key={item.id}>
            <td>{item.name}<small>{item.region}</small></td>
            <td><progress value={item.verifiedCount} max={item.equipmentCount || 1} aria-label={`${item.name} 장비 정보 검증`} />{" "}
              {item.verifiedCount} / {item.equipmentCount}대</td>
            <td className="cell-actions"><TextLink onClick={() => onSearch("", { institutionId: item.id })}>장비 보기</TextLink></td>
          </tr>)}</tbody>
        </table></div> },
  ];
  return <TabbedBoard key="admin" tabs={tabs} />;
}

export default function Home(props: HomeProps) {
  const { user } = useWorkspace();
  const local = useAuth().status === "local";
  const role = user.role;
  return <div className="work-dashboard page-enter">
    <PageHeader title="대시보드" description={user.organization?.name ?? "플랫폼 관리자"}>
      <Button variant="ghost" icon={RefreshCw} aria-label="새로고침" title="새로고침" disabled={local} onClick={invalidateData} />
      {role === "INSTITUTION_MANAGER" && <>
        <Button variant="secondary" icon={Database} onClick={() => props.setActiveMenu("equipment")}>우리 장비</Button>
        <Button icon={Inbox} onClick={() => props.setActiveMenu("received")}>받은 의뢰</Button>
      </>}
    </PageHeader>
    {role === "COMPANY_USER" ? <CompanyDashboard {...props} /> :
      role === "INSTITUTION_MANAGER" ? <InstitutionDashboard {...props} /> : <AdminDashboard {...props} />}
  </div>;
}
