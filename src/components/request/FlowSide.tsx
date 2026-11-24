import { useState } from "react";
import { Check, ClipboardList, Columns3, PenLine } from "lucide-react";
import { useWorkspace } from "../../context/AppContext";
import { useApiQuery } from "../../hooks/useApiQuery";
import { requirementService } from "../../services/requirementService";
import { requestService } from "../../services/requestService";
import { catalogService } from "../../services/catalogService";
import { testTypeLabel } from "../../services/equipmentService";
import type { RequirementCondition } from "../../services/contracts";
import { conditionName } from "../../domain/conditionNames";
import { valueText } from "../../domain/constants";
import { formatAgo } from "../../domain/format";
import { Button, TextLink } from "../ui";

export type Step = 1 | 2 | 3;
const stepNames: Record<Step, string> = { 1: "조건 정하기", 2: "장비 고르기", 3: "의뢰서 쓰기" };
const stepHints: Record<Step, string> = {
  1: "어떤 시험인지, 시료와 조건",
  2: "조건에 맞는 장비 비교",
  3: "기간·담당자 쓰고 제출",
};

/** 지금 맡기는 중인 의뢰가 어디까지 정해졌는지 (왼쪽 단계·오른쪽 요약이 같이 쓴다) */
function useFlowState() {
  const { requirementId, matchRun, draftRequestId, selectedEquipment } = useWorkspace();
  const requirement = useApiQuery((signal) => requirementService.get(requirementId, signal), `requirement:${requirementId}`, Boolean(requirementId));
  const draft = useApiQuery((signal) => requestService.get(draftRequestId, signal), `request:${draftRequestId}`, Boolean(draftRequestId));
  const content = draft.data?.revision?.content;
  const testTypeCode = content?.test?.testTypeCode ?? requirement.data?.testTypeCode ?? null;
  const conditions: RequirementCondition[] = (content?.conditions ?? requirement.data?.conditions ?? [])
    .filter((c: RequirementCondition) => c.status !== "MISSING");
  const equipmentName = draft.data?.equipment?.name ?? selectedEquipment?.name ?? null;
  const institutionName = draft.data?.institution?.name ?? selectedEquipment?.institution ?? null;
  const institutionId = draft.data?.institution?.id ?? selectedEquipment?.institutionId ?? null;
  return { requirementId, matchRun, draftRequestId, testTypeCode, conditions, equipmentName, institutionName, institutionId,
    purpose: content?.test?.purpose ?? requirement.data?.purpose ?? null };
}

/** 왼쪽: 단계 안내. 단계마다 무엇을 하는지, 무엇을 정했는지 */
export function StepRail({ step, canOpen, onStep }: { step: Step; canOpen: (id: Step) => boolean; onStep: (id: Step) => void }) {
  const flow = useFlowState();
  const done: Record<Step, boolean> = {
    1: Boolean(flow.requirementId || flow.matchRun || flow.draftRequestId),
    2: Boolean(flow.draftRequestId || flow.equipmentName),
    3: false,
  };
  const picked: Record<Step, string | null> = {
    1: flow.testTypeCode ? testTypeLabel(flow.testTypeCode) : null,
    2: flow.equipmentName,
    3: flow.draftRequestId ? "작성 중" : null,
  };
  return <nav className="flow-rail" aria-label="진행 단계">
    <ol>
      {([1, 2, 3] as Step[]).map((id) => {
        const state = step === id ? "is-current" : done[id] ? "is-done" : "";
        return <li key={id}>
          <button type="button" className={`flow-rail__step ${state}`} aria-current={step === id ? "step" : undefined}
            disabled={!canOpen(id)} onClick={() => onStep(id)}>
            <span className="flow-rail__num" aria-hidden="true">{done[id] && step !== id ? <Check size={14} /> : id}</span>
            <span className="flow-rail__text">
              <strong>{stepNames[id]}</strong>
              <small>{picked[id] ?? stepHints[id]}</small>
            </span>
          </button>
        </li>;
      })}
    </ol>
  </nav>;
}

const nextTodo: Record<Step, string> = {
  1: "조건을 넣고 '맞는 장비 찾기'를 누르세요.",
  2: "마음에 드는 장비에서 '이 장비로 맡기기'를 누르세요.",
  3: "희망 기간과 담당자를 채우고 제출하세요.",
};

/** 오른쪽: 지금까지 정한 것 + 단계별 도움말. 스크롤해도 따라온다 */
export function FlowSummary({ step, setActiveMenu }: { step: Step; setActiveMenu: (menu: string) => void }) {
  const flow = useFlowState();
  const { comparisonIds } = useWorkspace();
  const type = useApiQuery((signal) => catalogService.testType(flow.testTypeCode!, signal), `test-type:${flow.testTypeCode}`, Boolean(flow.testTypeCode));
  // 고른 기관이 있으면 그 기관 값, 없으면 가장 싼 값·가장 짧은 기간
  const institutions = type.data?.institutions ?? [];
  const mine = institutions.find((item) => item.id === flow.institutionId);
  const costs = (mine ? [mine] : institutions).map((item) => item.estCostMin).filter((v): v is number => v != null);
  const days = (mine ? [mine] : institutions).map((item) => item.estDurationDays).filter((v): v is number => v != null);
  const [showAll, setShowAll] = useState(false);
  const conditions = showAll ? flow.conditions : flow.conditions.slice(0, 4);

  return <aside className="flow-summary-card" aria-label="지금까지 정한 것">
    <h2>지금까지 정한 것</h2>
    <dl>
      <dt>시험</dt>
      <dd>{flow.testTypeCode ? testTypeLabel(flow.testTypeCode) : <span className="is-empty">아직 정하지 않음</span>}</dd>
      <dt>조건</dt>
      <dd>{flow.conditions.length ? <ul>
        {conditions.map((c) => <li key={c.key}>{c.label ?? conditionName(c.key)} <b>{valueText(c)}</b></li>)}
        {flow.conditions.length > 4 && <li><TextLink onClick={() => setShowAll((v) => !v)}>{showAll ? "접기" : `${flow.conditions.length - 4}개 더`}</TextLink></li>}
      </ul> : <span className="is-empty">아직 없음</span>}</dd>
      <dt>장비</dt>
      <dd>{flow.equipmentName ? <>{flow.equipmentName}<small>{flow.institutionName}</small></> : <span className="is-empty">아직 고르지 않음</span>}</dd>
      <dt>예상</dt>
      <dd>{costs.length || days.length ? <>
        {costs.length ? `${Math.min(...costs).toLocaleString("ko-KR")}원부터` : "비용은 기관 문의"}
        {days.length ? <small>최소 {Math.min(...days)}일</small> : null}
      </> : <span className="is-empty">{flow.testTypeCode ? "기관 문의" : "시험을 정하면 보여요"}</span>}</dd>
    </dl>

    <div className="flow-summary-card__next">
      <strong>다음 할 일</strong>
      <p>{nextTodo[step]}</p>
    </div>

    {step === 1 && <div className="flow-summary-card__tip">
      <strong><ClipboardList size={14} aria-hidden="true" /> 미리 알아 두면 좋아요</strong>
      <ul>
        <li>시료 크기와 무게</li>
        <li>시료를 고정하는 방법(지그·고정구)</li>
        <li>공인성적서가 필요한지</li>
        <li>원하는 시험 날짜</li>
      </ul>
    </div>}
    {step === 2 && <div className="flow-summary-card__tip">
      <strong><Columns3 size={14} aria-hidden="true" /> 비교함 {comparisonIds.length}대</strong>
      <p>장비 왼쪽 칸을 체크하면 최대 5대까지 나란히 비교할 수 있어요.</p>
      <Button variant="secondary" className="button--sm" disabled={comparisonIds.length < 2} onClick={() => setActiveMenu("compare")}>비교하기</Button>
    </div>}
    {step === 3 && <div className="flow-summary-card__tip">
      <strong>제출하면 이렇게 진행돼요</strong>
      <ol className="flow-summary-card__timeline">
        <li>시험기관이 검토</li>
        <li>필요하면 보완 요청</li>
        <li>일정 조율, 예약 확정</li>
        <li>시험, 결과와 성적서</li>
      </ol>
    </div>}
  </aside>;
}

/** 아래: 작성 중인 의뢰 이어 쓰기 (처음 단계에서만) */
export function DraftShelf({ onContinue, setActiveMenu }: { onContinue: (id: number) => void; setActiveMenu: (menu: string) => void }) {
  const { user } = useWorkspace();
  const drafts = useApiQuery((signal) => requestService.list({ box: "SENT", status: "DRAFT", size: 20 }, signal), `drafts:${user.id}`);
  const rows = (drafts.data?.content ?? []).slice().sort((a, b) => b.id - a.id);
  if (!rows.length) return null;
  return <section className="flow-drafts" aria-label="작성 중인 의뢰">
    <header>
      <h2><PenLine size={15} aria-hidden="true" /> 작성 중인 의뢰 {rows.length}건</h2>
      <TextLink onClick={() => setActiveMenu("sent")}>내 의뢰에서 보기</TextLink>
    </header>
    <ul>
      {rows.slice(0, 4).map((row) => <li key={row.id}>
        <button type="button" onClick={() => onContinue(row.id)}>
          <strong>{row.title || "제목 없음"}</strong>
          <small>{[row.equipment?.name, row.createdAt ? `${formatAgo(row.createdAt)} 시작` : null].filter(Boolean).join(", ")}</small>
          <span className="flow-drafts__go">이어 쓰기</span>
        </button>
      </li>)}
    </ul>
  </section>;
}
