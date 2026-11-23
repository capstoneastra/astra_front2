import { useState } from "react";
import { ArrowRight, BookOpen, BotMessageSquare, Columns3, RotateCcw } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { Badge, Button, PageHeader, Panel, TextLink } from "./ui";
import ApiState from "./ui/ApiState";
import { Feedback } from "./workflow/Feedback";
import RequirementWorkbench from "./workflow/RequirementWorkbench";
import Reservation from "./Reservation";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { catalogService } from "../services/catalogService";
import { requirementService } from "../services/requirementService";
import { requestService } from "../services/requestService";
import type { MatchRun, RequestBox } from "../services/contracts";
import {
  accessScopeLabels,
  availabilityLabels,
  availabilityTone,
  checkLabels,
  verdictLabels,
} from "../domain/constants";

type Step = 1 | 2 | 3;
const steps: { id: Step; label: string }[] = [
  { id: 1, label: "조건 말하기" },
  { id: 2, label: "추천 장비" },
  { id: 3, label: "의뢰서" },
];

/** 조건 입력 화면의 도움말: 선택한 시험유형의 가능 기관·예상 비용·입력할 조건 (구 '시험 정보 안내') */
function TestTypeHelp({ code, openTestInfo }: { code: string; openTestInfo: (code: string) => void }) {
  const query = useApiQuery((signal) => catalogService.testType(code, signal), `test-type:${code}`, Boolean(code));
  const data = query.data;
  if (!data) return <ApiState loading={query.loading} error={query.error} onRetry={query.reload} />;
  const costs = data.institutions.map((item) => item.estCostMin).filter((value): value is number => value != null);
  const days = data.institutions.map((item) => item.estDurationDays).filter((value): value is number => value != null);
  return <div className="request-help">
    <p><strong>{data.nameKo}</strong> {data.description}</p>
    <ul>
      <li>가능 조직 {data.institutions.length}곳 · 장비 {data.institutions.reduce((sum, item) => sum + item.equipmentCount, 0)}대</li>
      <li>예상 비용 {costs.length ? `${Math.min(...costs).toLocaleString("ko-KR")}원부터` : "조직 확인 필요"}
        {days.length ? ` · 최소 ${Math.min(...days)}일` : ""}</li>
      <li>입력할 조건: {data.conditionRules.map((rule) => `${rule.label}${rule.isRequired ? "*" : ""}`).join(", ")}</li>
    </ul>
    <TextLink onClick={() => openTestInfo(code)}>시험 정보 자세히</TextLink>
  </div>;
}

function ConditionStep({ setActiveMenu, onMatched }: { setActiveMenu: (menu: string) => void; onMatched: (run: MatchRun) => void }) {
  const { requirementId, setRequirementId, openTestInfo } = useWorkspace();
  const types = useApiQuery((signal) => catalogService.testTypes(signal), "test-types");
  const [form, setForm] = useState({ testTypeCode: "VIBRATION", title: "", purpose: "", sampleName: "", sampleQuantity: 1 });
  const requirement = useApiQuery((signal) => requirementService.get(requirementId, signal), `requirement:${requirementId}`, Boolean(requirementId));
  const action = useAction();
  const helpCode = requirement.data?.testTypeCode ?? form.testTypeCode;
  return <div className="request-step">
    <div>
      {requirementId ? <>
        <RequirementWorkbench key={requirementId} requirementId={requirementId} onMatched={onMatched} />
        <Button variant="ghost" className="button--sm" icon={RotateCcw} onClick={() => setRequirementId(null)}>조건 새로 쓰기</Button>
      </> : <Panel title="어떤 시험이 필요한가요?">
        <form className="request-form__body" onSubmit={(event) => {
          event.preventDefault();
          action.run(async (signal) => {
            const result = await requirementService.create(form, signal);
            setRequirementId(result.id);
          });
        }}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="flow-test-type">시험유형 <b>*</b></label>
              <select id="flow-test-type" value={form.testTypeCode} onChange={(e) => setForm({ ...form, testTypeCode: e.target.value })}>
                {types.data?.map((t) => <option key={t.code} value={t.code}>{t.nameKo}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="flow-title" className="label-optional">제목 <span>(선택)</span></label>
              <input id="flow-title" value={form.title} placeholder="예: 위성 전장품 진동시험" onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="form-field">
              <label htmlFor="flow-sample" className="label-optional">시료명 <span>(선택)</span></label>
              <input id="flow-sample" value={form.sampleName} onChange={(e) => setForm({ ...form, sampleName: e.target.value })} />
            </div>
            <div className="form-field">
              <label htmlFor="flow-quantity" className="label-optional">시료 수량 <span>(선택)</span></label>
              <input id="flow-quantity" className="input--short" type="number" min="1" step="1" value={form.sampleQuantity}
                onChange={(e) => setForm({ ...form, sampleQuantity: Number(e.target.value) })} />
            </div>
            <div className="form-field form-field--full">
              <label htmlFor="flow-purpose">시험 목적 <b>*</b></label>
              <textarea id="flow-purpose" required rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </div>
          </div>
          {types.error && <ApiState error={types.error} onRetry={types.reload} />}
          <Feedback action={action} />
          <div className="form-actions">
            <span className="small-note">다음 화면에서 질량·주파수 같은 세부 조건을 입력합니다.</span>
            <Button type="submit" icon={ArrowRight} disabled={action.busy || !types.data || !form.purpose.trim()}>조건 입력으로</Button>
          </div>
        </form>
      </Panel>}
    </div>
    <aside className="request-step__aside">
      <Panel title="AI 상담으로 정리하기">
        <div className="request-help">
          <p>말로 설명하면 AI가 조건을 정리해 이 화면으로 넘겨 줍니다.</p>
          <Button variant="secondary" icon={BotMessageSquare} onClick={() => setActiveMenu("chatbot")}>ASTRA AI 열기</Button>
        </div>
      </Panel>
      <Panel title="시험 정보" action={<BookOpen size={14} aria-hidden="true" />}>
        <TestTypeHelp code={helpCode} openTestInfo={openTestInfo} />
      </Panel>
    </aside>
  </div>;
}

function MatchStep({ matchRun, onChoose, setActiveMenu }: {
  matchRun: MatchRun;
  onChoose: (draftId: number) => void;
  setActiveMenu: (menu: string) => void;
}) {
  const { comparisonIds, setComparisonIds, setSelectedEquipment, resolveEquipment } = useWorkspace();
  const [open, setOpen] = useState<number | null>(matchRun.results[0]?.id ?? null);
  const action = useAction();
  const choose = (result: MatchRun["results"][number]) => action.run(async (signal) => {
    const draft = await requestService.aiDraft({
      requirementId: matchRun.requirementId, equipmentId: result.equipment.id, matchResultId: result.id,
    }, signal);
    setSelectedEquipment((await resolveEquipment(result.equipment.id, signal)) ?? null);
    onChoose(draft.requestId);
  });
  return <Panel title={`추천 장비 ${matchRun.results.length}대`}
    action={<Button variant="secondary" className="button--sm" icon={Columns3} disabled={comparisonIds.length < 2}
      onClick={() => setActiveMenu("compare")}>비교 ({comparisonIds.length})</Button>}>
    {matchRun.results.length === 0 ? <p className="inline-empty">조건에 맞는 장비 후보가 없습니다. 조건을 다시 확인하거나 장비 찾기에서 직접 골라 주세요.
      <Button variant="secondary" onClick={() => setActiveMenu("search")}>장비 찾기</Button></p> :
      <div className="table-scroll"><table className="data-table equipment-table">
        <thead><tr><th><span className="sr-only">비교</span></th><th>장비</th><th>판정</th><th>상태</th><th>이유</th><th /></tr></thead>
        <tbody>{matchRun.results.map((result) => {
          const equipment = result.equipment as MatchRun["results"][number]["equipment"] & { availability?: string; accessScope?: string };
          const checked = comparisonIds.includes(equipment.id);
          return [<tr key={result.id}>
            <td><input type="checkbox" aria-label={`${equipment.name} 비교에 담기`} checked={checked}
              disabled={!checked && comparisonIds.length >= 5}
              onChange={(e) => setComparisonIds((ids) => e.target.checked ? [...ids, equipment.id] : ids.filter((id) => id !== equipment.id))} /></td>
            <td><button type="button" className="row-title" aria-expanded={open === result.id}
              onClick={() => setOpen(open === result.id ? null : result.id)}>{result.rank}. {equipment.name}</button>
              <small>{equipment.institutionName} · {equipment.externalId}</small></td>
            <td><Badge tone={result.verdict === "SUITABLE" ? "green" : result.verdict === "UNSUITABLE" ? "red" : "amber"}>
              {verdictLabels[result.verdict] ?? result.verdict}</Badge><small>{Math.round(result.score)}점</small></td>
            <td><div className="badges">
              <Badge tone={availabilityTone[equipment.availability ?? "UNKNOWN"]} dot>{availabilityLabels[equipment.availability ?? "UNKNOWN"]}</Badge>
              {accessScopeLabels[equipment.accessScope ?? ""] && <Badge tone={equipment.accessScope === "EXTERNAL_ALLOWED" ? "blue" : "violet"}>
                {accessScopeLabels[equipment.accessScope]}</Badge>}
              {result.usedMockData && <Badge tone="amber">DEMO</Badge>}
            </div></td>
            <td className="match-reason">{result.reason}</td>
            <td className="cell-actions"><Button className="button--sm" icon={ArrowRight} disabled={action.busy || result.verdict === "UNSUITABLE"}
              title={result.verdict === "UNSUITABLE" ? "조건이 맞지 않는 장비입니다" : undefined}
              onClick={() => choose(result)}>이 장비로 의뢰</Button></td>
          </tr>, open === result.id && <tr key={`${result.id}-checks`} className="match-checks"><td />
            <td colSpan={5}><div className="badges">{result.checks.map((check) => <span key={check.conditionKey} className="small-note">
              <Badge tone={check.result === "MET" ? "green" : check.result === "NOT_MET" ? "red" : "neutral"}>{checkLabels[check.result]}</Badge>{" "}
              {check.conditionKey} 요구 {check.requiredText ?? "—"} / 장비 {check.equipmentText ?? "—"}</span>)}</div></td></tr>];
        })}</tbody>
      </table></div>}
    <Feedback action={action} />
    <p className="small-note request-form__body">{matchRun.disclaimer}</p>
  </Panel>;
}

/**
 * 시험 맡기기: ① 조건 말하기(AI 상담 또는 직접 입력) → ② 추천 장비 → ③ 의뢰서(조건·장비 자동 채움) → 초안 저장/제출
 * 장비 찾기·비교·AI 상담에서 "이 장비로 의뢰"를 누르면 ③으로 바로 들어온다.
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
  return <div className="content-page page-enter">
    <PageHeader title="시험 맡기기">
      <ol className="stepper" aria-label="진행 단계">
        {steps.map(({ id, label }) => <li key={id}>
          <button type="button" aria-current={step === id ? "step" : undefined} disabled={!canOpen(id)} onClick={() => setStep(id)}>
            <span>{id}</span>{label}
          </button>
        </li>)}
      </ol>
      {(draftRequestId || selectedEquipment || matchRun || requirementId) &&
        <Button variant="ghost" className="button--sm" icon={RotateCcw} onClick={restart}>처음부터</Button>}
    </PageHeader>
    {step === 1 && <ConditionStep setActiveMenu={setActiveMenu} onMatched={(run) => { setMatchRun(run); setStep(2); }} />}
    {step === 2 && matchRun && <MatchStep matchRun={matchRun} setActiveMenu={setActiveMenu}
      onChoose={(id) => { setDraftRequestId(id); setStep(3); }} />}
    {step === 3 && <Reservation key={draftRequestId ?? "new"} setActiveMenu={setActiveMenu} openRequest={openRequest}
      onChangeEquipment={() => { setSelectedEquipment(null); setStep(matchRun ? 2 : 1); if (!matchRun) setActiveMenu("search"); }} />}
  </div>;
}
