import { useEffect, useRef, useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2, X } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { Button, PageHeader, Panel } from "./ui";
import { Table, proportional, pixel } from "@astryxdesign/core/Table";
import { Badge as AxBadge } from "@astryxdesign/core/Badge";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import ApiState from "./ui/ApiState";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { catalogService } from "../services/catalogService";
import { equipmentService, testTypeLabel } from "../services/equipmentService";
import type { OwnedEquipment } from "../services/equipmentService";
import EquipmentEditDialog from "./workflow/EquipmentEditDialog";
import { Feedback } from "./workflow/Feedback";
import { availabilityLabels, equipmentTypeLabels, formatDate } from "../domain/constants";

const updateReasonLabels: Record<string, string> = {
  NOT_CONFIRMED: "조직 확인 전",
  OUTDATED: "정보 오래됨",
  AVAILABILITY_UNKNOWN: "가용 상태 미확인",
};

/** 정비·운휴 일정: 이 기간에는 예약을 받지 않는다. */
function DowntimeDialog({ equipment, onClose }: { equipment: OwnedEquipment; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const action = useAction();
  const [form, setForm] = useState({ startAt: "", endAt: "", reason: "" });
  const query = useApiQuery((signal) => catalogService.downtimes(equipment.id, signal), `downtimes:${equipment.id}`);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const valid = form.startAt && form.endAt && form.startAt < form.endAt && form.reason.trim();
  return <dialog ref={dialog} className="dialog equipment-dialog" aria-labelledby="downtime-title" onClose={onClose}>
    <div className="request-dialog__head">
      <div><h2 id="downtime-title">정비 일정</h2><p className="small-note">{equipment.name}</p></div>
      <button className="icon-button" aria-label="닫기" onClick={() => dialog.current?.close()}><X size={18} /></button>
    </div>
    <div className="request-form__body" style={{ paddingTop: 12 }}>
      {query.loading || query.error ? <ApiState loading={query.loading} error={query.error} onRetry={query.reload} /> :
        query.data?.length ? <table className="data-table"><tbody>{query.data.map((item) => <tr key={item.id}>
          <td>{formatDate(item.startAt)} ~ {formatDate(item.endAt)}<small>{item.reason}</small></td>
          <td className="cell-actions"><Button variant="ghost" className="button--sm" disabled={action.busy}
            onClick={() => action.run(() => catalogService.deleteDowntime(equipment.id, item.id), "정비 일정을 지웠습니다.")}>삭제</Button></td>
        </tr>)}</tbody></table> : <p className="inline-empty">등록된 정비 일정이 없습니다.</p>}
      <div className="form-grid" style={{ marginTop: 10 }}>
        <div className="form-field"><label htmlFor="dt-start">시작 <b>*</b></label>
          <input id="dt-start" type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} /></div>
        <div className="form-field"><label htmlFor="dt-end">종료 <b>*</b></label>
          <input id="dt-end" type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></div>
        <div className="form-field form-field--full"><label htmlFor="dt-reason">사유 <b>*</b></label>
          <input id="dt-reason" value={form.reason} placeholder="예: 정기 점검" onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
      </div>
      <Feedback action={action} />
      <div className="form-actions">
        <span className="small-note">한국 시간 기준</span>
        <Button disabled={!valid || action.busy} onClick={() => action.run(async (signal) => {
          await catalogService.addDowntime(equipment.id, {
            startAt: new Date(`${form.startAt}:00+09:00`).toISOString(),
            endAt: new Date(`${form.endAt}:00+09:00`).toISOString(),
            reason: form.reason.trim(),
          }, signal);
          setForm({ startAt: "", endAt: "", reason: "" });
        }, "정비 일정을 등록했습니다.")}>정비 일정 등록</Button>
      </div>
    </div>
  </dialog>;
}

export default function EquipmentManager(_props: { setActiveMenu: (menu: string) => void }) {
  const { user } = useWorkspace();
  const admin = user.role === "ADMIN";
  const [adminInstitution, setAdminInstitution] = useState("");
  const [adding, setAdding] = useState(false);
  const [newEquip, setNewEquip] = useState({ name: "", testType: "", description: "", equipmentType: "TEST", model: "" });
  const [editing, setEditing] = useState<number | null>(null);
  const [downtime, setDowntime] = useState<OwnedEquipment | null>(null);
  const action = useAction();
  const types = useApiQuery((signal) => catalogService.testTypes(signal), "test-types");
  const institutions = useApiQuery((signal) => catalogService.institutions(signal), "institutions", admin);
  // 관리자는 조직을 골라야 한다(GET /institutions/me/equipment?institutionId= 필수).
  const list = useApiQuery(
    (signal) => equipmentService.mine(admin ? { institutionId: Number(adminInstitution) } : {}, signal),
    `my-equipment:${user.id}:${adminInstitution}`,
    !admin || Boolean(adminInstitution),
  );
  const rows = list.data?.content ?? [];
  const needsUpdate = rows.filter((item) => item.needsUpdate).length;

  const handleAdd = () => action.run(async (signal) => {
    await catalogService.createEquipment({
      name: newEquip.name.trim(),
      model: newEquip.model.trim() || null,
      description: newEquip.description.trim() || null,
      equipmentType: newEquip.equipmentType,
      testTypes: newEquip.testType ? [newEquip.testType] : [],
      ...(admin ? { institutionId: Number(adminInstitution) } : {}),
    }, signal);
    setNewEquip({ ...newEquip, name: "", testType: "", description: "", model: "" });
    setAdding(false);
  }, "장비를 등록했습니다.");
  const handleDelete = (item: OwnedEquipment) => {
    if (window.confirm(`'${item.name}'을(를) 비활성화할까요? 기존 의뢰 이력은 유지됩니다.`))
      action.run(() => catalogService.deleteEquipment(item.id), "장비를 비활성화했습니다.");
  };

  return (
    <div className="content-page page-enter">
      <PageHeader title={admin ? "장비 데이터 관리" : "우리 장비"} description={list.data ? `${list.data.totalElements}대${needsUpdate ? `, 갱신 필요 ${needsUpdate}대` : ""}` : undefined}>
        {admin && <select aria-label="조직 선택" value={adminInstitution} onChange={(e) => setAdminInstitution(e.target.value)}>
          <option value="">조직 선택</option>
          {institutions.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>}
        <Button icon={Plus} disabled={admin && !adminInstitution} onClick={() => setAdding((value) => !value)}>장비 등록</Button>
      </PageHeader>

      <Panel>
      {adding && <section className="form-group">
        <header><h3>새 장비 등록</h3><Button variant="ghost" className="button--sm" onClick={() => setAdding(false)}>닫기</Button></header>
        <form onSubmit={(e) => { e.preventDefault(); handleAdd(); }}>
          <div className="grid-4" style={{ marginBottom: 0 }}>
            <div className="form-field"><label htmlFor="new-equipment-name">장비명 <b>*</b></label>
              <input id="new-equipment-name" value={newEquip.name} placeholder="예: 진동시험기" onChange={(e) => setNewEquip({ ...newEquip, name: e.target.value })} /></div>
            <div className="form-field"><label htmlFor="new-equipment-type">장비 유형 <b>*</b></label>
              <select id="new-equipment-type" value={newEquip.equipmentType} onChange={(e) => setNewEquip({ ...newEquip, equipmentType: e.target.value })}>
                {Object.entries(equipmentTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select></div>
            <div className="form-field"><label htmlFor="new-equipment-test">시험유형 {["TEST", "MEASUREMENT"].includes(newEquip.equipmentType) ? <b>*</b> : <span className="small-note">(선택)</span>}</label>
              <select id="new-equipment-test" value={newEquip.testType} onChange={(e) => setNewEquip({ ...newEquip, testType: e.target.value })}>
                <option value="">선택</option>
                {types.data?.map((t) => <option key={t.code} value={t.code}>{t.nameKo}</option>)}
              </select></div>
            <div className="form-field"><label htmlFor="new-equipment-model" className="label-optional">모델 <span>(선택)</span></label>
              <input id="new-equipment-model" value={newEquip.model} onChange={(e) => setNewEquip({ ...newEquip, model: e.target.value })} /></div>
            <div className="form-field form-field--full" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="new-equipment-description" className="label-optional">활용 설명 <span>(선택)</span></label>
              <input id="new-equipment-description" value={newEquip.description} onChange={(e) => setNewEquip({ ...newEquip, description: e.target.value })} /></div>
          </div>
          <div className="form-actions">
            <span className="small-note">사양·이용료·가용 상태는 등록 뒤 [수정]에서 입력합니다.</span>
            <Button type="submit" disabled={action.busy || !newEquip.name.trim() ||
              (["TEST", "MEASUREMENT"].includes(newEquip.equipmentType) && !newEquip.testType)}>등록</Button>
          </div>
        </form>
      </section>}
      <Feedback action={action} />
        {admin && !adminInstitution ? <p className="inline-empty">관리할 조직을 위에서 선택해주세요.</p> :
          list.loading || list.error ? <ApiState loading={list.loading} error={list.error} onRetry={list.reload} /> :
          rows.length === 0 ? <p className="inline-empty">등록된 장비가 없습니다.
            <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)}>장비 등록</Button></p> :
          <Table<OwnedEquipment & Record<string, unknown>>
            data={rows as (OwnedEquipment & Record<string, unknown>)[]}
            idKey="id"
            density="compact"
            hasHover
            columns={[
              { key: "name", header: "장비", width: proportional(2, { minWidth: 200 }), renderCell: (item) => <VStack gap={0.5}>
                <Link onClick={() => setEditing(item.id)} weight="semibold" color="primary">{item.name}</Link>
                <Text type="supporting" color="secondary">{[item.model, item.externalId, equipmentTypeLabels[item.equipmentType ?? ""]].filter(Boolean).join(", ")}</Text>
              </VStack> },
              { key: "testTypes", header: "시험유형", width: proportional(1.2), renderCell: (item) => <HStack gap={1} wrap="wrap">
                {item.testTypes.length ? item.testTypes.map((code) => <AxBadge key={code} variant="neutral" label={testTypeLabel(code)} />) : <Text color="secondary">없음</Text>}
              </HStack> },
              { key: "availability", header: "가용 상태", width: pixel(130), renderCell: (item) => <Text>{availabilityLabels[item.availability ?? "UNKNOWN"]}</Text> },
              { key: "update", header: "정보 갱신", width: proportional(1.3), renderCell: (item) => <VStack gap={0.5}>
                <HStack gap={1}><AxBadge variant={item.needsUpdate ? "warning" : "success"} label={item.needsUpdate ? "갱신 필요" : "최신"} />
                  {item.isMock && <AxBadge variant="neutral" label="시연" />}</HStack>
                <Text type="supporting" color="secondary">{[...(item.updateReasons ?? []).map((reason) => updateReasonLabels[reason] ?? reason),
                  item.daysSinceUpdate != null ? `${item.daysSinceUpdate}일 전 갱신` : null].filter(Boolean).join(", ")}</Text>
              </VStack> },
              { key: "actions", header: <span className="sr-only">동작</span>, width: pixel(230), align: "end", renderCell: (item) => <HStack gap={1} hAlign="end">
                <Button variant="secondary" className="button--sm" icon={Pencil} disabled={action.busy} onClick={() => setEditing(item.id)}>수정</Button>
                <Button variant="ghost" className="button--sm" icon={CalendarClock} onClick={() => setDowntime(item)}>정비 일정</Button>
                <Button variant="ghost" className="button--sm" icon={Trash2} aria-label={`${item.name} 비활성화`} disabled={action.busy}
                  onClick={() => handleDelete(item)} />
              </HStack> },
            ]}
          />}
      </Panel>
      {editing && <EquipmentEditDialog key={editing} equipmentId={editing} onClose={() => setEditing(null)} />}
      {downtime && <DowntimeDialog key={downtime.id} equipment={downtime} onClose={() => setDowntime(null)} />}
    </div>
  );
}
