import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Send, Sparkles } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { Badge, Button, Panel } from "./ui";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { chatService } from "../services/chatService";
import type { ChatExchange } from "../services/chatService";
import { Feedback } from "./workflow/Feedback";
import { availabilityLabels, availabilityTone, valueText } from "../domain/constants";
import { equipmentService } from "../services/equipmentService";
import type { Equipment } from "../services/equipmentService";

export default function Chatbot({ setActiveMenu }) {
  const {
    setTestCondition,
    chatSessionId,
    setChatSessionId,
    setRequirementId,
    setMatchRun,
    setSelectedEquipment,
    setDraftRequestId,
  } = useWorkspace();
  const history = useApiQuery(
    (signal) => chatService.messages(chatSessionId, signal),
    `chat:${chatSessionId}`,
    Boolean(chatSessionId),
  );
  const [exchange, setExchange] = useState<ChatExchange | null>(null),
    action = useAction();
  const historyMessages = history.data?.content ?? [];
  const all = [
    ...historyMessages,
    ...[exchange?.userMessage, exchange?.assistantMessage].filter(
      (m) => m && !historyMessages.some((old) => old.id === m.id),
    ),
  ];
  const messages = all.length
    ? all.map((m) => ({
        sender: m.role === "USER" ? "user" : "ai",
        text: m.content,
      }))
    : [
        {
          sender: "ai",
          text: "안녕하세요. 어떤 우주항공 시험장비가 필요하신가요?",
        },
      ];
  const metadata =
    exchange?.assistantMessage.metadata ??
    historyMessages.filter((m) => m.role === "ASSISTANT").at(-1)?.metadata;
  const suggestedIds = (metadata?.suggestedEquipmentIds ?? []).slice(0, 5);
  const suggested = useApiQuery(
    (signal) => Promise.all(suggestedIds.map((id) => equipmentService.detail(id, signal))),
    `chat-suggested:${suggestedIds.join(",")}`,
    suggestedIds.length > 0,
  );
  // 상담 결과(조건, 고른 장비)를 '시험 맡기기' 흐름으로 넘긴다.
  const handOff = (equipment?: Equipment) =>
    action.run(async (signal) => {
      const requirement = await chatService.requirement(chatSessionId, signal);
      setRequirementId(requirement.id);
      setMatchRun(null);
      setDraftRequestId(null);
      setSelectedEquipment(equipment ?? null);
      setActiveMenu("request");
    });
  const [input, setInput] = useState("");
  const isConditionReady = Boolean(metadata?.suggestedTestType);
  const isSending = action.busy;
  const messagesEnd = useRef(null);
  const messageCount = messages.length;

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({
      block: "nearest",
      behavior: "instant",
    });
  }, [messageCount, isSending]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    action.run(async (signal) => {
      let id = chatSessionId;
      if (!id) {
        const session = await chatService.create("시험조건 상담", signal);
        id = session.id;
        setChatSessionId(id);
      }
      const result = await chatService.send(id, input.trim(), signal);
      setExchange(result);
      setInput("");
      setTestCondition(
        (result.assistantMessage.metadata?.extractedConditions ?? [])
          .map(
            (c) =>
              `${c.label}: ${valueText(c)}${c.status === "CONFIRMED" ? "" : " (미확인)"}`,
          )
          .join(" · "),
      );
    });
  };

  return (
    <div className="content-page page-enter">
      <div className="chat-layout">
        <Panel className="chat-panel">
          <div
            className="chat-messages"
            role="log"
            aria-label="상담 대화"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.map((msg, idx) => (
              <div className={`message message--${msg.sender}`} key={idx}>
                {msg.sender === "ai" && (
                  <span className="chat-avatar">
                    <Sparkles size={14} />
                  </span>
                )}
                <div className="message__body">
                  <span>{msg.sender === "ai" ? "상담 AI" : "나"}</span>
                  <div className="message__bubble">{msg.text}</div>
                </div>
              </div>
            ))}
            {isSending && (
              <div className="message">
                <span className="chat-avatar">
                  <Sparkles size={14} />
                </span>
                <div className="message__bubble" role="status">
                  시연 응답을 준비하고 있습니다…
                </div>
              </div>
            )}
            {/* AI가 대화에서 조건을 뽑았으면 마지막 답변 아래에 붙여 보여 주고, 바로 시험 맡기기로 넘긴다 */}
            {isConditionReady && !isSending && (
              <div className="chat-handoff">
                <p className="chat-handoff__title"><Check size={13} aria-hidden="true" /> 지금까지 정리한 조건</p>
                <ul className="chat-handoff__conditions">
                  {metadata?.extractedConditions?.map((c) => (
                    <li key={c.key} className={c.status === "CONFIRMED" ? "" : "is-missing"}>
                      {c.label} <strong>{c.status === "MISSING" ? "아직 모름" : valueText(c)}</strong>
                      {c.status === "UNCONFIRMED" && <small> 확인 필요</small>}
                    </li>
                  ))}
                </ul>
                {suggested.data && suggested.data.length > 0 && (
                  <div className="chat-suggested">
                    <p className="small-note">이 시험을 할 수 있는 장비</p>
                    {suggested.data.map((item) => (
                      <div className="chat-suggested__item" key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.institution}, {item.region ?? "지역 확인 필요"}</small>
                          <Badge tone={availabilityTone[item.availability ?? "UNKNOWN"]}>
                            {availabilityLabels[item.availability ?? "UNKNOWN"]}
                          </Badge>
                        </div>
                        <Button variant="secondary" className="button--sm" disabled={action.busy} onClick={() => handOff(item)}>이 장비로 의뢰</Button>
                      </div>
                    ))}
                  </div>
                )}
                {suggested.error && <p className="small-note">{suggested.error.message}</p>}
                <Button icon={ArrowRight} disabled={action.busy} onClick={() => handOff()}>
                  이 조건으로 시험 맡기기
                </Button>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>
          {messages.length === 1 && (
            <div className="chat-examples">
              <button
                onClick={() =>
                  setInput("위성 전장품 15kg, 20~2000Hz 진동시험이 필요해요")
                }
              >
                항공 부품 진동시험
              </button>
              <button onClick={() => setInput("시험조건을 어떻게 정리하나요?")}>
                시험조건 정리하기
              </button>
            </div>
          )}
          <div className="chat-form">
            <label className="sr-only" htmlFor="chat-input">
              상담 메시지
            </label>
            <input
              id="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="필요한 시험을 편하게 이야기해주세요"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing)
                  handleSend();
              }}
            />
            <Button
              icon={Send}
              onClick={handleSend}
              disabled={!input.trim() || isSending}
            >
              <span>전송</span>
            </Button>
          </div>
          <p className="chat-panel__footnote">
            시연 응답은 실제 장비 적합성 판단이나 예약 가능 여부를 보장하지
            않습니다.
          </p>
        </Panel>
      </div>
      <Feedback action={{ ...action, error: action.error ?? history.error }} />
    </div>
  );
}
