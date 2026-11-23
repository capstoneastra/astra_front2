import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Database, Inbox, RefreshCw, Send, Telescope } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { useAuth } from "../auth/context";
import { useApiQuery } from "../hooks/useApiQuery";
import { invalidateData } from "../api/cache";
import { dashboardService } from "../services/dashboardService";
import type { RequestStatus } from "../services/dashboardService";
import { requestService } from "../services/requestService";
import { equipmentService } from "../services/equipmentService";
import type { RequestBox, RequestSummary } from "../services/contracts";
import type { ApprovalFocus } from "../hooks/useWorkspaceNavigation";
import { dateLabel, seoulDate, timeLabel } from "../domain/calendar";
import { requestStatusLabels } from "../domain/constants";
import { Badge, Button, PageHeader, Panel, TextLink } from "./ui";
import ApiState from "./ui/ApiState";
import "../styles/dashboard.css";

interface HomeProps {
  setActiveMenu: (menu: string) => void;
  onSearch: (query: string, options?: { institutionId: number }) => void;
  openRequest: (box: RequestBox, requestId?: number, status?: string) => void;
  openApprovals: (focus: ApprovalFocus) => void;
}

type Row = RequestSummary & { companyName?: string; requester?: { name: string }; desiredStartDate?: string | null };

const statusTone = (status: string) =>
  status === "SUPPLEMENT_REQUESTED" ? "amber" : status === "COMPLETED" ? "green" :
    ["REJECTED", "CANCELED"].includes(status) ? "red" : "cyan";

/** 요약 숫자 한 칸. 누르면 그 상태의 목록으로 간다. */
function Stat({ label, value, tone = "cyan", onClick, hint }: { label: string; value: number | string; tone?: string; onClick?: () => void; hint?: string }) {
  return <button type="button" className={`dash-stat dash-stat--${tone}`} onClick={onClick} disabled={!onClick}>
    <span>{label}</span>
    <strong>{typeof value === "number" ? value.toLocaleString("ko-KR") : value}</strong>
    {hint && <small>{hint}</small>}
  </button>;
}

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

function Section({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <Panel className={`work-dashboard__panel ${className}`} title={title} action={action}>{children}</Panel>;
}

function RowList({ rows, empty, render }: { rows: Row[]; empty: string; render: (row: Row) => ReactNode }) {
  return rows.length === 0 ? <p className="inline-empty">{empty}</p> : <ul className="work-dashboard__list">{rows.map(render)}</ul>;
}

/* ───────── 기업: 시험을 맡기는 쪽 ───────── */
function CompanyDashboard({ setActiveMenu, openRequest }: Pick<HomeProps, "setActiveMenu" | "openRequest">) {
  const { user } = useWorkspace();
  const summary = useApiQuery((signal) => dashboardService.summary(user, "REQUESTER", signal), `summary:${user.id}:REQUESTER`);
  const list = useApiQuery((signal) => requestService.list({ box: "SENT", size: 100 }, signal), `home-sent:${user.id}`);
  const rows: Row[] = list.data?.content ?? [];
  const counts = summary.data?.requestCounts;
  const sum = (...statuses: RequestStatus[]) => counts ? statuses.reduce((total, status) => total + counts[status], 0) : "—";
  const active = rows.filter((row) => ["SUBMITTED", "UNDER_REVIEW", "SUPPLEMENT_REQUESTED", "RESUBMITTED", "SCHEDULING", "CONFIRMED"].includes(row.status));
  const answer = rows.filter((row) => row.status === "SUPPLEMENT_REQUESTED" || row.status === "SCHEDULING");
  const results = rows.filter((row) => row.status === "COMPLETED").slice(0, 5);
  const drafts = rows.filter((row) => row.status === "DRAFT").slice(0, 3);
  const open = (row: Row) => openRequest("SENT", row.id);
  const loading = list.loading ? <ApiState loading /> : list.error ? <ApiState error={list.error} onRetry={list.reload} /> : null;

  return <>
    <div className="dash-hero">
      <div>
        <h2>어떤 시험이 필요하신가요?</h2>
        <p>조건을 말하면 맞는 장비를 추천하고, 의뢰서까지 채워 드립니다.</p>
      </div>
      <Button icon={Send} onClick={() => setActiveMenu("request")}>시험 맡기기</Button>
      <Button variant="secondary" icon={Telescope} onClick={() => setActiveMenu("search")}>장비 직접 찾기</Button>
    </div>
    <div className="dash-stats">
      <Stat label="내가 답할 차례" tone="amber" value={sum("SUPPLEMENT_REQUESTED", "SCHEDULING")} hint="보완 요청·일정 확인"
        onClick={() => openRequest("SENT", undefined, "MY_TURN")} />
      <Stat label="진행 중" value={sum("SUBMITTED", "UNDER_REVIEW", "SUPPLEMENT_REQUESTED", "RESUBMITTED", "SCHEDULING", "CONFIRMED")} onClick={() => openRequest("SENT", undefined, "ACTIVE")} />
      <Stat label="작성 중" tone="violet" value={sum("DRAFT")} onClick={() => openRequest("SENT", undefined, "DRAFT")} />
      <Stat label="결과 도착" tone="green" value={sum("COMPLETED")} onClick={() => openRequest("SENT", undefined, "COMPLETED")} />
    </div>
    <div className="dash-grid">
      <Section title={`진행 중인 의뢰 ${active.length ? active.length : ""}`} action={<TextLink onClick={() => setActiveMenu("sent")}>내 의뢰 전체</TextLink>}>
        {loading ?? <RowList rows={active} empty="진행 중인 의뢰가 없습니다." render={(row) => <li key={row.id}>
          <button type="button" className="work-dashboard__row" onClick={() => open(row)}>
            <span><strong>{row.title || row.requestNo}</strong><small>{row.equipment?.name} · {row.institution?.name}</small></span>
            <StageBar status={row.status} />
            <Badge tone={statusTone(row.status)}>{requestStatusLabels[row.status]}</Badge>
          </button>
        </li>} />}
      </Section>
      <div className="dash-side">
        <Section title="내가 답할 차례" className="dash-attention">
          {loading ?? <RowList rows={answer} empty="지금 답할 의뢰가 없습니다." render={(row) => <li key={row.id}>
            <button type="button" className="work-dashboard__row" onClick={() => open(row)}>
              <span><strong>{row.title || row.requestNo}</strong>
                <small>{row.status === "SUPPLEMENT_REQUESTED" ? "추가 정보·보완 요청에 답해주세요" : "제안된 일정을 확인해주세요"}</small></span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </li>} />}
        </Section>
        <Section title="도착한 결과">
          {loading ?? <RowList rows={results} empty="아직 도착한 결과가 없습니다." render={(row) => <li key={row.id}>
            <button type="button" className="work-dashboard__row" onClick={() => open(row)}>
              <span><strong>{row.title || row.requestNo}</strong><small>{row.institution?.name} · 성적서 보기</small></span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </li>} />}
        </Section>
        {drafts.length > 0 && <Section title="작성 중인 의뢰서">
          <RowList rows={drafts} empty="" render={(row) => <li key={row.id}>
            <button type="button" className="work-dashboard__row" onClick={() => open(row)}>
              <span><strong>{row.title || row.requestNo}</strong><small>{row.equipment?.name}</small></span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </li>} />
        </Section>}
      </div>
    </div>
    {summary.error && <ApiState error={summary.error} onRetry={summary.reload} />}
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
  const counts = summary.data?.requestCounts;
  const sum = (...statuses: RequestStatus[]) => counts ? statuses.reduce((total, status) => total + counts[status], 0) : "—";
  const todo = rows.filter((row) => nextAction[row.status])
    .sort((a, b) => Object.keys(nextAction).indexOf(a.status) - Object.keys(nextAction).indexOf(b.status));
  const waiting = rows.filter((row) => row.status === "SUPPLEMENT_REQUESTED");
  const upcoming = (summary.data?.upcomingReservations ?? []).filter((item) => Date.parse(item.endAt) > now)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)).slice(0, 5);
  const stale = (equipment.data?.content ?? []).filter((item) => item.needsUpdate);
  const loading = list.loading ? <ApiState loading /> : list.error ? <ApiState error={list.error} onRetry={list.reload} /> : null;

  return <>
    <div className="dash-stats">
      <Stat label="검토 대기" tone="amber" value={sum("SUBMITTED", "RESUBMITTED")} onClick={() => openRequest("RECEIVED", undefined, "REVIEW_QUEUE")} />
      <Stat label="검토 중" value={sum("UNDER_REVIEW")} onClick={() => openRequest("RECEIVED", undefined, "UNDER_REVIEW")} />
      <Stat label="일정 조율" tone="blue" value={sum("SCHEDULING")} onClick={() => openRequest("RECEIVED", undefined, "SCHEDULING")} />
      <Stat label="결과 등록 대기" tone="violet" value={sum("CONFIRMED")} onClick={() => openRequest("RECEIVED", undefined, "CONFIRMED")} />
      <Stat label="갱신 필요 장비" tone="amber" value={equipment.data ? stale.length : "—"} hint={equipment.data ? `전체 ${equipment.data.totalElements}대` : undefined}
        onClick={() => setActiveMenu("equipment")} />
    </div>
    <div className="dash-grid">
      <Section title={`처리할 의뢰 ${todo.length ? todo.length : ""}`} action={<TextLink onClick={() => setActiveMenu("received")}>받은 의뢰 전체</TextLink>}>
        {loading ?? <RowList rows={todo} empty="지금 처리할 의뢰가 없습니다." render={(row) => <li key={row.id}>
          <button type="button" className="work-dashboard__row" onClick={() => openRequest("RECEIVED", row.id)}>
            <span><strong>{row.title || row.requestNo}</strong>
              <small>{row.companyName ?? row.requester?.name} · {row.equipment?.name}{row.desiredStartDate ? ` · 희망 ${row.desiredStartDate}` : ""}</small></span>
            <Badge tone={statusTone(row.status)}>{requestStatusLabels[row.status]}</Badge>
            <span className="dash-next">{nextAction[row.status]} <ArrowRight size={13} aria-hidden="true" /></span>
          </button>
        </li>} />}
        {waiting.length > 0 && <p className="small-note dash-footnote">맡긴 쪽 답변을 기다리는 의뢰 {waiting.length}건</p>}
      </Section>
      <div className="dash-side">
        <Section title="다가오는 시험 일정" action={<TextLink onClick={() => setActiveMenu("calendar")}>시험 일정</TextLink>}>
          {upcoming.length === 0 ? <p className="inline-empty">{summary.loading ? "불러오는 중…" : "확정된 시험 일정이 없습니다."}</p> :
            <ul className="work-dashboard__list">{upcoming.map((item) => <li key={item.reservationId}>
              <button type="button" className="work-dashboard__row" onClick={() => openRequest("RECEIVED", item.requestId)}>
                <span><strong>{item.equipmentName}</strong>
                  <small>{dateLabel(seoulDate(item.startAt))} {timeLabel(item.startAt)}–{timeLabel(item.endAt)} · {item.requestNo}</small></span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </li>)}</ul>}
        </Section>
        <Section title="정보 갱신이 필요한 장비" action={<TextLink onClick={() => setActiveMenu("equipment")}>우리 장비</TextLink>}>
          {equipment.loading ? <p className="inline-empty">불러오는 중…</p> : equipment.error ? <ApiState error={equipment.error} onRetry={equipment.reload} /> :
            stale.length === 0 ? <p className="inline-empty">모든 장비 정보가 최신입니다.</p> :
            <ul className="work-dashboard__list">{stale.slice(0, 4).map((item) => <li key={item.id}>
              <button type="button" className="work-dashboard__row" onClick={() => setActiveMenu("equipment")}>
                <span><strong>{item.name}</strong><small>{item.externalId} · {item.daysSinceUpdate ?? "—"}일 전 갱신</small></span>
                <Badge tone="amber">갱신 필요</Badge>
              </button>
            </li>)}</ul>}
          {stale.length > 4 && <p className="small-note dash-footnote">외 {stale.length - 4}대</p>}
        </Section>
      </div>
    </div>
    {summary.error && <ApiState error={summary.error} onRetry={summary.reload} />}
  </>;
}

/* ───────── 관리자 ───────── */
function AdminDashboard({ onSearch, openApprovals, setActiveMenu, openRequest }: HomeProps) {
  const { user } = useWorkspace();
  const query = useApiQuery((signal) => dashboardService.summary(user, "ADMIN", signal), `summary:${user.id}:ADMIN`);
  const summary = query.data;
  const counts = summary?.requestCounts;
  const verification = [...(summary?.institutionVerification ?? [])]
    .sort((a, b) => (b.equipmentCount - b.verifiedCount) - (a.equipmentCount - a.verifiedCount)).slice(0, 8);
  return <>
    {query.error && <ApiState error={query.error} onRetry={query.reload} />}
    <div className="dash-stats">
      <Stat label="회원 승인 대기" tone="amber" value={summary?.pendingUsers ?? "—"} onClick={() => openApprovals("members")} />
      <Stat label="기관·대학 승인 대기" tone="violet" value={summary?.pendingInstitutions ?? "—"} onClick={() => openApprovals("organizations")} />
      <Stat label="등록 장비" value={summary?.equipmentStats.total ?? "—"} onClick={() => onSearch("")} />
      <Stat label="진행 중 의뢰" tone="blue" value={counts ? ["SUBMITTED", "UNDER_REVIEW", "SUPPLEMENT_REQUESTED", "RESUBMITTED", "SCHEDULING", "CONFIRMED"]
        .reduce((total, status) => total + counts[status], 0) : "—"} onClick={() => setActiveMenu("received")} />
    </div>
    <div className="dash-grid">
      <Section title="기관별 장비 정보 검증" action={<TextLink onClick={() => setActiveMenu("equipment")}>장비 데이터 관리</TextLink>}>
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
      </Section>
      <Section title="의뢰 상태 현황" action={<TextLink onClick={() => setActiveMenu("received")}>전체 의뢰</TextLink>}>
        {!counts ? <p className="inline-empty">{query.loading ? "불러오는 중…" : "—"}</p> :
          <ul className="status-counts">{Object.entries(requestStatusLabels).map(([status, label]) =>
            <li key={status}><button type="button" onClick={() => openRequest("RECEIVED", undefined, status)}>
              <span>{label}</span><strong>{counts[status] ?? 0}</strong>
            </button></li>)}</ul>}
      </Section>
    </div>
  </>;
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
