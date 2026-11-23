import { useState } from "react";
import { useWorkspace } from "../context/AppContext";
import { Badge, Button, FormField, PageHeader, Panel } from "./ui/index";
import ApiState from "./ui/ApiState";
import { DemoNotice, Feedback } from "./workflow/Feedback";
import RequirementWorkbench from "./workflow/RequirementWorkbench";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { catalogService } from "../services/catalogService";
import { requirementService } from "../services/requirementService";
import { requestService } from "../services/requestService";
import { checkLabels, verdictLabels } from "../domain/constants";

export default function Matching({ setActiveMenu }) {
  const {
    requirementId,
    setRequirementId,
    matchRun,
    setMatchRun,
    equipmentList,
    setSelectedEquipment,
    setDraftRequestId,
    comparisonIds,
    setComparisonIds,
  } = useWorkspace();
  const types = useApiQuery(
    (signal) => catalogService.testTypes(signal),
    "test-types",
  );
  const [form, setForm] = useState({
      testTypeCode: "VIBRATION",
      title: "",
      purpose: "",
      sampleName: "",
      sampleQuantity: 1,
    }),
    action = useAction();
  return (
    <div className="content-page page-enter">
      <PageHeader
        eyebrow="CONDITION INTELLIGENCE"
        title="AI 시험조건 분석·장비 매칭"
        description="조건을 확인하고, 장비별 충족·불일치·미확인 근거를 비교하세요."
      >
        <Button
          variant="secondary"
          onClick={() => setActiveMenu("compare")}
          disabled={comparisonIds.length < 2}
        >
          선택 장비 비교 ({comparisonIds.length})
        </Button>
      </PageHeader>
      <DemoNotice>
        규칙 비교 결과이며 실제 AI 분석이나 기관의 시험 가능 확정이 아닙니다.
      </DemoNotice>
      {!requirementId ? (
        <Panel className="form-panel" title="시험조건 직접 입력">
          {(types.loading || types.error) && (
            <ApiState
              loading={types.loading}
              error={types.error}
              onRetry={types.reload}
            />
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action.run(async (signal) => {
                const result = await requirementService.create(form, signal);
                setRequirementId(result.id);
                setMatchRun(null);
              });
            }}
          >
            <div className="form-grid">
              <FormField id="match-test-type" label="시험유형">
                <select
                  id="match-test-type"
                  value={form.testTypeCode}
                  onChange={(e) =>
                    setForm({ ...form, testTypeCode: e.target.value })
                  }
                >
                  {types.data?.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.nameKo}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField id="match-title" label="제목">
                <input
                  id="match-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="예: 위성 전장품 진동시험"
                />
              </FormField>
              <FormField id="match-sample" label="시료명">
                <input
                  id="match-sample"
                  value={form.sampleName}
                  onChange={(e) =>
                    setForm({ ...form, sampleName: e.target.value })
                  }
                />
              </FormField>
              <FormField id="match-quantity" label="시료 수량">
                <input
                  id="match-quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={form.sampleQuantity}
                  onChange={(e) =>
                    setForm({ ...form, sampleQuantity: Number(e.target.value) })
                  }
                />
              </FormField>
              <FormField
                id="match-purpose"
                label="시험 목적"
                className="form-field--full"
              >
                <textarea
                  id="match-purpose"
                  required
                  rows={3}
                  value={form.purpose}
                  onChange={(e) =>
                    setForm({ ...form, purpose: e.target.value })
                  }
                />
              </FormField>
            </div>
            <div className="form-actions">
              <Button type="submit" disabled={action.busy || !types.data}>
                시험조건 작성 시작
              </Button>
            </div>
          </form>
        </Panel>
      ) : (
        <>
          <RequirementWorkbench
            key={requirementId}
            requirementId={requirementId}
            onMatched={setMatchRun}
          />
          <Button
            variant="secondary"
            onClick={() => {
              setRequirementId(null);
              setMatchRun(null);
            }}
          >
            새 조건 작성
          </Button>
        </>
      )}
      <Feedback action={action} />
      {matchRun && (
        <>
          <div className="results-heading">
            <span>
              추천 후보 <strong>{matchRun.results.length}</strong>대
            </span>
            <small>{matchRun.disclaimer}</small>
          </div>
          {matchRun.results.length ? (
            matchRun.results.map((result) => (
              <Panel
                key={result.id}
                className="form-panel"
                title={`${result.rank}. ${result.equipment.name}`}
                description={result.equipment.institutionName}
                action={
                  <Badge
                    tone={result.verdict === "UNSUITABLE" ? "amber" : "cyan"}
                  >
                    {verdictLabels[result.verdict]}
                  </Badge>
                }
              >
                <p>{result.reason}</p>
                <p className="field-hint">
                  {result.equipment.externalId} · 점수 {result.score}% · 정보
                  갱신일{" "}
                  {equipmentList.find((e) => e.id === result.equipment.id)
                    ?.updateDate ?? "확인 필요"}{" "}
                  {result.usedMockData && (
                    <Badge tone="amber">DEMO 사양 사용</Badge>
                  )}
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>조건</th>
                        <th>요구</th>
                        <th>장비 사양</th>
                        <th>판정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.checks.map((c) => (
                        <tr key={c.conditionKey}>
                          <td>{c.conditionKey}</td>
                          <td>{c.requiredText}</td>
                          <td>
                            {c.equipmentText}
                            <small>{c.note}</small>
                          </td>
                          <td>{checkLabels[c.result]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions">
                  <label>
                    <input
                      type="checkbox"
                      style={{ width: "auto" }}
                      checked={comparisonIds.includes(result.equipment.id)}
                      disabled={
                        !comparisonIds.includes(result.equipment.id) &&
                        comparisonIds.length >= 5
                      }
                      onChange={(e) =>
                        setComparisonIds(
                          e.target.checked
                            ? [...comparisonIds, result.equipment.id]
                            : comparisonIds.filter(
                                (id) => id !== result.equipment.id,
                              ),
                        )
                      }
                    />{" "}
                    비교에 담기
                  </label>
                  <Button
                    disabled={action.busy || result.verdict === "UNSUITABLE"}
                    onClick={() =>
                      action.run(async (signal) => {
                        const draft = await requestService.aiDraft(
                          {
                            requirementId: matchRun.requirementId,
                            equipmentId: result.equipment.id,
                            matchResultId: result.id,
                          },
                          signal,
                        );
                        setSelectedEquipment(
                          equipmentList.find(
                            (e) => e.id === result.equipment.id,
                          ),
                        );
                        setDraftRequestId(draft.requestId);
                        setActiveMenu("request");
                      })
                    }
                  >
                    AI 의뢰서 초안 작성
                  </Button>
                </div>
              </Panel>
            ))
          ) : (
            <Panel className="form-panel">
              <p>
                DB에 조건에 맞는 장비 후보가 없습니다. 조건과 지역을 다시
                확인해주세요.
              </p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
