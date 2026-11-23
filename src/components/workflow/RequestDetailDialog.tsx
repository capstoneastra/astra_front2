import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../../auth/context";
import { ownsOrganization } from "../../auth/permissions";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAction } from "../../hooks/useAction";
import { requestService } from "../../services/requestService";
import type { RequestBox } from "../../services/contracts";
import { catalogService } from "../../services/catalogService";
import { Badge, Button, FormField } from "../ui/index";
import ApiState from "../ui/ApiState";
import ConditionEditor from "./ConditionEditor";
import ReservationControls from "./ReservationControls";
import { Feedback } from "./Feedback";
import {
  requestStatusLabels,
  formatDate,
  valueText,
} from "../../domain/constants";

export default function RequestDetailDialog({ requestId, onClose, initialReservationDate, requestBox }: {
  requestId: number;
  onClose: () => void;
  initialReservationDate?: string;
  requestBox?: RequestBox;
}) {
  const dialog = useRef(null),
    { user } = useAuth(),
    action = useAction();
  const query = useApiQuery(
      (signal) => requestService.get(requestId, signal),
      `request:${requestId}`,
    ),
    r = query.data;
  const history = useApiQuery(
      (signal) => requestService.history(requestId, signal),
      `request-history:${requestId}`,
    ),
    revisions = useApiQuery(
      (signal) => requestService.revisions(requestId, signal),
      `request-revisions:${requestId}`,
    );
  const rules = useApiQuery(
    (signal) =>
      catalogService.testType(r.revision.content.test.testTypeCode, signal),
    `test-type:${r?.revision.content.test.testTypeCode}`,
    Boolean(r?.revision.content.test.testTypeCode),
  );
  const [edited, setEdited] = useState(null),
    [message, setMessage] = useState(""),
    [dueDate, setDueDate] = useState(""),
    [selectedFields, setSelectedFields] = useState(null),
    [changeSummary, setSummary] = useState(""),
    [responseMessage, setResponse] = useState("요청하신 정보를 보완했습니다.");
  const content = edited ?? r?.revision.content;
  const admin = user.role === "ADMIN";
  const ownsEquipment = ownsOrganization(user, r?.institution?.id);
  const institution = admin || (requestBox !== "SENT" && ownsEquipment);
  const company = admin || requestBox === "SENT" ||
    (!requestBox && user.role === "COMPANY_USER" && !ownsEquipment);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const openSupplement = r?.openSupplement?.status === "OPEN" ? r.openSupplement : null;
  const fields = [
    ...(content?.conditions ?? []).map((c) => ({
      fieldKey: c.key,
      label: c.label ?? c.key,
      required: true,
    })),
    { fieldKey: "sample.readyDate", label: "시료 준비 완료일", required: true },
    { fieldKey: "test.standard", label: "시험 규격", required: true },
    { fieldKey: "notes", label: "추가 자료 설명", required: true },
  ];
  const selected =
    selectedFields ??
    ["fixture_mass", "sample.readyDate"].filter((key) =>
      fields.some((f) => f.fieldKey === key),
    );
  const updatePath = (path, value) => {
    const [section, key] = path.split(".");
    setEdited(
      key
        ? { ...content, [section]: { ...content[section], [key]: value } }
        : { ...content, [section]: value },
    );
  };
  return (
    <dialog
      ref={dialog}
      className="dialog equipment-dialog"
      aria-labelledby="request-detail-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close();
      }}
    >
      <div className="dialog__heading">
        <Badge tone="cyan">
          {r ? requestStatusLabels[r.status] : "시험 의뢰"}
        </Badge>
        <button
          className="icon-button"
          aria-label="의뢰 상세 닫기"
          onClick={() => dialog.current.close()}
        >
          <X size={20} />
        </button>
      </div>
      <h2 id="request-detail-title">{r?.title ?? "의뢰 상세"}</h2>
      {(query.loading || query.error) && (
        <ApiState
          loading={query.loading}
          error={query.error}
          onRetry={query.reload}
        />
      )}
      {r && (
        <>
          <p className="field-hint">
            {r.requestNo} · 제출본 {r.revision.revisionNo} ·{" "}
            {r.revision.isAiGenerated ? "AI 초안 기반" : "사용자 작성"} ·{" "}
            {r.institution.name}
          </p>
          <dl className="detail-list">
            <div>
              <dt>장비</dt>
              <dd>
                {r.equipment.name} · {r.equipment.externalId}
              </dd>
            </div>
            <div>
              <dt>시험 목적</dt>
              <dd>{content.test.purpose || "확인 필요"}</dd>
            </div>
            <div>
              <dt>시료</dt>
              <dd>
                {content.sample.name || "확인 필요"} ·{" "}
                {content.sample.quantity ?? "미확인"}개
              </dd>
            </div>
            <div>
              <dt>준비 완료일</dt>
              <dd>{content.sample.readyDate || "확인 필요"}</dd>
            </div>
            <div>
              <dt>신청 기업</dt>
              <dd>
                {content.applicant.companyName} ·{" "}
                {content.applicant.contactName}
              </dd>
            </div>
            <div>
              <dt>규격·기타 정보</dt>
              <dd>
                {content.test.standard || "확인 필요"} ·{" "}
                {content.notes || "기타 정보 없음"}
              </dd>
            </div>
          </dl>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>시험조건</th>
                  <th>값</th>
                  <th>확인 상태</th>
                </tr>
              </thead>
              <tbody>
                {content.conditions.map((c) => (
                  <tr key={c.key}>
                    <td>{c.label ?? c.key}</td>
                    <td>{valueText(c)}</td>
                    <td>{c.status === "CONFIRMED" ? "확인" : "미확인"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {institution && ["SUBMITTED", "RESUBMITTED"].includes(r.status) && (
            <div className="form-actions">
              <Button
                disabled={action.busy}
                onClick={() =>
                  action.run(
                    () =>
                      requestService.action(r.id, "review/start", r.version),
                    "의뢰 검토를 시작했습니다.",
                  )
                }
              >
                검토 시작
              </Button>
            </div>
          )}
          {institution && r.status === "UNDER_REVIEW" && (
            <section>
              <h3>검토 의견·보완 요청</h3>
              <FormField id="review-message" label="보완 요청 또는 반려 사유">
                <textarea
                  id="review-message"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </FormField>
              <div className="form-grid">
                {fields.map((field) => (
                  <label key={field.fieldKey}>
                    <input
                      type="checkbox"
                      style={{ width: "auto" }}
                      checked={selected.includes(field.fieldKey)}
                      onChange={(e) =>
                        setSelectedFields(
                          e.target.checked
                            ? [...selected, field.fieldKey]
                            : selected.filter((key) => key !== field.fieldKey),
                        )
                      }
                    />{" "}
                    {field.label}
                  </label>
                ))}
              </div>
              <FormField id="supplement-due" label="보완 기한 (선택)">
                <input
                  id="supplement-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </FormField>
              <div className="form-actions">
                <Button
                  disabled={action.busy || !message.trim() || !selected.length}
                  onClick={() =>
                    action.run(
                      () =>
                        requestService.action(r.id, "supplements", r.version, {
                          message,
                          items: fields.filter((f) =>
                            selected.includes(f.fieldKey),
                          ),
                          dueDate: dueDate || null,
                        }),
                      "기업에 보완을 요청했습니다.",
                    )
                  }
                >
                  보완 요청 보내기
                </Button>
                <Button
                  variant="secondary"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(
                      () => requestService.action(r.id, "accept", r.version),
                      "기술 검토를 통과했습니다. 일정을 협의해주세요.",
                    )
                  }
                >
                  검토 승인·일정 협의
                </Button>
                <Button
                  variant="danger"
                  disabled={action.busy || !message.trim()}
                  onClick={() =>
                    action.run(
                      () =>
                        requestService.action(r.id, "reject", r.version, {
                          reason: message,
                        }),
                      "의뢰를 반려했습니다.",
                    )
                  }
                >
                  의뢰 반려
                </Button>
              </div>
            </section>
          )}
          {openSupplement && (
            <section>
              <h3>기관의 보완 요청</h3>
              <div className="content-note">
                <span>
                  {openSupplement.message}
                  <br />
                  기한: {openSupplement.dueDate ?? "기관 협의"}
                </span>
              </div>
              {company && r.status === "SUPPLEMENT_REQUESTED" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    action.run(
                      () =>
                        requestService.respond(openSupplement.id, {
                          version: r.version,
                          content,
                          message: responseMessage,
                          changeSummary,
                        }),
                      "보완한 정보로 재제출했습니다.",
                    );
                  }}
                >
                  {rules.loading && <ApiState loading />}
                  {rules.data && (
                    <ConditionEditor
                      rules={rules.data.conditionRules}
                      conditions={content.conditions}
                      disabled={action.busy}
                      onChange={(conditions) =>
                        setEdited({ ...content, conditions })
                      }
                    />
                  )}
                  {openSupplement.items
                    .filter(
                      (f) => f.fieldKey.includes(".") || f.fieldKey === "notes",
                    )
                    .map((field) => (
                      <FormField
                        key={field.fieldKey}
                        id={`supplement-${field.fieldKey.replaceAll(".", "-")}`}
                        label={field.label}
                      >
                        <input
                          id={`supplement-${field.fieldKey.replaceAll(".", "-")}`}
                          type={
                            field.fieldKey === "sample.readyDate"
                              ? "date"
                              : field.fieldKey === "sample.quantity"
                                ? "number"
                                : "text"
                          }
                          required={field.required}
                          value={
                            field.fieldKey
                              .split(".")
                              .reduce((value, k) => value?.[k], content) ?? ""
                          }
                          onChange={(e) =>
                            updatePath(
                              field.fieldKey,
                              field.fieldKey === "sample.quantity"
                                ? Number(e.target.value)
                                : e.target.value,
                            )
                          }
                        />
                      </FormField>
                    ))}
                  <FormField id="supplement-message" label="보완 응답">
                    <textarea
                      id="supplement-message"
                      required
                      rows={2}
                      value={responseMessage}
                      onChange={(e) => setResponse(e.target.value)}
                    />
                  </FormField>
                  <FormField id="supplement-summary" label="변경 내용 요약">
                    <input
                      id="supplement-summary"
                      required
                      value={changeSummary}
                      onChange={(e) => setSummary(e.target.value)}
                    />
                  </FormField>
                  <div className="form-actions">
                    <Button type="submit" disabled={action.busy}>
                      보완 내용 확인·재제출
                    </Button>
                  </div>
                </form>
              )}
            </section>
          )}
          {["SCHEDULING", "CONFIRMED", "COMPLETED"].includes(r.status) && (
            <ReservationControls request={r} initialDate={initialReservationDate} canConfirm={institution} />
          )}
          {institution && r.status === "CONFIRMED" && (
            <Button
              disabled={action.busy}
              onClick={() =>
                action.run(
                  () => requestService.action(r.id, "complete", r.version),
                  "시험 완료 상태로 변경했습니다.",
                )
              }
            >
              시험 완료 처리
            </Button>
          )}
          {company &&
            [
              "DRAFT",
              "SUBMITTED",
              "UNDER_REVIEW",
              "SUPPLEMENT_REQUESTED",
              "RESUBMITTED",
              "SCHEDULING",
            ].includes(r.status) && (
              <details>
                <summary>의뢰 취소</summary>
                <FormField id="request-cancel-reason" label="취소 사유">
                  <input
                    id="request-cancel-reason"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </FormField>
                <Button
                  variant="danger"
                  disabled={!message.trim() || action.busy}
                  onClick={() =>
                    action.run(
                      () =>
                        requestService.action(r.id, "cancel", r.version, {
                          reason: message,
                        }),
                      "의뢰를 취소했습니다.",
                    )
                  }
                >
                  의뢰 취소 확인
                </Button>
              </details>
            )}
          <Feedback action={action} onRetry={query.reload} />
          {rules.error && (
            <ApiState error={rules.error} onRetry={rules.reload} />
          )}
          <details>
            <summary>제출본·상태 변경 이력</summary>
            {history.error || revisions.error ? (
              <ApiState
                error={history.error ?? revisions.error}
                onRetry={() => {
                  history.reload();
                  revisions.reload();
                }}
              />
            ) : (
              <>
                <ol className="condition-steps">
                  {history.data?.map((entry) => (
                    <li key={entry.id}>
                      {requestStatusLabels[entry.fromStatus]} →{" "}
                      {requestStatusLabels[entry.toStatus]}
                      <p>
                        {formatDate(entry.createdAt)} · {entry.changedBy.name} ·{" "}
                        {entry.note}
                      </p>
                    </li>
                  ))}
                </ol>
                {revisions.data?.map((revision) => (
                  <div className="content-note" key={revision.revisionNo}>
                    <div>
                      <strong>제출본 {revision.revisionNo}</strong>
                      <p>{revision.changeSummary}</p>
                      {revision.content.conditions.map((c) => (
                        <p key={c.key}>
                          {c.label ?? c.key}: {valueText(c)}
                        </p>
                      ))}
                      <p>
                        준비 완료일{" "}
                        {revision.content.sample.readyDate ?? "미확인"}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </details>
        </>
      )}
    </dialog>
  );
}
