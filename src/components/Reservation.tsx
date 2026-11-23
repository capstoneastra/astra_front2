import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Copy, RefreshCw } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { Badge, Button, Panel } from "./ui";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { requestService } from "../services/requestService";
import { catalogService } from "../services/catalogService";
import { testTypeLabel } from "../services/equipmentService";
import type { ContactPerson, RequestBox, RequestContent } from "../services/contracts";
import { ApiError, toApiError } from "../api/errors";
import ConditionEditor from "./workflow/ConditionEditor";
import { Feedback } from "./workflow/Feedback";
import ApiState from "./ui/ApiState";
import { requestStatusLabels } from "../domain/constants";

type Errors = Record<string, string>;

const hasContact = (person?: ContactPerson) => Boolean(person?.phone?.trim() || person?.email?.trim());

/** 서버의 제출 필수 검사(§5)를 화면에서도 미리 해 본다. 서버가 완화 모드여도 칸은 채우도록 안내한다. */
function missingForSubmit(content: RequestContent): Errors {
  const errors: Errors = {};
  if (!content.test?.purpose?.trim()) errors["test.purpose"] = "시험 목적을 입력해주세요.";
  if (!content.sample?.name?.trim()) errors["sample.name"] = "시료명을 입력해주세요.";
  if (!content.schedule?.desiredStartDate) errors["schedule.desiredStartDate"] = "시작일을 선택해주세요.";
  if (!content.schedule?.desiredEndDate) errors["schedule.desiredEndDate"] = "종료일을 선택해주세요.";
  if (content.schedule?.desiredStartDate && content.schedule?.desiredEndDate &&
    content.schedule.desiredStartDate > content.schedule.desiredEndDate)
    errors["schedule.desiredEndDate"] = "종료일이 시작일보다 빠릅니다.";
  if (!content.actualUser?.name?.trim()) errors["actualUser.name"] = "실사용자 이름을 입력해주세요.";
  if (!hasContact(content.actualUser)) errors["actualUser.contact"] = "전화 또는 이메일 중 하나를 입력해주세요.";
  if (!content.accounting?.name?.trim()) errors["accounting.name"] = "회계 담당자 이름을 입력해주세요.";
  if (!hasContact(content.accounting)) errors["accounting.contact"] = "전화 또는 이메일 중 하나를 입력해주세요.";
  return errors;
}

/** 서버 오류(400 details.missingItems·fields[])를 칸 이름 → 안내 문구로 바꾼다. */
function errorsFromServer(error: ApiError | null): Errors {
  if (!error?.details) return {};
  const errors: Errors = { ...(error.details.fieldErrors ?? {}) };
  for (const key of error.details.missingItems ?? []) errors[key] ??= "제출하려면 입력해야 합니다.";
  // 서버가 content. 접두어를 붙여 보내는 경우
  for (const key of Object.keys(errors))
    if (key.startsWith("content.")) errors[key.slice(8)] ??= errors[key];
  return errors;
}

function Field({ id, label, required, error, hint, children, wide }: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return <div className={`form-field ${wide ? "form-field--full" : ""} ${error ? "form-field--invalid" : ""}`}>
    <label htmlFor={id} className={required ? "label-required" : "label-optional"}>
      {label}{required ? <b aria-hidden="true"> *</b> : <span> (선택)</span>}
    </label>
    {children}
    {error ? <p className="field-error" id={`${id}-error`} role="alert">{error}</p> : hint && <p className="field-hint">{hint}</p>}
  </div>;
}

/**
 * 시험 맡기기 ③ 의뢰서. 장비·조건은 앞 단계에서 넘어오고, 여기서는 초안을 만들고 채워서 제출한다.
 */
export default function Reservation({ setActiveMenu, openRequest, onChangeEquipment }: {
  setActiveMenu: (menu: string) => void;
  openRequest: (box: RequestBox, requestId?: number) => void;
  onChangeEquipment: () => void;
}) {
  const { selectedEquipment, setSelectedEquipment, requirementId, draftRequestId, setDraftRequestId, setTestCondition, user } = useWorkspace();
  const [editor, setEditor] = useState<RequestContent | null>(null);
  const [touched, setTouched] = useState(false);
  const action = useAction();
  const query = useApiQuery((signal) => requestService.get(draftRequestId, signal), `request:${draftRequestId}`, Boolean(draftRequestId));
  const draft = query.data;
  const content = editor ?? draft?.revision.content ?? null;
  const testTypeCode = content?.test?.testTypeCode;
  const rules = useApiQuery((signal) => catalogService.testType(testTypeCode, signal), `test-type:${testTypeCode}`, Boolean(testTypeCode));

  const local = missingForSubmit(content ?? ({} as RequestContent));
  const server = errorsFromServer(action.error);
  const errors: Errors = { ...(touched ? local : {}), ...server };
  const busy = action.busy;
  const ownEquipment = selectedEquipment?.institutionId != null && selectedEquipment.institutionId === user.organization?.id;

  const change = (section: keyof RequestContent, key: string, value: unknown) => {
    if (!content) return;
    setEditor({ ...content, [section]: { ...(content[section] as object ?? {}), [key]: value } });
  };
  const text = (section: keyof RequestContent, key: string) =>
    String((content?.[section] as Record<string, unknown> | undefined)?.[key] ?? "");
  const input = (section: keyof RequestContent, key: string, props: Record<string, unknown> = {}) => {
    const id = `req-${section}-${key}`;
    const errorKey = `${section}.${key}`;
    const contactError = (key === "phone" || key === "email") ? errors[`${section}.contact`] : undefined;
    return <input id={id} value={text(section, key)} disabled={!content || busy}
      aria-invalid={Boolean(errors[errorKey] || contactError) || undefined}
      aria-describedby={errors[errorKey] ? `${id}-error` : undefined}
      onChange={(event) => change(section, key, props.type === "number"
        ? (event.target.value === "" ? null : Number(event.target.value))
        : props.type === "date" ? (event.target.value || null) : event.target.value)}
      {...props} />;
  };

  const createDraft = () => action.run(async (signal) => {
    const body = { equipmentId: selectedEquipment.id, ...(requirementId ? { requirementId } : {}) };
    const result = requirementId ? await requestService.aiDraft(body, signal) : await requestService.create(body, signal);
    setDraftRequestId(result.requestId ?? result.id);
  });

  const save = () => action.run(async (signal) => {
    await requestService.save(draft.id, draft.version, content, signal);
    setEditor(null);
  }, "초안을 저장했습니다. 아직 제출되지 않았습니다.");

  const submit = () => {
    setTouched(true);
    action.clearFeedback();
    if (Object.keys(local).length) {
      document.querySelector<HTMLElement>(".form-field--invalid input, .form-field--invalid textarea")?.focus();
      return;
    }
    void action.run(async (signal) => {
      try {
        const saved = await requestService.save(draft.id, draft.version, content, signal);
        await requestService.submit(draft.id, saved.version, signal);
      } catch (failure) {
        const error = toApiError(failure);
        if (error.details?.missingItems?.length)
          throw new ApiError("빠진 칸이 있어 제출하지 못했습니다. 빨간 표시를 확인해주세요.", error);
        throw error;
      }
      const id = draft.id;
      setDraftRequestId(null);
      setSelectedEquipment(null);
      setTestCondition("");
      openRequest("SENT", id);
    });
  };

  // 초안이 아직 없다: 선택한 장비를 확인하고 의뢰서를 만든다.
  if (!draftRequestId)
    return <Panel title="의뢰서 만들기" action={<Button variant="ghost" className="button--sm" icon={RefreshCw} onClick={onChangeEquipment}>장비 바꾸기</Button>}>
      <div className="inline-empty" style={{ color: "var(--text-secondary)" }}>
        <span><strong>{selectedEquipment?.name}</strong> · {selectedEquipment?.institution || "보유 조직 확인 필요"}
          {requirementId ? " · 앞에서 정리한 조건을 함께 넣습니다(AI 초안)" : ""}</span>
        <Button icon={ArrowRight} disabled={busy || !selectedEquipment || ownEquipment} onClick={createDraft}>
          {busy ? "만드는 중…" : "의뢰서 작성 시작"}
        </Button>
      </div>
      {ownEquipment && <p className="inline-empty">우리 조직이 보유한 장비에는 의뢰할 수 없습니다.</p>}
      <Feedback action={action} />
    </Panel>;

  if (query.loading || query.error || !content)
    return <Panel><ApiState loading={query.loading} error={query.error} onRetry={query.reload} /></Panel>;

  const copyApplicant = () => setEditor({ ...content, actualUser: {
    name: content.applicant?.contactName ?? "", phone: content.applicant?.phone ?? "", email: content.applicant?.email ?? "" } });
  const editable = draft.status === "DRAFT";

  return <form onSubmit={(event) => { event.preventDefault(); submit(); }} noValidate aria-busy={busy}>
    <div className="request-form__bar">
      <span><strong>{draft.equipment?.name}</strong> · {draft.institution?.name} · {draft.requestNo}</span>
      <Badge tone="cyan">{requestStatusLabels[draft.status] ?? draft.status}</Badge>
      {draft.revision.isAiGenerated && <Badge tone="violet">AI 초안</Badge>}
      {editor && <span className="small-note">저장하지 않은 변경 있음</span>}
      <span className="finder__bar-end">
        <Button variant="ghost" className="button--sm" onClick={() => { setDraftRequestId(null); setSelectedEquipment(null); setActiveMenu("sent"); }}>
          나중에 이어서
        </Button>
      </span>
    </div>
    <fieldset disabled={!editable || busy} className="request-form">
      <div className="request-form__main">
        <Panel title="시험" action={<span className="small-note">{testTypeCode ? testTypeLabel(testTypeCode) : "시험유형 확인 필요"}</span>}>
          <div className="form-grid request-form__body">
            <Field id="req-test-purpose" label="시험 목적" required error={errors["test.purpose"]} wide>
              <textarea id="req-test-purpose" rows={2} value={text("test", "purpose")} onChange={(e) => change("test", "purpose", e.target.value)} />
            </Field>
            <Field id="req-sample-name" label="시료명" required error={errors["sample.name"]}>{input("sample", "name")}</Field>
            <Field id="req-sample-quantity" label="시료 수량" error={errors["sample.quantity"]}>
              {input("sample", "quantity", { type: "number", min: 1, step: 1, className: "input--short" })}
            </Field>
            <Field id="req-sample-readyDate" label="시료 준비 완료일">{input("sample", "readyDate", { type: "date" })}</Field>
            <Field id="req-test-standard" label="시험 규격">{input("test", "standard", { placeholder: "예: MIL-STD-810H" })}</Field>
            <Field id="req-notes" label="기타 요청 사항" wide>
              <textarea id="req-notes" rows={2} value={content.notes ?? ""} onChange={(e) => setEditor({ ...content, notes: e.target.value })} />
            </Field>
          </div>
        </Panel>
        <Panel title="시험 조건" action={<span className="small-note">앞 단계에서 정리한 값이 들어 있습니다</span>}>
          <div className="request-form__body">
            {rules.data ? <ConditionEditor rules={rules.data.conditionRules} conditions={content.conditions ?? []} disabled={!editable || busy}
              onChange={(conditions) => setEditor({ ...content, conditions })} /> :
              <ApiState loading={rules.loading} error={rules.error} onRetry={rules.reload} />}
          </div>
        </Panel>
      </div>
      <div className="request-form__side">
        <Panel title="이용 희망 기간">
          <div className="form-grid request-form__body">
            <Field id="req-schedule-desiredStartDate" label="시작일" required error={errors["schedule.desiredStartDate"]}>
              {input("schedule", "desiredStartDate", { type: "date" })}</Field>
            <Field id="req-schedule-desiredEndDate" label="종료일" required error={errors["schedule.desiredEndDate"]}>
              {input("schedule", "desiredEndDate", { type: "date" })}</Field>
          </div>
          <p className="small-note request-form__body">희망일이며 실제 일정은 장비 보유 조직과 조율합니다.</p>
        </Panel>
        <Panel title="실사용자" action={<Button variant="ghost" className="button--sm" icon={Copy} onClick={copyApplicant}>신청자와 같음</Button>}>
          <div className="form-grid request-form__body">
            <Field id="req-actualUser-name" label="이름" required error={errors["actualUser.name"]}>{input("actualUser", "name")}</Field>
            <Field id="req-actualUser-phone" label="전화" error={errors["actualUser.contact"]}>{input("actualUser", "phone", { type: "tel" })}</Field>
            <Field id="req-actualUser-email" label="이메일" wide hint="전화 또는 이메일 중 하나는 필수입니다.">{input("actualUser", "email", { type: "email" })}</Field>
          </div>
        </Panel>
        <Panel title="회계 담당자">
          <div className="form-grid request-form__body">
            <Field id="req-accounting-name" label="이름" required error={errors["accounting.name"]}>{input("accounting", "name")}</Field>
            <Field id="req-accounting-phone" label="전화" error={errors["accounting.contact"]}>{input("accounting", "phone", { type: "tel" })}</Field>
            <Field id="req-accounting-email" label="이메일" wide hint="전화 또는 이메일 중 하나는 필수입니다.">{input("accounting", "email", { type: "email" })}</Field>
          </div>
        </Panel>
        <details className="panel request-form__body">
          <summary className="small-note">신청자 정보 (계정 정보로 채워짐)</summary>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <Field id="req-applicant-companyName" label="기업·기관명">{input("applicant", "companyName")}</Field>
            <Field id="req-applicant-contactName" label="담당자">{input("applicant", "contactName")}</Field>
            <Field id="req-applicant-email" label="이메일">{input("applicant", "email", { type: "email" })}</Field>
            <Field id="req-applicant-phone" label="연락처">{input("applicant", "phone", { type: "tel" })}</Field>
          </div>
        </details>
      </div>
    </fieldset>
    <div className="request-form__actions">
      <Feedback action={action} onRetry={query.reload} />
      <span className="small-note"><b>*</b> 필수 · 제출하면 장비 보유 조직이 검토합니다.</span>
      <Button variant="secondary" disabled={!editable || busy || !editor} onClick={save}>초안 저장</Button>
      <Button type="submit" icon={ArrowRight} disabled={!editable || busy}>{busy ? "처리 중…" : "제출"}</Button>
    </div>
  </form>;
}
