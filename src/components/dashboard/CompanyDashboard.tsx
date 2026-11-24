import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Badge as AxBadge } from "@astryxdesign/core/Badge";
import { List, ListItem } from "@astryxdesign/core/List";
import { useWorkspace } from "../../context/AppContext";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAction } from "../../hooks/useAction";
import { dashboardService } from "../../services/dashboardService";
import { requestService } from "../../services/requestService";
import { catalogService } from "../../services/catalogService";
import { chatService } from "../../services/chatService";
import type { ChatExchange } from "../../services/chatService";
import { equipmentView, testTypeLabel } from "../../services/equipmentService";
import type { Equipment } from "../../services/equipmentService";
import { loadCalendar } from "../../services/calendarService";
import type { RequestBox } from "../../services/contracts";
import { addDays, dayStart, seoulDate } from "../../domain/calendar";
import { availabilityLabels, valueText } from "../../domain/constants";
import { toApiError } from "../../api/errors";
import { Button, Panel, TextLink } from "../ui";
import ApiState from "../ui/ApiState";
import { requestStages } from "../../domain/requestStages";
import { formatDateTime } from "../../domain/format";

interface Props {
  setActiveMenu: (menu: string) => void;
  openRequest: (box: RequestBox, requestId?: number, status?: string) => void;
}

const DAY = 86_400_000;
/** AI 응답에 조건 이름이 빠졌을 때 쓰는 기본 이름 */
const conditionNames: Record<string, string> = {
  sample_mass: "시료 질량",
  fixture_mass: "고정구 질량",
  frequency: "주파수",
  excitation_axis: "가진 축",
  temperature: "온도",
  humidity: "습도",
  accredited_required: "공인성적서",
};
/** AI 답변의 마크다운 강조 기호(**, __, #)를 지워 읽기 쉽게 */
const plain = (text: string) => text.replace(/\*\*|__|^#+\s*/gm, "");
/** 의뢰 진행 단계(한 줄 막대). 반려·취소는 기업 화면에서 빼고 보여 준다 */
const stages = requestStages.filter((stage) => stage.id !== "CLOSED");
/** 지금 처리할 일: 상태별 바로 할 일 */
const todoAction: Record<string, string> = {
  SUPPLEMENT_REQUESTED: "보완하기",
  SCHEDULING: "일정 확인",
  DRAFT: "이어 쓰기",
};

const dDay = (date?: string | null) => {
  if (!date) return null;
  const diff = Math.round((dayStart(date.slice(0, 10)) - dayStart(seoulDate())) / DAY);
  return diff === 0 ? "D-day" : diff > 0 ? `D-${diff}` : `기한 ${-diff}일 지남`;
};

/**
 * 맨 위 AI 탐색: 문장을 쓰면
 *  - 문장 검색(GET /search, AI 한도와 상관없음)으로 맞는 장비를 바로 보여 주고
 *  - AI 상담(채팅)으로 조건을 정리해 '이 조건으로 시험 맡기기'로 넘긴다
 */
function AiExplore({ setActiveMenu }: Pick<Props, "setActiveMenu">) {
  const { setRequirementId, setMatchRun, setDraftRequestId, setSelectedEquipment, setChatSessionId, resolveEquipment, user } = useWorkspace();
  const [text, setText] = useState("");
  const [asked, setAsked] = useState("");
  const [equipment, setEquipment] = useState<Equipment[] | null>(null);
  const [chat, setChat] = useState<{ sessionId: number; exchange: ChatExchange } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const search = useAction();
  const handoff = useAction();
  const busy = search.busy;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const question = text.trim();
    if (!question) return;
    setAsked(question);
    setEquipment(null);
    setChat(null);
    setAiError(null);
    void search.run(async (signal) => {
      const [found, talk] = await Promise.allSettled([
        catalogService.search(question, signal),
        (async () => {
          const session = await chatService.create(question.slice(0, 40), signal);
          return { sessionId: session.id, exchange: await chatService.send(session.id, question, signal) };
        })(),
      ]);
      if (found.status === "fulfilled") setEquipment(found.value.equipment.map(equipmentView).slice(0, 5));
      else setEquipment([]);
      if (talk.status === "fulfilled") setChat(talk.value);
      else setAiError(toApiError(talk.reason).message);
    });
  };

  const continueRequest = (item?: Equipment) => handoff.run(async (signal) => {
    if (chat) {
      const requirement = await chatService.requirement(chat.sessionId, signal);
      setRequirementId(requirement.id);
      setChatSessionId(chat.sessionId);
    } else setRequirementId(null);
    setMatchRun(null);
    setDraftRequestId(null);
    setSelectedEquipment(item ? (await resolveEquipment(item.id, signal)) ?? item : null);
    setActiveMenu("request");
  });

  const conditions = chat?.exchange.assistantMessage.metadata?.extractedConditions ?? [];
  const own = (item: Equipment) => user.organization?.id != null && item.institutionId === user.organization.id;

  return <Panel className="ai-explore">
    <form className="ai-explore__form" onSubmit={submit} role="search">
      <label htmlFor="ai-explore-input" className="ai-explore__label">어떤 시험이 필요하세요?</label>
      <HStack gap={2} vAlign="center" className="ai-explore__box">
        <Sparkles size={20} aria-hidden="true" />
        <input id="ai-explore-input" value={text} autoComplete="off" enterKeyHint="search"
          placeholder="예: 위성 전장품 15kg, 20~2000Hz 진동시험"
          onChange={(event) => setText(event.target.value)} />
        <Button type="submit" disabled={busy || !text.trim()}>{busy ? "찾는 중…" : "AI로 찾기"}</Button>
      </HStack>
      <HStack gap={3} wrap="wrap" className="ai-explore__links">
        <TextLink onClick={() => setActiveMenu("search")}>장비 직접 찾기</TextLink>
        <TextLink onClick={() => setActiveMenu("request")}>단계별로 맡기기</TextLink>
        <TextLink onClick={() => setActiveMenu("simulation")}>가상 시험</TextLink>
      </HStack>
    </form>

    {(busy || equipment || chat || aiError) && <VStack gap={2} className="ai-explore__result" aria-live="polite">
      {busy ? <ApiState loading /> : <>
        <Text type="supporting" color="secondary">"{asked}"에 대한 결과</Text>
        {chat && <Text as="p" textWrap="pretty">{plain(chat.exchange.assistantMessage.content)}</Text>}
        {aiError && <Text type="supporting" color="secondary">AI 답변은 받지 못했습니다({aiError}). 아래는 문장 검색으로 찾은 장비입니다.</Text>}
        {conditions.length > 0 && <HStack gap={1} wrap="wrap">
          {conditions.map((c) => <AxBadge key={c.key} variant={c.status === "CONFIRMED" ? "neutral" : "warning"}
            label={`${c.label ?? conditionNames[c.key] ?? c.key} ${c.status === "MISSING" ? "아직 모름" : valueText(c)}`} />)}
        </HStack>}
        {equipment && equipment.length > 0 && <List hasDividers density="compact">
          {equipment.map((item) => <ListItem key={item.id} itemKey={item.id} label={item.name}
            description={[item.institution, item.region, item.testTypes.map(testTypeLabel).join(", "),
              availabilityLabels[item.availability ?? "UNKNOWN"]].filter(Boolean).join(", ")}
            endContent={<Button variant="secondary" className="button--sm" disabled={handoff.busy || own(item)}
              title={own(item) ? "우리 기관 장비에는 의뢰할 수 없습니다" : undefined}
              onClick={() => continueRequest(item)}>이 장비로 맡기기</Button>} />)}
        </List>}
        {equipment && equipment.length === 0 && !chat && <Text color="secondary">맞는 장비를 찾지 못했습니다. 시험 이름이나 조건을 바꿔 보세요.</Text>}
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Button icon={ArrowRight} disabled={handoff.busy} onClick={() => continueRequest()}>이 조건으로 시험 맡기기</Button>
          {handoff.error && <Text type="supporting" color="secondary">{handoff.error.message}</Text>}
        </HStack>
      </>}
    </VStack>}
  </Panel>;
}

/** 오늘부터 2주 미니 달력: 시험이 있는 날에 점 */
function MiniCalendar({ days, marked }: { days: string[]; marked: Set<string> }) {
  const today = seoulDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"];
  return <div className="mini-cal" role="grid" aria-label="오늘부터 2주 시험 일정">
    {weekday.map((w) => <span key={w} className="mini-cal__head" role="columnheader">{w}</span>)}
    {Array.from({ length: new Date(`${days[0]}T00:00:00Z`).getUTCDay() }, (_, i) => <span key={`pad${i}`} />)}
    {days.map((day) => <span key={day} role="gridcell"
      className={`mini-cal__day ${day === today ? "is-today" : ""} ${marked.has(day) ? "has-event" : ""}`}
      aria-label={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일${marked.has(day) ? ", 시험 있음" : ""}`}>
      {Number(day.slice(8))}
    </span>)}
  </div>;
}

export default function CompanyDashboard({ setActiveMenu, openRequest }: Props) {
  const { user } = useWorkspace();
  const summary = useApiQuery((signal) => dashboardService.summary(user, "REQUESTER", signal), `summary:${user.id}:REQUESTER`);
  const list = useApiQuery((signal) => requestService.list({ box: "SENT", size: 100 }, signal), `home-sent:${user.id}`);
  const calendar = useApiQuery((signal) => loadCalendar(signal, "SENT"), `calendar:${user.id}:SENT`);
  const [now] = useState(() => Date.now());

  const counts = useMemo(() => {
    const rows = list.data?.content ?? [];
    return stages.map((stage) => rows.filter((row) => stage.statuses.includes(row.status)).length);
  }, [list.data]);
  const todo = summary.data?.actionRequired ?? [];
  const upcoming = (calendar.data?.schedules ?? [])
    .filter((item) => item.status !== "CANCELED" && Date.parse(item.endAt) > now).slice(0, 5);
  const days = Array.from({ length: 14 }, (_, i) => addDays(seoulDate(now), i));
  const marked = new Set(days.filter((day) => upcoming.some((item) =>
    Date.parse(item.startAt) < dayStart(addDays(day, 1)) && Date.parse(item.endAt) > dayStart(day))));

  return <>
    <AiExplore setActiveMenu={setActiveMenu} />

    {/* 의뢰 진행 단계: 작게 한 줄 */}
    <nav className="stage-strip" aria-label="내 의뢰 단계">
      {stages.map((stage, index) => <button key={stage.label} type="button" className={counts[index] ? "has-count" : ""}
        onClick={() => openRequest("SENT", undefined, stage.id)}>
        <span>{stage.label}</span><strong>{list.data ? counts[index] : "–"}</strong>
      </button>)}
    </nav>

    <div className="dash-grid">
      <Panel title={`지금 처리할 일 ${todo.length || ""}`} action={<TextLink onClick={() => setActiveMenu("sent")}>내 의뢰</TextLink>}>
        {summary.loading || summary.error ? <ApiState loading={summary.loading} error={summary.error} onRetry={summary.reload} /> :
          todo.length === 0 ? <p className="inline-empty">지금 처리할 일이 없습니다.</p> :
          <List hasDividers density="compact">
            {todo.map((item) => {
              const due = dDay(item.dueDate);
              return <ListItem key={item.requestId} itemKey={item.requestId} onClick={() => openRequest("SENT", item.requestId)}
                label={item.title} description={item.institutionName ?? undefined}
                endContent={<HStack gap={2} vAlign="center">
                  {due && <AxBadge variant={due.startsWith("기한") || due === "D-day" ? "error" : "warning"} label={due} />}
                  <Button variant="secondary" className="button--sm" onClick={() => openRequest("SENT", item.requestId)}>
                    {todoAction[item.status] ?? "보기"}
                  </Button>
                </HStack>} />;
            })}
          </List>}
      </Panel>
      <Panel title="다가오는 시험" action={<TextLink onClick={() => setActiveMenu("calendar")}>시험 일정</TextLink>}>
        <div className="upcoming">
          <MiniCalendar days={days} marked={marked} />
          {calendar.loading || calendar.error ? <ApiState loading={calendar.loading} error={calendar.error} onRetry={calendar.reload} /> :
            upcoming.length === 0 ? <p className="inline-empty">예정된 시험이 없습니다.</p> :
            <List hasDividers density="compact">
              {upcoming.map((item) => {
                const day = seoulDate(item.startAt);
                return <ListItem key={item.id} itemKey={item.id} onClick={() => openRequest("SENT", item.requestId)}
                  startContent={<span className="date-chip"><strong>{Number(day.slice(8))}</strong>
                    <small>{["일", "월", "화", "수", "목", "금", "토"][new Date(`${day}T00:00:00Z`).getUTCDay()]}</small></span>}
                  label={item.equipment?.name ?? item.title}
                  description={`${formatDateTime(item.startAt)} 시작`}
                  endContent={<AxBadge variant={item.status === "CONFIRMED" ? "success" : "neutral"}
                    label={item.status === "CONFIRMED" ? dDay(day) ?? "확정" : "제안 중"} />} />;
              })}
            </List>}
        </div>
      </Panel>
    </div>
  </>;
}
