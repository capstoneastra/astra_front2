import { useState } from "react";
import { CalendarDays, Send } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { Badge, Button, PageHeader, Panel } from "./ui";
import { useApiQuery } from "../hooks/useApiQuery";
import { requestService } from "../services/requestService";
import RequestDetailDialog from "./workflow/RequestDetailDialog";
import ApiState from "./ui/ApiState";
import { requestStatusLabels } from "../domain/constants";
import { seoulDate } from "../domain/calendar";
import type { RequestBox, RequestSummary } from "../services/contracts";

// 상태 필터는 자주 쓰는 묶음 + 개별 상태
const quickFilters: { id: string; label: string; statuses: string[] }[] = [
  { id: "", label: "전체", statuses: [] },
  { id: "ACTIVE", label: "진행 중", statuses: ["SUBMITTED", "UNDER_REVIEW", "SUPPLEMENT_REQUESTED", "RESUBMITTED", "SCHEDULING", "CONFIRMED"] },
  { id: "REVIEW_QUEUE", label: "검토 대기", statuses: ["SUBMITTED", "RESUBMITTED"] },
  { id: "MY_TURN", label: "내가 답할 차례", statuses: ["SUPPLEMENT_REQUESTED", "SCHEDULING"] },
  { id: "DRAFT", label: "작성 중", statuses: ["DRAFT"] },
  { id: "COMPLETED", label: "완료", statuses: ["COMPLETED"] },
];

const tone = (status: string) =>
  status === "SUPPLEMENT_REQUESTED" ? "amber" : status === "COMPLETED" ? "green" : ["REJECTED", "CANCELED"].includes(status) ? "red" :
    status === "DRAFT" ? "neutral" : "cyan";

// 목록 응답은 revision 없이 desiredStartDate·desiredEndDate를 위로 올려 준다.
type Row = RequestSummary & { companyName?: string; requester?: { name: string }; desiredStartDate?: string | null; desiredEndDate?: string | null };

export default function ReservationCheck({
  setActiveMenu,
  openCalendar,
  initialStatus = "",
  initialRequestId = undefined,
  institutionView = false,
}: {
  setActiveMenu: (menu: string) => void;
  openCalendar: (box?: RequestBox) => void;
  initialStatus?: string;
  initialRequestId?: number;
  institutionView?: boolean;
}) {
  const { user, setDraftRequestId, setSelectedEquipment } = useWorkspace();
  const [selected, setSelected] = useState<number | null>(initialRequestId ?? null);
  const [status, setStatus] = useState(initialStatus);
  const admin = user.role === "ADMIN";
  const received = institutionView;
  // 관리자는 받은 의뢰 화면에서 전체 의뢰를 본다.
  const box: RequestBox | undefined = admin && received ? undefined : received ? "RECEIVED" : "SENT";
  const filters = quickFilters.filter((item) => received ? !["DRAFT", "MY_TURN"].includes(item.id) : item.id !== "REVIEW_QUEUE");
  const group = quickFilters.find((item) => item.id === status);
  const query = useApiQuery(
    async (signal) => {
      const statuses = group?.statuses.length ? group.statuses : status ? [status] : [];
      if (statuses.length <= 1)
        return (await requestService.list({ ...(box && { box }), ...(statuses[0] && { status: statuses[0] }) }, signal)).content;
      const pages = await Promise.all(statuses.map((stage) => requestService.list({ ...(box && { box }), status: stage }, signal)));
      return pages.flatMap((page) => page.content).sort((a, b) => b.id - a.id);
    },
    `requests:${user.id}:${box ?? "ALL"}:${status}`,
  );
  const rows: Row[] = query.data ?? [];
  const continueDraft = (id: number) => {
    setSelectedEquipment(null);
    setDraftRequestId(id);
    setActiveMenu("request");
  };

  return (
    <div className="content-page page-enter">
      <PageHeader title={admin ? "전체 의뢰" : received ? "받은 의뢰" : "내 의뢰"} description={query.loading ? undefined : `${rows.length}건`}>
        <Button variant="secondary" icon={CalendarDays} onClick={() => openCalendar(box)}>일정 보기</Button>
        {!received && <Button icon={Send} onClick={() => { setDraftRequestId(null); setSelectedEquipment(null); setActiveMenu("request"); }}>시험 맡기기</Button>}
      </PageHeader>
      <Panel className="search-results">
      <div className="search-summary list-toolbar">
        <div className="segmented" role="group" aria-label="진행 상태">
          {filters.map((item) => <button key={item.id} type="button" aria-pressed={status === item.id} onClick={() => setStatus(item.id)}>{item.label}</button>)}
        </div>
        <span className="finder__bar-end">
          <label className="sr-only" htmlFor="requests-status">개별 상태</label>
          <select id="requests-status" value={group ? "" : status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">상태별 보기</option>
            {Object.entries(requestStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </span>
      </div>
        {query.loading || query.error ? <ApiState loading={query.loading} error={query.error} onRetry={query.reload} /> :
          rows.length === 0 ? <p className="inline-empty">{received ? "받은 의뢰가 없습니다." : "의뢰가 없습니다."}
            {!received && <Button variant="secondary" onClick={() => setActiveMenu("request")}>시험 맡기기</Button>}</p> :
          <div className="table-scroll"><table className="data-table">
            <thead><tr>
              <th>의뢰</th><th>장비</th><th>{admin ? "맡긴 곳 → 맡은 곳" : received ? "맡긴 곳" : "맡은 곳"}</th><th>상태</th><th>희망 기간</th><th>접수일</th><th><span className="sr-only">동작</span></th>
            </tr></thead>
            <tbody>{rows.map((item) => {
              const schedule = { desiredStartDate: item.desiredStartDate ?? item.revision?.content?.schedule?.desiredStartDate,
                desiredEndDate: item.desiredEndDate ?? item.revision?.content?.schedule?.desiredEndDate };
              return <tr key={item.id}>
                <td><button type="button" className="row-title" onClick={() => setSelected(item.id)}>{item.title || item.requestNo}</button>
                  <small>{item.requestNo}</small></td>
                <td>{item.equipment?.name ?? "—"}<small>{item.equipment?.externalId}</small></td>
                <td>{admin ? `${item.companyName ?? item.requester?.name ?? "—"} → ${item.institution?.name ?? "—"}`
                  : received ? item.companyName ?? item.requester?.name ?? "—" : item.institution?.name ?? "—"}</td>
                <td><Badge tone={tone(item.status)} dot>{requestStatusLabels[item.status] ?? item.status}</Badge></td>
                <td>{schedule?.desiredStartDate ? `${schedule.desiredStartDate}${schedule.desiredEndDate ? ` ~ ${schedule.desiredEndDate.slice(5)}` : ""}` : "—"}</td>
                <td>{item.submittedAt ? seoulDate(item.submittedAt) : "—"}</td>
                <td className="cell-actions">
                  {!received && item.status === "DRAFT" && <Button variant="secondary" className="button--sm" onClick={() => continueDraft(item.id)}>이어서 작성</Button>}
                  <Button variant="ghost" className="button--sm" onClick={() => setSelected(item.id)}>상세</Button>
                </td>
              </tr>;
            })}</tbody>
          </table></div>}
      </Panel>
      {selected && (
        <RequestDetailDialog key={selected} requestId={selected} requestBox={box} onClose={() => setSelected(null)}
          onOpenSchedule={() => openCalendar(box)} onContinueDraft={(request) => continueDraft(request.id)} />
      )}
    </div>
  );
}
