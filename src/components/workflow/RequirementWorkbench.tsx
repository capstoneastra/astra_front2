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
  plain = false,
}: {
  requirementId: number;
  onMatched?: (matchRun: MatchRun) => void;
  onSaved?: (requirement: Requirement) => void;
  idPrefix?: string;
  /** 바깥 카드 없이 (시험 맡기기 화면처럼 이미 카드 안에 넣을 때) */
  plain?: boolean;
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
  const required = (rules.data?.conditionRules ?? []).filter((rule) => rule.isRequired);
  const filled = required.filter((rule) => conditions.some((c) => c.key === rule.conditionKey && c.status !== "MISSING")).length;
  const inner = <>
      <ConditionEditor
        idPrefix={idPrefix}
        rules={rules.data?.conditionRules ?? []}
        conditions={conditions}
        onChange={setEdited}
        disabled={action.busy}
      />
      {analysis && !analysis.readyForMatching && (
        <div className="content-note" role="status">
          <span>
            {`더 필요한 조건: ${[...analysis.missing, ...analysis.unconfirmed].map((c) => c.label).join(", ")}`}
            {analysis.missing.length > 0 && <><br />{analysis.missing.map((c) => c.question).join(" ")}</>}
          </span>
        </div>
      )}
      <Feedback action={action} />
      <div className="form-actions">
        <span className="small-note">
          {required.length ? `필수 조건 ${filled}/${required.length}개 입력` : "필수 조건 없음"}, 비워 둔 조건은 시험기관이 확인합니다.
        </span>
        {!onMatched && <Button variant="secondary" disabled={action.busy}
          onClick={() => action.run(save, "조건을 저장했습니다.")}>조건 저장</Button>}
        {onMatched && (
          <Button
            disabled={action.busy}
            onClick={() =>
              action.run(async (signal) => {
                const result = await save(signal);
                if (!result.readyForMatching) return;
                const match = await requirementService.match(data.id, {}, signal);
                onMatched(match);
              })
            }
          >
            {action.busy ? "찾는 중…" : "맞는 장비 찾기"}
          </Button>
        )}
      </div>
  </>;
  if (plain) return <div className="workbench workbench--plain">{inner}</div>;
  return (
    <Panel
      className="workbench"
      title="세부 조건"
      description="비워 둔 조건은 시험기관이 확인합니다."
    >
      {inner}
    </Panel>
  );
}
