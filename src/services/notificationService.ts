import { getData, mutate } from "./http";
import type { Page, ResourceId } from "./contracts";

/** 서버 알림 (GET /notifications). 문구는 title, 자세한 내용은 body */
export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  relatedRequestId?: number | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export const notificationService = {
  list: (params: { unreadOnly?: boolean; size?: number } = {}, signal?: AbortSignal) =>
    getData<Page<AppNotification>>("/notifications", { size: 100, ...params }, signal),
  /** 헤더 배지용 개수 (GET /notifications/unread-count → { count }) */
  unreadCount: async (signal?: AbortSignal) =>
    (await getData<{ count: number }>("/notifications/unread-count", undefined, signal))?.count ?? 0,
  read: (id: ResourceId) => mutate("PATCH", `/notifications/${id}/read`, {}),
  readAll: () => mutate("POST", "/notifications/read-all", {}),
};
