import { apiClient, responseData } from "../api/client";
import { contractError } from "../api/errors";
import { USER_ROLES } from "./authService";
import type { User, UserRole } from "./authService";
import type { NamedResource } from "./contracts";

export const REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "SUPPLEMENT_REQUESTED",
  "RESUBMITTED",
  "SCHEDULING",
  "CONFIRMED",
  "COMPLETED",
  "REJECTED",
  "CANCELED",
] as const;

export type DashboardView = "REQUESTER" | "PROVIDER" | "ADMIN";
export type RequestStatus = typeof REQUEST_STATUSES[number];

export function defaultDashboardView(role: UserRole): DashboardView {
  if (role === "ADMIN") return "ADMIN";
  return role === "INSTITUTION_MANAGER" ? "PROVIDER" : "REQUESTER";
}

export interface DashboardRequest {
  requestId: number;
  requestNo: string;
  title: string;
  status: RequestStatus;
  submittedAt?: string | null;
  dueDate?: string | null;
  institutionName?: string;
}

interface DashboardChat { id: number; title: string; updatedAt?: string | null }
interface DashboardReservation {
  reservationId: number;
  requestId: number;
  requestNo: string;
  equipmentName: string;
  startAt: string;
  endAt: string;
}
interface InstitutionVerification extends NamedResource {
  region?: string | null;
  equipmentCount: number;
  verifiedCount: number;
}

interface DashboardSummary {
  role: UserRole;
  view?: DashboardView;
  requestCounts: Record<RequestStatus, number>;
  equipmentStats: { total: number; byRegion?: Record<string, number> };
  dataAvailable: { requests: boolean; chats?: boolean };
  institution?: NamedResource | null;
  actionRequired?: DashboardRequest[];
  pendingReview?: DashboardRequest[];
  recentChats?: DashboardChat[];
  upcomingReservations?: DashboardReservation[];
  equipmentNeedsUpdate?: { total: number; notConfirmed: number; outdated: number };
  institutionVerification?: InstitutionVerification[];
  pendingUsers?: number;
  pendingInstitutions?: number;
}

const isCount = (value: number) => Number.isSafeInteger(value) && value >= 0;

export function validateSummary(data: DashboardSummary | undefined, expectedRole?: UserRole, expectedView?: DashboardView, expectedOrganizationId?: number) {
  if (
    !data ||
    !USER_ROLES.includes(data.role) ||
    (expectedRole && data.role !== expectedRole) ||
    !Number.isSafeInteger(data.equipmentStats?.total) ||
    data.equipmentStats.total < 0 ||
    typeof data.dataAvailable?.requests !== "boolean" ||
    (data.dataAvailable.chats !== undefined && typeof data.dataAvailable.chats !== "boolean")
  )
    throw contractError(
      "대시보드 role·equipmentStats·dataAvailable 응답을 확인해주세요.",
    );
  // A legacy response without view can only represent the role's default scope.
  const view = data.view === undefined ? defaultDashboardView(data.role) : data.view;
  if (!["REQUESTER", "PROVIDER", "ADMIN"].includes(view) ||
    (expectedView && view !== expectedView) || (data.role === "ADMIN") !== (view === "ADMIN"))
    throw contractError("서버 대시보드 응답의 업무 범위가 선택한 화면과 다릅니다.");
  if (
    !REQUEST_STATUSES.every(
      (key) =>
        Number.isSafeInteger(data.requestCounts?.[key]) &&
        data.requestCounts[key] >= 0,
    )
  )
    throw contractError("대시보드의 10개 의뢰 상태 집계가 명세와 다릅니다.");
  for (const key of [
    "actionRequired",
    "pendingReview",
    "recentChats",
    "upcomingReservations",
    "institutionVerification",
  ] as const) {
    if (data[key] !== undefined && !Array.isArray(data[key]))
      throw contractError(`대시보드 ${key}가 목록 형식이 아닙니다.`);
  }
  for (const key of ["actionRequired", "pendingReview"] as const) {
    if (
      data[key]?.some(
        (item) =>
          !item ||
          !Number.isSafeInteger(item.requestId) ||
          typeof item.requestNo !== "string" ||
          typeof item.title !== "string" ||
          !REQUEST_STATUSES.includes(item.status) ||
          (item.submittedAt != null && typeof item.submittedAt !== "string") ||
          (item.dueDate != null && typeof item.dueDate !== "string"),
      )
    )
      throw contractError("대시보드 의뢰 항목이 명세와 다릅니다.");
  }
  if (
    view === "ADMIN" && ![data.pendingUsers, data.pendingInstitutions].every(isCount)
  )
    throw contractError("관리자 승인 대기 집계가 명세와 다릅니다.");
  if (
    view === "PROVIDER" &&
    (!Number.isSafeInteger(data.institution?.id) ||
      typeof data.institution.name !== "string" ||
      (expectedOrganizationId !== undefined && data.institution.id !== expectedOrganizationId))
  )
    throw contractError("기관 대시보드의 소속 기관 응답을 확인해주세요.");
  if (data.recentChats?.some((chat) => !chat || !Number.isSafeInteger(chat.id) ||
    typeof chat.title !== "string" || (chat.updatedAt != null && typeof chat.updatedAt !== "string")))
    throw contractError("최근 상담 응답의 형식을 확인해주세요.");
  if (data.upcomingReservations?.some((item) => !item || !Number.isSafeInteger(item.reservationId) ||
    !Number.isSafeInteger(item.requestId) || typeof item.requestNo !== "string" || typeof item.equipmentName !== "string" ||
    !Number.isFinite(Date.parse(item.startAt)) || !Number.isFinite(Date.parse(item.endAt)) ||
    Date.parse(item.startAt) >= Date.parse(item.endAt)))
    throw contractError("예정된 시험 예약 응답의 형식을 확인해주세요.");
  const updates = data.equipmentNeedsUpdate;
  if (updates !== undefined && (!updates || ![updates.total, updates.notConfirmed, updates.outdated].every(isCount)))
    throw contractError("갱신 필요 장비 집계의 형식을 확인해주세요.");
  if (data.institutionVerification?.some((item) => !item || !Number.isSafeInteger(item.id) ||
    typeof item.name !== "string" || !isCount(item.equipmentCount) || !isCount(item.verifiedCount) ||
    item.verifiedCount > item.equipmentCount || (item.region != null && typeof item.region !== "string")))
    throw contractError("기관별 장비 검증 응답의 형식을 확인해주세요.");
  return { ...data, view };
}

export const dashboardService = {
  async summary(user: Pick<User, "role" | "organization">, view: DashboardView, signal?: AbortSignal) {
    return validateSummary(
      responseData<DashboardSummary>(await apiClient.get("/dashboard/summary", {
        signal, params: view === "ADMIN" ? undefined : { view },
      })),
      user.role,
      view,
      user.organization?.id,
    );
  },
};
