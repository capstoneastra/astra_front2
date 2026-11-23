import { useState } from "react";
import { Box, Database, Info, Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { Badge, Button, EmptyState, FormField, PageHeader, Panel } from "./ui";
import ApiState from "./ui/ApiState";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { catalogService } from "../services/catalogService";
import EquipmentEditDialog from "./workflow/EquipmentEditDialog";
import { Feedback } from "./workflow/Feedback";

export default function EquipmentManager(_props: { setActiveMenu: (menu: string) => void }) {
  const { equipmentList, user, catalogQuery } = useWorkspace();
  const managedEquipment =
    user.role === "INSTITUTION_MANAGER"
      ? equipmentList.filter(
          (item) => item.institutionId === user.organization?.id,
        )
      : equipmentList;
  const [newEquip, setNewEquip] = useState({
    name: "",
    testItem: "",
    institution: "",
    reason: "",
    institutionId: "",
    equipmentType: "TEST",
    model: "",
  });
  const [editing, setEditing] = useState(null),
    action = useAction();
  const types = useApiQuery(
    (signal) => catalogService.testTypes(signal),
    "test-types",
  );
  const institutions = useApiQuery(
    (signal) => catalogService.institutions(signal),
    "institutions",
    user.role === "ADMIN",
  );

  const handleAdd = () => {
    if (!newEquip.name.trim() || !newEquip.testItem) return;
    action.run(async (signal) => {
      await catalogService.createEquipment(
        {
          name: newEquip.name,
          model: newEquip.model || null,
          description: newEquip.reason || null,
          equipmentType: newEquip.equipmentType,
          testTypes: [newEquip.testItem],
          ...(user.role === "ADMIN"
            ? { institutionId: Number(newEquip.institutionId) }
            : {}),
        },
        signal,
      );
      setNewEquip({
        ...newEquip,
        name: "",
        testItem: "",
        reason: "",
        model: "",
      });
    }, "장비를 등록했습니다.");
  };
  const handleDelete = (id) => {
    if (
      window.confirm("이 장비를 비활성화할까요? 기존 의뢰 이력은 유지됩니다.")
    )
      action.run(
        () => catalogService.deleteEquipment(id),
        "장비를 비활성화했습니다.",
      );
  };

  return (
    <div className="content-page page-enter">
      <PageHeader
        eyebrow="INFRASTRUCTURE DATA"
        title="보유 장비 관리"
        description="공동활용 장비의 정보를 등록하고 목록을 관리하세요."
      >
        <Badge tone="cyan">
          현재 {catalogQuery.status === "ready" ? managedEquipment.length : "—"}
          대
        </Badge>
      </PageHeader>
      <div className="content-note">
        <Info size={16} />
        <span>
          기관이 등록·확인한 정보로 갱신합니다.{" "}
          소속 기관의 장비만 관리하며, 미확인 비용·사양은 추정해 입력하지
          않습니다.
        </span>
      </div>
      <Panel className="form-panel manager-add">
        <div className="form-section-heading">
          <span>
            <Database size={18} />
          </span>
          <div>
            <h2>새 장비 등록</h2>
            <p>장비명과 시험항목은 필수 입력입니다.</p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <div className="form-grid">
            <FormField id="new-equipment-name" label="장비명 *">
              <input
                id="new-equipment-name"
                value={newEquip.name}
                onChange={(e) =>
                  setNewEquip({ ...newEquip, name: e.target.value })
                }
                placeholder="예: 치구복합가공기"
              />
            </FormField>
            <FormField id="new-equipment-test" label="시험항목 *">
              <select
                id="new-equipment-test"
                value={newEquip.testItem}
                onChange={(e) =>
                  setNewEquip({ ...newEquip, testItem: e.target.value })
                }
              >
                <option value="">시험유형 선택</option>
                {types.data?.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.nameKo}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="new-equipment-institution" label="보유기관">
              {user.role === "ADMIN" ? (
                <select
                  id="new-equipment-institution"
                  value={newEquip.institutionId}
                  onChange={(e) =>
                    setNewEquip({ ...newEquip, institutionId: e.target.value })
                  }
                >
                  <option value="">기관 선택</option>
                  {institutions.data?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="new-equipment-institution"
                  value={user.organization?.name ?? ""}
                  disabled
                  onChange={(e) =>
                    setNewEquip({ ...newEquip, institution: e.target.value })
                  }
                  placeholder="예: 한국생산기술연구원"
                />
              )}
            </FormField>
            <FormField id="new-equipment-description" label="활용 설명">
              <input
                id="new-equipment-description"
                value={newEquip.reason}
                onChange={(e) =>
                  setNewEquip({ ...newEquip, reason: e.target.value })
                }
                placeholder="예: 대형 항공기 부품 단조 성형"
              />
            </FormField>
          </div>
          <div className="form-grid">
            <FormField id="new-equipment-model" label="모델">
              <input
                id="new-equipment-model"
                value={newEquip.model}
                onChange={(e) =>
                  setNewEquip({ ...newEquip, model: e.target.value })
                }
              />
            </FormField>
            <FormField id="new-equipment-type" label="장비 유형">
              <select
                id="new-equipment-type"
                value={newEquip.equipmentType}
                onChange={(e) =>
                  setNewEquip({ ...newEquip, equipmentType: e.target.value })
                }
              >
                {Object.entries({
                  TEST: "시험",
                  MEASUREMENT: "측정",
                  MANUFACTURING: "제조",
                  SOFTWARE: "소프트웨어",
                  SUPPORT: "지원",
                }).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="form-actions">
            <p>등록 정보는 운영 데이터와 구분되는 시연 데이터입니다.</p>
            <Button
              type="submit"
              icon={Plus}
              disabled={
                action.busy ||
                !newEquip.name.trim() ||
                !newEquip.testItem ||
                (user.role === "ADMIN" && !newEquip.institutionId)
              }
            >
              장비 추가하기
            </Button>
          </div>
        </form>
      </Panel>
      <Feedback action={action} />
      {(types.error || institutions.error) && (
        <ApiState
          error={types.error ?? institutions.error}
          onRetry={() => {
            types.reload();
            institutions.reload();
          }}
        />
      )}
      <div className="results-heading">
        <span>
          등록 장비
          <strong>
            {catalogQuery.status === "ready" ? managedEquipment.length : "—"}
          </strong>
          대
        </span>
        <small>현재 워크스페이스 기준</small>
      </div>
      <div className="manager-list">
        {catalogQuery.loading || catalogQuery.error ? (
          <Panel>
            <ApiState
              loading={catalogQuery.loading}
              error={catalogQuery.error}
              onRetry={catalogQuery.reload}
            />
          </Panel>
        ) : managedEquipment.length ? (
          managedEquipment.map((equip) => (
            <Panel className="manager-row" key={equip.id}>
              <span className="manager-row__icon">
                <Box size={19} />
              </span>
              <div>
                <h3>{equip.name}</h3>
                <p>
                  {equip.testItem} · {equip.institution || "보유기관 미입력"}
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={action.busy}
                onClick={() => setEditing(equip.id)}
              >
                정보 수정
              </Button>
              <Button
                variant="danger"
                icon={Trash2}
                disabled={action.busy}
                onClick={() => handleDelete(equip.id)}
              >
                삭제
              </Button>
            </Panel>
          ))
        ) : (
          <Panel>
            <EmptyState
              icon={Database}
              title="등록된 장비가 없습니다"
              description="위 입력란에서 첫 번째 장비를 등록해 보세요."
            />
          </Panel>
        )}
      </div>
      {editing && (
        <EquipmentEditDialog
          key={editing}
          equipmentId={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
