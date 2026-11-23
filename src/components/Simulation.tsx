import { lazy, Suspense, useState } from "react";
import { useWorkspace } from "../context/AppContext";
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
export default function Simulation() {
  const {
      equipmentList,
      simulationEquipmentId,
      setSimulationEquipmentId,
      requirementId,
    } = useWorkspace(),
    [chosen, setChosen] = useState(""),
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
  const preset =
      presets.data?.find((p) => p.presetId === chosen) ?? presets.data?.[0],
    model = models.data?.find((m) => m.modelType === preset?.modelType),
    input =
      edited && edited.presetId === preset?.presetId
        ? edited.values
        : (preset?.inputParameters ?? {});
  return (
    <div className="content-page page-enter">
      <PageHeader
        title="가상 시뮬레이션"
      >
        <Badge tone="amber">DEMO ONLY</Badge>
      </PageHeader>
      <DemoNotice>
        가상 모델이며 실제 장비 성능·시험 적합성·안전성을 의미하지 않습니다.
      </DemoNotice>
      <Panel className="form-panel">
        <div className="form-grid">
          <FormField id="simulation-equipment" label="장비">
            <select
              id="simulation-equipment"
              value={simulationEquipmentId ?? ""}
              onChange={(e) => {
                setSimulationEquipmentId(Number(e.target.value));
                setChosen("");
                setEdited(null);
                setResult(null);
              }}
            >
              <option value="" disabled>장비를 선택하세요</option>
              {equipmentList.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.externalId} · {e.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="simulation-preset" label="가상 프리셋">
            <select
              id="simulation-preset"
              value={preset?.presetId ?? ""}
              onChange={(e) => {
                setChosen(e.target.value);
                setEdited(null);
                setResult(null);
              }}
            >
              {presets.data?.map((p) => (
                <option key={p.presetId} value={p.presetId}>
                  {p.presetId} · {p.modelType}
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
        <Panel className="form-panel">
          <p>이 장비에 등록된 시연 프리셋이 없습니다.</p>
        </Panel>
      )}
      {model && preset && (
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
          action={<Badge tone="amber">{model.capability} · DEMO</Badge>}
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
              <Button type="submit" disabled={action.busy}>
                가상 시뮬레이션 실행
              </Button>
            </div>
          </form>
        </Panel>
      )}
      <Feedback action={action} />
      {result && (
        <Panel
          className="form-panel"
          title="가상 시연 결과"
          action={<Badge tone="amber">{result.capability} · DEMO</Badge>}
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
        </Panel>
      )}
      <Panel className="form-panel" title="내 시뮬레이션 실행 이력">
        {history.loading || history.error ? (
          <ApiState
            loading={history.loading}
            error={history.error}
            onRetry={history.reload}
          />
        ) : history.data?.content.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>실행</th>
                  <th>모델</th>
                  <th>결과</th>
                </tr>
              </thead>
              <tbody>
                {history.data.content.map((r) => (
                  <tr key={r.id}>
                    <td>{r.presetId}</td>
                    <td>{r.modelType}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          action.run(async (signal) => {
                            const saved = await simulationService.result(r.id, signal);
                            setSimulationEquipmentId(saved.equipmentId);
                            setChosen(saved.presetId);
                            setEdited({ presetId: saved.presetId, values: saved.inputParameters });
                            setResult(saved);
                          })
                        }
                      >
                        결과 보기 · DEMO
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>아직 실행한 가상 시뮬레이션이 없습니다.</p>
        )}
      </Panel>
    </div>
  );
}
