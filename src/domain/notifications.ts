import { notificationService } from "../services/notificationService";
import type { AppNotification } from "../services/notificationService";

/** 알림 종류 → 짧은 이름 */
export const notificationTypeLabels: Record<string, string> = {
  REQUEST_SUBMITTED: "새 의뢰",
  REQUEST_ACCEPTED: "검토 통과",
  REQUEST_REJECTED: "반려",
  SUPPLEMENT_REQUESTED: "보완 요청",
  SUPPLEMENT_RESPONDED: "보완 답변",
  RESERVATION_PROPOSED: "일정 제안",
  RESERVATION_CONFIRMED: "일정 확정",
  RESULT_REGISTERED: "결과 도착",
};

/** 알림을 누르면 읽음 처리하고, 연결된 의뢰가 있으면 그 의뢰를 연다. */
export function useOpenNotification(onOpenRequest: (requestId: number) => void) {
  return async (item: AppNotification) => {
    if (!item.isRead) {
      try { await notificationService.read(item.id); } catch { /* 읽음 실패해도 이동은 한다 */ }
    }
    // 메뉴(팝오버)가 완전히 닫힌 뒤에 의뢰 상세 창을 연다. 바로 열면 메뉴가 닫히면서 상세 창도 같이 닫힌다.
    const requestId = item.relatedRequestId;
    if (requestId) window.setTimeout(() => onOpenRequest(requestId), 150);
  };
}

