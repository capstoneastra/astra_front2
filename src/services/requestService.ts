import { getData, mutate } from "./http";
import { apiClient, responseData } from "../api/client";
import { invalidateData } from "../api/cache";
import { contractError } from "../api/errors";
import type { Attachment, NamedResource, Page, RequestDetail, Supplement, RequestRevision, RequestSummary, ResourceId, TimeInterval } from "./contracts";

interface RequestHistoryEntry {
  id: number;
  fromStatus: string;
  toStatus: string;
  createdAt: string;
  changedBy: NamedResource;
  note?: string | null;
}

interface DraftResult {
  requestId: number;
  id?: number;
}

export const requestService = {
  list: (params: object = {}, signal?: AbortSignal) =>
    getData<Page<RequestSummary>>("/test-requests", { size: 100, ...params }, signal),
  get: (id: ResourceId, signal?: AbortSignal) => getData<RequestDetail>(`/test-requests/${id}`, undefined, signal),
  create: (body: object, signal?: AbortSignal) => mutate<DraftResult>("POST", "/test-requests", body, signal),
  aiDraft: (body: object, signal?: AbortSignal) =>
    mutate<DraftResult>("POST", "/test-requests/ai-draft", body, signal),
  save: (id: ResourceId, version: number, content: object, signal?: AbortSignal) =>
    mutate<RequestDetail>("PUT", `/test-requests/${id}/draft`, { version, content }, signal),
  submit: (id: ResourceId, version: number, signal?: AbortSignal) =>
    mutate("POST", `/test-requests/${id}/submit`, { version }, signal),
  action: (id: ResourceId, action: string, version: number, fields: object = {}, signal?: AbortSignal) =>
    mutate(
      "POST",
      `/test-requests/${id}/${action}`,
      { version, ...fields },
      signal,
    ),
  supplements: (id: ResourceId, signal?: AbortSignal) =>
    getData<Supplement[]>(`/test-requests/${id}/supplements`, undefined, signal),
  /** 받는 쪽: 보완 요청(SUPPLEMENT) 또는 추가 정보 요청(ADDITIONAL_INFO) */
  requestSupplement: (id: ResourceId, version: number, body: { kind: "SUPPLEMENT" | "ADDITIONAL_INFO"; message?: string; items?: object[]; dueDate?: string | null }, signal?: AbortSignal) =>
    mutate("POST", `/test-requests/${id}/supplements`, { version, ...body }, signal),
  /** 받는 쪽: 예상 이용료 (검토 중~일정 조율 중) */
  estimatedFee: (id: ResourceId, version: number, body: { amount: number; note?: string }, signal?: AbortSignal) =>
    mutate<RequestDetail>("PUT", `/test-requests/${id}/estimated-fee`, { version, ...body }, signal),
  /** 받는 쪽: 시험 결과 등록·수정 (일정 확정 뒤) */
  result: (id: ResourceId, body: { summary: string; reportNo?: string; reportUrl?: string }, signal?: AbortSignal) =>
    mutate<RequestDetail>("PUT", `/test-requests/${id}/result`, body, signal),
  attachments: (id: ResourceId, signal?: AbortSignal) =>
    getData<Attachment[]>(`/test-requests/${id}/attachments`, undefined, signal),
  async upload(id: ResourceId, file: File, category: Attachment["category"], signal?: AbortSignal) {
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    const data = responseData<Attachment>(await apiClient.post(`/test-requests/${id}/attachments`, form, { signal }));
    invalidateData();
    return data;
  },
  /** 내려받기: 인증 헤더가 필요해서 Blob으로 받아 저장한다. */
  async download(attachment: Pick<Attachment, "id" | "fileName">) {
    const response = await apiClient.get(`/attachments/${attachment.id}/download`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  respond: (id: ResourceId, body: object, signal?: AbortSignal) =>
    mutate("POST", `/supplements/${id}/respond`, body, signal),
  revisions: (id: ResourceId, signal?: AbortSignal) =>
    getData<RequestRevision[]>(`/test-requests/${id}/revisions`, undefined, signal),
  history: (id: ResourceId, signal?: AbortSignal) =>
    getData<RequestHistoryEntry[]>(`/test-requests/${id}/history`, undefined, signal),
  propose: (id: ResourceId, version: number, body: TimeInterval, signal?: AbortSignal) =>
    mutate(
      "POST",
      `/test-requests/${id}/reservations`,
      { version, ...body },
      signal,
    ),
  reservationAction: (id: ResourceId, action: string, version: number, fields: object = {}, signal?: AbortSignal) =>
    mutate(
      "POST",
      `/reservations/${id}/${action}`,
      { version, ...fields },
      signal,
    ),
  availability: async (equipmentId: ResourceId, params: object = {}, signal?: AbortSignal) => {
    const intervals = await getData<TimeInterval[]>(`/equipment/${equipmentId}/reservations`, params, signal);
    if (!Array.isArray(intervals) || intervals.some((item) =>
      !Number.isFinite(Date.parse(item?.startAt)) || !Number.isFinite(Date.parse(item?.endAt)) || Date.parse(item.startAt) >= Date.parse(item.endAt)))
      throw contractError("장비의 확정 예약 구간 응답을 확인해주세요.");
    return intervals;
  },
};
