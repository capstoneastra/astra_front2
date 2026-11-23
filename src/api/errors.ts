export interface ApiErrorDetails {
  status?: string;
  rejectReason?: string | null;
  remainingAttempts?: number;
  retryAfter?: number;
  fieldErrors?: Record<string, string>;
  /** 제출 시 빠진 칸 (예: schedule.desiredStartDate, accounting.contact) */
  missingItems?: string[];
}

interface ApiErrorOptions {
  status?: number;
  code?: string;
  details?: ApiErrorDetails | null;
}

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown; details?: Record<string, unknown> | null };
}

interface ResponseEnvelope<T> extends ErrorEnvelope {
  success: boolean;
  data?: T;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetails | null;

  constructor(
    message: string,
    { status = 0, code = "UNKNOWN_ERROR", details = null }: ApiErrorOptions = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const messages: Record<string, string> = {
  AUTH_REQUIRED: "로그인이 필요합니다.",
  TOKEN_EXPIRED: "로그인이 만료되었습니다. 다시 로그인해주세요.",
  INVALID_CREDENTIALS: "이메일 또는 비밀번호를 확인해주세요.",
  ACCOUNT_NOT_ACTIVE: "아직 이용할 수 없는 계정입니다.",
  EMAIL_NOT_VERIFIED: "이메일 인증이 만료되었거나 사용할 수 없습니다. 인증 코드를 다시 받으세요.",
  EMAIL_ALREADY_EXISTS: "이미 가입된 이메일입니다.",
  ORGANIZATION_ALREADY_EXISTS: "같은 이름의 조직이 이미 등록되어 있습니다.",
  VERIFICATION_CODE_INVALID: "인증 코드가 일치하지 않습니다.",
  VERIFICATION_CODE_EXPIRED: "인증 코드를 더 이상 사용할 수 없습니다. 코드를 다시 받으세요.",
  TOO_MANY_REQUESTS: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
  FORBIDDEN: "이 기능에 접근할 권한이 없습니다.",
  EQUIPMENT_NOT_FOUND: "장비가 없거나 비활성화되었습니다.",
  NOT_FOUND: "요청한 정보를 찾을 수 없습니다.",
  INTERNAL_ERROR: "서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  RESERVATION_OVERLAP: "이미 확정된 예약과 시간이 겹칩니다. 최신 일정을 확인한 뒤 다른 시간을 선택해주세요.",
};

export function errorFromEnvelope(body: ErrorEnvelope | null | undefined, status: number) {
  const item = body?.error;
  const code = typeof item?.code === "string" ? item.code : `HTTP_${status}`;
  const fallback =
    status === 403
      ? messages.FORBIDDEN
      : status === 404
        ? messages.NOT_FOUND
        : status === 409
          ? "요청이 현재 서버 상태와 충돌합니다. 정보를 새로 확인해주세요."
          : status >= 500
            ? messages.INTERNAL_ERROR
            : "요청을 처리할 수 없습니다.";
  const message =
    status >= 500
      ? fallback
      : (messages[code] ??
        (typeof item?.message === "string" ? item.message : fallback));
  // Do not retain Axios config, request bodies or response objects containing tokens.
  const source = item?.details;
  let details: ApiErrorDetails | null = null;
  if (code === "ACCOUNT_NOT_ACTIVE")
    details = {
      status: typeof source?.status === "string" ? source.status : undefined,
      rejectReason: typeof source?.rejectReason === "string" ? source.rejectReason : undefined,
    };
  if (code === "VERIFICATION_CODE_INVALID" && typeof source?.remainingAttempts === "number" &&
      Number.isSafeInteger(source.remainingAttempts) && source.remainingAttempts >= 0)
    details = { remainingAttempts: source.remainingAttempts };
  if (code === "TOO_MANY_REQUESTS" && typeof source?.retryAfter === "number" &&
      Number.isSafeInteger(source.retryAfter) && source.retryAfter >= 0)
    details = { retryAfter: source.retryAfter };
  if (code === "VALIDATION_FAILED" && source) {
    const fieldErrors: Record<string, string> = {};
    // 명세 형식: details.fields = [{ field, reason }]
    if (Array.isArray(source.fields))
      for (const item of source.fields)
        if (item && typeof item.field === "string" && typeof item.reason === "string" && item.reason.trim())
          fieldErrors[item.field] ??= item.reason;
    // 단일 필드 형식: details.field (+ details.reason)
    if (typeof source.field === "string")
      fieldErrors[source.field] ??= typeof source.reason === "string" ? source.reason : message;
    // 이전 형식: details.fieldErrors 또는 { 필드: 사유 }
    const legacy = source.fieldErrors ?? source;
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy))
      for (const [field, reason] of Object.entries(legacy))
        if (typeof reason === "string" && reason.trim() && !["field", "reason"].includes(field)) fieldErrors[field] ??= reason;
    const missingItems = Array.isArray(source.missingItems)
      ? source.missingItems.filter((item): item is string => typeof item === "string")
      : [];
    if (Object.keys(fieldErrors).length || missingItems.length)
      details = {
        ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}),
        ...(missingItems.length ? { missingItems } : {}),
      };
  }
  return new ApiError(message, { status, code, details });
}

export function validateEnvelope<T>(body: unknown, status = 200) {
  if (!body || typeof body !== "object" || !("success" in body) || typeof body.success !== "boolean") {
    throw new ApiError("API 응답 형식이 명세와 다릅니다.", {
      status,
      code: "INVALID_RESPONSE",
    });
  }
  const envelope = body as ResponseEnvelope<T>;
  if (!envelope.success) throw errorFromEnvelope(envelope, status);
  // ApiResponse uses NON_NULL: successful void responses can omit data entirely.
  // Resource services validate their own non-null DTOs.
  return envelope.data;
}

export function contractError(message: string) {
  return new ApiError(message, { code: "INVALID_RESPONSE" });
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(error instanceof Error ? error.message : "요청을 처리할 수 없습니다.");
}
