import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Columns3, Info, RotateCcw, Sparkles } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { HStack } from "@astryxdesign/core/HStack";
import { Badge, Button, PageHeader, Panel, TextLink } from "./ui";
import ApiState from "./ui/ApiState";
import { Feedback } from "./workflow/Feedback";
import RequirementWorkbench from "./workflow/RequirementWorkbench";
import Reservation from "./Reservation";
import { DraftShelf, FlowSummary, StepRail } from "./request/FlowSide";
import type { Step } from "./request/FlowSide";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { catalogService } from "../services/catalogService";
import { requirementService } from "../services/requirementService";
import { requestService } from "../services/requestService";
import { chatService } from "../services/chatService";
import { conditionName } from "../domain/conditionNames";
import { testTypeLabel } from "../services/equipmentService";
import type { MatchRun, RequestBox } from "../services/contracts";
import {
  availabilityLabels,
  availabilityTone,
  verdictLabels,
} from "../domain/constants";


/** 고른 시험 종류 한 줄 안내: 가능 기관·장비 수·예상 비용·기간 */
function TestTypeHelp({ code, openTestInfo }: { code: string; openTestInfo: (code: string) => void }) {
  const query = useApiQuery((signal) => catalogService.testType(code, signal), `test-type:${code}`, Boolean(code));
  const data = query.data;
  if (!data) return query.error ? <ApiState error={query.error} onRetry={query.reload} /> : null;
  const costs = data.institutions.map((item) => item.estCostMin).filter((value): value is number => value != null);
  const days = data.institutions.map((item) => item.estDurationDays).filter((value): value is number => value != null);
  const facts = [
    `시험기관 ${data.institutions.length}곳`,
    `장비 ${data.institutions.reduce((sum, item) => sum + item.equipmentCount, 0)}대`,
    costs.length ? `예상 비용 ${Math.min(...costs).toLocaleString("ko-KR")}원부터` : "비용은 기관 문의",
    days.length ? `최소 ${Math.min(...days)}일` : null,
  ].filter(Boolean);
  return <p className="flow-help">
    <Info size={14} aria-hidden="true" />
    <span><strong>{data.nameKo}</strong> {facts.join(", ")}</span>
    <TextLink onClick={() => openTestInfo(code)}>자세히</TextLink>
  </p>;
}

/** 말로 설명하면 AI가 조건을 정리해 아래 칸을 채운다 (이 화면의 AI는 이것 하나) */
function AiFill({ onFilled }: { onFilled: (requirementId: number) => void }) {
  const { setChatSessionId } = useWorkspace();
  const [text, setText] = useState("");
  const action = useAction();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const sentence = text.trim();
    if (!sentence) return;
    void action.run(async (signal) => {
      const session = await chatService.create(sentence.slice(0, 40), signal);
      await chatService.send(session.id, sentence, signal);
      const requirement = await chatService.requirement(session.id, signal);
      setChatSessionId(session.id);
      onFilled(requirement.id);
    });
  };
  return <form className="flow-ai" onSubmit={submit} role="search">
    <label htmlFor="flow-ai-input" className="flow-ai__label">
      <Sparkles size={16} aria-hidden="true" /> 말로 설명하면 AI가 조건을 채워 드려요
    </label>
    <div className="flow-ai__box">
      <input id="flow-ai-input" value={text} autoComplete="off" disabled={action.busy}
        placeholder="예: 15kg 위성 전장품을 20~2000Hz로 진동시험 하고 싶어요"
        onChange={(event) => setText(event.target.value)} />
      <Button type="submit" disabled={action.busy || !text.trim()}>{action.busy ? "정리하는 중…" : "AI로 채우기"}</Button>
    </div>
    {action.error && <p className="flow-ai__error" role="alert">
      {action.error.message} 아래에서 직접 골라도 됩니다.
    </p>}
  </form>;
}

function ConditionStep({ onMatched }: { onMatched: (run: MatchRun) => void }) {
  const { requirementId, setRequirementId, openTestInfo } = useWorkspace();
  const types = useApiQuery((signal) => catalogService.testTypes(signal), "test-types");
  const [form, setForm] = useState({ testTypeCode: "VIBRATION", title: "", purpose: "", sampleName: "", sampleQuantity: 1 });
  const requirement = useApiQuery((signal) => requirementService.get(requirementId, signal), `requirement:${requirementId}`, Boolean(requirementId));
  const action = useAction();
  const req = requirementId ? requirement.data : null;

  return <Panel className="flow-card">
    <AiFill onFilled={setRequirementId} />
    <div className="flow-divider"><span>{req ? "정리된 조건" : "또는 직접 고르기"}</span></div>

    {req ? <>
      {/* 기본 정보는 한 줄 요약, 아래에서 세부 조건만 손본다 */}
      <div className="flow-summary">
        <span className="flow-summary__type">{testTypeLabel(req.testTypeCode)}</span>
        <span className="flow-summary__text">
          {[req.purpose, req.sampleName ? `${req.sampleName}${req.sampleQuantity ? ` ${req.sampleQuantity}개` : ""}` : null].filter(Boolean).join(", ") || "목적은 의뢰서에서 적어도 돼요"}
        </span>
        <Button variant="ghost" className="button--sm" icon={RotateCcw} onClick={() => setRequirementId(null)}>다시 쓰기</Button>
      </div>
      <TestTypeHelp code={req.testTypeCode} openTestInfo={openTestInfo} />
      <RequirementWorkbench key={requirementId} requirementId={requirementId!} onMatched={onMatched} plain />
    </> : <form onSubmit={(event) => {
      event.preventDefault();
      action.run(async (signal) => {
        const result = await requirementService.create(form, signal);
        setRequirementId(result.id);
      });
    }}>
      <div className="flow-grid">
        <div className="form-field">
          <label htmlFor="flow-test-type">시험 종류 <b>*</b></label>
          <select id="flow-test-type" value={form.testTypeCode} onChange={(e) => setForm({ ...form, testTypeCode: e.target.value })}>
            {types.data?.map((t) => <option key={t.code} value={t.code}>{t.nameKo}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="flow-sample" className="label-optional">시료명 <span>(선택)</span></label>
          <input id="flow-sample" value={form.sampleName} placeholder="예: 위성 전장품" onChange={(e) => setForm({ ...form, sampleName: e.target.value })} />
        </div>
        <div className="form-field">
          <label htmlFor="flow-quantity" className="label-optional">수량 <span>(선택)</span></label>
          <input id="flow-quantity" type="number" min="1" step="1" value={form.sampleQuantity}
            onChange={(e) => setForm({ ...form, sampleQuantity: Number(e.target.value) })} />
        </div>
        <div className="form-field flow-grid__wide">
          <label htmlFor="flow-purpose">시험 목적 <b>*</b></label>
          <input id="flow-purpose" required value={form.purpose} placeholder="예: 발사 환경 진동에 견디는지 확인"
            onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        </div>
      </div>
      <TestTypeHelp code={form.testTypeCode} openTestInfo={openTestInfo} />
      {types.error && <ApiState error={types.error} onRetry={types.reload} />}
      <Feedback action={action} />
      <div className="form-actions">
        <span className="small-note">다음에 질량·주파수 같은 세부 조건을 넣습니다.</span>
        <Button type="submit" icon={ArrowRight} disabled={action.busy || !types.data || !form.purpose.trim()}>세부 조건 넣기</Button>
      </div>
    </form>}
  </Panel>;
}

/**
 * ② 장비 고르기: 장비 한 줄에 판정·상태·조건 충족 여부를 한 번에.
 * 서버의 이유 문장(result.reason)은 AI가 쓴 글이라 형식이 매번 달라, 조건별 표시로 대신한다.
 */
function MatchStep({ matchRun, onChoose, onBack, setActiveMenu }: {
  matchRun: MatchRun;
  onChoose: (draftId: number) => void;
  onBack: () => void;
  setActiveMenu: (menu: string) => void;
}) {
  const { comparisonIds, setComparisonIds, setSelectedEquipment, resolveEquipment, openSimulation } = useWorkspace();
  const action = useAction();
  const choose = (result: MatchRun["results"][number]) => action.run(async (signal) => {
    const draft = await requestService.aiDraft({
      requirementId: matchRun.requirementId, equipmentId: result.equipment.id, matchResultId: result.id,
    }, signal);
    setSelectedEquipment((await resolveEquipment(result.equipment.id, signal)) ?? null);
    onChoose(draft.requestId);
  });
  const results = matchRun.results;
  const suitable = results.filter((result) => result.verdict === "SUITABLE").length;
  return <Panel className="flow-card">
    <div className="flow-match__head">
      <div>
        <strong>맞는 장비 {results.length}대</strong>
        <span className="small-note">{suitable ? `조건을 모두 충족하는 장비 ${suitable}대` : "조건을 모두 충족하는 장비는 없어요"}</span>
      </div>
      <HStack gap={2}>
        <Button variant="ghost" className="button--sm" icon={RotateCcw} onClick={onBack}>조건 고치기</Button>
        <Button variant="secondary" className="button--sm" icon={Columns3} disabled={comparisonIds.length < 2}
          onClick={() => setActiveMenu("compare")}>{comparisonIds.length ? `${comparisonIds.length}대 비교` : "비교"}</Button>
      </HStack>
    </div>
    {results.length === 0 ? <p className="inline-empty">조건에 맞는 장비가 없습니다. 조건을 고치거나 장비 찾기에서 직접 골라 주세요.
      <Button variant="secondary" onClick={() => setActiveMenu("search")}>장비 찾기</Button></p> :
      <ol className="flow-match">
        {results.map((result) => {
          const equipment = result.equipment as MatchRun["results"][number]["equipment"] & { availability?: string; accessScope?: string };
          const checked = comparisonIds.includes(equipment.id);
          return <li key={result.id} className={`flow-match__row ${result.verdict === "UNSUITABLE" ? "is-unsuitable" : ""}`}>
            <input type="checkbox" aria-label={`${equipment.name} 비교에 담기`} checked={checked}
              disabled={!checked && comparisonIds.length >= 5}
              onChange={(e) => setComparisonIds((ids) => e.target.checked ? [...ids, equipment.id] : ids.filter((id) => id !== equipment.id))} />
            <span className="flow-match__rank">{result.rank}</span>
            <div className="flow-match__main">
              <div className="flow-match__title">
                <strong>{equipment.name}</strong>
                <span>{equipment.institutionName}</span>
              </div>
              <div className="flow-match__checks">
                <Badge tone={result.verdict === "SUITABLE" ? "green" : result.verdict === "UNSUITABLE" ? "red" : "amber"}>
                  {verdictLabels[result.verdict] ?? result.verdict}</Badge>
                <Badge tone={availabilityTone[equipment.availability ?? "UNKNOWN"]} dot>
                  {equipment.availability && equipment.availability !== "UNKNOWN" ? availabilityLabels[equipment.availability] : "가용 상태 확인 전"}</Badge>
                {result.checks.map((check) => <span key={check.conditionKey}
                  className={`flow-check flow-check--${check.result === "MET" ? "ok" : check.result === "NOT_MET" ? "no" : "unknown"}`}
                  title={`필요 ${check.requiredText ?? "정보 없음"}, 장비 ${check.equipmentText ?? "정보 없음"}`}>
                  {check.result === "MET" ? "✓" : check.result === "NOT_MET" ? "✕" : "?"} {conditionName(check.conditionKey)}
                  {check.equipmentText && <small> {check.equipmentText}</small>}
                </span>)}
              </div>
            </div>
            <div className="flow-match__actions">
              {equipment.availability !== "AVAILABLE" && <Button variant="ghost" className="button--sm"
                title="예약이 차 있어도 결과를 미리 가늠해 볼 수 있습니다" onClick={() => openSimulation(equipment.id)}>가상 시험</Button>}
              <Button className="button--sm" icon={ArrowRight} disabled={action.busy || result.verdict === "UNSUITABLE"}
                title={result.verdict === "UNSUITABLE" ? "조건이 맞지 않는 장비입니다" : undefined}
                onClick={() => choose(result)}>이 장비로 맡기기</Button>
            </div>
          </li>;
        })}
      </ol>}
    <Feedback action={action} />
    {results.some((result) => result.usedMockData) && <p className="small-note">일부 장비는 예시 사양으로 비교했습니다. {matchRun.disclaimer}</p>}
  </Panel>;
}

/**
 * 시험 맡기기: ① 조건 말하기(AI 상담 또는 직접 입력) → ② 추천 장비 → ③ 의뢰서(조건·장비 자동 채움) → 초안 저장/제출
 * 장비 찾기·비교·AI 상담에서 "이 장비로 맡기기"를 누르면 ③으로 바로 들어온다.
 */
export default function RequestFlow({ setActiveMenu, openRequest }: {
  setActiveMenu: (menu: string) => void;
  openRequest: (box: RequestBox, requestId?: number) => void;
}) {
  const { draftRequestId, setDraftRequestId, selectedEquipment, setSelectedEquipment, matchRun, setMatchRun, requirementId, setRequirementId } = useWorkspace();
  const [step, setStep] = useState<Step>(draftRequestId || selectedEquipment ? 3 : matchRun ? 2 : 1);
  const canOpen = (id: Step) => id === 1 || (id === 2 && Boolean(matchRun)) || (id === 3 && Boolean(draftRequestId || selectedEquipment));
  const restart = () => {
    setDraftRequestId(null);
    setSelectedEquipment(null);
    setMatchRun(null);
    setRequirementId(null);
    setStep(1);
  };
  const continueDraft = (id: number) => {
    setSelectedEquipment(null);
    setDraftRequestId(id);
    setStep(3);
  };
  // 왼쪽 단계 안내 | 가운데 지금 단계 | 오른쪽 지금까지 정한 것. 좁은 화면에서는 위아래로 쌓인다.
  return <div className="content-page content-page--flow page-enter">
    <PageHeader title="시험 맡기기">
      {(draftRequestId || selectedEquipment || matchRun || requirementId) &&
        <Button variant="ghost" className="button--sm" icon={RotateCcw} onClick={restart}>처음부터</Button>}
    </PageHeader>
    <div className="flow-layout">
      <StepRail step={step} canOpen={canOpen} onStep={setStep} />
      <div className="flow-main">
        {step === 1 && <ConditionStep onMatched={(run) => { setMatchRun(run); setStep(2); }} />}
        {step === 2 && matchRun && <MatchStep matchRun={matchRun} setActiveMenu={setActiveMenu} onBack={() => setStep(1)}
          onChoose={(id) => { setDraftRequestId(id); setStep(3); }} />}
        {step === 3 && <Reservation key={draftRequestId ?? "new"} setActiveMenu={setActiveMenu} openRequest={openRequest}
          onChangeEquipment={() => { setSelectedEquipment(null); setStep(matchRun ? 2 : 1); if (!matchRun) setActiveMenu("search"); }} />}
        {step === 1 && !requirementId && <DraftShelf onContinue={continueDraft} setActiveMenu={setActiveMenu} />}
      </div>
      <FlowSummary step={step} setActiveMenu={setActiveMenu} />
    </div>
  </div>;
}
