import { useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Badge as AxBadge } from "@astryxdesign/core/Badge";
import { List, ListItem } from "@astryxdesign/core/List";
import { useWorkspace } from "../../context/AppContext";
import { useApiQuery } from "../../hooks/useApiQuery";
import { requestService } from "../../services/requestService";
import { equipmentService } from "../../services/equipmentService";
import { loadCalendar } from "../../services/calendarService";
import type { RequestBox, RequestSummary } from "../../services/contracts";
import { addDays, dayStart, seoulDate } from "../../domain/calendar";
import { formatDateTime } from "../../domain/format";
import { requestStatusLabels } from "../../domain/constants";
import { Button, Panel, TextLink } from "../ui";
import ApiState from "../ui/ApiState";

interface Props {
  setActiveMenu: (menu: string) => void;
  openRequest: (box: RequestBox, requestId?: number, status?: string) => void;
}
type Row = RequestSummary & { companyName?: string; requester?: { name: string }; desiredStartDate?: string | null };

const DAY = 86_400_000;
const RANGE = 14;
/** 받은 의뢰 상태 → 지금 할 일 */
const nextAction: Record<string, string> = {
  SUBMITTED: "검토하기",
  RESUBMITTED: "보완 내용 검토",
  UNDER_REVIEW: "검토 마무리",
  SCHEDULING: "일정 확정",
  CONFIRMED: "결과 등록",
};
const updateReasonLabels: Record<string, string> = {
  NOT_CONFIRMED: "조직 확인 전",
  OUTDATED: "6개월 넘게 갱신 안 됨",
  AVAILABILITY_UNKNOWN: "가용 상태 미확인",
};
const weekday = ["일", "월", "화", "수", "목", "금", "토"];

function Stat({ label, value, hint, onClick }: { label: string; value: number | null; hint?: string; onClick: () => void }) {
  return <button type="button" className="dash-stat" onClick={onClick}>
    <span>{label}</span>
    <strong>{value == null ? "–" : value.toLocaleString("ko-KR")}</strong>
    {hint && <small>{hint}</small>}
  </button>;
}

export default function InstitutionDashboard({ setActiveMenu, openRequest }: Props) {
  const { user } = useWorkspace();
  const list = useApiQuery((signal) => requestService.list({ box: "RECEIVED", size: 100 }, signal), `home-received:${user.id}`);
  const equipment = useApiQuery((signal) => equipmentService.mine({}, signal), `home-my-equipment:${user.id}`);
  const calendar = useApiQuery((signal) => loadCalendar(signal, "RECEIVED"), `calendar:${user.id}:RECEIVED`);
  const [now] = useState(() => Date.now());
  const today = seoulDate(now);
  const days = Array.from({ length: RANGE }, (_, i) => addDays(today, i));
  const rangeEnd = dayStart(addDays(today, RANGE));

  const rows: Row[] = list.data?.content ?? [];
  const pick = (...statuses: string[]) => rows.filter((row) => statuses.includes(row.status));
  const reviewQueue = pick("SUBMITTED", "RESUBMITTED");
  const oldest = reviewQueue.map((row) => row.submittedAt).filter(Boolean).sort()[0];
  const oldestDays = oldest ? Math.max(0, Math.floor((now - Date.parse(oldest)) / DAY)) : null;
  const todo = rows.filter((row) => nextAction[row.status])
    .sort((a, b) => Object.keys(nextAction).indexOf(a.status) - Object.keys(nextAction).indexOf(b.status));
  const stale = (equipment.data?.content ?? []).filter((item) => item.needsUpdate);

  // 2주 일정표: 이 기간에 예약이 있는 장비만 행으로
  const inRange = (calendar.data?.schedules ?? []).filter((item) => item.status !== "CANCELED" &&
    Date.parse(item.endAt) > dayStart(today) && Date.parse(item.startAt) < rangeEnd);
  const machines = [...new Map(inRange.map((item) => [item.equipment?.id ?? 0, item.equipment?.name ?? "장비"])).entries()];
  const span = (startAt: string, endAt: string) => {
    const first = Math.max(0, Math.floor((Date.parse(startAt) - dayStart(today)) / DAY));
    const last = Math.min(RANGE - 1, Math.floor((Date.parse(endAt) - 1 - dayStart(today)) / DAY));
    return { column: first + 2, width: Math.max(1, last - first + 1) };
  };

  return <>
    <div className="dash-stats">
      <Stat label="검토 대기" value={list.data ? reviewQueue.length : null}
        hint={oldestDays != null ? `가장 오래된 접수 ${oldestDays}일 경과` : "새 접수 없음"} onClick={() => openRequest("RECEIVED", undefined, "REVIEW_QUEUE")} />
      <Stat label="일정 협의" value={list.data ? pick("SCHEDULING").length : null} hint="일정을 정할 의뢰"
        onClick={() => openRequest("RECEIVED", undefined, "SCHEDULING")} />
      <Stat label="2주 안 시험" value={calendar.data ? inRange.length : null} hint="오늘부터 14일"
        onClick={() => setActiveMenu("calendar")} />
      <Stat label="정보 갱신 필요" value={equipment.data ? stale.length : null}
        hint={equipment.data ? `등록 장비 ${equipment.data.totalElements}대 중` : undefined} onClick={() => setActiveMenu("equipment")} />
    </div>

    <div className="dash-grid">
      <Panel title={`처리할 의뢰 ${todo.length || ""}`} action={<TextLink onClick={() => setActiveMenu("received")}>받은 의뢰</TextLink>}>
        {list.loading || list.error ? <ApiState loading={list.loading} error={list.error} onRetry={list.reload} /> :
          todo.length === 0 ? <p className="inline-empty">지금 처리할 의뢰가 없습니다.</p> :
          <List hasDividers density="compact">
            {todo.map((item) => <ListItem key={item.id} itemKey={item.id} onClick={() => openRequest("RECEIVED", item.id)}
              label={item.title || item.requestNo}
              description={[item.companyName ?? item.requester?.name, item.equipment?.name].filter(Boolean).join(", ")}
              endContent={<HStack gap={2} vAlign="center">
                <AxBadge variant={item.status === "SUBMITTED" || item.status === "RESUBMITTED" ? "warning" : "neutral"} label={requestStatusLabels[item.status]} />
                <Button variant="secondary" className="button--sm" onClick={() => openRequest("RECEIVED", item.id)}>{nextAction[item.status]}</Button>
              </HStack>} />)}
          </List>}
      </Panel>
      <Panel title={`갱신이 필요한 장비 ${stale.length || ""}`} action={<TextLink onClick={() => setActiveMenu("equipment")}>우리 장비</TextLink>}>
        {equipment.loading || equipment.error ? <ApiState loading={equipment.loading} error={equipment.error} onRetry={equipment.reload} /> :
          stale.length === 0 ? <p className="inline-empty">모든 장비 정보가 최신입니다.</p> :
          <List hasDividers density="compact">
            {stale.slice(0, 8).map((item) => <ListItem key={item.id} itemKey={item.id} onClick={() => setActiveMenu("equipment")}
              label={item.name}
              description={[...(item.updateReasons ?? []).map((reason) => updateReasonLabels[reason] ?? reason),
                item.daysSinceUpdate != null ? `${item.daysSinceUpdate}일 전 갱신` : null].filter(Boolean).join(", ")}
              endContent={<Button variant="ghost" className="button--sm" onClick={() => setActiveMenu("equipment")}>수정</Button>} />)}
            {stale.length > 8 && <ListItem label={`외 ${stale.length - 8}대 더 보기`} onClick={() => setActiveMenu("equipment")} />}
          </List>}
      </Panel>
    </div>

    <Panel title="2주 장비 일정" description="오늘부터 14일, 예약이 있는 장비만"
      action={<TextLink onClick={() => setActiveMenu("calendar")}>시험 일정</TextLink>}>
      {calendar.loading || calendar.error ? <ApiState loading={calendar.loading} error={calendar.error} onRetry={calendar.reload} /> :
        <div className="two-week" role="table" aria-label="오늘부터 2주 장비별 예약">
          <div className="two-week__row two-week__head" role="row">
            <span role="columnheader">장비</span>
            {days.map((day) => {
              const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
              return <span key={day} role="columnheader" className={`${day === today ? "is-today" : ""} ${wd === 0 || wd === 6 ? "is-weekend" : ""}`}>
                {Number(day.slice(8))}<small>{weekday[wd]}</small>
              </span>;
            })}
          </div>
          {machines.length === 0 ? <p className="inline-empty">2주 안에 잡힌 시험이 없습니다.</p> :
            machines.map(([id, name]) => <div key={id} className="two-week__row" role="row">
              <span role="rowheader" className="two-week__name"><Text maxLines={1}>{name}</Text></span>
              {inRange.filter((item) => (item.equipment?.id ?? 0) === id).map((item) => {
                const { column, width } = span(item.startAt, item.endAt);
                return <button key={item.id} type="button" role="cell"
                  className={`two-week__bar ${item.status === "CONFIRMED" ? "is-confirmed" : "is-proposed"}`}
                  style={{ gridColumn: `${column} / span ${width}` }}
                  title={`${item.title ?? item.requestNo}, ${formatDateTime(item.startAt)} 시작, ${item.status === "CONFIRMED" ? "확정" : "일정 조율 중"}`}
                  onClick={() => openRequest("RECEIVED", item.requestId)}>
                  {item.companyName ?? item.title ?? item.requestNo}
                </button>;
              })}
            </div>)}
        </div>}
    </Panel>
  </>;
}
