import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/index";
import ScheduleCard from "./ScheduleCard";
import { monthDays, monthOf, moveMonth, onDay, addDays, dateLabel } from "../../domain/calendar";
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
export default function Calendar({ month, today, selected, events, busy = [], testName, onMonth, onToday, onDaySelect, onEventSelect }) {
  const root = useRef(null);
  const days = monthDays(month);
  const keyboard = (e, day) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -new Date(`${day}T00:00:00Z`).getUTCDay(), End: 6 - new Date(`${day}T00:00:00Z`).getUTCDay() }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = addDays(day, delta);
    if (monthOf(next) !== month) onMonth(monthOf(next));
    requestAnimationFrame(() => root.current?.querySelector(`[data-day="${next}"] .calendar-day__select`)?.focus());
  };
  return (
    <section className="panel calendar" aria-label="월간 시험 예약 캘린더" ref={root}>
      <header className="calendar__toolbar">
        <div><span className="eyebrow">TEST SCHEDULE</span><h2 aria-live="polite">{Number(month.slice(0, 4))}년 <strong>{Number(month.slice(5))}월</strong></h2></div>
        <div className="calendar__navigation">
          <span className="calendar__timezone">한국 시간</span>
          <Button variant="secondary" onClick={onToday}>오늘</Button>
          <button type="button" className="icon-button" aria-label="이전 달" onClick={() => onMonth(moveMonth(month, -1))}><ChevronLeft size={19} /></button>
          <button type="button" className="icon-button" aria-label="다음 달" onClick={() => onMonth(moveMonth(month, 1))}><ChevronRight size={19} /></button>
        </div>
      </header>
      <div className="calendar__weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar__days">
        {days.map((day) => {
          const entries = events.filter((event) => onDay(event, day));
          const occupied = busy.filter((interval) => onDay(interval, day));
          return (
            <div key={day} data-day={day} className={`calendar-day${monthOf(day) !== month ? " calendar-day--outside" : ""}${day === selected ? " calendar-day--selected" : ""}${day === today ? " calendar-day--today" : ""}`}>
              <button type="button" className="calendar-day__select" aria-label={`${dateLabel(day)} · ${entries.length}건${occupied.length ? ` · 장비 확정 점유 ${occupied.length}구간` : ""}${day === today ? " · 오늘" : ""}`} aria-current={day === today ? "date" : undefined}
                onClick={() => onDaySelect(day)} onKeyDown={(e) => keyboard(e, day)}>
                <span>{Number(day.slice(-2))}</span><small>{entries.length > 0 ? `${entries.length}건` : day === today ? "오늘" : ""}</small>
              </button>
              <div className="calendar-day__events">{entries.slice(0, 2).map((event) => <ScheduleCard key={event.id} event={event} date={day} testName={testName(event.testType)} onSelect={onEventSelect} compact />)}</div>
              {occupied.length > 0 && <span className="calendar-day__busy" aria-label={`선택 장비 확정 점유 ${occupied.length}구간`}>확정 점유 {occupied.length}구간</span>}
              {entries.length > 2 && <button type="button" className="calendar-day__more" onClick={() => onDaySelect(day)} aria-label={`${dateLabel(day)} 예약 ${entries.length}건 모두 보기`}>+{entries.length - 2}건 더보기</button>}
            </div>
          );
        })}
      </div>
      <footer className="calendar__footer"><span>날짜를 누르면 그날 일정이 보입니다. 방향키로 날짜를 옮길 수 있습니다.</span><span>여러 날 시험은 날짜별로 이어서 표시됩니다.</span></footer>
    </section>
  );
}
