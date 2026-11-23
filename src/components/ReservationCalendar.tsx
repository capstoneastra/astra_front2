import { useEffect, useState } from "react";
import { CalendarDays, CheckCheck, Clock3, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useAuth } from "../auth/context";
import { useApiQuery } from "../hooks/useApiQuery";
import { loadCalendar } from "../services/calendarService";
import { requestService } from "../services/requestService";
import { catalogService } from "../services/catalogService";
import { inMonth, monthOf, onDay, reservationStatuses, seoulDate } from "../domain/calendar";
import type { RequestBox, RequestSummary } from "../services/contracts";
import { Badge, Button, EmptyState, PageHeader, Panel } from "./ui/index";
import ApiState from "./ui/ApiState";
import Calendar from "./calendar/Calendar";
import ScheduleCard from "./calendar/ScheduleCard";
import ScheduleDetail from "./calendar/ScheduleDetail";
import RequestDetailDialog from "./workflow/RequestDetailDialog";
import "../styles/calendar.css";

function uniqueOptions(items: RequestSummary[], key: "equipment" | "institution") {
  const options = new Map<string, string>();
  for (const item of items) {
    const resource = item[key];
    if (resource?.id != null) options.set(String(resource.id), resource.name);
  }
  return [...options];
}
export default function ReservationCalendar({ requestBox, onBoxChange, ownsEquipment }: {
  requestBox?: RequestBox;
  onBoxChange: (box: RequestBox) => void;
  ownsEquipment: boolean;
}) {
  const { user } = useAuth();
  const box = user.role === "ADMIN" ? undefined : !ownsEquipment ? "SENT" : requestBox ?? (user.role === "INSTITUTION_MANAGER" ? "RECEIVED" : "SENT");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const today = seoulDate(now);
  const [month, setMonth] = useState(monthOf(today));
  const [selection, setSelection] = useState(null);
  const [requestDetail, setRequestDetail] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ test: "", equipment: "", status: "", institution: "" });
  const query = useApiQuery((signal) => loadCalendar(signal, box), `calendar:${user.id}:${box ?? "ALL"}`);
  const types = useApiQuery((signal) => catalogService.testTypes(signal), "calendar-test-types");
  const busy = useApiQuery((signal) => requestService.availability(filters.equipment, {}, signal),
    `calendar-busy:${user.id}:${filters.equipment}`, Boolean(filters.equipment));
  const names = new Map((types.data ?? []).map((type) => [type.code, type.nameKo]));
  const testName = (code) => names.get(code) ?? (code === "UNKNOWN" || !code ? "시험 유형 확인 필요" : code);
  const all = query.data?.schedules ?? [];
  const anonymousBusy = (busy.data ?? []).filter((interval) => !all.some((event) =>
    event.status === "CONFIRMED" && String(event.equipment?.id) === filters.equipment &&
    Date.parse(event.startAt) === Date.parse(interval.startAt) && Date.parse(event.endAt) === Date.parse(interval.endAt)));
  const filtered = all.filter((event) => (!filters.test || event.testType === filters.test) &&
    (!filters.equipment || String(event.equipment?.id) === filters.equipment) && (!filters.status || event.status === filters.status) &&
    (!filters.institution || String(event.institution?.id) === filters.institution));
  const monthly = filtered.filter((event) => inMonth(event, month));
  const confirmed = monthly.filter((event) => event.status === "CONFIRMED").length;
  const pending = monthly.filter((event) => ["PROPOSED", "COUNTER_PROPOSED"].includes(event.status)).length;
  const upcoming = filtered.filter((event) => event.status !== "CANCELED" && Date.parse(event.endAt) > now).slice(0, 4);
  const eligible = (query.data?.requests ?? []).filter((r) => r.status === "SCHEDULING" &&
    (!filters.equipment || String(r.equipment?.id) === filters.equipment) &&
    (!filters.institution || String(r.institution?.id) === filters.institution) &&
    (!filters.test || r.revision?.content?.test?.testTypeCode === filters.test));
  const updateFilter = (name, value) => { setFilters((previous) => ({ ...previous, [name]: value })); setSelection(null); };
  const chooseDate = (date: string, id?: number) => { setSelection({ date, id }); setMonth(monthOf(date)); };
  const openRequest = (id, date) => { setSelection(null); setRequestDetail({ id, date }); };
  const scope = !box ? "전체 시험 예약" : box === "RECEIVED" ? "소속 조직에 접수된 시험 예약" : "내가 신청한 시험 예약";
  const changeBox = (next: RequestBox) => {
    if (box === next) return;
    setFilters({ test: "", equipment: "", status: "", institution: "" });
    setSelection(null);
    setRequestDetail(null);
    onBoxChange(next);
  };
  return <div className="content-page page-enter reservation-calendar">
    <PageHeader eyebrow="ASTRA SCHEDULE CONTROL" title="시험 예약 캘린더" description={`${scope}을 한눈에 확인하고 일정을 협의하세요.`}>
      <Badge tone="cyan"><CalendarDays size={14} /> 월간 일정</Badge>
      <Button className="schedule-filter-toggle" variant="secondary" icon={SlidersHorizontal} aria-controls="schedule-filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>필터</Button>
      <Button variant="secondary" icon={RefreshCw} disabled={query.loading || query.refreshing} onClick={query.reload}>새로고침</Button>
    </PageHeader>
    {box && ownsEquipment && <div className="workspace-context-actions" role="group" aria-label="예약 조회 범위">
      <Button variant={box === "SENT" ? "primary" : "secondary"} aria-pressed={box === "SENT"} onClick={() => changeBox("SENT")}>보낸 의뢰의 예약</Button>
      <Button variant={box === "RECEIVED" ? "primary" : "secondary"} aria-pressed={box === "RECEIVED"} onClick={() => changeBox("RECEIVED")}>받은 의뢰의 예약</Button>
    </div>}
    <div className="schedule-source"><Badge tone="cyan">{query.data ? "예약 정보" : "조회 대기"}</Badge><span>{query.data ? "서버 응답 기준의 시험 예약입니다." : "시험 예약 정보를 서버에서 조회합니다."} 제안 일정은 기관 확정 전까지 미확정입니다.</span></div>
    <div className="schedule-metrics" aria-label="선택한 달 예약 요약">
      {[{ icon: CalendarDays, label: "선택한 달 시험 예약", value: monthly.length, hint: "필터 적용 · 여러 날 시험은 1건", tone: "blue" },
        { icon: CheckCheck, label: "예약 확정", value: confirmed, hint: "기관 확인이 완료된 일정", tone: "cyan" },
        { icon: Clock3, label: "일정 협의 중", value: pending, hint: "예약 제안 및 대안 일정", tone: "amber" }].map(({ icon: Icon, ...item }) =>
        <section className={`panel schedule-metric schedule-metric--${item.tone}`} key={item.label}><span className="schedule-metric__icon"><Icon size={21} /></span><div><span>{item.label}</span><strong>{query.loading || query.error ? "—" : item.value}<small>건</small></strong><p>{item.hint}</p></div></section>)}
    </div>
    <Panel id="schedule-filters" className={`schedule-filters${filtersOpen ? " schedule-filters--open" : ""}`}>
      <div><label htmlFor="calendar-test">시험 종류</label><select id="calendar-test" value={filters.test} onChange={(e) => updateFilter("test", e.target.value)}><option value="">전체 시험</option>{[...new Set(all.map((e) => e.testType))].map((code) => <option key={code} value={code}>{testName(code)}</option>)}</select></div>
      <div><label htmlFor="calendar-equipment">시험장비</label><select id="calendar-equipment" value={filters.equipment} onChange={(e) => updateFilter("equipment", e.target.value)}><option value="">전체 장비</option>{uniqueOptions(query.data?.requests ?? [], "equipment").map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
      <div><label htmlFor="calendar-status">예약 상태</label><select id="calendar-status" value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}><option value="">전체 상태</option>{Object.entries(reservationStatuses).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></div>
      {user.role === "ADMIN" && <div><label htmlFor="calendar-institution">시험기관</label><select id="calendar-institution" value={filters.institution} onChange={(e) => updateFilter("institution", e.target.value)}><option value="">전체 기관</option>{uniqueOptions(query.data?.requests ?? [], "institution").map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>}
      <Button variant="ghost" onClick={() => { setFilters({ test: "", equipment: "", status: "", institution: "" }); setSelection(null); }}>필터 초기화</Button>
    </Panel>
    {types.error && <p className="field-hint" role="status">시험 종류 이름을 불러오지 못해 코드로 표시합니다. <button type="button" className="text-link" onClick={types.reload}>다시 조회</button></p>}
    {filters.equipment && <div className="schedule-busy-note">{busy.error ? <ApiState error={busy.error} onRetry={busy.reload} /> : <span role="status">{busy.loading || busy.refreshing ? "선택 장비의 확정 점유 구간 조회 중…" : "선택 장비의 확정 점유 구간을 함께 표시합니다. 다른 기업의 의뢰 정보는 공개하지 않으며 월별 예약 건수에 포함하지 않습니다."}</span>}</div>}
    {query.loading || query.error ? (
      <Panel><ApiState loading={query.loading} error={query.error} onRetry={query.reload} /></Panel>
    ) : <>
      <div className="schedule-legend" aria-label="예약 상태 범례">{Object.entries(reservationStatuses).map(([key, item]) => <span key={key} className={`schedule-status schedule-status--${item.tone}`}>{item.label}</span>)}<span className="schedule-legend__note" role="status">{query.refreshing ? "최신 예약 상태 확인 중…" : "조회한 의뢰 기준 · 한국 표준시"}</span></div>
      <div className="schedule-workspace">
        <div className="schedule-workspace__main"><Calendar month={month} today={today} selected={selection?.date ?? today} events={filtered} busy={anonymousBusy} testName={testName} onMonth={setMonth} onToday={() => { setMonth(monthOf(today)); setSelection(null); }} onDaySelect={(date) => chooseDate(date)} onEventSelect={(event, date) => chooseDate(date, event.id)} />
          {monthly.length === 0 && <div className="schedule-month-empty"><CalendarDays size={18} /><span>선택한 달과 필터에 해당하는 일정이 없습니다. 날짜를 선택하면 일정 협의가 가능한 의뢰를 확인할 수 있습니다.</span></div>}
        </div>
        <aside className="panel schedule-upcoming"><header><span className="eyebrow">UP NEXT</span><h2>다가오는 시험</h2><p>진행 중인 일정부터 다음 예약까지</p></header>
          <div className="schedule-upcoming__list">{upcoming.length ? upcoming.map((event) => <ScheduleCard key={event.id} event={event} date={seoulDate(event.startAt) < today ? today : undefined} testName={testName(event.testType)} onSelect={(item, date) => chooseDate(date, item.id)} />) : <EmptyState icon={Clock3} title="예정된 시험이 없습니다" description="예약 제안과 확정 일정이 여기에 표시됩니다." />}</div>
          <div className="schedule-upcoming__note"><strong>일정 협의 가능 {eligible.length}건</strong><p>검토가 완료된 의뢰는 날짜 선택 후 일정을 제안할 수 있습니다.</p></div>
        </aside>
      </div>
    </>}
    {selection && !query.error && !query.loading && <ScheduleDetail key={`${selection.date}:${selection.id ?? "day"}`} date={selection.date} events={filtered.filter((event) => onDay(event, selection.date))} busy={anonymousBusy.filter((interval) => onDay(interval, selection.date))} initialId={selection.id} eligibleRequests={eligible} testName={testName} requestBox={box} onClose={() => setSelection(null)} onRequest={openRequest} />}
    {requestDetail && <RequestDetailDialog requestId={requestDetail.id} initialReservationDate={requestDetail.date} requestBox={box} onClose={() => setRequestDetail(null)} />}
  </div>;
}
