import { useState } from "react";
import { Button, Panel } from "../ui/index";
import ApiState from "../ui/ApiState";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAction } from "../../hooks/useAction";
import { requirementService } from "../../services/requirementService";
import { catalogService } from "../../services/catalogService";
import ConditionEditor from "./ConditionEditor";
import { Feedback } from "./Feedback";
import type { MatchRun, Requirement, RequirementCondition } from "../../services/contracts";
import type { RequirementAnalysis } from "../../services/requirementService";

export default function RequirementWorkbench({
  requirementId,
  onMatched,
  onSaved,
  idPrefix = "",
}: {
  requirementId: number;
  onMatched?: (matchRun: MatchRun) => void;
  onSaved?: (requirement: Requirement) => void;
  idPrefix?: string;
}) {
  const query = useApiQuery(
    (signal) => requirementService.get(requirementId, signal),
    `requirement:${requirementId}`,
    Boolean(requirementId),
  );
  const rules = useApiQuery(
    (signal) => catalogService.testType(query.data.testTypeCode, signal),
    `test-type:${query.data?.testTypeCode}`,
    Boolean(query.data?.testTypeCode),
  );
  const [edited, setEdited] = useState<RequirementCondition[] | null>(null),
    [analysis, setAnalysis] = useState<RequirementAnalysis | null>(null),
    action = useAction();
  const data = query.data,
    conditions = edited ?? data?.conditions ?? [];
  if (query.loading || query.error || rules.loading || rules.error)
    return (
      <ApiState
        loading={query.loading || rules.loading}
        error={query.error ?? rules.error}
        onRetry={() => {
          query.reload();
          rules.reload();
        }}
      />
    );
  if (!data) return null;
  const save = async (signal) => {
    await requirementService.update(
      data.id,
      {
        title: data.title,
        purpose: data.purpose,
        sampleName: data.sampleName,
        sampleQuantity: data.sampleQuantity,
      },
      signal,
    );
    const saved = await requirementService.conditions(
      data.id,
      conditions,
      signal,
    );
    setEdited(saved.conditions);
    const result = await requirementService.analyze(data.id, signal);
    setAnalysis(result);
    onSaved?.(saved);
    return result;
  };
  return (
    <Panel
      className="workbench"
      title="세부 조건"
      description="입력하지 않은 조건은 미확인으로 남고, 시험기관이 확인합니다."
    >
      <p className="field-hint">
        {rules.data?.nameKo} · 조건 #{data.id} ·{" "}
        {data.purpose || "목적 정보 없음"}
      </p>
      <ConditionEditor
        idPrefix={idPrefix}
        rules={rules.data?.conditionRules ?? []}
        conditions={conditions}
        onChange={setEdited}
        disabled={action.busy}
      />
      {analysis && (
        <div className="content-note" role="status">
          <span>
            {analysis.readyForMatching
              ? "필수 조건이 확인되었습니다. 장비별 사양을 비교할 수 있습니다."
              : `추가 확인 필요: ${[...analysis.missing, ...analysis.unconfirmed].map((c) => c.label).join(", ")}`}
            <br />
            {analysis.missing.map((c) => c.question).join(" ")}
          </span>
        </div>
      )}
      <Feedback action={action} />
      <div className="form-actions">
        <Button
          variant="secondary"
          disabled={action.busy}
          onClick={() =>
            action.run(save, "조건을 저장하고 누락 항목을 확인했습니다.")
          }
        >
          조건 저장·분석
        </Button>
        {onMatched && (
          <Button
            disabled={action.busy}
            onClick={() =>
              action.run(async (signal) => {
                const result = await save(signal);
                if (!result.readyForMatching) return;
                const match = await requirementService.match(
                  data.id,
                  {},
                  signal,
                );
                onMatched(match);
              })
            }
          >
            적합 장비 추천
          </Button>
        )}
      </div>
    </Panel>
  );
}
