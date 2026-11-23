import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "../context/AppContext";
import { Badge, Button, FormField, PageHeader, Panel } from "./ui/index";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { automationService } from "../services/automationService";
import { invalidateData } from "../api/cache";
import { DemoNotice, Feedback } from "./workflow/Feedback";
import RequirementWorkbench from "./workflow/RequirementWorkbench";
import ApiState from "./ui/ApiState";
export default function Automation({ setActiveMenu, embedded = false }) {
  const { autoRunId, setAutoRunId, setRequirementId, setDraftRequestId } =
      useWorkspace(),
    [input, setInput] = useState(""),
    action = useAction(),
    completed = useRef(null);
  const query = useApiQuery(
      (signal) => automationService.get(autoRunId, signal),
      `auto-run:${autoRunId}`,
      Boolean(autoRunId),
      (data) => data?.status === "RUNNING" ? 1200 : false,
    ),
    run = query.data;
  useEffect(() => {
    if (run?.status === "SUCCEEDED" && completed.current !== run.id) {
      completed.current = run.id;
      invalidateData();
    }
  }, [run]);
  const running = run && ["RUNNING", "PENDING"].includes(run.status);
  return (
    <div className="content-page page-enter">
      <PageHeader
        eyebrow="AI MISSION WORKFLOW"
        title="AI 자동 추진"
        description="조건 분석부터 의뢰서 초안까지, 각 단계의 진행 상황을 확인하세요."
      />
      <DemoNotice>
        최종 결과는 DRAFT 초안입니다. 사용자 승인 없이 의뢰를 제출하거나 예약을
        확정하지 않습니다.
      </DemoNotice>
      <Panel className="form-panel">
        <FormField id="auto-input" label="시험 목적과 조건">
          <textarea
            id="auto-input"
            rows={3}
            placeholder="시험 목적과 확인된 조건을 입력하세요."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={running || action.busy}
          />
        </FormField>
        <div className="form-actions">
          <Button
            disabled={!input.trim() || action.busy || running}
            onClick={() =>
              action.run(async (signal) => {
                const result = await automationService.start(
                  { inputText: input },
                  signal,
                );
                setAutoRunId(result.id);
              })
            }
          >
            자동 추진 시작
          </Button>
          {run &&
            ["RUNNING", "WAITING_USER", "PENDING"].includes(run.status) && (
              <Button
                variant="secondary"
                disabled={action.busy}
                onClick={() =>
                  action.run(() => automationService.cancel(run.id))
                }
              >
                추진 중단
              </Button>
            )}
        </div>
      </Panel>
      {(query.loading || query.error) && (
        <ApiState
          loading={query.loading}
          error={query.error}
          onRetry={query.reload}
        />
      )}
      {run && (
        <Panel
          className="form-panel"
          title="단계별 진행 상태"
          action={
            <Badge tone="cyan">
              {{
                RUNNING: "진행 중",
                WAITING_USER: "사용자 입력 대기",
                SUCCEEDED: "초안 준비 완료",
                CANCELED: "중단",
                FAILED: "실패",
                PENDING: "대기",
              }[run.status] ?? run.status}
            </Badge>
          }
        >
          <ol className="condition-steps">
            {run.steps.map((step) => (
              <li key={step.step}>
                <strong>
                  {
                    {
                      ANALYZE: "시험조건 분석",
                      SEARCH: "통합 DB 검색",
                      MATCH: "적합성 비교",
                      DRAFT: "의뢰서 초안",
                    }[step.step]
                  }
                </strong>{" "}
                ·{" "}
                {{
                  DONE: "완료",
                  RUNNING: "진행 중",
                  PENDING: "대기",
                  WAITING_USER: "보완 필요",
                }[step.status] ?? step.status}
                <p>{step.message ?? "다음 단계 대기"}</p>
              </li>
            ))}
          </ol>
          {run.status === "WAITING_USER" && (
            <p role="status">
              확인되지 않은 조건을 아래에서 저장한 뒤 재개해주세요. 시험유형이
              없으면 목적에 시험 종류를 포함해 다시 시작해주세요.
            </p>
          )}
          {run.status === "WAITING_USER" && run.requirementId && (
            <Button
              disabled={action.busy}
              onClick={() => action.run(() => automationService.resume(run.id))}
            >
              조건 보완 후 재개
            </Button>
          )}
          {run.status === "SUCCEEDED" && run.draftRequestId && (
            <Button
              onClick={() => {
                setRequirementId(run.requirementId);
                setDraftRequestId(run.draftRequestId);
                setActiveMenu("request");
              }}
            >
              초안 검토하기 · 아직 제출되지 않음
            </Button>
          )}
        </Panel>
      )}
      {run?.status === "WAITING_USER" && run.requirementId && (
        <RequirementWorkbench
          idPrefix={embedded ? "assistant-auto-" : ""}
          key={run.requirementId}
          requirementId={run.requirementId}
        />
      )}
      <Feedback action={action} />
    </div>
  );
}
