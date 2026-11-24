import { reservationStatuses, dayTimeLabel, seoulDate, dateLabel } from "../../domain/calendar";
export default function ScheduleCard({ event, date, testName, onSelect, compact = false }) {
  const status = reservationStatuses[event.status];
  const day = date ?? seoulDate(event.startAt);
  return (
    <button type="button" className={`schedule-card schedule-card--${status.tone}${compact ? " schedule-card--compact" : ""}`}
      data-reservation-id={event.id} onClick={() => onSelect(event, day)}
      aria-label={`${dateLabel(day)} ${testName} · ${event.equipment?.name ?? "장비 정보 없음"} · ${dayTimeLabel(event, day)} · ${status.label}`}>
      {!compact && <span className="schedule-card__date">{dateLabel(day)}</span>}
      <span className="schedule-card__title">{testName}</span>
      <span className="schedule-card__equipment" title={event.equipment?.name}>{event.equipment?.name ?? "장비 정보 없음"}</span>
      <span className="schedule-card__time">{dayTimeLabel(event, day)}</span>
      <span className="schedule-card__institution" title={event.institution?.name}>{event.institution?.name ?? "기관 정보 없음"}</span>
      <span className="schedule-status" data-status={event.status}>{status.label}</span>
    </button>
  );
}
