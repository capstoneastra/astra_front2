import { useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { useWorkspace } from "../../context/AppContext";
import { useApiQuery } from "../../hooks/useApiQuery";
import { requestService } from "../../services/requestService";
import { equipmentService } from "../../services/equipmentService";
import { loadCalendar } from "../../services/calendarService";
import type { RequestBox, RequestSummary } from "../../services/contracts";
import { addDays, dayStart, seoulDate } from "../../domain/calendar";
import { formatAgo } from "../../domain/format";
import { requestStatusLabels } from "../../domain/constants";
import { Button, Panel, TextLink } from "../ui";
import ApiState from "../ui/ApiState";
import WeekCalendar from "./WeekCalendar";

interface Props {
  setActiveMenu: (menu: string) => void;
  openRequest: (box: RequestBox, requestId?: number, status?: string) => void;
}
type Row = RequestSummary & { companyName?: string; requester?: { name: string } };

const DAY = 86_400_000;
/** 받은 의뢰 상태 → 지금 할 일 (위에서부터 급한 순서) */
const nextAction: Record<string, string> = {
  SUBMITTED: "검토하기",
  RESUBMITTED: "보완 내용 검토",
  UNDER_REVIEW: "검토 마무리",
  SCHEDULING: "일정 확정",
  CONFIRMED: "결과 등록",
};
const updateReasonLabels: Record<string, string> = {
  NOT_CONFIRMED: "기관 확인 전",
  OUTDATED: "6개월 넘게 갱신 안 됨",
  AVAILABILITY_UNKNOWN: "가용 상태 미확인",
};

/**
 * 기관 대시보드 (기업 대시보드와 같은 틀)
 *  왼쪽: 처리할 의뢰 | 오른쪽: 지금 현황(세로 흐름) + 갱신이 필요한 장비 몇 개
 *  아래: 이번 주·다음 주 2주 달력 (기업과 같은 포스트잇 달력)
 */
export default function InstitutionDashboard({ setActiveMenu, openRequest }: Props) {
  const { user } = useWorkspace();
  const list = useApiQuery((signal) => requestService.list({ box: "RECEIVED", size: 100 }, signal), `home-received:${user.id}`);
  const equipment = useApiQuery((signal) => equipmentService.mine({}, signal), `home-my-equipment:${user.id}`);
  const calendar = useApiQuery((signal) => loadCalendar(signal, "RECEIVED"), `calendar:${user.id}:RECEIVED`);
  const [now] = useState(() => Date.now());

  const rows: Row[] = list.data?.content ?? [];
  const count = (...statuses: string[]) => rows.filter((row) => statuses.includes(row.status)).length;
  const reviewQueue = rows.filter((row) => ["SUBMITTED", "RESUBMITTED"].includes(row.status));
  const oldest = reviewQueue.map((row) => row.submittedAt).filter(Boolean).sort()[0];
  const oldestDays = oldest ? Math.max(0, Math.floor((now - Date.parse(oldest)) / DAY)) : null;
  const todo = rows.filter((row) => nextAction[row.status])
    .sort((a, b) => Object.keys(nextAction).indexOf(a.status) - Object.keys(nextAction).indexOf(b.status));
  const owned = equipment.data?.content ?? [];
  const stale = owned.filter((item) => item.needsUpdate).sort((a, b) => (b.daysSinceUpdate ?? 0) - (a.daysSinceUpdate ?? 0));

  // 2주 달력과 같은 범위(이번 주 일요일 ~ 다음 주 토요일)의 시험 수
  const today = seoulDate(now);
  const sunday = addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
  const twoWeeks = (calendar.data?.schedules ?? []).filter((item) => item.status !== "CANCELED" &&
    Date.parse(item.endAt) > dayStart(sunday) && Date.parse(item.startAt) < dayStart(addDays(sunday, 14))).length;

  const flow: { id: string; label: string; value: number | null; hint?: string; urgent?: boolean; onClick: () => void }[] = [
    { id: "review", label: "검토 대기", value: list.data ? reviewQueue.length : null, urgent: reviewQueue.length > 0,
      hint: oldestDays != null ? `가장 오래된 접수 ${oldestDays}일 지남` : undefined,
      onClick: () => openRequest("RECEIVED", undefined, "REVIEW_QUEUE") },
    { id: "reviewing", label: "검토 중", value: list.data ? count("UNDER_REVIEW") : null,
      onClick: () => openRequest("RECEIVED", undefined, "UNDER_REVIEW") },
    { id: "scheduling", label: "일정 협의", value: list.data ? count("SCHEDULING") : null,
      onClick: () => openRequest("RECEIVED", undefined, "SCHEDULING") },
    { id: "result", label: "결과 등록 대기", value: list.data ? count("CONFIRMED") : null,
      onClick: () => openRequest("RECEIVED", undefined, "CONFIRMED") },
    { id: "twoweeks", label: "2주 안 시험", value: calendar.data ? twoWeeks : null, onClick: () => setActiveMenu("calendar") },
  ];

  return <>
    <div className="dash-grid dash-grid--stretch">
      <Panel title={`처리할 의뢰 ${todo.length || ""}`} action={<TextLink onClick={() => setActiveMenu("received")}>받은 의뢰</TextLink>}>
        {list.loading || list.error ? <ApiState loading={list.loading} error={list.error} onRetry={list.reload} /> :
          todo.length === 0 ? <p className="inline-empty">지금 처리할 의뢰가 없습니다.</p> :
          <List hasDividers density="compact">
            {todo.slice(0, 8).map((item) => <ListItem key={item.id} itemKey={item.id} onClick={() => openRequest("RECEIVED", item.id)}
              startContent={<span className={`todo-status todo-status--${["SUBMITTED", "RESUBMITTED"].includes(item.status) ? "warn" : "plain"}`}>
                {requestStatusLabels[item.status as keyof typeof requestStatusLabels] ?? item.status}</span>}
              label={item.title || item.requestNo}
              description={[item.companyName ?? item.requester?.name, item.equipment?.name,
                item.submittedAt ? `${formatAgo(item.submittedAt)} 접수` : null].filter(Boolean).join(", ")}
              endContent={<Button variant="secondary" className="button--sm" onClick={() => openRequest("RECEIVED", item.id)}>
                {nextAction[item.status]}</Button>} />)}
            {todo.length > 8 && <ListItem label={`외 ${todo.length - 8}건 더 보기`} onClick={() => setActiveMenu("received")} />}
          </List>}
      </Panel>

      <Panel title="지금 현황" action={<TextLink onClick={() => setActiveMenu("received")}>전체 보기</TextLink>}>
        <ol className="stage-flow" aria-label="받은 의뢰 현황">
          {flow.map((item) => <li key={item.id}>
            <button type="button" onClick={item.onClick}
              className={[item.value ? "has-count" : "", item.urgent ? "is-my-turn" : ""].filter(Boolean).join(" ")}>
              <span className="stage-flow__dot" aria-hidden="true" />
              <span className="stage-flow__label">{item.label}{item.hint && <em className="stage-flow__hint">{item.hint}</em>}</span>
              <strong>{item.value ?? "–"}</strong>
            </button>
          </li>)}
        </ol>
        {/* 갱신이 필요한 장비: 오래된 것 3개만, 나머지는 우리 장비에서 */}
        <section className="stale-mini" aria-label="갱신이 필요한 장비">
          <header>
            <strong>정보 갱신 필요 {equipment.data ? `${stale.length}/${owned.length}대` : ""}</strong>
            <TextLink onClick={() => setActiveMenu("equipment")}>우리 장비</TextLink>
          </header>
          {equipment.loading || equipment.error ? <ApiState loading={equipment.loading} error={equipment.error} onRetry={equipment.reload} /> :
            stale.length === 0 ? <p className="inline-empty">모든 장비 정보가 최신입니다.</p> :
            <ul>
              {stale.slice(0, 3).map((item) => <li key={item.id}>
                <button type="button" onClick={() => setActiveMenu("equipment")}>
                  <span className="cell-2line">
                    <span className="cell-2line__main" title={item.name}>{item.name}</span>
                    <span className="cell-2line__sub">{[...(item.updateReasons ?? []).map((reason) => updateReasonLabels[reason] ?? reason),
                      item.daysSinceUpdate != null ? `${item.daysSinceUpdate}일 전 갱신` : null].filter(Boolean).join(", ")}</span>
                  </span>
                  <span className="stale-mini__go">수정</span>
                </button>
              </li>)}
            </ul>}
        </section>
      </Panel>
    </div>

    <Panel title="다가오는 시험" description="이번 주와 다음 주, 우리 기관에 잡힌 시험"
      action={<HStack gap={2}><TextLink onClick={() => setActiveMenu("calendar")}>전체 일정</TextLink></HStack>}>
      {calendar.loading || calendar.error ? <ApiState loading={calendar.loading} error={calendar.error} onRetry={calendar.reload} /> :
        <WeekCalendar schedules={calendar.data?.schedules ?? []} onOpen={(id) => openRequest("RECEIVED", id)} />}
    </Panel>
  </>;
}
