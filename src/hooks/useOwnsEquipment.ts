import { useAuth } from "../auth/context";
import type { User } from "../services/authService";
import { equipmentService } from "../services/equipmentService";
import { useApiQuery } from "./useApiQuery";

/**
 * "장비를 가진 조직"인지는 역할이 아니라 데이터로 판단한다.
 * GET /institutions/me/equipment 결과가 1대 이상이면 받은 의뢰·우리 장비 메뉴를 연다.
 * - 관리자: 항상 true
 * - 서버 없이 화면 열기(미리보기): API가 막혀 있으므로 기관·대학 계정은 보유, 기업은 미보유로 본다.
 * - 조회 실패·조회 중: false (메뉴를 숨긴다)
 */
export function useOwnsEquipment(user: User) {
  const { status } = useAuth();
  const local = status === "local";
  const admin = user.role === "ADMIN";
  const query = useApiQuery(
    (signal) => equipmentService.mine({ size: 1 }, signal),
    `my-equipment-count:${user.id}:${user.organization?.id ?? "none"}`,
    !admin && !local && user.organization != null,
  );
  if (admin) return { owns: true, loading: false };
  if (local) return { owns: user.role === "INSTITUTION_MANAGER", loading: false };
  return { owns: (query.data?.totalElements ?? 0) > 0, loading: query.loading };
}
