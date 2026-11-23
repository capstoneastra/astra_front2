import { useEffect, useRef } from "react";
import { FilePlus2, Microscope, X } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { useApiQuery } from "../hooks/useApiQuery";
import { canAccessMenu } from "../auth/permissions";
import { Badge, Button } from "./ui";
import ApiState from "./ui/ApiState";
import type { ReactNode } from "react";
import type { EquipmentSpec } from "../services/contracts";
import type { Equipment } from "../services/equipmentService";

function specValue(spec: EquipmentSpec) {
  if (spec.value !== null && spec.value !== undefined)
    return `${spec.value} ${spec.unit ?? ""}`;
  if (
    spec.min !== null &&
    spec.min !== undefined &&
    spec.max !== null &&
    spec.max !== undefined
  )
    return `${spec.min} ~ ${spec.max} ${spec.unit ?? ""}`;
  if (spec.min !== null && spec.min !== undefined)
    return `${spec.min} ${spec.unit ?? ""} 이상`;
  if (spec.max !== null && spec.max !== undefined)
    return `${spec.max} ${spec.unit ?? ""} 이하`;
  return spec.valueText || "확인 필요";
}

export default function EquipmentDetailDialog({
  item,
  onClose,
  onSelect,
  illustration,
}: {
  item: Equipment | null;
  onClose: () => void;
  onSelect: (equipment: Equipment) => void;
  illustration?: ReactNode;
}) {
  const { resolveEquipment, user, openSimulation, openTestInfo } =
    useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const query = useApiQuery(
    (signal) => item ? resolveEquipment(item.id, signal) : undefined,
    `equipment-detail:${user.id}:${item?.id}`,
    Boolean(item),
  );
  const data = query.data;
  useEffect(() => {
    if (item && !dialog.current.open) dialog.current.showModal();
    else if (!item && dialog.current.open) dialog.current.close();
  }, [item]);
  return (
    <dialog
      ref={dialog}
      className="dialog equipment-dialog"
      aria-labelledby="equipment-detail-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current.close();
      }}
    >
      <div className="dialog__heading">
        <Badge tone="cyan">장비 정보{data?.isMock ? ", 시연 값 포함" : ""}</Badge>
        <button
          className="icon-button"
          aria-label="장비 상세 닫기"
          onClick={() => dialog.current.close()}
        >
          <X size={20} />
        </button>
      </div>
      {!data && <h2 id="equipment-detail-title">장비 상세</h2>}
      {(query.loading || query.error) && (
        <ApiState
          loading={query.loading}
          error={query.error}
          onRetry={query.reload}
        />
      )}
      {data && (
        <>
          {illustration ?? (
            <span className="equipment-glyph">
              <Microscope size={28} />
            </span>
          )}
          <h2 id="equipment-detail-title">{data.name}</h2>
          <dl className="detail-list">
            <div>
              <dt>시험항목</dt>
              <dd>{data.testItem || "확인 필요"}</dd>
            </div>
            <div>
              <dt>보유기관</dt>
              <dd>{data.institution || "확인 필요"}</dd>
            </div>
            <div>
              <dt>활용 설명</dt>
              <dd>{data.reason || "확인 필요"}</dd>
            </div>
            <div>
              <dt>정보 갱신일</dt>
              <dd>{data.updateDate || "확인 필요"}</dd>
            </div>
            <div>
              <dt>가용 상태</dt>
              <dd>
                {data.usage?.availability === "AVAILABLE"
                  ? "이용 가능 · 최종 일정은 기관 확인 필요"
                  : data.usage?.availability &&
                      data.usage.availability !== "UNKNOWN"
                    ? data.usage.availability
                    : "확인 필요"}
              </dd>
            </div>
            <div>
              <dt>비용·기간</dt>
              <dd>
                {data.usage?.feeText || "비용 확인 필요"} /{" "}
                {data.usage?.durationText || "기간 확인 필요"}
              </dd>
            </div>
            <div>
              <dt>이용조건</dt>
              <dd>
                {data.usage?.accessScope === "EXTERNAL_ALLOWED"
                  ? "외부 이용 가능"
                  : data.usage?.accessScope === "INTERNAL_ONLY"
                    ? "기관 내부 전용"
                    : "확인 필요"}
              </dd>
            </div>
            <div>
              <dt>주요 사양</dt>
              <dd>
                {data.specs?.length
                  ? data.specs.map((spec, index) => (
                      <p key={`${spec.key}:${spec.sourceType}:${index}`}>
                        {spec.label || spec.key}: {specValue(spec)}{" "}
                        {spec.sourceType === "MOCK" ? (
                          <Badge tone="amber">시연 값, 미검증</Badge>
                        ) : (
                          <Badge>
                            {spec.verificationStatus || "검증 확인 필요"}
                          </Badge>
                        )}
                      </p>
                    ))
                  : "확인 필요"}
              </dd>
            </div>
          </dl>
          {canAccessMenu(user.role, "request") && <Button
            icon={FilePlus2}
            disabled={
              (user.organization?.id != null && data.institutionId === user.organization.id)}
            onClick={() => {
              onSelect(data);
              dialog.current.close();
            }}
          >
            이 장비로 시험 의뢰하기
          </Button>}
          <div className="form-actions">
            {canAccessMenu(user.role, "simulation") && <Button
              variant="secondary"
              disabled={!data.simulation?.presetIds?.length}
              onClick={() => {
                dialog.current.close();
                openSimulation(data.id);
              }}
            >
              가상 시험 돌려보기
            </Button>}
            {canAccessMenu(user.role, "testInfo") && <Button
              variant="secondary"
              disabled={!data.testTypes.length}
              onClick={() => {
                dialog.current.close();
                openTestInfo(data.testTypes[0]);
              }}
            >
              시험 정보 안내
            </Button>}
          </div>
        </>
      )}
    </dialog>
  );
}
