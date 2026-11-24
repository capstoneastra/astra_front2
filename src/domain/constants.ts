import { formatDateTime } from "./format";
export const requestStatusLabels = {
  DRAFT: "작성 중",
  SUBMITTED: "접수",
  UNDER_REVIEW: "검토 중",
  SUPPLEMENT_REQUESTED: "보완 요청",
  RESUBMITTED: "재제출",
  SCHEDULING: "일정 협의",
  CONFIRMED: "예약 확정",
  COMPLETED: "시험 완료",
  REJECTED: "반려",
  CANCELED: "취소",
};
export const checkLabels = {
  MET: "충족",
  NOT_MET: "불일치",
  UNKNOWN: "미확인",
};
export const verdictLabels = {
  SUITABLE: "조건 충족",
  PARTIAL: "일부 확인 필요",
  UNSUITABLE: "조건 불일치",
  UNKNOWN: "미확인",
};
export const roleLabels = {
  COMPANY_USER: "기업 회원",
  INSTITUTION_MANAGER: "기관 담당자",
  ADMIN: "관리자",
};
export const accountStatusLabels = {
  ACTIVE: "활성",
  PENDING: "승인 대기",
  REJECTED: "가입 거절",
  SUSPENDED: "이용 정지",
};
/** 날짜+시각 (예: 11월 24일 (화) 14:00). 표기 규칙은 domain/format.ts */
export const formatDate = (value) => formatDateTime(value, "기록 없음");
export function valueText(value) {
  if (!value) return "정보 없음";
  return `${value.value ?? (value.min != null && value.max != null ? `${value.min}~${value.max}` : (value.valueText ?? "정보 없음"))} ${value.unit ?? ""}`.trim();
}
export const availabilityLabels: Record<string, string> = {
  AVAILABLE: "예약 가능",
  BUSY: "사용 중",
  MAINTENANCE: "정비 중",
  UNAVAILABLE: "사용 불가",
  UNKNOWN: "정보 없음",
};
export const availabilityTone: Record<string, string> = {
  AVAILABLE: "green",
  BUSY: "amber",
  MAINTENANCE: "violet",
  UNAVAILABLE: "red",
  UNKNOWN: "neutral",
};
export const accessScopeLabels: Record<string, string> = {
  EXTERNAL_ALLOWED: "공동활용",
  INTERNAL_ONLY: "단독활용",
};
export const equipmentTypeLabels: Record<string, string> = {
  TEST: "시험",
  MEASUREMENT: "측정",
  MANUFACTURING: "제작·가공",
  SOFTWARE: "소프트웨어",
  SUPPORT: "지원",
};
