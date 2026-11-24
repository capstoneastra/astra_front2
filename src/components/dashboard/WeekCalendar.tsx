import { useState } from "react";
import { addDays, dayStart, onDay, seoulDate, timeLabel } from "../../domain/calendar";
import type { Schedule } from "../../domain/calendar";
import { formatDay } from "../../domain/format";

const weekday = ["일", "월", "화", "수", "목", "금", "토"];
/** 포스트잇 색: 같은 의뢰는 어느 날에 있어도 같은 색 */
const NOTE_COLORS = 6;
const colorOf = (item: Schedule) => `note--c${Math.abs(item.requestId ?? item.id) % NOTE_COLORS}`;
const statusText = (item: Schedule) => item.status === "CONFIRMED" ? "확정" : "일정 조율 중";

interface Props {
  schedules: Schedule[];
  onOpen: (requestId: number) => void;
}

/**
 * 이번 주(일요일 시작)와 다음 주, 2주 달력.
 * 하루에 시험이 여러 건이면 포스트잇처럼 겹쳐 두고, 마우스를 올리거나 키보드로 들어가면 아래로 펼친다.
 * 왼쪽 탭에는 2주 전체 목록, 날짜를 누르면 그날 목록이 나온다.
 */
export default function WeekCalendar({ schedules, onOpen }: Props) {
  const [now] = useState(() => Date.now());
  const today = seoulDate(now);
  const sunday = addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
  const days = Array.from({ length: 14 }, (_, i) => addDays(sunday, i));
  const end = dayStart(addDays(sunday, 14));
  const inRange = schedules
    .filter((item) => item.status !== "CANCELED" && Date.parse(item.endAt) > dayStart(sunday) && Date.parse(item.startAt) < end)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const sideItems = selected ? inRange.filter((item) => onDay(item, selected)) : inRange;

  return <div className="week-cal">
    <aside className="week-cal__side">
      <div className="week-cal__tabs" role="tablist" aria-label="일정 보기">
        <button type="button" role="tab" aria-selected={!selected} onClick={() => setSelected(null)}>
          2주 전체 <b>{inRange.length}</b>
        </button>
        {selected && <button type="button" role="tab" aria-selected="true">
          {formatDay(selected)} <b>{sideItems.length}</b>
        </button>}
      </div>
      <div role="tabpanel" className="week-cal__list">
        {sideItems.length === 0 ? <p className="inline-empty">{selected ? "이날은 시험이 없습니다." : "이번 주와 다음 주에 잡힌 시험이 없습니다."}</p> :
          sideItems.map((item) => <button key={item.id} type="button"
            className={`week-cal__item ${hovered === item.id ? "is-hovered" : ""}`}
            onMouseEnter={() => setHovered(item.id)} onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(item.id)} onBlur={() => setHovered(null)}
            onClick={() => onOpen(item.requestId)}>
            <span className={`week-cal__swatch ${colorOf(item)}`} aria-hidden="true" />
            <span className="week-cal__item-body">
              <strong>{item.equipment?.name ?? item.title}</strong>
              <small>{formatDay(item.startAt)} {timeLabel(item.startAt)}, {statusText(item)}</small>
            </span>
          </button>)}
      </div>
    </aside>

    <div className="week-cal__grid" role="grid" aria-label="이번 주와 다음 주 시험 일정">
      <div className="week-cal__row week-cal__head" role="row">
        {weekday.map((w, i) => <span key={w} role="columnheader" className={i === 0 ? "is-sun" : i === 6 ? "is-sat" : ""}>{w}</span>)}
      </div>
      {[0, 1].map((week) => <div key={week} className="week-cal__row" role="row">
        {days.slice(week * 7, week * 7 + 7).map((day, i) => {
          const items = inRange.filter((item) => onDay(item, day));
          const firstOfMonth = day.endsWith("-01") || (week === 0 && i === 0);
          return <div key={day} role="gridcell" aria-selected={selected === day}
            className={["week-cal__day", day === today && "is-today", day < today && "is-past", selected === day && "is-selected",
              i === 0 && "is-sun", i === 6 && "is-sat"].filter(Boolean).join(" ")}>
            <button type="button" className="week-cal__date" onClick={() => setSelected(selected === day ? null : day)}
              aria-label={`${formatDay(day)}${items.length ? `, 시험 ${items.length}건` : ""}`}>
              {firstOfMonth ? `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일` : Number(day.slice(8))}
              {day === today && <em>오늘</em>}
            </button>
            {items.length > 0 && <div className={`note-stack ${items.length > 1 ? "is-multi" : ""}`}>
              {items.slice(0, 4).map((item) => <button key={item.id} type="button"
                className={`note ${colorOf(item)} ${item.status === "CONFIRMED" ? "is-confirmed" : ""} ${hovered === item.id ? "is-hovered" : ""}`}
                aria-label={`${item.equipment?.name ?? item.title}, ${formatDay(day)} ${timeLabel(item.startAt)}, ${statusText(item)}`}
                onClick={() => onOpen(item.requestId)}>
                <strong>{item.equipment?.name ?? item.title}</strong>
                <small>{timeLabel(item.startAt)} {statusText(item)}</small>
                <span className="note__time" aria-hidden="true">{timeLabel(item.startAt)}</span>
              </button>)}
              {items.length > 1 && <span className="note-stack__count" aria-hidden="true">{items.length}</span>}
            </div>}
          </div>;
        })}
      </div>)}
    </div>
  </div>;
}
