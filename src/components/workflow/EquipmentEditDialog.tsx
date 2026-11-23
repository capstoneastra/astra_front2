import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAction } from "../../hooks/useAction";
import { equipmentService } from "../../services/equipmentService";
import { catalogService } from "../../services/catalogService";
import { Badge, Button, FormField } from "../ui/index";
import ApiState from "../ui/ApiState";
import { Feedback } from "./Feedback";

export default function EquipmentEditDialog({ equipmentId, onClose }) {
  const dialog = useRef(null),
    [editor, setEditor] = useState(null),
    [realSpecs, setSpecs] = useState(null),
    action = useAction();
  const query = useApiQuery(
      (signal) => equipmentService.detail(equipmentId, signal),
      `managed-equipment:${equipmentId}`,
    ),
    data = query.data,
    value = editor ?? data;
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const specs =
    realSpecs ?? data?.specs.filter((s) => s.sourceType === "REAL") ?? [];
  const setField = (key, text) => setEditor({ ...value, [key]: text });
  const setUsage = (key, text) =>
    setEditor({ ...value, usage: { ...value.usage, [key]: text } });
  const setSpec = (index, key, val) =>
    setSpecs(specs.map((s, i) => (i === index ? { ...s, [key]: val } : s)));
  return (
    <dialog
      ref={dialog}
      className="dialog equipment-dialog"
      aria-labelledby="edit-equipment-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close();
      }}
    >
      <div className="dialog__heading">
        <Badge tone="cyan">기관 장비 정보</Badge>
        <button
          className="icon-button"
          aria-label="장비 수정 닫기"
          onClick={() => dialog.current.close()}
        >
          <X size={20} />
        </button>
      </div>
      <h2 id="edit-equipment-title">장비 정보 수정</h2>
      {(query.loading || query.error) && (
        <ApiState
          loading={query.loading}
          error={query.error}
          onRetry={query.reload}
        />
      )}
      {value && (
        <>
          <p className="field-hint">
            {value.externalId} · {value.institution} · 소속 기관만 변경할 수
            있습니다.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action.run(async (signal) => {
                await catalogService.updateEquipment(
                  value.id,
                  { name: value.name, model: value.model, usage: value.usage },
                  signal,
                );
              }, "장비 정보를 갱신했습니다.");
            }}
          >
            <div className="form-grid">
              <FormField id="edit-equipment-name" label="장비명">
                <input
                  id="edit-equipment-name"
                  required
                  value={value.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </FormField>
              <FormField id="edit-equipment-model" label="모델">
                <input
                  id="edit-equipment-model"
                  value={value.model ?? ""}
                  onChange={(e) => setField("model", e.target.value)}
                />
              </FormField>
              <FormField id="edit-equipment-fee" label="이용료 안내">
                <input
                  id="edit-equipment-fee"
                  value={value.usage.feeText ?? ""}
                  onChange={(e) => setUsage("feeText", e.target.value || null)}
                  placeholder="미확인 정보는 비워두세요"
                />
              </FormField>
              <FormField id="edit-equipment-duration" label="소요 기간">
                <input
                  id="edit-equipment-duration"
                  value={value.usage.durationText ?? ""}
                  onChange={(e) =>
                    setUsage("durationText", e.target.value || null)
                  }
                />
              </FormField>
              <FormField id="edit-equipment-utilization" label="가동률 (%)">
                <input
                  id="edit-equipment-utilization"
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={value.usage.utilizationRate ?? ""}
                  onChange={(e) =>
                    setUsage(
                      "utilizationRate",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                />
              </FormField>
              <FormField id="edit-equipment-availability" label="가용 상태">
                <select
                  id="edit-equipment-availability"
                  value={value.usage.availability ?? "UNKNOWN"}
                  onChange={(e) => setUsage("availability", e.target.value)}
                >
                  <option value="UNKNOWN">확인 필요</option>
                  <option value="AVAILABLE">이용 가능</option>
                  <option value="BUSY">사용 중</option>
                  <option value="MAINTENANCE">점검 중</option>
                  <option value="UNAVAILABLE">이용 불가</option>
                </select>
              </FormField>
              <FormField id="edit-equipment-access" label="이용조건">
                <select
                  id="edit-equipment-access"
                  value={value.usage.accessScope ?? "UNKNOWN"}
                  onChange={(e) => setUsage("accessScope", e.target.value)}
                >
                  <option value="UNKNOWN">확인 필요</option>
                  <option value="EXTERNAL_ALLOWED">외부 이용 가능</option>
                  <option value="INTERNAL_ONLY">기관 내부 전용</option>
                </select>
              </FormField>
            </div>
            <div className="form-actions">
              <Button type="submit" disabled={action.busy}>
                장비 정보 저장
              </Button>
              <Button
                variant="secondary"
                disabled={action.busy}
                onClick={() =>
                  action.run(
                    () => catalogService.confirmEquipment(value.id),
                    "기관 확인 상태를 갱신했습니다.",
                  )
                }
              >
                현재 정보 확인
              </Button>
            </div>
          </form>
          <h3>기관 등록 REAL 사양</h3>
          <p className="field-hint">
            기존 MOCK 사양은 이 입력란에서 수정하지 않습니다. 시연 모드의 입력은
            실제 장비 검증을 의미하지 않습니다.
          </p>
          {specs.map((spec, index) => (
            <div className="form-grid" key={index}>
              <FormField id={`spec-key-${index}`} label="사양 키">
                <input
                  id={`spec-key-${index}`}
                  value={spec.key}
                  onChange={(e) => setSpec(index, "key", e.target.value)}
                />
              </FormField>
              <FormField id={`spec-label-${index}`} label="사양 이름">
                <input
                  id={`spec-label-${index}`}
                  value={spec.label}
                  onChange={(e) => setSpec(index, "label", e.target.value)}
                />
              </FormField>
              {["value", "min", "max"].map((key) => (
                <FormField
                  key={key}
                  id={`spec-${key}-${index}`}
                  label={{ value: "단일값", min: "최솟값", max: "최댓값" }[key]}
                >
                  <input
                    id={`spec-${key}-${index}`}
                    type="number"
                    step="any"
                    value={spec[key] ?? ""}
                    onChange={(e) =>
                      setSpec(
                        index,
                        key,
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                  />
                </FormField>
              ))}
              <FormField id={`spec-unit-${index}`} label="단위">
                <input
                  id={`spec-unit-${index}`}
                  value={spec.unit ?? ""}
                  onChange={(e) =>
                    setSpec(index, "unit", e.target.value || null)
                  }
                />
              </FormField>
              <Button
                variant="secondary"
                disabled={action.busy}
                onClick={() => setSpecs(specs.filter((_, i) => i !== index))}
              >
                이 사양 제거
              </Button>
            </div>
          ))}
          <div className="form-actions">
            <Button
              variant="secondary"
              disabled={action.busy}
              onClick={() =>
                setSpecs([
                  ...specs,
                  {
                    key: "",
                    label: "",
                    unit: null,
                    value: null,
                    min: null,
                    max: null,
                  },
                ])
              }
            >
              REAL 사양 추가
            </Button>
            <Button
              disabled={
                action.busy ||
                specs.some((s) => !s.key.trim() || !s.label.trim())
              }
              onClick={() =>
                action.run(
                  () => catalogService.saveSpecs(value.id, specs),
                  "REAL 사양을 저장했습니다. MOCK 사양은 유지됩니다.",
                )
              }
            >
              REAL 사양 저장
            </Button>
          </div>
          {data.specs
            .filter((s) => s.sourceType === "MOCK")
            .map((s, i) => (
              <p className="field-hint" key={`${s.key}:${i}`}>
                시연 값: {s.label} (수정하지 않음)
              </p>
            ))}
        </>
      )}
      <Feedback action={action} />
    </dialog>
  );
}
