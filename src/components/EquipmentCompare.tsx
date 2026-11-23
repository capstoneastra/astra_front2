import { useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { Badge, Button, PageHeader, Panel } from "./ui/index";
import { useApiQuery } from "../hooks/useApiQuery";
import { catalogService } from "../services/catalogService";
import ApiState from "./ui/ApiState";
import { DemoNotice } from "./workflow/Feedback";
import { availabilityLabels, valueText } from "../domain/constants";

const usageLabels = { feeText: "이용료", durationText: "기간", availability: "가용 상태", infoUpdatedAt: "갱신일" };

// 장비 찾기·추천 목록에서 체크한 2~5대를 비교한다. 여기서 바로 "이 장비로 의뢰"로 넘어간다.
export default function EquipmentCompare({ setActiveMenu }: { setActiveMenu: (menu: string) => void }) {
  const { comparisonIds, setComparisonIds, resolveEquipment, setSelectedEquipment, setDraftRequestId, user } = useWorkspace();
  const [choosing, setChoosing] = useState<number | null>(null);
  const [error, setError] = useState(null);
  const comparison = useApiQuery(
    (signal) => catalogService.compare(comparisonIds, undefined, signal),
    `compare:${comparisonIds.join(",")}`,
    comparisonIds.length >= 2,
  );
  const data = comparison.data;
  const choose = async (id: number) => {
    setChoosing(id);
    setError(null);
    try {
      const detail = await resolveEquipment(id);
      setDraftRequestId(null);
      setSelectedEquipment(detail ?? null);
      setActiveMenu("request");
    } catch (failure) {
      setError(failure);
    } finally {
      setChoosing(null);
    }
  };
  return (
    <div className="content-page page-enter">
      <PageHeader title="장비 비교" description={`${comparisonIds.length}/5대 선택`}>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => setActiveMenu("search")}>장비 찾기</Button>
      </PageHeader>
      <DemoNotice>REAL 사양을 우선 비교하며, 없는 값은 확인 필요로 표시합니다.</DemoNotice>
      {comparisonIds.length < 2 ? (
        <Panel><p className="inline-empty">장비 찾기 목록에서 2~5대를 체크하면 비교할 수 있습니다.
          <Button variant="secondary" onClick={() => setActiveMenu("search")}>장비 찾기</Button></p></Panel>
      ) : comparison.loading || comparison.error ? (
        <Panel><ApiState loading={comparison.loading} error={comparison.error} onRetry={comparison.reload} /></Panel>
      ) : data && (
        <Panel title="사양·이용조건" action={data.usedMockData && <Badge tone="amber">DEMO 포함</Badge>}>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>항목</th>
                  {data.equipment.map((e) => (
                    <th key={e.id}>
                      <span className="tw:flex tw:items-center tw:gap-1">{e.name}
                        <button type="button" className="icon-button" aria-label={`${e.name} 비교에서 빼기`}
                          onClick={() => setComparisonIds(comparisonIds.filter((id) => id !== e.id))}><X size={13} /></button>
                      </span>
                      <small>{e.institution.name}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    {row.values.map((cell, i) => (
                      <td key={data.equipment[i]?.id ?? i}>
                        {valueText(cell)}
                        {cell?.sourceType === "MOCK" && <small>시연 값, 미검증</small>}
                      </td>
                    ))}
                  </tr>
                ))}
                {Object.entries(usageLabels).map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    {data.usage.map((item) => {
                      const value = item[key];
                      return <td key={item.equipmentId}>
                        {!value || value === "UNKNOWN" ? "확인 필요" : key === "availability" ? availabilityLabels[value] ?? value :
                          key === "infoUpdatedAt" ? String(value).slice(0, 10) : value}
                      </td>;
                    })}
                  </tr>
                ))}
                <tr>
                  <td />
                  {data.equipment.map((e) => (
                    <td key={e.id}>
                      <Button className="button--sm" icon={ArrowRight} disabled={choosing !== null || e.institution.id === user.organization?.id}
                        onClick={() => choose(e.id)}>{choosing === e.id ? "확인 중…" : "이 장비로 의뢰"}</Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {error && <ApiState error={error} />}
        </Panel>
      )}
    </div>
  );
}
