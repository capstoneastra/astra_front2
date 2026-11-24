/**
 * 화면에 보이는 날짜·금액 표기를 한 곳에서 정한다. 모두 한국 시간 기준.
 *  - 날짜:        11월 24일 (화)          다른 해면 2025년 11월 24일 (월)
 *  - 날짜+시각:   11월 24일 (화) 14:00
 *  - 기간:        11월 24일 (화) 09:00–18:00 / 11월 24일 (화) ~ 11월 26일 (목)
 *  - 지난 시각:   방금, 5분 전, 3시간 전, 17일 전 (30일 넘으면 날짜)
 */
type Instant = string | number | Date;

const parts = (value: Instant) => {
  const map = Object.fromEntries(new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(dateOnly(value))).map((part) => [part.type, part.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), weekday: map.weekday, time: `${map.hour}:${map.minute}` };
};
/** "2026-11-24"처럼 날짜만 온 값은 한국 자정으로 읽는다 */
const dateOnly = (value: Instant) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00` : value;
const valid = (value: Instant | null | undefined): value is Instant =>
  value != null && value !== "" && Number.isFinite(new Date(dateOnly(value)).getTime());
const thisYear = () => parts(Date.now()).year;

export function formatDay(value: Instant | null | undefined, empty = "미정") {
  if (!valid(value)) return empty;
  const p = parts(value);
  return `${p.year === thisYear() ? "" : `${p.year}년 `}${p.month}월 ${p.day}일 (${p.weekday})`;
}

export function formatDateTime(value: Instant | null | undefined, empty = "미정") {
  if (!valid(value)) return empty;
  return `${formatDay(value)} ${parts(value).time}`;
}

export function formatRange(start: Instant | null | undefined, end: Instant | null | undefined, withTime = true) {
  if (!valid(start)) return "미정";
  if (!valid(end)) return withTime ? formatDateTime(start) : formatDay(start);
  const sameDay = formatDay(start) === formatDay(end);
  if (!withTime) return sameDay ? formatDay(start) : `${formatDay(start)} ~ ${formatDay(end)}`;
  return sameDay ? `${formatDay(start)} ${parts(start).time}–${parts(end).time}` : `${formatDateTime(start)} ~ ${formatDateTime(end)}`;
}

export function formatAgo(value: Instant | null | undefined, now = Date.now(), empty = "기록 없음") {
  if (!valid(value)) return empty;
  const minutes = Math.floor((now - new Date(dateOnly(value)).getTime()) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
  const days = Math.floor(minutes / (60 * 24));
  return days <= 30 ? `${days}일 전` : formatDay(value);
}

/** 이용료 원문(예: "12000 KRW/hour VAT excluded")을 "시간당 12,000원 (부가세 별도)"로 */
const feeUnits: Record<string, string> = {
  hour: "시간당", hr: "시간당", h: "시간당", day: "1일", d: "1일", sample: "시료당", specimen: "시료당",
  case: "건당", test: "건당", run: "회당", time: "회당", piece: "개당", ea: "개당", month: "월", week: "주",
  시간: "시간당", 일: "1일", 시료: "시료당", 건: "건당", 회: "회당", 개: "개당",
};
export function formatFee(text: string | null | undefined, empty = "이용료 문의") {
  if (!text?.trim()) return empty;
  const raw = text.trim();
  if (raw === "협의") return "이용료 협의";
  const match = raw.match(/^([\d,.]+)\s*(KRW|원)?\s*(?:\/|per)\s*([a-zA-Z가-힣]+)?/i) ?? raw.match(/^([\d,.]+)\s*(KRW|원)/i);
  if (!match) return raw; // 이미 한글 문장이면 그대로
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount)) return raw;
  const unit = match[3] ? feeUnits[match[3].toLowerCase()] ?? `${match[3]}당` : "";
  const vat = /VAT\s*excl|부가세\s*별도/i.test(raw) ? " (부가세 별도)" : /VAT\s*incl|부가세\s*포함/i.test(raw) ? " (부가세 포함)" : "";
  return `${unit ? `${unit} ` : ""}${amount.toLocaleString("ko-KR")}원${vat}`;
}
