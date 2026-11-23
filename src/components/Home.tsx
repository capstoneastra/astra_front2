import { useState } from "react";
import type { ReactNode } from "react";
import { Activity, Database, Inbox, RefreshCw, Send, Telescope } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { useAuth } from "../auth/context";
import { useApiQuery } from "../hooks/useApiQuery";
import { invalidateData } from "../api/cache";
import { dashboardService } from "../services/dashboardService";
import { requestService } from "../services/requestService";
import { equipmentService } from "../services/equipmentService";
import type { RequestBox, RequestSummary } from "../services/contracts";
import type { ApprovalFocus } from "../hooks/useWorkspaceNavigation";
import { dateLabel, seoulDate, timeLabel } from "../domain/calendar";
import { requestStatusLabels } from "../domain/constants";
import { Button, PageHeader, Panel, TextLink } from "./ui";
import { List, ListItem } from "@astryxdesign/core/List";
import { Badge as AxBadge } from "@astryxdesign/core/Badge";
import { Text } from "@astryxdesign/core/Text";
import { HStack } from "@astryxdesign/core/HStack";
import ApiState from "./ui/ApiState";

interface HomeProps {
  setActiveMenu: (menu: string) => void;
  onSearch: (query: string, options?: { institutionId: number }) => void;
  openRequest: (box: RequestBox, requestId?: number, status?: string) => void;
  openApprovals: (focus: ApprovalFocus) => void;
}

type Row = RequestSummary & { companyName?: string; requester?: { name: string }; desiredStartDate?: string | null };

const statusVariant = (status: string): "warning" | "success" | "error" | "neutral" =>
  status === "SUPPLEMENT_REQUESTED" ? "warning" : status === "COMPLETED" ? "success" :
    ["REJECTED", "CANCELED"].includes(status) ? "error" : "neutral";

/** 의뢰가 어디까지 왔는지: 제출 → 검토 → 일정 → 시험 → 결과 */
const stages = ["제출", "검토", "일정", "시험", "결과"];
const stageOf: Record<string, number> = {
  SUBMITTED: 0, RESUBMITTED: 1, UNDER_REVIEW: 1, SUPPLEMENT_REQUESTED: 1, SCHEDULING: 2, CONFIRMED: 3, COMPLETED: 4,
};
function StageBar({ status }: { status: string }) {
  const at = stageOf[status] ?? -1;
  return <span className="stage-bar" aria-label={`진행 단계: ${stages[at] ?? requestStatusLabels[status]}`}>
    {stages.map((label, index) => <span key={label} className={index < at ? "is-done" : index === at ? "is-now" : ""}>{label}</span>)}
  </span>;
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

function RowList({ rows, empty, render, state }: {
  rows: Row[];
  empty: string;
  render: (row: Row) => ReactNode;
  state?: { loading: boolean; error: unknown; reload: () => void };
}) {
  if (state?.loading) return <ApiState loading />;
  if (state?.error) return <ApiState error={state.error as never} onRetry={state.reload} />;
  return rows.length === 0 ? <p className="inline-empty">{empty}</p> : <List hasDividers density="compact">{rows.map(render)}</List>;
}

/* ───────── 기업: 시험을 맡기는 쪽 ───────── */
function CompanyDashboard({ setActiveMenu, openRequest }: Pick<HomeProps, "setActiveMenu" | "openRequest">) {
  const { user } = useWorkspace();
  const list = useApiQuery((signal) => requestService.list({ box: "SENT", size: 100 }, signal), `home-sent:${user.id}`);
  const rows: Row[] = list.data?.content ?? [];
  const ready = list.data ? true : false;
  const pick = (...statuses: string[]) => rows.filter((row) => statuses.includes(row.status));
  const myTurn = pick("SUPPLEMENT_REQUESTED", "SCHEDULING");
  const active = pick("SUBMITTED", "UNDER_REVIEW", "SUPPLEMENT_REQUESTED", "RESUBMITTED", "SCHEDULING", "CONFIRMED");
  const results = pick("COMPLETED");
  const drafts = pick("DRAFT");
  const open = (row: Row) => openRequest("SENT", row.id);
  const row = (item: Row, side: ReactNode) => <ListItem key={item.id} itemKey={item.id} onClick={() => open(item)}
    label={item.title || item.requestNo} description={[item.equipment?.name, item.institution?.name].filter(Boolean).join(", ")}
    endContent={<HStack gap={2} vAlign="center">{side}</HStack>} />;
  const tabs: Tab[] = [
    { id: "turn", label: "내가 답할 차례", tone: "amber", count: ready ? myTurn.length : null, hint: "보완 요청과 일정 확인",
      body: <RowList rows={myTurn} state={list} empty="지금 답할 의뢰가 없습니다." render={(item) => row(item, <>
        <Text type="supporting" color="accent">{item.status === "SUPPLEMENT_REQUESTED" ? "추가 정보 입력" : "일정 확인"}</Text>
      </>)} /> },
    { id: "active", label: "진행 중", count: ready ? active.length : null,
      more: <TextLink onClick={() => openRequest("SENT", undefined, "ACTIVE")}>목록으로</TextLink>,
      body: <RowList rows={active} state={list} empty="진행 중인 의뢰가 없습니다." render={(item) => row(item, <>
        <StageBar status={item.status} />
      </>)} /> },
    { id: "results", label: "결과 도착", tone: "green", count: ready ? results.length : null,
      body: <RowList rows={results} state={list} empty="아직 도착한 결과가 없습니다." render={(item) => row(item, <>
        <Text type="supporting" color="accent">결과와 성적서 보기</Text>
      </>)} /> },
    { id: "drafts", label: "작성 중", tone: "violet", count: ready ? drafts.length : null,
      body: <RowList rows={drafts} state={list} empty="작성 중인 의뢰서가 없습니다." render={(item) => row(item, <>
        <Text type="supporting" color="accent">이어서 작성</Text>
      </>)} /> },
  ];
  return <>
    <div className="dash-hero">
      <div>
        <h2>어떤 시험이 필요하신가요?</h2>
        <p>조건을 말하면 맞는 장비를 추천하고, 의뢰서까지 채워 드립니다.</p>
      </div>
      <Button icon={Send} onClick={() => setActiveMenu("request")}>시험 맡기기</Button>
      <Button variant="secondary" icon={Telescope} onClick={() => setActiveMenu("search")}>장비 직접 찾기</Button>
      <Button variant="secondary" icon={Activity} title="예약이 차 있어도 결과를 미리 가늠해 볼 수 있습니다"
        onClick={() => setActiveMenu("simulation")}>가상 시험</Button>
    </div>
    {ready && <TabbedBoard key="company" tabs={tabs} initial={myTurn.length ? "turn" : "active"} />}
    {!ready && <Panel><RowList rows={[]} state={list} empty="" render={() => null} /></Panel>}
  </>;
}

/* ───────── 기관·대학: 시험을 받는 쪽 ───────── */
const nextAction: Record<string, string> = {
  SUBMITTED: "검토 시작",
  RESUBMITTED: "보완 내용 검토",
  UNDER_REVIEW: "검토 결과·이용료 입력",
  SCHEDULING: "일정 확정",
  CONFIRMED: "결과·성적서 등록",
};

function InstitutionDashboard({ setActiveMenu, openRequest }: Pick<HomeProps, "setActiveMenu" | "openRequest">) {
  const { user } = useWorkspace();
  const summary = useApiQuery((signal) => dashboardService.summary(user, "PROVIDER", signal), `summary:${user.id}:PROVIDER`);
  const list = useApiQuery((signal) => requestService.list({ box: "RECEIVED", size: 100 }, signal), `home-received:${user.id}`);
  const equipment = useApiQuery((signal) => equipmentService.mine({}, signal), `home-my-equipment:${user.id}`);
  const [now] = useState(() => Date.now());
  const rows: Row[] = list.data?.content ?? [];
  const ready = Boolean(list.data);
  const pick = (...statuses: string[]) => rows.filter((row) => statuses.includes(row.status));
  const upcoming = (summary.data?.upcomingReservations ?? []).filter((item) => Date.parse(item.endAt) > now)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const stale = (equipment.data?.content ?? []).filter((item) => item.needsUpdate);
  const requestRows = (items: Row[], empty: string) => <RowList rows={items} state={list} empty={empty} render={(item) =>
    <ListItem key={item.id} itemKey={item.id} onClick={() => openRequest("RECEIVED", item.id)} label={item.title || item.requestNo}
      description={[item.companyName ?? item.requester?.name, item.equipment?.name, item.desiredStartDate ? `희망 ${item.desiredStartDate}` : null].filter(Boolean).join(", ")}
      endContent={<HStack gap={2} vAlign="center">
        <AxBadge variant={statusVariant(item.status)} label={requestStatusLabels[item.status]} />
        <Text type="supporting" color="accent">{nextAction[item.status] ?? "보기"}</Text>
      </HStack>} />} />;
  const review = pick("SUBMITTED", "RESUBMITTED", "UNDER_REVIEW");
  const tabs: Tab[] = [
    { id: "review", label: "검토할 의뢰", tone: "amber", count: ready ? review.length : null,
      body: requestRows(review, "검토할 의뢰가 없습니다.") },
    { id: "schedule", label: "일정 조율", tone: "blue", count: ready ? pick("SCHEDULING").length : null,
      body: requestRows(pick("SCHEDULING"), "일정을 조율할 의뢰가 없습니다.") },
    { id: "result", label: "결과 등록 대기", tone: "violet", count: ready ? pick("CONFIRMED").length : null,
      body: requestRows(pick("CONFIRMED"), "결과를 올릴 의뢰가 없습니다.") },
    { id: "upcoming", label: "다가오는 일정", count: summary.data ? upcoming.length : null,
      more: <TextLink onClick={() => setActiveMenu("calendar")}>시험 일정</TextLink>,
      body: upcoming.length === 0 ? <p className="inline-empty">{summary.loading ? "불러오는 중…" : "확정된 시험 일정이 없습니다."}</p> :
        <List hasDividers density="compact">{upcoming.map((item) => <ListItem key={item.reservationId} itemKey={item.reservationId}
          onClick={() => openRequest("RECEIVED", item.requestId)} label={item.equipmentName}
          description={`${dateLabel(seoulDate(item.startAt))} ${timeLabel(item.startAt)}–${timeLabel(item.endAt)}, ${item.requestNo}`} />)}</List> },
    { id: "stale", label: "갱신 필요 장비", tone: "amber", count: equipment.data ? stale.length : null,
      hint: equipment.data ? `전체 ${equipment.data.totalElements}대` : undefined,
      more: <TextLink onClick={() => setActiveMenu("equipment")}>우리 장비</TextLink>,
      body: equipment.loading ? <ApiState loading /> : equipment.error ? <ApiState error={equipment.error} onRetry={equipment.reload} /> :
        stale.length === 0 ? <p className="inline-empty">모든 장비 정보가 최신입니다.</p> :
        <List hasDividers density="compact">{stale.map((item) => <ListItem key={item.id} itemKey={item.id}
          onClick={() => setActiveMenu("equipment")} label={item.name}
          description={`${item.externalId ?? ""}, ${item.daysSinceUpdate ?? "?"}일 전 갱신`}
          endContent={<AxBadge variant="warning" label="갱신 필요" />} />)}</List> },
  ];
  return ready ? <TabbedBoard key="institution" tabs={tabs} /> : <Panel><RowList rows={[]} state={list} empty="" render={() => null} /></Panel>;
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
      hint: `회원 ${summary?.pendingUsers ?? 0} · 기관 ${summary?.pendingInstitutions ?? 0}`,
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
