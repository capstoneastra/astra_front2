import { lazy, Suspense, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import { canAccessMenu } from "../auth/permissions";
import { availabilityLabels, availabilityTone, formatDate } from "../domain/constants";
import { useWorkspace } from "../context/AppContext";
import { catalogService } from "../services/catalogService";
import { Table, proportional, pixel } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Badge, Button, FormField, PageHeader, Panel } from "./ui/index";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { simulationService } from "../services/simulationService";
import type { SimulationInput, SimulationResult } from "../services/simulationService";
import { DemoNotice, Feedback } from "./workflow/Feedback";
import SimulationChart from "./workflow/SimulationChart";
import ApiState from "./ui/ApiState";
import SimulationExports from "./workflow/SimulationExports";
const SimulationStage = lazy(() => import("./workflow/SimulationStage"));
/** 계산 방식 코드 → 화면 이름 */
const capabilityLabels: Record<string, string> = {
  CALCULATED_DEMO: "계산 모델(참고용)",
  RULE_BASED_DEMO: "규칙 기반(참고용)",
  VISUAL_DEMO: "개념 시각화(참고용)",
};
const labels = {
  massKg: "시료 질량 (kg)",
  fixtureMassKg: "고정구 질량 (kg)",
  stiffnessNPerM: "가상 강성 (N/m)",
  dampingRatio: "감쇠비 (0 초과~1)",
  frequencyMinHz: "시작 주파수 (Hz)",
  frequencyMaxHz: "종료 주파수 (Hz)",
  startTempC: "시작 온도 (°C)",
  targetTempC: "목표 온도 (°C)",
  rampMin: "승온 시간 (분)",
  holdMin: "유지 시간 (분)",
  targetHumidityPct: "목표 습도 (%)",
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
    [testText, setTestText] = useState(""),
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
  // 시험 이름으로 찾기: 시험유형 목록에서 입력한 이름과 맞는 것을 고른다
  const types = useApiQuery((signal) => catalogService.testTypes(signal), "test-types");
  const term = testText.trim().toLowerCase();
  const matchedType = term ? (types.data ?? []).find((type) => type.nameKo.toLowerCase() === term)
    ?? ((types.data ?? []).filter((type) => type.nameKo.toLowerCase().includes(term)).length === 1
      ? (types.data ?? []).find((type) => type.nameKo.toLowerCase().includes(term)) : undefined) : undefined;
  const typeCandidates = matchedType ? equipmentList.filter((item) => item.testTypes.includes(matchedType.code)).slice(0, 40) : [];
  // 그 시험의 장비 중 가상 모델이 있는 것만 남긴다 (장비별 프리셋 조회)
  const withModel = useApiQuery(
    async (signal) => {
      const checks = await Promise.all(typeCandidates.map(async (item) => {
        try { return (await simulationService.presets(item.id, signal)).length > 0 ? item.id : null; } catch { return null; }
      }));
      return checks.filter((id): id is number => id != null);
    },
    `simulation-capable:${matchedType?.code}:${typeCandidates.length}`,
    typeCandidates.length > 0,
  );
  const equipmentOptions = matchedType
    ? typeCandidates.filter((item) => withModel.data?.includes(item.id))
    : equipmentList;
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
  // 실제 시험 의뢰로 넘어가는 버튼: 실행 버튼 옆과 결과 아래에 둔다
  const requestButton = selected && canAccessMenu(user.role, "request") && setActiveMenu ? (
    <Button variant="secondary" icon={ArrowRight} disabled={selected.institutionId === user.organization?.id}
      title={selected.institutionId === user.organization?.id ? "우리 조직 장비에는 의뢰할 수 없습니다" : undefined}
      onClick={() => { setDraftRequestId(null); setSelectedEquipment(selected); setActiveMenu("request"); }}>
      이 장비로 실제 시험 의뢰
    </Button>
  ) : null;
  return (
    <div className="content-page page-enter">
      <PageHeader title="가상 시험" description="예약이 차 있어도 결과를 먼저 가늠해 보세요">
        <SegmentedControl label="보기 방식" size="sm" value={view} onChange={(value) => setView(value as "simple" | "3d")}>
          <SegmentedControlItem value="simple" label="간단 보기" />
          <SegmentedControlItem value="3d" label="3D 보기" />
        </SegmentedControl>
        <Badge tone="amber">참고용 계산</Badge>
      </PageHeader>
      {selected && selected.availability !== "AVAILABLE" && <p className="content-note">
        <Info size={14} aria-hidden="true" />
        <span><strong>{selected.name}</strong>은(는) 지금 <Badge tone={availabilityTone[selected.availability ?? "UNKNOWN"]}>
          {availabilityLabels[selected.availability ?? "UNKNOWN"]}</Badge> 상태입니다. 실제 시험을 기다리는 동안 아래 가상 시험으로 결과를 미리 확인할 수 있습니다.</span>
      </p>}
      <DemoNotice>
        계산 모델로 만든 참고값이며 실제 장비 성능·시험 적합성·성적서를 대신하지 않습니다.
      </DemoNotice>
      <Panel className="form-panel">
        <div className="form-grid">
          <FormField id="simulation-test" label="시험 이름" hint={matchedType
            ? (withModel.loading ? "가상 모델이 있는 장비를 찾는 중…" : `${matchedType.nameKo}: 가상 시험이 되는 장비 ${equipmentOptions.length}대`)
            : "예: 진동시험, 온습도시험. 입력하면 그 시험을 하는 장비만 보여 줍니다."}>
            <input id="simulation-test" list="simulation-test-types" value={testText} autoComplete="off"
              placeholder="시험 이름을 입력하세요"
              onChange={(e) => { setTestText(e.target.value); }} />
            <datalist id="simulation-test-types">
              {types.data?.map((type) => <option key={type.code} value={type.nameKo} />)}
            </datalist>
          </FormField>
          <FormField id="simulation-equipment" label="장비">
            <select
              id="simulation-equipment"
              value={equipmentOptions.some((item) => item.id === simulationEquipmentId) ? simulationEquipmentId ?? "" : ""}
              onChange={(e) => chooseEquipment(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{matchedType && !withModel.loading && equipmentOptions.length === 0
                ? "이 시험은 가상 모델이 있는 장비가 없습니다" : "장비를 선택하세요"}</option>
              {equipmentOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.institution || "보유 조직 확인 필요"}, {e.externalId})
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </Panel>
      {(models.loading || models.error || presets.loading || presets.error) && (
        <ApiState
          loading={models.loading || presets.loading}
          error={models.error ?? presets.error}
          onRetry={() => {
            models.reload();
            presets.reload();
          }}
        />
      )}
      {presets.data?.length === 0 && (
        <Panel>
          <p className="inline-empty">
            {selected?.name ?? "이 장비"}에는 아직 가상 시험 모델이 없습니다. 같은 시험을 하는 다른 장비로 돌려 보세요.
            {setActiveMenu && <Button variant="secondary" onClick={() => setActiveMenu("search")}>다른 장비 찾기</Button>}
          </p>
        </Panel>
      )}
      {view === "3d" && model && preset && (
        <Suspense fallback={<div className="sim-stage-loading" role="status">3D 시험실을 준비하고 있습니다…</div>}>
          <SimulationStage
            key={preset.presetId}
            modelType={model.modelType}
            input={input}
            result={result?.presetId === preset.presetId ? result : null}
            equipmentName={equipmentList.find((e) => e.id === simulationEquipmentId)?.name ?? "선택 장비"}
          />
        </Suspense>
      )}
      {model && preset && (
        <Panel
          className="form-panel"
          title={model.description}
          action={<Badge tone="amber">{capabilityLabels[model.capability] ?? "참고용 계산"}</Badge>}
        >
          <p className="content-note">{model.limitation}</p>
          <p className="field-hint">
            아래 값은 프리셋의 가상 입력값이며 실제 장비 사양이 아닙니다.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setResult(null);
              action.run(async (signal) =>
                setResult(
                  await simulationService.run(
                    {
                      presetId: preset.presetId,
                      inputParameters: input,
                      ...(requirementId ? { requirementId } : {}),
                    },
                    signal,
                  ),
                ),
              );
            }}
          >
            <div className="form-grid">
              {model.requiredInputFields.map((field) => (
                <FormField
                  key={field}
                  id={`simulation-${field}`}
                  label={labels[field] ?? field}
                >
                  <input
                    id={`simulation-${field}`}
                    type={
                      typeof preset.inputParameters[field] === "number"
                        ? "number"
                        : "text"
                    }
                    step="any"
                    required
                    value={input[field] ?? ""}
                    onChange={(e) => {
                      setResult(null);
                      setEdited({
                        presetId: preset.presetId,
                        values: {
                          ...input,
                          [field]:
                            typeof preset.inputParameters[field] === "number"
                              ? e.target.value === ""
                                ? ""
                                : Number(e.target.value)
                              : e.target.value,
                        },
                      });
                    }}
                  />
                </FormField>
              ))}
            </div>
            <div className="form-actions">
              <span className="small-note">계산 결과는 참고용이며 실제 시험·성적서를 대신하지 않습니다.</span>
              {requestButton}
              <Button type="submit" disabled={action.busy}>
                가상 시험 실행
              </Button>
            </div>
          </form>
        </Panel>
      )}
      <Feedback action={action} />
      {result && (
        <Panel
          className="form-panel"
          title="가상 시험 결과"
          action={<Badge tone="amber">{capabilityLabels[result.capability] ?? "참고용 계산"}</Badge>}
        >
          <SimulationExports key={result.id} result={result} equipment={equipmentList.find((item) => item.id === result.equipmentId)} />
          <p className="content-note">{result.warning}</p>
          <p>{result.limitation}</p>
          {result.output.chart && (
            <SimulationChart chart={result.output.chart} />
          )}
          {result.output.summary && (
            <dl className="detail-list">
              {Object.entries(result.output.summary).map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {key === "naturalFrequencyHz"
                      ? "가상 고유진동수 (Hz)"
                      : key}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {result.output.checks && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>시연 사양</th>
                    <th>입력</th>
                    <th>가상 비교</th>
                    <th>출처</th>
                  </tr>
                </thead>
                <tbody>
                  {result.output.checks.map((c) => (
                    <tr key={c.key}>
                      <td>{c.key}</td>
                      <td>{c.input}</td>
                      <td>
                        {
                          {
                            MET: "가상 범위 내",
                            NOT_MET: "가상 범위 초과",
                            UNKNOWN: "미확인",
                          }[c.result]
                        }
                      </td>
                      <td>{c.sourceType ?? "확인 필요"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.output.concept && (
            <p>
              {result.output.concept.label}: {result.output.concept.value}{" "}
              {result.output.concept.unit} · 개념 시각화
            </p>
          )}
          {result.output.steps && (
            <ol className="condition-steps">
              {result.output.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
          {requestButton && <div className="form-actions">
            <span className="small-note">정확한 결과와 성적서가 필요하면 실제 시험을 맡기세요.</span>
            {requestButton}
          </div>}
        </Panel>
      )}
      <Panel title="지난 가상 시험">
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
              { key: "createdAt", header: "실행 시각", width: pixel(180), renderCell: (r) =>
                <Text hasTabularNumbers color="secondary">{r.createdAt ? formatDate(r.createdAt) : "기록 없음"}</Text> },
              { key: "open", header: <span className="sr-only">동작</span>, width: pixel(110), align: "end", renderCell: (r) =>
                <Button variant="ghost" className="button--sm" onClick={() =>
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
      </Panel>
    </div>
  );
}
