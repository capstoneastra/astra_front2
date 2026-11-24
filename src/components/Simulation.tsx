import { lazy, Suspense, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import { canAccessMenu } from "../auth/permissions";
import { availabilityLabels, availabilityTone } from "../domain/constants";
import { useWorkspace } from "../context/AppContext";
import { Table, proportional, pixel } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Badge, Button, FormField, PageHeader, Panel } from "./ui/index";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { simulationService } from "../services/simulationService";
import type { SimulationInput, SimulationResult } from "../services/simulationService";
import { Feedback } from "./workflow/Feedback";
import SimulationPicker from "./workflow/SimulationPicker";
import { testTypeLabel } from "../services/equipmentService";
import SimulationChart from "./workflow/SimulationChart";
import ApiState from "./ui/ApiState";
import SimulationExports from "./workflow/SimulationExports";
import { formatAgo } from "../domain/format";
import { simulationLabel, simulationValue } from "../domain/simulationLabels";
const SimulationStage = lazy(() => import("./workflow/SimulationStage"));
/** 계산 방식 코드 → 화면 이름 */
const capabilityLabels: Record<string, string> = {
  CALCULATED_DEMO: "계산 모델(참고용)",
  RULE_BASED_DEMO: "규칙 기반(참고용)",
  VISUAL_DEMO: "개념 시각화(참고용)",
};
/**
 * 가상 시험: 장비 예약이 차 있거나 일정이 멀어도, 기업이 결과를 대략 가늠해 볼 수 있게 한다.
 * 실제 시험이 아니므로 DEMO 표시를 유지하고, 정확한 결과는 의뢰로 이어지게 한다.
 */
export default function Simulation({ setActiveMenu }: { setActiveMenu?: (menu: string) => void }) {
  const {
      equipmentList,
      simulationEquipmentId,
      setSimulationEquipmentId,
      requirementId,
      user,
      setSelectedEquipment,
      setDraftRequestId,
    } = useWorkspace(),
    [edited, setEdited] = useState<{ presetId: string; values: SimulationInput } | null>(null),
    [result, setResult] = useState<SimulationResult | null>(null),
    action = useAction();
  const models = useApiQuery(
    (signal) => simulationService.models(signal),
    "simulation-models",
  );
  const presets = useApiQuery(
    (signal) => simulationService.presets(simulationEquipmentId, signal),
    `simulation-presets:${simulationEquipmentId}`,
    Boolean(simulationEquipmentId),
  );
  const history = useApiQuery(
    (signal) => simulationService.history(signal),
    "simulation-history",
  );
  // 가상 시험이 되는 장비만 (목록 응답의 simulation.presetIds). 그 정보가 아예 없으면(서버 없이 보기) 전부 보여 준다.
  const known = equipmentList.some((item) => item.simulation !== undefined);
  const simulatable = known ? equipmentList.filter((item) => (item.simulation?.presetIds?.length ?? 0) > 0) : equipmentList;
  const chooseEquipment = (id: number | null) => {
    setSimulationEquipmentId(id);
    setEdited(null);
    setResult(null);
  };
  // 기본은 간단 보기(입력·그래프·핵심 수치). 3D 시험실은 고를 때만 불러온다.
  const [view, setView] = useState<"simple" | "3d">("simple");
  const selected = equipmentList.find((item) => item.id === simulationEquipmentId) ?? null;
  // 장비마다 가상 모델(프리셋)이 하나씩이라 고르지 않고 첫 번째를 쓴다
  const preset =
      presets.data?.[0],
    model = models.data?.find((m) => m.modelType === preset?.modelType),
    input =
      edited && edited.presetId === preset?.presetId
        ? edited.values
        : (preset?.inputParameters ?? {});
  const shownResult = result && result.presetId === preset?.presetId ? result : null;
  // 실제 시험 의뢰로 넘어가는 버튼
  const requestButton = selected && canAccessMenu(user.role, "request") && setActiveMenu ? (
    <Button variant="secondary" icon={ArrowRight} disabled={selected.institutionId === user.organization?.id}
      title={selected.institutionId === user.organization?.id ? "우리 기관 장비에는 의뢰할 수 없습니다" : undefined}
      onClick={() => { setDraftRequestId(null); setSelectedEquipment(selected); setActiveMenu("request"); }}>
      이 장비로 실제 시험 맡기기
    </Button>
  ) : null;
  const run = () => {
    if (!preset) return;
    setResult(null);
    void action.run(async (signal) =>
      setResult(await simulationService.run({
        presetId: preset.presetId,
        inputParameters: input,
        ...(requirementId ? { requirementId } : {}),
      }, signal)));
  };

  return (
    <div className="content-page page-enter sim-page">
      <PageHeader title="가상 시험" description="예약이 차 있어도 결과를 먼저 가늠해 보세요">
        <SegmentedControl label="보기 방식" size="sm" value={view} onChange={(value) => setView(value as "simple" | "3d")}>
          <SegmentedControlItem value="simple" label="간단 보기" />
          <SegmentedControlItem value="3d" label="3D 보기" />
        </SegmentedControl>
      </PageHeader>

      {/* 한 장에: ① 장비 고르기 → ② 입력값 → ③ 결과 */}
      <Panel className="sim-card">
        <SimulationPicker key={simulationEquipmentId ?? "none"} equipment={simulatable} selectedId={simulationEquipmentId} onChoose={chooseEquipment} />
        <p className="sim-note"><Info size={13} aria-hidden="true" /> 계산 모델로 만든 참고값이에요. 실제 장비 성능·시험 적합성·성적서를 대신하지 않습니다.</p>

        {selected && <section className="sim-section" aria-label="고른 장비와 입력값">
          <header className="sim-equipment">
            <span className="sim-equipment__name">
              <strong>{selected.name}</strong>
              <small>{[selected.institution, selected.testTypes.map(testTypeLabel).join(", ")].filter(Boolean).join(", ")}</small>
            </span>
            <span className="sim-equipment__tags">
              <Badge tone={availabilityTone[selected.availability ?? "UNKNOWN"]} dot>{availabilityLabels[selected.availability ?? "UNKNOWN"]}</Badge>
              {model && <Badge tone="amber">{capabilityLabels[model.capability] ?? "참고용 계산"}</Badge>}
            </span>
          </header>

          {(models.loading || models.error || presets.loading || presets.error) &&
            <ApiState loading={models.loading || presets.loading} error={models.error ?? presets.error}
              onRetry={() => { models.reload(); presets.reload(); }} />}
          {presets.data?.length === 0 && <p className="inline-empty">
            이 장비로는 아직 가상 시험을 할 수 없습니다. 위에서 다른 장비를 골라 보세요.
          </p>}

          {model && preset && <form onSubmit={(e) => { e.preventDefault(); run(); }}>
            <p className="sim-model">{model.description}<small>{model.limitation}</small></p>
            <div className="sim-inputs">
              {model.requiredInputFields.map((field) => (
                <FormField key={field} id={`simulation-${field}`} label={simulationLabel(field)}>
                  <input
                    id={`simulation-${field}`}
                    type={typeof preset.inputParameters[field] === "number" ? "number" : "text"}
                    step="any"
                    required
                    value={input[field] ?? ""}
                    onChange={(e) => {
                      setResult(null);
                      setEdited({
                        presetId: preset.presetId,
                        values: {
                          ...input,
                          [field]: typeof preset.inputParameters[field] === "number"
                            ? e.target.value === "" ? "" : Number(e.target.value)
                            : e.target.value,
                        },
                      });
                    }}
                  />
                </FormField>
              ))}
            </div>
            <div className="form-actions">
              <span className="small-note">처음 값은 예시예요. 내 시료에 맞게 바꿔 보세요.</span>
              {requestButton}
              <Button type="submit" disabled={action.busy}>{action.busy ? "계산 중…" : "가상 시험 실행"}</Button>
            </div>
          </form>}
          <Feedback action={action} />
        </section>}

        {view === "3d" && model && preset && (
          <Suspense fallback={<div className="sim-stage-loading" role="status">3D 시험실을 준비하고 있습니다…</div>}>
            <SimulationStage
              key={preset.presetId}
              modelType={model.modelType}
              input={input}
              result={shownResult}
              equipmentName={selected?.name ?? "선택 장비"}
            />
          </Suspense>
        )}

        {shownResult && <section className="sim-section sim-result" aria-label="가상 시험 결과">
          <header className="sim-result__head">
            <h2>결과</h2>
            <SimulationExports key={shownResult.id} result={shownResult} equipment={equipmentList.find((item) => item.id === shownResult.equipmentId)} />
          </header>
          {shownResult.output.summary && (
            <dl className="sim-summary">
              {Object.entries(shownResult.output.summary).map(([key, value]) => (
                <div key={key}><dt>{simulationLabel(key)}</dt><dd>{simulationValue(value)}</dd></div>
              ))}
            </dl>
          )}
          {shownResult.output.chart && <SimulationChart chart={shownResult.output.chart} />}
          {shownResult.output.checks && (
            <div className="table-scroll">
              <table>
                <thead><tr><th>예시 사양</th><th>입력</th><th>가상 비교</th><th>출처</th></tr></thead>
                <tbody>
                  {shownResult.output.checks.map((c) => (
                    <tr key={c.key}>
                      <td>{c.key}</td>
                      <td>{c.input}</td>
                      <td>{({ MET: "가상 범위 내", NOT_MET: "가상 범위 초과", UNKNOWN: "미확인" } as Record<string, string>)[c.result]}</td>
                      <td>{c.sourceType ?? "정보 없음"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {shownResult.output.concept && (
            <p>{shownResult.output.concept.label}: {shownResult.output.concept.value} {shownResult.output.concept.unit}, 개념 시각화</p>
          )}
          {shownResult.output.steps && (
            <ol className="condition-steps">{shownResult.output.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
          )}
          {(shownResult.warning || shownResult.limitation) &&
            <p className="sim-note">{[shownResult.warning, shownResult.limitation].filter(Boolean).join(" ")}</p>}
          {requestButton && <div className="form-actions">
            <span className="small-note">정확한 결과와 성적서가 필요하면 실제 시험을 맡기세요.</span>
            {requestButton}
          </div>}
        </section>}

        {/* 지난 가상 시험: 같은 카드 아래에 접어 둔다 */}
        <details className="sim-history">
          <summary>지난 가상 시험 {history.data?.content.length ?? ""}</summary>
          {history.loading || history.error ? (
            <ApiState loading={history.loading} error={history.error} onRetry={history.reload} />
          ) : history.data?.content.length ? (
            <Table<SimulationResult & Record<string, unknown>>
              data={history.data.content as (SimulationResult & Record<string, unknown>)[]}
              idKey="id"
              density="compact"
              hasHover
              columns={[
                { key: "equipment", header: "장비", width: proportional(1.5), renderCell: (r) =>
                  <Text>{equipmentList.find((item) => item.id === r.equipmentId)?.name ?? `장비 ${r.equipmentId}`}</Text> },
                { key: "model", header: "계산 내용", width: proportional(2), renderCell: (r) =>
                  <Text color="secondary">{models.data?.find((m) => m.modelType === r.modelType)?.description ?? "가상 시험"}</Text> },
                { key: "createdAt", header: "실행", width: pixel(110), renderCell: (r) =>
                  <Text hasTabularNumbers color="secondary">{formatAgo(r.createdAt)}</Text> },
                { key: "open", header: <span className="sr-only">동작</span>, width: pixel(100), align: "end", renderCell: (r) =>
                  <Button variant="secondary" className="button--sm" onClick={() =>
                    action.run(async (signal) => {
                      const saved = await simulationService.result(r.id, signal);
                      setSimulationEquipmentId(saved.equipmentId);
                      setEdited({ presetId: saved.presetId, values: saved.inputParameters });
                      setResult(saved);
                    })}>결과 보기</Button> },
              ]}
            />
          ) : (
            <p className="inline-empty">아직 실행한 가상 시험이 없습니다.</p>
          )}
        </details>
      </Panel>
    </div>
  );
}
