import { useEffect, useState } from "react";
import { CalendarDays, CheckCheck, Clock3, RefreshCw } from "lucide-react";
import { useAuth } from "../auth/context";
import { useApiQuery } from "../hooks/useApiQuery";
import { loadCalendar } from "../services/calendarService";
import { requestService } from "../services/requestService";
import { catalogService } from "../services/catalogService";
import { inMonth, monthOf, onDay, reservationStatuses, seoulDate } from "../domain/calendar";
import type { RequestBox } from "../services/contracts";
import { Button, EmptyState, PageHeader, Panel } from "./ui/index";
import ApiState from "./ui/ApiState";
import Calendar from "./calendar/Calendar";
import ScheduleCard from "./calendar/ScheduleCard";
import ScheduleDetail from "./calendar/ScheduleDetail";
import RequestDetailDialog from "./workflow/RequestDetailDialog";

export default function ReservationCalendar() {
  const { user } = useAuth();
  // 기업 = 내가 맡긴 의뢰의 일정, 기관·대학 = 받은 의뢰의 일정, 관리자 = 전체
  const box: RequestBox | undefined = user.role === "ADMIN" ? undefined : user.role === "INSTITUTION_MANAGER" ? "RECEIVED" : "SENT";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const today = seoulDate(now);
  const [month, setMonth] = useState(monthOf(today));
  const [selection, setSelection] = useState(null);
  const [requestDetail, setRequestDetail] = useState(null);
  // 회의(11/24): 일정 화면의 필터는 없앰. 모든 일정을 그대로 보여 준다
  const filters = { test: "", equipment: "", status: "", institution: "" };
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
  const chooseDate = (date: string, id?: number) => { setSelection({ date, id }); setMonth(monthOf(date)); };
  const openRequest = (id, date) => { setSelection(null); setRequestDetail({ id, date }); };
  const scope = !box ? "전체 시험 예약" : box === "RECEIVED" ? "소속 조직에 접수된 시험 예약" : "내가 신청한 시험 예약";
  return <div className="content-page page-enter reservation-calendar">
    <PageHeader title="시험 일정" description={scope}>
      <Button variant="secondary" icon={RefreshCw} disabled={query.loading || query.refreshing} onClick={query.reload}>새로고침</Button>
    </PageHeader>

    <div className="schedule-metrics" aria-label="선택한 달 예약 요약">
      {[{ icon: CalendarDays, label: "선택한 달 시험 예약", value: monthly.length, hint: "여러 날 시험은 1건", tone: "blue" },
        { icon: CheckCheck, label: "예약 확정", value: confirmed, hint: "기관 확인이 완료된 일정", tone: "cyan" },
        { icon: Clock3, label: "일정 협의 중", value: pending, hint: "예약 제안 및 대안 일정", tone: "amber" }].map(({ icon: Icon, ...item }) =>
        <section className={`panel schedule-metric schedule-metric--${item.tone}`} key={item.label}><span className="schedule-metric__icon"><Icon size={21} /></span><div><span>{item.label}</span><strong>{query.loading || query.error ? "—" : item.value}<small>건</small></strong><p>{item.hint}</p></div></section>)}
    </div>
    {types.error && <p className="field-hint" role="status">시험 종류 이름을 불러오지 못해 코드로 표시합니다. <button type="button" className="text-link" onClick={types.reload}>다시 조회</button></p>}
    {query.loading || query.error ? (
      <Panel><ApiState loading={query.loading} error={query.error} onRetry={query.reload} /></Panel>
    ) : <>
      <div className="schedule-legend" aria-label="예약 상태 범례">{Object.entries(reservationStatuses).map(([key, item]) => <span key={key} className={`schedule-status schedule-status--${item.tone}`}>{item.label}</span>)}<span className="schedule-legend__note" role="status">{query.refreshing ? "최신 예약 상태 확인 중…" : "조회한 의뢰 기준, 한국 시간"}</span></div>
      <div className="schedule-workspace">
        <div className="schedule-workspace__main"><Calendar month={month} today={today} selected={selection?.date ?? today} events={filtered} busy={anonymousBusy} testName={testName} onMonth={setMonth} onToday={() => { setMonth(monthOf(today)); setSelection(null); }} onDaySelect={(date) => chooseDate(date)} onEventSelect={(event, date) => chooseDate(date, event.id)} />
          {monthly.length === 0 && <div className="schedule-month-empty"><CalendarDays size={18} /><span>이 달에는 일정이 없습니다. 날짜를 선택하면 일정 협의가 가능한 의뢰를 확인할 수 있습니다.</span></div>}
        </div>
        <aside className="panel schedule-upcoming"><header><h2>다가오는 시험</h2></header>
          <div className="schedule-upcoming__list">{upcoming.length ? upcoming.map((event) => <ScheduleCard key={event.id} event={event} date={seoulDate(event.startAt) < today ? today : undefined} testName={testName(event.testType)} onSelect={(item, date) => chooseDate(date, item.id)} />) : <EmptyState icon={Clock3} title="예정된 시험이 없습니다" description="예약 제안과 확정 일정이 여기에 표시됩니다." />}</div>
          <div className="schedule-upcoming__note"><strong>일정 협의 가능 {eligible.length}건</strong><p>검토가 완료된 의뢰는 날짜 선택 후 일정을 제안할 수 있습니다.</p></div>
        </aside>
      </div>
    </>}
    {selection && !query.error && !query.loading && <ScheduleDetail key={`${selection.date}:${selection.id ?? "day"}`} date={selection.date} events={filtered.filter((event) => onDay(event, selection.date))} busy={anonymousBusy.filter((interval) => onDay(interval, selection.date))} initialId={selection.id} eligibleRequests={eligible} testName={testName} requestBox={box} onClose={() => setSelection(null)} onRequest={openRequest} />}
    {requestDetail && <RequestDetailDialog requestId={requestDetail.id} initialReservationDate={requestDetail.date} requestBox={box} onClose={() => setRequestDetail(null)} />}
  </div>;
}
