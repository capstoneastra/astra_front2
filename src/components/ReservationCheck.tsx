import { useState } from "react";
import { CalendarDays, ChevronRight, Send } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { Button, PageHeader, Panel } from "./ui";
import { Table, proportional, pixel } from "@astryxdesign/core/Table";
import { Badge as AxBadge } from "@astryxdesign/core/Badge";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useApiQuery } from "../hooks/useApiQuery";
import { requestService } from "../services/requestService";
import { testTypeLabel } from "../services/equipmentService";
import RequestDetailDialog from "./workflow/RequestDetailDialog";
import ApiState from "./ui/ApiState";
import { requestStatusLabels } from "../domain/constants";
import { groupedStages } from "../domain/requestStages";
import type { RequestBox, RequestSummary } from "../services/contracts";
import { formatDay } from "../domain/format";

// 상태 필터는 자주 쓰는 묶음 + 개별 상태
const quickFilters: { id: string; label: string; statuses: string[] }[] = [
  { id: "", label: "전체", statuses: [] },
  { id: "ACTIVE", label: "진행 중", statuses: ["SUBMITTED", "UNDER_REVIEW", "SUPPLEMENT_REQUESTED", "RESUBMITTED", "SCHEDULING", "CONFIRMED"] },
  { id: "REVIEW_QUEUE", label: "검토 대기", statuses: ["SUBMITTED", "RESUBMITTED"] },
  { id: "MY_TURN", label: "내가 답할 차례", statuses: ["SUPPLEMENT_REQUESTED", "SCHEDULING"] },
  { id: "DRAFT", label: "작성 중", statuses: ["DRAFT"] },
  { id: "COMPLETED", label: "시험 완료", statuses: ["COMPLETED"] },
];

/** 상태 배지 색: 내가 할 일(보완 요청)은 경고색, 완료는 성공색, 반려·취소는 오류색, 나머지는 차분하게 */
const statusVariant = (status: string): "warning" | "success" | "error" | "neutral" =>
  status === "SUPPLEMENT_REQUESTED" ? "warning" : status === "COMPLETED" ? "success" : ["REJECTED", "CANCELED"].includes(status) ? "error" :
    "neutral";

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
  // 빠른 필터에 없는 단계 묶음(접수·검토, 반려·취소)은 아래 선택 상자에 묶음으로 나온다
  const quick = filters.find((item) => item.id === status); // 이 화면에 보이는 칩만
  const group = quick ?? groupedStages.find((item) => item.id === status);
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
  const hasDraftAction = !received && rows.some((row) => row.status === "DRAFT");
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
          <select id="requests-status" value={quick ? "" : status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">상태별 보기</option>
            <optgroup label="단계 묶음">
              {groupedStages.map((stage) => <option key={stage.id} value={stage.id}>
                {stage.label} ({stage.statuses.map((key) => requestStatusLabels[key as keyof typeof requestStatusLabels]).join(", ")})</option>)}
            </optgroup>
            <optgroup label="개별 상태">
              {Object.entries(requestStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </optgroup>
          </select>
        </span>
      </div>
        {query.loading || query.error ? <ApiState loading={query.loading} error={query.error} onRetry={query.reload} /> :
          rows.length === 0 ? <p className="inline-empty">{received ? "받은 의뢰가 없습니다." : "의뢰가 없습니다."}
            {!received && <Button variant="secondary" onClick={() => setActiveMenu("request")}>시험 맡기기</Button>}</p> :
          <Table<Row & Record<string, unknown>>
            data={rows as (Row & Record<string, unknown>)[]}
            idKey="id"
            density="compact"
            hasHover
            columns={[
              { key: "title", header: "의뢰", width: proportional(2, { minWidth: 200 }), renderCell: (item) => <span className="cell-2line">
                <span className="cell-2line__main" title={item.title || item.requestNo}>
                  <Link onClick={() => setSelected(item.id)} weight="semibold" color="primary">{item.title || item.requestNo}</Link></span>
                <span className="cell-2line__sub">{item.requestNo}</span>
              </span> },
              { key: "equipment", header: "장비", width: proportional(1.4), renderCell: (item) => {
                const testType = item.revision?.content?.test?.testTypeCode;
                return <span className="cell-2line">
                  <span className="cell-2line__main" title={item.equipment?.name ?? undefined}>{item.equipment?.name ?? "장비 미정"}</span>
                  <span className="cell-2line__sub">{testType ? testTypeLabel(testType) : " "}</span>
                </span>;
              } },
              { key: "party", header: admin ? "맡긴 곳 / 맡은 곳" : received ? "맡긴 곳" : "맡은 곳", width: proportional(1.4), renderCell: (item) => admin
                ? <VStack gap={0.5}><Text>{item.companyName ?? item.requester?.name ?? "정보 없음"}</Text>
                  <Text type="supporting" color="secondary">{item.institution?.name ?? ""}</Text></VStack>
                : <Text>{received ? item.companyName ?? item.requester?.name ?? "정보 없음" : item.institution?.name ?? "정보 없음"}</Text> },
              { key: "status", header: "상태", width: pixel(110), renderCell: (item) =>
                <AxBadge variant={statusVariant(item.status)} label={requestStatusLabels[item.status] ?? item.status} /> },
              { key: "schedule", header: "희망 기간", width: pixel(150), renderCell: (item) => {
                const start = item.desiredStartDate ?? item.revision?.content?.schedule?.desiredStartDate;
                const end = item.desiredEndDate ?? item.revision?.content?.schedule?.desiredEndDate;
                // 두 줄: 시작일 / ~ 종료일 (한 줄에 넣으면 줄바꿈되어 줄 높이가 들쭉날쭉해진다)
                if (!start) return <span className="cell-2line"><span className="cell-2line__main cell-2line__main--muted">미정</span></span>;
                return <span className="cell-2line">
                  <span className="cell-2line__main">{formatDay(start)}</span>
                  <span className="cell-2line__sub">{end && end !== start ? `~ ${formatDay(end)}` : " "}</span>
                </span>;
              } },
              { key: "submittedAt", header: "접수일", width: pixel(104), renderCell: (item) =>
                <Text hasTabularNumbers color={item.submittedAt ? "primary" : "secondary"}>{formatDay(item.submittedAt, "미제출")}</Text> },
              // 한 줄에 버튼 하나: 작성 중이면 '이어서 작성', 아니면 '상세' (작성 중 의뢰의 상세는 제목을 누르면 열린다)
              { key: "actions", header: <span className="sr-only">동작</span>, width: pixel(hasDraftAction ? 112 : 92), align: "end", renderCell: (item) =>
                !received && item.status === "DRAFT"
                  ? <Button className="button--sm" onClick={() => continueDraft(item.id)}>이어서 작성</Button>
                  : <Button variant="secondary" className="button--sm" icon={ChevronRight} onClick={() => setSelected(item.id)}>상세</Button> },
            ]}
          />}
      </Panel>
      {selected && (
        <RequestDetailDialog key={selected} requestId={selected} requestBox={box} onClose={() => setSelected(null)}
          onOpenSchedule={() => openCalendar(box)} onContinueDraft={(request) => continueDraft(request.id)} />
      )}
    </div>
  );
}
