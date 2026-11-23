import { useState } from "react";
import { useWorkspace } from "../context/AppContext";
import { Button, FormField, PageHeader, Panel } from "./ui/index";
import { useApiQuery } from "../hooks/useApiQuery";
import { catalogService } from "../services/catalogService";
import ApiState from "./ui/ApiState";
import { DemoNotice } from "./workflow/Feedback";
export default function DuplicateEquipment({ setActiveMenu, embedded = false }) {
  const { equipmentList, setComparisonIds } = useWorkspace(),
    [region, setRegion] = useState(""),
    [testType, setType] = useState("");
  const types = useApiQuery(
    (signal) => catalogService.testTypes(signal),
    "test-types",
  );
  const query = useApiQuery(
    (signal) =>
      catalogService.duplicates(
        { ...(region ? { region } : {}), ...(testType ? { testType } : {}) },
        signal,
      ),
    `duplicates:${region}:${testType}`,
  );
  return (
    <div className="content-page page-enter">
      {!embedded && <PageHeader title="중복·유사 장비 조회" />}
      <DemoNotice>
        같은 그룹에 속한다는 사실만으로 중복 투자나 대체 가능 장비로 확정하지
        않습니다.
      </DemoNotice>
      <Panel className="form-panel">
        <div className="form-grid">
          <FormField id="duplicate-region" label="지역">
            <select
              id="duplicate-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">전체 지역</option>
              {[
                ...new Set(equipmentList.map((e) => e.region).filter(Boolean)),
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </FormField>
          <FormField id="duplicate-test-type" label="시험유형">
            <select
              id="duplicate-test-type"
              value={testType}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">전체 시험유형</option>
              {types.data?.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.nameKo}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </Panel>
      {(query.loading || query.error) && (
        <ApiState
          loading={query.loading}
          error={query.error}
          onRetry={query.reload}
        />
      )}
      {query.data?.map((group) => (
        <Panel
          className="form-panel"
          key={`${group.region}:${group.testType.code}`}
          title={`${group.region} · ${group.testType.nameKo}`}
          description={`${group.equipmentCount}대 · ${group.institutionCount}개 기관`}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setComparisonIds(group.equipment.slice(0, 5).map((e) => e.id));
                setActiveMenu("compare");
              }}
            >
              그룹 장비 비교 {group.equipmentCount > 5 ? "(앞 5대)" : ""}
            </Button>
          }
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>장비</th>
                  <th>모델</th>
                  <th>보유기관</th>
                  <th>데이터</th>
                </tr>
              </thead>
              <tbody>
                {group.equipment.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.name}
                      <small>{e.externalId}</small>
                    </td>
                    <td>{e.model ?? "확인 필요"}</td>
                    <td>{e.institution.name}</td>
                    <td>{e.isMock ? "DEMO 포함" : "등록 정보"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      {query.data?.length === 0 && (
        <Panel className="form-panel">
          <p>선택한 조건에서 중복 후보 그룹이 없습니다.</p>
        </Panel>
      )}
    </div>
  );
}
