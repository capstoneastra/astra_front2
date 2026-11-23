import { useEffect, useRef } from "react";
import { BotMessageSquare, MessageSquareText, Workflow, X } from "lucide-react";
import Chatbot from "../Chatbot";
import Automation from "../Automation";

const modes = [
  {
    id: "chatbot",
    label: "시험 상담",
    icon: MessageSquareText,
    description: "대화로 시험조건을 정리하고 필요한 장비를 찾아보세요.",
  },
  {
    id: "autopilot",
    label: "자동 추진",
    icon: Workflow,
    description: "조건 분석부터 의뢰서 초안까지 단계별로 진행하세요.",
  },
];

export default function AiAssistant({
  chatPanelKey,
  open,
  started,
  mode,
  modal,
  onOpen,
  onClose,
  onModeChange,
  onNavigate,
}) {
  const panel = useRef<HTMLElement>(null);
  const launcher = useRef(null);
  const tabs = useRef({});
  const currentMode = useRef(mode);
  useEffect(() => {
    currentMode.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const launchButton = launcher.current;
    tabs.current[currentMode.current]?.focus({ preventScroll: true });
    const closeWithEscape = (event) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      window.removeEventListener("keydown", closeWithEscape);
      const target =
        previous !== document.body &&
        previous?.isConnected &&
        !previous.closest("[inert]")
          ? previous
          : launchButton;
      target?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !modal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      const items = [
        ...panel.current.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href],[tabindex]",
        ),
      ].filter(
        (node) =>
          node.tabIndex >= 0 &&
          !node.matches(":disabled") &&
          node.getClientRects().length &&
          !node.closest("[inert]"),
      );
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0].focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", trapFocus);
    };
  }, [open, modal]);

  const changeTabWithKeys = (event) => {
    const index = modes.findIndex((item) => item.id === mode);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % modes.length
        : event.key === "ArrowLeft"
          ? (index - 1 + modes.length) % modes.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? modes.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    onModeChange(modes[next].id);
    tabs.current[modes[next].id]?.focus();
  };

  return (
    <>
      {/* 열려 있을 때는 버튼을 숨기고 상담 창만 보인다. 닫으면 다시 나타난다. */}
      <button
        ref={launcher}
        type="button"
        hidden={open}
        className="ai-launcher"
        aria-label={open ? "AI 어시스턴트 닫기" : "AI 어시스턴트 열기"}
        title={open ? "AI 어시스턴트 닫기" : "시험 상담과 자동 추진 열기"}
        aria-expanded={open}
        aria-controls="astra-ai-assistant"
        onClick={open ? onClose : onOpen}
      >
        <BotMessageSquare size={24} aria-hidden="true" />
        <span>ASTRA AI</span>
      </button>
      <aside
        ref={(node) => {
          panel.current = node;
          if (node) node.inert = !open;
        }}
        id="astra-ai-assistant"
        className={`ai-assistant ${open ? "ai-assistant--open" : ""}`}
        hidden={!open}
        role={modal ? "dialog" : "complementary"}
        aria-modal={modal && open ? true : undefined}
        aria-labelledby="ai-assistant-title"
      >
        <header className="ai-assistant__header">
          <span className="ai-assistant__mark">
            <BotMessageSquare size={23} aria-hidden="true" />
          </span>
          <div>
            <h2 id="ai-assistant-title">ASTRA AI</h2>
            <p>시험 준비를 함께하는 어시스턴트</p>
          </div>
          <span className="ai-assistant__environment">AI</span>
          <button
            type="button"
            className="icon-button"
            aria-label="AI 패널 닫기"
            title="닫아도 입력과 진행 상태가 유지됩니다"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="ai-assistant__navigation">
          <div
            className="ai-assistant__tabs"
            role="tablist"
            aria-label="AI 지원 기능"
          >
            {modes.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                id={`ai-tab-${id}`}
                type="button"
                role="tab"
                ref={(node) => {
                  tabs.current[id] = node;
                }}
                aria-selected={mode === id}
                aria-controls={`ai-pane-${id}`}
                tabIndex={mode === id ? 0 : -1}
                onKeyDown={changeTabWithKeys}
                onClick={() => onModeChange(id)}
              >
                <Icon size={17} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <p>{modes.find((item) => item.id === mode)?.description}</p>
        </div>
        <div className="ai-assistant__body">
          {started &&
            modes.map(({ id }) => (
              <section
                key={id}
                id={`ai-pane-${id}`}
                className="ai-assistant__pane"
                role="tabpanel"
                aria-labelledby={`ai-tab-${id}`}
                hidden={mode !== id}
                ref={(node) => {
                  if (node) node.inert = !open || mode !== id;
                }}
              >
                {id === "chatbot" ? (
                  <Chatbot key={chatPanelKey} setActiveMenu={onNavigate} />
                ) : (
                  <Automation setActiveMenu={onNavigate} embedded />
                )}
              </section>
            ))}
        </div>
        <footer className="ai-assistant__footer">
          상담과 자동 추진의 입력·진행 상태는 각각 유지됩니다.
        </footer>
      </aside>
    </>
  );
}
