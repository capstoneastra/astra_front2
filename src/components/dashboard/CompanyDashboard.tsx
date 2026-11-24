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
import WeekCalendar from "./WeekCalendar";
import type { RequestBox } from "../../services/contracts";
import { dayStart, seoulDate } from "../../domain/calendar";
import { availabilityLabels, requestStatusLabels, valueText } from "../../domain/constants";
import { formatAgo } from "../../domain/format";
import { toApiError } from "../../api/errors";
import { Button, Panel, TextLink } from "../ui";
import ApiState from "../ui/ApiState";
import { requestStages } from "../../domain/requestStages";
import { conditionNames } from "../../domain/conditionNames";

interface Props {
  setActiveMenu: (menu: string) => void;
  openRequest: (box: RequestBox, requestId?: number, status?: string) => void;
}

const DAY = 86_400_000;
/** AI 응답에 조건 이름이 빠졌을 때 쓰는 기본 이름 */
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
      <p className="ai-explore__hint">장비 이름만 써도 되고, 시료와 조건을 문장으로 써도 됩니다.</p>
      <HStack gap={2} vAlign="center" className="ai-explore__box">
        <Sparkles size={24} aria-hidden="true" />
        <input id="ai-explore-input" value={text} autoComplete="off" enterKeyHint="search"
          placeholder="예: 위성 전장품 15kg, 20~2000Hz 진동시험"
          onChange={(event) => setText(event.target.value)} />
        <Button type="submit" className="button--lg" disabled={busy || !text.trim()}>{busy ? "찾는 중…" : "찾기"}</Button>
      </HStack>
      <HStack gap={4} wrap="wrap" hAlign="center" className="ai-explore__links">
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

export default function CompanyDashboard({ setActiveMenu, openRequest }: Props) {
  const { user } = useWorkspace();
  const summary = useApiQuery((signal) => dashboardService.summary(user, "REQUESTER", signal), `summary:${user.id}:REQUESTER`);
  const list = useApiQuery((signal) => requestService.list({ box: "SENT", size: 100 }, signal), `home-sent:${user.id}`);
  const calendar = useApiQuery((signal) => loadCalendar(signal, "SENT"), `calendar:${user.id}:SENT`);

  const counts = useMemo(() => {
    const rows = list.data?.content ?? [];
    return stages.map((stage) => rows.filter((row) => stage.statuses.includes(row.status)).length);
  }, [list.data]);
  const todo = summary.data?.actionRequired ?? [];
  const rowsById = new Map((list.data?.content ?? []).map((row) => [row.id, row]));

  return <>
    <AiExplore setActiveMenu={setActiveMenu} />


    <div className="dash-grid dash-grid--stretch">
      <Panel title={`지금 처리할 일 ${todo.length || ""}`} action={<TextLink onClick={() => setActiveMenu("sent")}>내 의뢰</TextLink>}>
        {summary.loading || summary.error ? <ApiState loading={summary.loading} error={summary.error} onRetry={summary.reload} /> :
          todo.length === 0 ? <p className="inline-empty">지금 처리할 일이 없습니다.</p> :
          <List hasDividers density="compact">
            {todo.map((item) => {
              const due = dDay(item.dueDate);
              // 요약 응답에는 장비·시험기관이 없어서, 이미 불러온 내 의뢰 목록에서 찾아 붙인다
              const row = rowsById.get(item.requestId);
              return <ListItem key={item.requestId} itemKey={item.requestId} onClick={() => openRequest("SENT", item.requestId)}
                startContent={<span className={`todo-status todo-status--${item.status === "SUPPLEMENT_REQUESTED" ? "warn" : "plain"}`}>
                  {requestStatusLabels[item.status as keyof typeof requestStatusLabels] ?? item.status}</span>}
                label={item.title}
                description={[row?.equipment?.name, row?.institution?.name ?? item.institutionName,
                  item.submittedAt ? `${formatAgo(item.submittedAt)} 접수` : "아직 제출 전"].filter(Boolean).join(", ")}
                endContent={<HStack gap={2} vAlign="center">
                  {due && <AxBadge variant={due.startsWith("기한") || due === "D-day" ? "error" : "warning"} label={due} />}
                  <Button variant="secondary" className="button--sm" onClick={() => openRequest("SENT", item.requestId)}>
                    {todoAction[item.status] ?? "보기"}
                  </Button>
                </HStack>} />;
            })}
          </List>}
      </Panel>
      {/* 의뢰 진행 단계: 세로 흐름으로 작게. 내가 답할 차례(보완 요청)는 강조 */}
      <Panel title={`내 의뢰 진행 ${list.data ? counts.reduce((sum, n) => sum + n, 0) : ""}`}
        action={<TextLink onClick={() => setActiveMenu("sent")}>전체 보기</TextLink>}>
        <ol className="stage-flow" aria-label="내 의뢰 단계별 건수">
          {stages.map((stage, index) => <li key={stage.id}>
            <button type="button" onClick={() => openRequest("SENT", undefined, stage.id)}
              className={[counts[index] ? "has-count" : "", stage.id === "SUPPLEMENT_REQUESTED" && counts[index] ? "is-my-turn" : ""].filter(Boolean).join(" ")}>
              <span className="stage-flow__dot" aria-hidden="true" />
              <span className="stage-flow__label">{stage.label}</span>
              {stage.id === "SUPPLEMENT_REQUESTED" && counts[index] > 0 && <small>내 차례</small>}
              <strong>{list.data ? counts[index] : "–"}</strong>
            </button>
          </li>)}
        </ol>
      </Panel>
    </div>

    <Panel title="다가오는 시험" description="이번 주와 다음 주"
      action={<TextLink onClick={() => setActiveMenu("calendar")}>전체 일정</TextLink>}>
      {calendar.loading || calendar.error ? <ApiState loading={calendar.loading} error={calendar.error} onRetry={calendar.reload} /> :
        <WeekCalendar schedules={calendar.data?.schedules ?? []} onOpen={(id) => openRequest("SENT", id)} />}
    </Panel>
  </>;
}
