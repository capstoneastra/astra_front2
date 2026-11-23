import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, Download, FileUp, X } from "lucide-react";
import { useAuth } from "../../auth/context";
import { useWorkspace } from "../../context/AppContext";
import { canAccessMenu } from "../../auth/permissions";
import { ownsOrganization } from "../../auth/permissions";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAction } from "../../hooks/useAction";
import { requestService } from "../../services/requestService";
import type { RequestBox, RequestContent, RequestDetail, Supplement } from "../../services/contracts";
import { catalogService } from "../../services/catalogService";
import { testTypeLabel } from "../../services/equipmentService";
import { Badge, Button } from "../ui/index";
import ApiState from "../ui/ApiState";
import ConditionEditor from "./ConditionEditor";
import ReservationControls from "./ReservationControls";
import { Feedback } from "./Feedback";
import { requestStatusLabels, formatDate, valueText } from "../../domain/constants";

const won = (amount?: number | null) => amount == null ? "—" : `${amount.toLocaleString("ko-KR")}원`;
const fileSize = (bytes: number) => bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / 1048576).toFixed(1)}MB`;
const person = (p?: { name?: string; phone?: string; email?: string }) =>
  p?.name ? [p.name, p.phone, p.email].filter(Boolean).join(" · ") : "미입력";

/** 추가 정보 요청(ADDITIONAL_INFO)의 기본 4개 칸 */
const additionalFields: { key: string; label: string; options?: string[] }[] = [
  { key: "responsible.name", label: "책임자명" },
  { key: "report.type", label: "성적서 종류", options: ["일반 성적서", "공인성적서(KOLAS)", "시험 결과 보고서"] },
  { key: "sample.disposal", label: "시료 처리", options: ["시험 후 반환", "시험 후 폐기", "일정 기간 보관 후 반환"] },
  { key: "billing.method", label: "청구 방법", options: ["세금계산서", "법인카드", "계좌이체"] },
];

const readPath = (content: RequestContent, path: string) =>
  path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], content);
const writePath = (content: RequestContent, path: string, value: unknown): RequestContent => {
  const [section, key] = path.split(".");
  if (!key) return { ...content, [section]: value };
  return { ...content, [section]: { ...((content as unknown as Record<string, object>)[section] ?? {}), [key]: value } };
};

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="detail-section">
    <header><h3>{title}</h3>{action}</header>
    {children}
  </section>;
}

/** 맡기는 쪽: 보완·추가 정보 요청에 답한다. */
function SupplementResponse({ request, supplement, content, onContent }: {
  request: RequestDetail;
  supplement: Supplement;
  content: RequestContent;
  onContent: (content: RequestContent) => void;
}) {
  const action = useAction();
  const additional = supplement.kind === "ADDITIONAL_INFO";
  const [message, setMessage] = useState(additional ? "요청하신 추가 정보를 입력했습니다." : "요청하신 정보를 보완했습니다.");
  const rules = useApiQuery((signal) => catalogService.testType(content.test.testTypeCode, signal),
    `test-type:${content.test.testTypeCode}`, !additional && Boolean(content.test.testTypeCode));
  const items = additional
    ? additionalFields.filter((field) => supplement.items.length === 0 || supplement.items.some((item) => item.fieldKey === field.key))
    : supplement.items.filter((item) => item.fieldKey.includes(".") || item.fieldKey === "notes").map((item) => ({ key: item.fieldKey, label: item.label ?? item.fieldKey }));
  const missing = items.filter((field) => !String(readPath(content, field.key) ?? "").trim());
  return <form onSubmit={(event) => {
    event.preventDefault();
    void action.run(() => requestService.respond(supplement.id, {
      version: request.version, content, message,
      changeSummary: items.map((field) => `${field.label}: ${readPath(content, field.key) ?? ""}`).join(", ") || message,
    }), "답변을 보냈습니다. 상대 조직이 다시 검토합니다.");
  }}>
    <div className="form-grid">
      {items.map((field) => {
        const id = `supplement-${field.key.replaceAll(".", "-")}`;
        const value = String(readPath(content, field.key) ?? "");
        const options = (field as { options?: string[] }).options;
        return <div className="form-field" key={field.key}>
          <label htmlFor={id} className="label-required">{field.label} <b>*</b></label>
          {options ? <>
            <input id={id} list={`${id}-options`} value={value} onChange={(e) => onContent(writePath(content, field.key, e.target.value))} />
            <datalist id={`${id}-options`}>{options.map((option) => <option key={option} value={option} />)}</datalist>
          </> : <input id={id} type={field.key === "sample.readyDate" ? "date" : "text"} value={value}
            onChange={(e) => onContent(writePath(content, field.key, e.target.value))} />}
        </div>;
      })}
    </div>
    {!additional && rules.data && <div style={{ marginTop: 8 }}>
      <ConditionEditor rules={rules.data.conditionRules} conditions={content.conditions} disabled={action.busy}
        onChange={(conditions) => onContent({ ...content, conditions })} />
    </div>}
    <div className="form-field" style={{ marginTop: 8 }}>
      <label htmlFor="supplement-message" className="label-optional">전할 말 <span>(선택)</span></label>
      <input id="supplement-message" value={message} onChange={(e) => setMessage(e.target.value)} />
    </div>
    <Feedback action={action} />
    <div className="form-actions">
      {missing.length > 0 && <span className="field-error">입력할 칸: {missing.map((f) => f.label).join(", ")}</span>}
      <Button type="submit" disabled={action.busy || missing.length > 0}>답변 보내기</Button>
    </div>
  </form>;
}

/** 받는 쪽: 지금 상태에서 할 수 있는 일 */
function ProviderActions({ request }: { request: RequestDetail }) {
  const action = useAction();
  const [message, setMessage] = useState("");
  const [fee, setFee] = useState(request.estimatedFee ? String(request.estimatedFee.amount) : "");
  const [feeNote, setFeeNote] = useState(request.estimatedFee?.note ?? "");
  const [result, setResult] = useState({ summary: request.result?.summary ?? "", reportNo: request.result?.reportNo ?? "", reportUrl: request.result?.reportUrl ?? "" });
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const status = request.status;
  const can = (name: string) => !request.availableActions || request.availableActions.includes(name);
  const feeEditable = ["UNDER_REVIEW", "SUPPLEMENT_REQUESTED", "RESUBMITTED", "SCHEDULING"].includes(status);
  const resultEditable = ["CONFIRMED", "COMPLETED"].includes(status);
  return <>
    {["SUBMITTED", "RESUBMITTED"].includes(status) && <Section title="검토 시작">
      <p className="small-note">검토를 시작하면 상대에게 알림이 갑니다.</p>
      <div className="form-actions"><Button disabled={action.busy}
        onClick={() => action.run(() => requestService.action(request.id, "review/start", request.version), "검토를 시작했습니다.")}>검토 시작</Button></div>
    </Section>}
    {status === "UNDER_REVIEW" && <Section title="검토 결과">
      <div className="button-row">
        <Button disabled={action.busy || !can("ACCEPT")}
          onClick={() => action.run(() => requestService.action(request.id, "accept", request.version), "검토를 통과했습니다. 일정을 제안해 주세요.")}>통과 · 일정 조율로</Button>
        <Button variant="secondary" disabled={action.busy || !can("REQUEST_SUPPLEMENT")}
          title="책임자명·성적서 종류·시료 처리·청구 방법을 요청합니다"
          onClick={() => action.run(() => requestService.requestSupplement(request.id, request.version, { kind: "ADDITIONAL_INFO" }), "추가 정보를 요청했습니다.")}>추가 정보 요청</Button>
      </div>
      <div className="form-field" style={{ marginTop: 8 }}>
        <label htmlFor="review-message">보완 요청 내용 또는 반려 사유</label>
        <textarea id="review-message" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className="form-actions">
        <Button variant="secondary" disabled={action.busy || !message.trim() || !can("REQUEST_SUPPLEMENT")}
          onClick={() => action.run(() => requestService.requestSupplement(request.id, request.version, { kind: "SUPPLEMENT", message }), "보완을 요청했습니다.")}>보완 요청</Button>
        <Button variant="danger" disabled={action.busy || !message.trim() || !can("REJECT")}
          onClick={() => action.run(() => requestService.action(request.id, "reject", request.version, { reason: message }), "의뢰를 반려했습니다.")}>반려</Button>
      </div>
    </Section>}
    {feeEditable && <Section title="예상 이용료">
      <div className="form-grid">
        <div className="form-field"><label htmlFor="fee-amount">금액(원) <b>*</b></label>
          <input id="fee-amount" type="number" min="0" step="1000" value={fee} onChange={(e) => setFee(e.target.value)} /></div>
        <div className="form-field"><label htmlFor="fee-note" className="label-optional">메모 <span>(선택)</span></label>
          <input id="fee-note" value={feeNote} placeholder="예: 2일, 고정구 제작비 별도" onChange={(e) => setFeeNote(e.target.value)} /></div>
      </div>
      <div className="form-actions"><Button variant="secondary" disabled={action.busy || fee === "" || Number(fee) < 0}
        onClick={() => action.run(() => requestService.estimatedFee(request.id, request.version, { amount: Number(fee), ...(feeNote.trim() ? { note: feeNote.trim() } : {}) }),
          "예상 이용료를 저장했습니다.")}>{request.estimatedFee ? "이용료 수정" : "이용료 저장"}</Button></div>
    </Section>}
    {resultEditable && <Section title="시험 결과·성적서">
      <div className="form-field"><label htmlFor="result-summary">결과 요약 <b>*</b></label>
        <textarea id="result-summary" rows={2} value={result.summary} onChange={(e) => setResult({ ...result, summary: e.target.value })} /></div>
      <div className="form-grid" style={{ marginTop: 8 }}>
        <div className="form-field"><label htmlFor="result-no" className="label-optional">성적서 번호 <span>(선택)</span></label>
          <input id="result-no" value={result.reportNo} onChange={(e) => setResult({ ...result, reportNo: e.target.value })} /></div>
        <div className="form-field"><label htmlFor="result-url" className="label-optional">성적서 링크 <span>(선택)</span></label>
          <input id="result-url" type="url" placeholder="https://" value={result.reportUrl} onChange={(e) => setResult({ ...result, reportUrl: e.target.value })} /></div>
      </div>
      <div className="form-actions">
        <Button variant="secondary" disabled={action.busy || !result.summary.trim()}
          onClick={() => action.run(() => requestService.result(request.id, {
            summary: result.summary.trim(),
            ...(result.reportNo.trim() ? { reportNo: result.reportNo.trim() } : {}),
            ...(result.reportUrl.trim() ? { reportUrl: result.reportUrl.trim() } : {}),
          }), "결과를 등록했습니다. 맡긴 쪽에 알림이 갑니다.")}>{request.result ? "결과 수정" : "결과 등록"}</Button>
      </div>
      <div className="upload-row">
        <input ref={fileInput} id="report-file" type="file" className="sr-only"
          accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.docx,.doc,.hwp,.hwpx,.pptx,.txt,.zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button variant="secondary" className="button--sm" icon={FileUp} onClick={() => fileInput.current?.click()}>성적서 파일 선택</Button>
        <span className="small-note">{file ? `${file.name} (${fileSize(file.size)})` : "PDF·이미지·문서, 20MB 이하"}</span>
        <Button className="button--sm" disabled={!file || action.busy || file.size > 20 * 1048576}
          onClick={() => action.run(async (signal) => {
            await requestService.upload(request.id, file, "RESULT_REPORT", signal);
            setFile(null);
            if (fileInput.current) fileInput.current.value = "";
          }, "성적서를 올렸습니다.")}>올리기</Button>
      </div>
    </Section>}
    {status === "CONFIRMED" && <Section title="시험 완료">
      <p className="small-note">{request.result ? "결과가 등록되어 완료 처리할 수 있습니다." : "결과를 먼저 등록해야 완료할 수 있습니다."}</p>
      <div className="form-actions"><Button disabled={action.busy || !request.result || !can("COMPLETE")}
        onClick={() => action.run(() => requestService.action(request.id, "complete", request.version), "시험 완료로 바꿨습니다.")}>완료 처리</Button></div>
    </Section>}
    <Feedback action={action} />
  </>;
}

export default function RequestDetailDialog({ requestId, onClose, initialReservationDate, requestBox, onOpenSchedule, onContinueDraft }: {
  requestId: number;
  onClose: () => void;
  initialReservationDate?: string;
  requestBox?: RequestBox;
  onOpenSchedule?: () => void;
  onContinueDraft?: (request: RequestDetail) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { user } = useAuth();
  const { openSimulation } = useWorkspace();
  const cancel = useAction();
  const query = useApiQuery((signal) => requestService.get(requestId, signal), `request:${requestId}`);
  const r = query.data;
  const history = useApiQuery((signal) => requestService.history(requestId, signal), `request-history:${requestId}`);
  const attachments = useApiQuery((signal) => requestService.attachments(requestId, signal), `request-attachments:${requestId}`);
  const [edited, setEdited] = useState<RequestContent | null>(null);
  const [reason, setReason] = useState("");
  const [downloadError, setDownloadError] = useState(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  const admin = user.role === "ADMIN";
  const ownsEquipment = ownsOrganization(user, r?.institution?.id);
  const provider = admin || (requestBox !== "SENT" && ownsEquipment);
  const requester = admin || requestBox === "SENT" || (!requestBox && !ownsEquipment);
  const content = edited ?? r?.revision.content;
  const supplement = r?.openSupplement?.status === "OPEN" ? r.openSupplement : null;
  const reports = (attachments.data ?? []).filter((item) => item.category === "RESULT_REPORT");
  const others = (attachments.data ?? []).filter((item) => item.category !== "RESULT_REPORT");
  const download = async (item: { id: number; fileName: string }) => {
    setDownloadError(null);
    try { await requestService.download(item); } catch (error) { setDownloadError(error); }
  };

  return (
    <dialog ref={dialog} className="dialog equipment-dialog request-dialog" aria-labelledby="request-detail-title" onClose={onClose}
      onClick={(e) => { if (e.target === dialog.current) dialog.current.close(); }}>
      <div className="request-dialog__head">
        <div>
          <h2 id="request-detail-title">{r?.title ?? "의뢰 상세"}</h2>
          {r && <p className="small-note">{r.requestNo} · {r.equipment?.name} · {provider && !admin ? `맡긴 곳 ${r.companyName ?? r.requester?.name ?? ""}` : r.institution?.name}</p>}
        </div>
        {r && <Badge tone={r.status === "SUPPLEMENT_REQUESTED" ? "amber" : r.status === "COMPLETED" ? "green" : r.status === "REJECTED" ? "red" : "cyan"}>
          {requestStatusLabels[r.status] ?? r.status}</Badge>}
        {onOpenSchedule && r && ["SCHEDULING", "CONFIRMED", "COMPLETED"].includes(r.status) &&
          <Button variant="secondary" className="button--sm" icon={CalendarDays} onClick={() => { dialog.current?.close(); onOpenSchedule(); }}>일정 보기</Button>}
        <button className="icon-button" aria-label="의뢰 상세 닫기" onClick={() => dialog.current?.close()}><X size={20} /></button>
      </div>
      {(query.loading || query.error) && <ApiState loading={query.loading} error={query.error} onRetry={query.reload} />}
      {r && content && <div className="request-dialog__body">
        <div className="request-dialog__main">
          <dl className="kv">
            <dt>시험</dt><dd>{content.test.testTypeCode ? testTypeLabel(content.test.testTypeCode) : "—"} · {content.test.purpose || "목적 미입력"}</dd>
            <dt>시료</dt><dd>{content.sample.name || "미입력"} · {content.sample.quantity ?? "—"}개{content.sample.readyDate ? ` · 준비 ${content.sample.readyDate}` : ""}</dd>
            <dt>희망 기간</dt><dd>{content.schedule?.desiredStartDate ?? "미입력"} ~ {content.schedule?.desiredEndDate ?? "미입력"}</dd>
            <dt>신청자</dt><dd>{[content.applicant.companyName, content.applicant.contactName, content.applicant.phone, content.applicant.email].filter(Boolean).join(" · ")}</dd>
            <dt>실사용자</dt><dd>{person(content.actualUser)}</dd>
            <dt>회계 담당자</dt><dd>{person(content.accounting)}</dd>
            {(content.responsible || content.report || content.billing || content.sample.disposal) && <>
              <dt>추가 정보</dt><dd>{[content.responsible?.name && `책임자 ${content.responsible.name}`, content.report?.type, content.sample.disposal, content.billing?.method].filter(Boolean).join(" · ") || "—"}</dd>
            </>}
            {content.test.standard && <><dt>규격</dt><dd>{content.test.standard}</dd></>}
            {content.notes && <><dt>기타</dt><dd className="kv__long">{content.notes}</dd></>}
          </dl>
          {content.conditions.length > 0 && <div className="table-scroll"><table className="data-table">
            <thead><tr><th>시험 조건</th><th>값</th><th>상태</th></tr></thead>
            <tbody>{content.conditions.map((c) => <tr key={c.key}><td>{c.label ?? c.key}</td><td>{valueText(c)}</td>
              <td>{c.status === "CONFIRMED" ? "확인" : c.status === "MISSING" ? "미입력" : "미확인"}</td></tr>)}</tbody>
          </table></div>}
          <details className="detail-history">
            <summary>상태 변경 이력</summary>
            {history.error ? <ApiState error={history.error} onRetry={history.reload} /> :
              <ol>{history.data?.map((entry) => <li key={entry.id}>
                {requestStatusLabels[entry.fromStatus] ?? "—"} → {requestStatusLabels[entry.toStatus]}
                <small> {formatDate(entry.createdAt)} · {entry.changedBy.name}{entry.note ? ` · ${entry.note}` : ""}</small>
              </li>)}</ol>}
          </details>
        </div>

        <div className="request-dialog__side">
          {(r.estimatedFee || r.result || reports.length > 0) && <Section title="이용료·결과">
            <dl className="kv">
              <dt>예상 이용료</dt><dd>{r.estimatedFee ? <>{won(r.estimatedFee.amount)}{r.estimatedFee.note && <small> · {r.estimatedFee.note}</small>}</> : "아직 없음"}</dd>
              {r.result && <>
                <dt>결과</dt><dd>{r.result.summary}</dd>
                {r.result.reportNo && <><dt>성적서 번호</dt><dd>{r.result.reportNo}</dd></>}
                {r.result.reportUrl && <><dt>성적서 링크</dt><dd><a href={r.result.reportUrl} target="_blank" rel="noopener noreferrer">열기</a></dd></>}
              </>}
            </dl>
            {reports.map((item) => <div className="file-row" key={item.id}>
              <span>{item.fileName} <small>{fileSize(item.sizeBytes)} · {item.uploadedBy?.name}</small></span>
              <Button variant="secondary" className="button--sm" icon={Download} onClick={() => download(item)}>내려받기</Button>
            </div>)}
          </Section>}

          {canAccessMenu(user.role, "simulation") && r.equipment?.id &&
            ["SUBMITTED", "UNDER_REVIEW", "SUPPLEMENT_REQUESTED", "RESUBMITTED", "SCHEDULING", "CONFIRMED"].includes(r.status) &&
            <Section title="결과가 급하다면">
              <p className="small-note">실제 시험 전이라도 이 장비의 가상 시험으로 결과를 대략 가늠해 볼 수 있습니다(참고용).</p>
              <div className="form-actions"><Button variant="secondary"
                onClick={() => { dialog.current?.close(); openSimulation(r.equipment.id); }}>가상 시험 돌려보기</Button></div>
            </Section>}

          {requester && r.status === "DRAFT" && <Section title="작성 중">
            <p className="small-note">아직 제출하지 않은 의뢰서입니다.</p>
            {onContinueDraft && <div className="form-actions"><Button onClick={() => { dialog.current?.close(); onContinueDraft(r); }}>이어서 작성</Button></div>}
          </Section>}

          {supplement && <Section title={supplement.kind === "ADDITIONAL_INFO" ? "추가 정보 요청" : "보완 요청"}>
            <p className="content-note">{supplement.message}{supplement.dueDate && <> · 기한 {supplement.dueDate}</>}</p>
            {requester && r.status === "SUPPLEMENT_REQUESTED"
              ? <SupplementResponse request={r} supplement={supplement} content={content} onContent={setEdited} />
              : <p className="small-note">맡긴 쪽의 답변을 기다리고 있습니다.</p>}
          </Section>}

          {provider && <ProviderActions request={r} />}

          {["SCHEDULING", "CONFIRMED", "COMPLETED"].includes(r.status) && <div className="detail-section">
            <ReservationControls request={r} initialDate={initialReservationDate} canConfirm={provider} />
          </div>}

          {others.length > 0 && <Section title="첨부">
            {others.map((item) => <div className="file-row" key={item.id}>
              <span>{item.fileName} <small>{fileSize(item.sizeBytes)}</small></span>
              <Button variant="ghost" className="button--sm" icon={Download} onClick={() => download(item)}>내려받기</Button>
            </div>)}
          </Section>}
          {downloadError && <ApiState error={downloadError} />}

          {requester && ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "SUPPLEMENT_REQUESTED", "RESUBMITTED", "SCHEDULING"].includes(r.status) &&
            <details className="detail-history">
              <summary>의뢰 취소</summary>
              <div className="form-field"><label htmlFor="request-cancel-reason">취소 사유</label>
                <input id="request-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              <div className="form-actions"><Button variant="danger" disabled={!reason.trim() || cancel.busy}
                onClick={() => cancel.run(() => requestService.action(r.id, "cancel", r.version, { reason }), "의뢰를 취소했습니다.")}>취소 확인</Button></div>
              <Feedback action={cancel} />
            </details>}
        </div>
      </div>}
    </dialog>
  );
}
