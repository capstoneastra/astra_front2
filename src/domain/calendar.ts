import type { RequestDetail, TimeInterval } from "../services/contracts";

// Calendar arithmetic is independent of the browser / operating system timezone.
export const SEOUL_OFFSET = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
export const reservationStatuses = {
  PROPOSED: { label: "예약 제안", tone: "amber" },
  CONFIRMED: { label: "예약 확정", tone: "cyan" },
  COUNTER_PROPOSED: { label: "대안 일정 제안", tone: "violet" },
  CANCELED: { label: "예약 취소", tone: "neutral" },
};
export const seoulDate = (instant: number | string | Date = Date.now()) =>
  new Date(new Date(instant).getTime() + SEOUL_OFFSET).toISOString().slice(0, 10);
export const dayStart = (date: string) => Date.parse(`${date}T00:00:00+09:00`);
export const addDays = (date: string, count: number) => seoulDate(dayStart(date) + count * DAY);
export const monthOf = (date: string) => date.slice(0, 7);
export function moveMonth(month: string, count: number) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value - 1 + count, 1)).toISOString().slice(0, 7);
}
export function monthDays(month: string) {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const last = addDays(`${moveMonth(month, 1)}-01`, -1);
  const count = Math.ceil((weekday + Number(last.slice(-2))) / 7) * 7;
  return Array.from({ length: count }, (_, i) => addDays(first, i - weekday));
}
export function overlaps(a: TimeInterval, b: TimeInterval) {
  return Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(a.endAt) > Date.parse(b.startAt);
}
export const onDay = (event: TimeInterval, date: string) => overlaps(event, {
  startAt: new Date(dayStart(date)).toISOString(),
  endAt: new Date(dayStart(addDays(date, 1))).toISOString(),
});
export const inMonth = (event: TimeInterval, month: string) => overlaps(event, {
  startAt: `${month}-01T00:00:00+09:00`,
  endAt: `${moveMonth(month, 1)}-01T00:00:00+09:00`,
});
export const dateLabel = (date: string) => new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long",
}).format(new Date(dayStart(date)));
export const timeLabel = (instant: string | number | Date) => new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(instant));
export function dayTimeLabel(event: TimeInterval, date: string) {
  const start = Date.parse(event.startAt), end = Date.parse(event.endAt);
  const from = dayStart(date), to = dayStart(addDays(date, 1));
  if (start <= from && end >= to) return "종일 · 여러 날 시험";
  return `${start < from ? "이전 날짜부터" : timeLabel(event.startAt)} – ${end > to ? "24:00, 다음 날 계속" : end === to ? "24:00" : timeLabel(event.endAt)}`;
}

export function schedulesFromRequests(requests: RequestDetail[]) {
  return requests.flatMap((request) => {
    if (!Array.isArray(request.reservations)) throw new Error("예약 목록이 없는 의뢰 상세 응답입니다.");
    return request.reservations.map((reservation) => {
      if (!reservationStatuses[reservation.status] || !Number.isFinite(Date.parse(reservation.startAt)) ||
        !Number.isFinite(Date.parse(reservation.endAt)) || Date.parse(reservation.startAt) >= Date.parse(reservation.endAt))
        throw new Error("예약 상태 또는 기간이 명세와 다릅니다.");
      return { ...reservation, requestId: request.id, requestNo: request.requestNo,
        title: request.title, requestStatus: request.status, equipment: request.equipment,
        institution: request.institution, companyName: request.revision?.content?.applicant?.companyName,
        testType: request.revision?.content?.test?.testTypeCode ?? "UNKNOWN" };
    });
  }).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id - b.id);
}

export type Schedule = ReturnType<typeof schedulesFromRequests>[number];
