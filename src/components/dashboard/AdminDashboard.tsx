import { useState } from "react";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack } from "@astryxdesign/core/HStack";
import { useWorkspace } from "../../context/AppContext";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAction } from "../../hooks/useAction";
import { dashboardService } from "../../services/dashboardService";
import { adminService } from "../../services/adminService";
import { catalogService } from "../../services/catalogService";
import type { RequestBox } from "../../services/contracts";
import type { ApprovalFocus } from "../../hooks/useWorkspaceNavigation";
import { Button, Panel, TextLink } from "../ui";
import ApiState from "../ui/ApiState";
import { Feedback } from "../workflow/Feedback";

interface Props {
  setActiveMenu: (menu: string) => void;
  onSearch: (query: string, options?: { institutionId: number }) => void;
  openRequest: (box: RequestBox, requestId?: number, status?: string) => void;
  openApprovals: (focus: ApprovalFocus) => void;
}

interface Bar { key: string; label: string; value: number; onClick?: () => void }

/** 한 계열 가로 막대: 한 색, 값은 막대 끝에 글자색으로. 큰 순서가 의미 있을 때만 정렬. */
function Bars({ rows, unit, label }: { rows: Bar[]; unit: string; label: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <p className="inline-empty">표시할 데이터가 없습니다.</p>;
  return <ul className="hbars" aria-label={label}>
    {rows.map((row) => {
      const body = <>
        <span className="hbars__label">{row.label}</span>
        <span className="hbars__track" aria-hidden="true">
          <span className="hbars__fill" style={{ width: `${(row.value / max) * 100}%` }} />
        </span>
        <span className="hbars__value">{row.value.toLocaleString("ko-KR")}{unit}</span>
      </>;
      return <li key={row.key} title={`${row.label}: ${row.value.toLocaleString("ko-KR")}${unit}`}>
        {row.onClick ? <button type="button" className="hbars__row" onClick={row.onClick}>{body}</button> :
          <span className="hbars__row">{body}</span>}
      </li>;
    })}
  </ul>;
}

/** 열 개 넘는 항목은 상위 9개 + 기타로 접는다. */
function topWithOther(rows: Bar[], limit = 9) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  if (sorted.length <= limit + 1) return sorted;
  const rest = sorted.slice(limit).reduce((sum, row) => sum + row.value, 0);
  return [...sorted.slice(0, limit), { key: "__other", label: `기타 ${sorted.length - limit}개`, value: rest }];
}

const stages: { label: string; statuses: string[] }[] = [
  { label: "작성 중", statuses: ["DRAFT"] },
  { label: "접수·검토", statuses: ["SUBMITTED", "UNDER_REVIEW", "RESUBMITTED"] },
  { label: "보완 요청", statuses: ["SUPPLEMENT_REQUESTED"] },
  { label: "일정 협의", statuses: ["SCHEDULING"] },
  { label: "예약 확정", statuses: ["CONFIRMED"] },
  { label: "시험 완료", statuses: ["COMPLETED"] },
  { label: "반려·취소", statuses: ["REJECTED", "CANCELED"] },
];

function Stat({ label, value, hint, onClick }: { label: string; value: number | null; hint?: string; onClick: () => void }) {
  return <button type="button" className="dash-stat" onClick={onClick}>
    <span>{label}</span>
    <strong>{value == null ? "–" : value.toLocaleString("ko-KR")}</strong>
    {hint && <small>{hint}</small>}
  </button>;
}

export default function AdminDashboard({ setActiveMenu, onSearch, openRequest, openApprovals }: Props) {
  const { user } = useWorkspace();
  const action = useAction();
  const query = useApiQuery((signal) => dashboardService.summary(user, "ADMIN", signal), `summary:${user.id}:ADMIN`);
  const types = useApiQuery((signal) => catalogService.testTypes(signal), "test-types");
  const pending = useApiQuery((signal) => adminService.users({ status: "PENDING" }, signal), "admin-users:PENDING");
  const [showAllOrgs, setShowAllOrgs] = useState(false);
  if (query.loading || query.error) return <Panel><ApiState loading={query.loading} error={query.error} onRetry={query.reload} /></Panel>;
  const summary = query.data!;
  const counts = summary.requestCounts;
  const sum = (statuses: string[]) => statuses.reduce((total, status) => total + (counts[status as keyof typeof counts] ?? 0), 0);
  const active = sum(["SUBMITTED", "UNDER_REVIEW", "SUPPLEMENT_REQUESTED", "RESUBMITTED", "SCHEDULING", "CONFIRMED"]);
  const finished = sum(["COMPLETED", "REJECTED", "CANCELED"]);
  const verification = [...(summary.institutionVerification ?? [])];
  const verified = verification.reduce((total, item) => total + item.verifiedCount, 0);
  const listed = verification.reduce((total, item) => total + item.equipmentCount, 0);
  const pendingTotal = (summary.pendingUsers ?? 0) + (summary.pendingInstitutions ?? 0);

  const stageBars: Bar[] = stages.map((stage) => ({ key: stage.label, label: stage.label, value: sum(stage.statuses),
    onClick: () => openRequest("RECEIVED", undefined, stage.statuses[0]) }));
  const typeBars = topWithOther((types.data ?? []).filter((type) => (type.equipmentCount ?? 0) > 0)
    .map((type) => ({ key: type.code, label: type.nameKo, value: type.equipmentCount ?? 0 })));
  const regionBars = topWithOther(Object.entries(summary.equipmentStats.byRegion ?? {})
    .map(([region, value]) => ({ key: region, label: region, value })));
  const orgRows = verification.sort((a, b) => (b.equipmentCount - b.verifiedCount) - (a.equipmentCount - a.verifiedCount));

  return <>
    <div className="dash-stats">
      <Stat label="승인 대기" value={pendingTotal} hint={`회원 ${summary.pendingUsers ?? 0}건, 기관 ${summary.pendingInstitutions ?? 0}건`}
        onClick={() => openApprovals(summary.pendingUsers ? "members" : "organizations")} />
      <Stat label="진행 중 의뢰" value={active} hint={`보완 요청 ${counts.SUPPLEMENT_REQUESTED ?? 0}건 포함`}
        onClick={() => setActiveMenu("received")} />
      <Stat label="마친 의뢰" value={finished} hint={`완료 ${counts.COMPLETED ?? 0}, 반려·취소 ${sum(["REJECTED", "CANCELED"])}`}
        onClick={() => openRequest("RECEIVED", undefined, "COMPLETED")} />
      <Stat label="등록 장비" value={summary.equipmentStats.total}
        hint={listed ? `정보 검증 ${Math.round((verified / listed) * 100)}% (${verified}/${listed}대)` : undefined}
        onClick={() => setActiveMenu("equipment")} />
    </div>

    <div className="dash-grid">
      <Panel title="의뢰 단계별 현황" description="플랫폼 전체, 막대를 누르면 해당 의뢰 목록"
        action={<TextLink onClick={() => setActiveMenu("received")}>전체 의뢰</TextLink>}>
        <Bars rows={stageBars} unit="건" label="의뢰 단계별 건수" />
      </Panel>
      <Panel title={`가입 승인 대기 ${pending.data?.content.length || ""}`}
        action={<TextLink onClick={() => openApprovals("members")}>회원·기관 관리</TextLink>}>
        <Feedback action={action} />
        {pending.loading || pending.error ? <ApiState loading={pending.loading} error={pending.error} onRetry={pending.reload} /> :
          !pending.data?.content.length ? <p className="inline-empty">승인을 기다리는 회원이 없습니다.</p> :
          <List hasDividers density="compact">
            {pending.data.content.slice(0, 6).map((member) => <ListItem key={member.id} itemKey={member.id}
              label={member.name}
              description={[member.email, member.organization?.name].filter(Boolean).join(", ")}
              endContent={<HStack gap={1}>
                <Button className="button--sm" disabled={action.busy}
                  onClick={() => action.run(() => adminService.approve(member.id), `${member.name} 님을 승인했습니다.`)}>승인</Button>
                <Button variant="ghost" className="button--sm" onClick={() => openApprovals("members")}>거절</Button>
              </HStack>} />)}
          </List>}
        {summary.pendingInstitutions ? <p className="inline-empty">
          기관·대학 승인 {summary.pendingInstitutions}건 <TextLink onClick={() => openApprovals("organizations")}>처리하기</TextLink>
        </p> : null}
      </Panel>
    </div>

    <div className="dash-grid dash-grid--even">
      <Panel title="시험유형별 장비 수" description="어떤 시험을 맡길 곳이 많고 적은지">
        {types.loading || types.error ? <ApiState loading={types.loading} error={types.error} onRetry={types.reload} /> :
          <Bars rows={typeBars} unit="대" label="시험유형별 장비 수" />}
      </Panel>
      <Panel title="지역별 장비 분포" description={`등록 장비 ${summary.equipmentStats.total.toLocaleString("ko-KR")}대`}>
        <Bars rows={regionBars} unit="대" label="지역별 장비 수" />
      </Panel>
    </div>

    <Panel title="기관별 정보 검증" description="검증이 덜 된 기관부터"
      action={<TextLink onClick={() => setActiveMenu("equipment")}>장비 데이터 관리</TextLink>}>
      {orgRows.length === 0 ? <p className="inline-empty">표시할 검증 현황이 없습니다.</p> : <>
        <ul className="hbars hbars--progress" aria-label="기관별 장비 정보 검증률">
          {(showAllOrgs ? orgRows : orgRows.slice(0, 6)).map((item) => <li key={item.id}
            title={`${item.name}: ${item.verifiedCount}/${item.equipmentCount}대 검증`}>
            <button type="button" className="hbars__row" onClick={() => onSearch("", { institutionId: item.id })}>
              <span className="hbars__label">{item.name}<small>{item.region}</small></span>
              <span className="hbars__track" aria-hidden="true">
                <span className="hbars__fill" style={{ width: `${(item.verifiedCount / Math.max(1, item.equipmentCount)) * 100}%` }} />
              </span>
              <span className="hbars__value">{item.verifiedCount}/{item.equipmentCount}대</span>
            </button>
          </li>)}
        </ul>
        {orgRows.length > 6 && <p className="inline-empty">
          <TextLink onClick={() => setShowAllOrgs((value) => !value)}>{showAllOrgs ? "접기" : `${orgRows.length - 6}곳 더 보기`}</TextLink>
        </p>}
      </>}
    </Panel>
  </>;
}
