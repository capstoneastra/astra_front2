import { useState } from "react";
import { useWorkspace } from "../context/AppContext";
import { Button, FormField, PageHeader, Panel } from "./ui/index";
import { useApiQuery } from "../hooks/useApiQuery";
import { catalogService } from "../services/catalogService";
import ApiState from "./ui/ApiState";
import { DemoNotice } from "./workflow/Feedback";
export default function TestInformation({ setActiveMenu }) {
  const { testTypeCode, setTestTypeCode } = useWorkspace(),
    [selected, setSelected] = useState(testTypeCode || "VIBRATION");
  const types = useApiQuery(
    (signal) => catalogService.testTypes(signal),
    "test-types",
  );
  const detail = useApiQuery(
    (signal) => catalogService.testType(selected, signal),
    `test-type:${selected}`,
  );
  return (
    <div className="content-page page-enter">
      <PageHeader
        title="시험 정보 안내"
      />
      <DemoNotice />
      <Panel className="form-panel">
        <FormField id="information-test-type" label="시험 종류">
          <select
            id="information-test-type"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setTestTypeCode(e.target.value);
            }}
          >
            {types.data?.map((t) => (
              <option key={t.code} value={t.code}>
                {t.nameKo} · 장비 {t.equipmentCount}대
              </option>
            ))}
          </select>
        </FormField>
      </Panel>
      {(types.loading || types.error || detail.loading || detail.error) && (
        <ApiState
          loading={types.loading || detail.loading}
          error={types.error ?? detail.error}
          onRetry={() => {
            types.reload();
            detail.reload();
          }}
        />
      )}
      {detail.data && (
        <>
          <Panel
            className="form-panel"
            title={`${detail.data.nameKo} · 입력할 시험조건`}
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>조건</th>
                    <th>필수 여부</th>
                    <th>단위</th>
                    <th>비교 규칙</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data.conditionRules.map((rule) => (
                    <tr key={rule.conditionKey}>
                      <td>{rule.label}</td>
                      <td>{rule.isRequired ? "필수" : "선택"}</td>
                      <td>{rule.unit ?? "텍스트"}</td>
                      <td>
                        {rule.comparator === "NONE"
                          ? "기관 확인"
                          : rule.comparator}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <Button onClick={() => setActiveMenu("request")}>
                조건 분석으로 이어가기
              </Button>
            </div>
          </Panel>
          <Panel className="form-panel" title="수행 가능 기관">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>기관</th>
                    <th>지역</th>
                    <th>장비</th>
                    <th>예상 비용</th>
                    <th>소요 기간</th>
                    <th>이용조건</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data.institutions.map((org) => (
                    <tr key={org.id}>
                      <td>{org.name}</td>
                      <td>{org.region ?? "정보 없음"}</td>
                      <td>{org.equipmentCount}대</td>
                      <td>
                        {org.estCostMin != null
                          ? `${org.estCostMin.toLocaleString("ko-KR")}원~`
                          : "정보 없음"}
                      </td>
                      <td>
                        {org.estDurationDays != null
                          ? `${org.estDurationDays}일`
                          : "정보 없음"}
                      </td>
                      <td>
                        {org.accessScope === "EXTERNAL_ALLOWED"
                          ? "외부 이용 가능"
                          : org.accessScope === "INTERNAL_ONLY"
                            ? "기관 내부 전용"
                            : "정보 없음"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!detail.data.institutions.length && (
              <p>현재 등록된 수행기관이 없습니다.</p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
