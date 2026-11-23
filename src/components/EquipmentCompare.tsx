import { useState } from "react";
import { useWorkspace } from "../context/AppContext";
import { Badge, Button, FormField, PageHeader, Panel } from "./ui/index";
import { useApiQuery } from "../hooks/useApiQuery";
import { catalogService } from "../services/catalogService";
import ApiState from "./ui/ApiState";
import { DemoNotice } from "./workflow/Feedback";
import { valueText } from "../domain/constants";
export default function EquipmentCompare(_props: { setActiveMenu?: (menu: string) => void }) {
  const { equipmentList, comparisonIds, setComparisonIds, catalogQuery } =
      useWorkspace(),
    [candidate, setCandidate] = useState("");
  const comparison = useApiQuery(
    (signal) => catalogService.compare(comparisonIds, undefined, signal),
    `compare:${comparisonIds.join(",")}`,
    comparisonIds.length >= 2,
  );
  return (
    <div className="content-page page-enter">
      <PageHeader
        title="장비 비교"
      />
      <DemoNotice>
        REAL 사양을 우선 비교하며, 없는 사양과 이용료는 확인 필요로 표시합니다.
      </DemoNotice>
      <Panel className="form-panel">
        <div className="form-grid">
          <FormField id="compare-equipment" label="비교할 장비">
            <select
              id="compare-equipment"
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
            >
              <option value="">장비 선택</option>
              {equipmentList.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.externalId} · {e.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="form-actions">
            <Button
              disabled={
                !candidate ||
                comparisonIds.length >= 5 ||
                comparisonIds.includes(Number(candidate))
              }
              onClick={() =>
                setComparisonIds([...comparisonIds, Number(candidate)])
              }
            >
              비교 장비 추가
            </Button>
          </div>
        </div>
        <div className="form-actions">
          {comparisonIds.map((id) => (
            <Button
              key={id}
              variant="secondary"
              style={{ whiteSpace: "normal" }}
              onClick={() =>
                setComparisonIds(comparisonIds.filter((value) => value !== id))
              }
            >
              {equipmentList.find((e) => e.id === id)?.name ?? id} · 제외
            </Button>
          ))}
        </div>
        {(catalogQuery.loading || catalogQuery.error) && (
          <ApiState
            loading={catalogQuery.loading}
            error={catalogQuery.error}
            onRetry={catalogQuery.reload}
          />
        )}
        <p className="field-hint">{comparisonIds.length}/5대 선택</p>
      </Panel>
      {(comparison.loading || comparison.error) && (
        <Panel>
          <ApiState
            loading={comparison.loading}
            error={comparison.error}
            onRetry={comparison.reload}
          />
        </Panel>
      )}
      {comparison.data ? (
        <Panel
          className="form-panel"
          title="사양·이용조건 비교표"
          action={
            comparison.data.usedMockData && (
              <Badge tone="amber">DEMO 포함</Badge>
            )
          }
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>항목</th>
                  {comparison.data.equipment.map((e) => (
                    <th key={e.id}>
                      {e.name}
                      <small>{e.institution.name}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.data.rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    {row.values.map((cell, i) => (
                      <td key={comparisonIds[i]}>
                        {valueText(cell)}
                        {cell?.sourceType === "MOCK" && (
                          <small>DEMO · 미검증</small>
                        )}
                        {cell?.sourceType === "REAL" && (
                          <small>REAL · 기관 등록 정보</small>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {[
                  "feeText",
                  "durationText",
                  "availability",
                  "infoUpdatedAt",
                ].map((key) => (
                  <tr key={key}>
                    <td>
                      {
                        {
                          feeText: "이용료",
                          durationText: "기간",
                          availability: "가용 상태",
                          infoUpdatedAt: "갱신일",
                        }[key]
                      }
                    </td>
                    {comparison.data.usage.map((item) => (
                      <td key={item.equipmentId}>
                        {item[key] && item[key] !== "UNKNOWN"
                          ? item[key]
                          : "확인 필요"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint">
            최종 시험 가능 여부·비용·일정은 보유기관에 확인해야 합니다.
          </p>
        </Panel>
      ) : (
        !comparison.loading &&
        !comparison.error && (
          <Panel className="form-panel">
            <p>장비를 2대 이상 선택하면 비교표를 확인할 수 있습니다.</p>
          </Panel>
        )
      )}
    </div>
  );
}
