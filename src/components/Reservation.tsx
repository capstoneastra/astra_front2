import { useState } from "react";
import { ArrowRight, FilePlus2, Info } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { Badge, Button, FormField, PageHeader, Panel } from "./ui";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { requestService } from "../services/requestService";
import { catalogService } from "../services/catalogService";
import ConditionEditor from "./workflow/ConditionEditor";
import { Feedback } from "./workflow/Feedback";
import ApiState from "./ui/ApiState";

export default function Reservation({ setActiveMenu }) {
  const {
    testCondition,
    setTestCondition,
    selectedEquipment,
    setSelectedEquipment,
    equipmentList,
    requirementId,
    draftRequestId,
    setDraftRequestId,
    user,
  } = useWorkspace();
  const [editor, setEditor] = useState(null),
    [reviewed, setReviewed] = useState(false),
    action = useAction();
  const query = useApiQuery(
    (signal) => requestService.get(draftRequestId, signal),
    `request:${draftRequestId}`,
    Boolean(draftRequestId),
  );
  const draft = query.data,
    content = editor ?? draft?.revision.content;
  const rules = useApiQuery(
    (signal) => catalogService.testType(content.test.testTypeCode, signal),
    `test-type:${content?.test.testTypeCode}`,
    Boolean(content?.test.testTypeCode),
  );
  const change = (section, key, value) => {
    if (content) {
      setEditor({
        ...content,
        [section]: { ...content[section], [key]: value },
      });
      setReviewed(false);
    }
  };
  const candidateEquipment =
    selectedEquipment &&
    !equipmentList.some((item) => item.id === selectedEquipment.id)
      ? [selectedEquipment, ...equipmentList]
      : equipmentList;
  const organizationId = user.organization?.id;
  const options = candidateEquipment.filter((equipment) => organizationId == null || equipment.institutionId !== organizationId);
  const canStartDraft = selectedEquipment != null && options.some((equipment) => equipment.id === selectedEquipment.id);

  const handleEquipmentChange = (e) => {
    const selectedId = parseInt(e.target.value);
    const equipment = options.find((eq) => eq.id === selectedId);
    setSelectedEquipment(equipment || null);
  };

  const handleReservationSubmit = () => {
    if (!draft || !reviewed || !content) return;
    action.run(async (signal) => {
      const saved = await requestService.save(
        draft.id,
        draft.version,
        content,
        signal,
      );
      await requestService.submit(draft.id, saved.version, signal);
      setDraftRequestId(null);
      setSelectedEquipment(null);
      setTestCondition("");
      setActiveMenu("sent");
    });
  };

  return (
    <div className="content-page content-page--narrow page-enter">
      <PageHeader
        eyebrow="TEST REQUEST"
        title="시험 의뢰하기"
        description="필요한 장비와 시험조건을 정리해 의뢰를 준비하세요."
      >
        <Badge tone="cyan">
          시험 의뢰 ·{" "}
          {draft?.status ?? "초안 작성"}
        </Badge>
      </PageHeader>
      <div className="content-note">
        <Info size={16} />
        <span>
          입력한 정보를 확인하고 직접 제출해주세요.{" "}
          초안 저장은 접수가 아니며, 예약은 기관 검토 이후 별도로 협의합니다.
        </span>
      </div>
      <Panel className="form-panel">
        <div className="form-section-heading">
          <span>
            <FilePlus2 size={18} />
          </span>
          <div>
            <h2>시험 의뢰 신청서</h2>
            <p>선택한 장비와 상담에서 정리한 시험조건이 자동으로 연결됩니다.</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleReservationSubmit();
          }}
        >
          <div className="form-grid">
            <FormField
              id="request-equipment"
              label="시험장비 *"
              className="form-field--full"
            >
              <select
                id="request-equipment"
                value={draft?.equipment?.id ?? (canStartDraft ? selectedEquipment.id : "")}
                disabled={Boolean(draftRequestId) || action.busy}
                onChange={handleEquipmentChange}
              >
                <option value="" disabled>
                  의뢰할 장비를 선택해주세요
                </option>
                {options.map((equip) => (
                  <option key={equip.id} value={equip.id}>
                    {equip.name}
                  </option>
                ))}
              </select>
              {!draftRequestId && (
                <div className="form-actions">
                  <Button
                    disabled={!canStartDraft || action.busy}
                    onClick={() =>
                      action.run(async (signal) => {
                        const body = {
                          equipmentId: selectedEquipment.id,
                          ...(requirementId ? { requirementId } : {}),
                        };
                        const result = requirementId
                          ? await requestService.aiDraft(body, signal)
                          : await requestService.create(body, signal);
                        setDraftRequestId(result.requestId ?? result.id);
                      })
                    }
                  >
                    {requirementId ? "AI 의뢰서 초안 생성" : "의뢰서 작성 시작"}
                  </Button>
                </div>
              )}
            </FormField>
            <FormField id="request-institution" label="보유기관">
              <input
                id="request-institution"
                value={
                  draft?.institution.name ??
                  selectedEquipment?.institution ??
                  ""
                }
                placeholder="장비를 선택하면 자동으로 표시됩니다"
                disabled
              />
            </FormField>
            <FormField
              id="request-date"
              label="희망 시험일 *"
              hint="희망일이며, 실제 가능 일정은 기관 확인이 필요합니다."
            >
              <input
                id="request-date"
                type="date"
                value={content?.schedule.desiredStartDate ?? ""}
                disabled={!content || action.busy}
                onChange={(e) =>
                  change("schedule", "desiredStartDate", e.target.value || null)
                }
              />
            </FormField>
            <FormField id="request-end-date" label="희망 종료일">
              <input
                id="request-end-date"
                type="date"
                value={content?.schedule.desiredEndDate ?? ""}
                disabled={!content || action.busy}
                onChange={(e) =>
                  change("schedule", "desiredEndDate", e.target.value || null)
                }
              />
            </FormField>
            <FormField id="request-company" label="기업명 *">
              <input
                id="request-company"
                required
                value={content?.applicant.companyName ?? ""}
                disabled={!content || action.busy}
                onChange={(e) =>
                  change("applicant", "companyName", e.target.value)
                }
              />
            </FormField>
            <FormField id="request-contact" label="담당자 *">
              <input
                id="request-contact"
                required
                value={content?.applicant.contactName ?? ""}
                disabled={!content || action.busy}
                onChange={(e) =>
                  change("applicant", "contactName", e.target.value)
                }
              />
            </FormField>
            <FormField id="request-email" label="이메일 *">
              <input
                id="request-email"
                type="email"
                required
                value={content?.applicant.email ?? ""}
                disabled={!content || action.busy}
                onChange={(e) => change("applicant", "email", e.target.value)}
              />
            </FormField>
            <FormField id="request-phone" label="연락처">
              <input
                id="request-phone"
                value={content?.applicant.phone ?? ""}
                disabled={!content || action.busy}
                onChange={(e) => change("applicant", "phone", e.target.value)}
              />
            </FormField>
            <FormField id="request-sample" label="시료명 *">
              <input
                id="request-sample"
                required
                value={content?.sample.name ?? ""}
                disabled={!content || action.busy}
                onChange={(e) => change("sample", "name", e.target.value)}
              />
            </FormField>
            <FormField id="request-quantity" label="시료 수량 *">
              <input
                id="request-quantity"
                type="number"
                min="1"
                step="1"
                required
                value={content?.sample.quantity ?? ""}
                disabled={!content || action.busy}
                onChange={(e) =>
                  change(
                    "sample",
                    "quantity",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </FormField>
            <FormField id="request-ready" label="시료 준비 완료일">
              <input
                id="request-ready"
                type="date"
                value={content?.sample.readyDate ?? ""}
                disabled={!content || action.busy}
                onChange={(e) =>
                  change("sample", "readyDate", e.target.value || null)
                }
              />
            </FormField>
            <FormField id="request-standard" label="시험 규격 (선택)">
              <input
                id="request-standard"
                value={content?.test.standard ?? ""}
                disabled={!content || action.busy}
                onChange={(e) => change("test", "standard", e.target.value)}
              />
            </FormField>
            <FormField
              id="request-purpose"
              label="시험 목적 *"
              className="form-field--full"
            >
              <textarea
                id="request-purpose"
                required
                rows={3}
                value={content?.test.purpose ?? ""}
                disabled={!content || action.busy}
                onChange={(e) => change("test", "purpose", e.target.value)}
              />
            </FormField>
            <FormField
              id="request-condition"
              label="세부 시험조건"
              className="form-field--full"
              hint="상담에서 정리한 조건을 확인하거나 직접 입력해 주세요."
            >
              <textarea
                id="request-condition"
                rows={5}
                value={content?.notes ?? testCondition}
                disabled={!content || action.busy}
                onChange={(e) => {
                  setEditor({ ...content, notes: e.target.value });
                  setReviewed(false);
                }}
                placeholder="시험 대상, 시험항목, 주파수·하중 등의 조건을 입력해주세요."
              />
            </FormField>
          </div>
          {content && rules.data && (
            <ConditionEditor
              rules={rules.data.conditionRules}
              conditions={content.conditions}
              disabled={action.busy}
              onChange={(conditions) => {
                setEditor({ ...content, conditions });
                setReviewed(false);
              }}
            />
          )}
          {draftRequestId && (query.loading || query.error) && (
            <ApiState
              loading={query.loading}
              error={query.error}
              onRetry={query.reload}
            />
          )}
          {(rules.loading || rules.error) && (
            <ApiState
              loading={rules.loading}
              error={rules.error}
              onRetry={rules.reload}
            />
          )}
          <Feedback action={action} onRetry={query.reload} />
          {draft && (
            <label>
              <input
                id="request-reviewed"
                type="checkbox"
                style={{ width: "auto" }}
                checked={reviewed}
                disabled={action.busy}
                onChange={(e) => setReviewed(e.target.checked)}
              />{" "}
              의뢰 내용·미확인 조건을 검토했으며 직접 제출합니다.
            </label>
          )}
          <div className="form-actions">
            <p>* 필수 입력 · 제출 후 기관이 검토합니다.</p>
            <Button
              variant="secondary"
              disabled={!draft || !content || action.busy}
              onClick={() =>
                action.run(async (signal) => {
                  await requestService.save(
                    draft.id,
                    draft.version,
                    content,
                    signal,
                  );
                }, "초안을 저장했습니다. 아직 접수되지 않았습니다.")
              }
            >
              초안 저장
            </Button>
            <Button
              type="submit"
              icon={ArrowRight}
              disabled={
                !draft || !reviewed || action.busy || draft.status !== "DRAFT"
              }
            >
              의뢰서 제출
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
