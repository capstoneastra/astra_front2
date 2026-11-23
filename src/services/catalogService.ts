import { getData, postData, mutate } from "./http";
import type { EquipmentDto, EquipmentSpec, NamedResource, ResourceId, TestType, TestTypeDetail } from "./contracts";

type CatalogEquipment = EquipmentDto & { institution: NamedResource };

interface Comparison {
  usedMockData: boolean;
  equipment: CatalogEquipment[];
  rows: { key: string; label: string; values: (EquipmentSpec | null)[] }[];
  usage: {
    equipmentId: number;
    feeText?: string | null;
    durationText?: string | null;
    availability?: string | null;
    infoUpdatedAt?: string | null;
  }[];
}

interface DuplicateGroup {
  region: string;
  testType: TestType;
  equipmentCount: number;
  institutionCount: number;
  equipment: CatalogEquipment[];
}

export const catalogService = {
  testTypes: (signal?: AbortSignal) => getData<TestType[]>("/test-types", undefined, signal),
  testType: (code: string, signal?: AbortSignal) => getData<TestTypeDetail>(`/test-types/${code}`, undefined, signal),
  search: (q: string, signal?: AbortSignal) =>
    getData<{ equipment: EquipmentDto[]; interpreted: { testTypeCode?: string; keywords?: string[] } }>("/search", { q }, signal),
  compare: (equipmentIds: number[], testType?: string, signal?: AbortSignal) =>
    postData<Comparison>(
      "/equipment/compare",
      { equipmentIds, ...(testType ? { testType } : {}) },
      signal,
    ),
  duplicates: (params: object = {}, signal?: AbortSignal) =>
    getData<DuplicateGroup[]>("/equipment/duplicates", params, signal),
  similar: (id: ResourceId, signal?: AbortSignal) =>
    getData<CatalogEquipment[]>(`/equipment/${id}/similar`, undefined, signal),
  institutions: (signal?: AbortSignal) => getData<NamedResource[]>("/institutions", undefined, signal),
  createEquipment: (body: object, signal?: AbortSignal) => mutate("POST", "/equipment", body, signal),
  updateEquipment: (id: ResourceId, body: object, signal?: AbortSignal) =>
    mutate("PATCH", `/equipment/${id}`, body, signal),
  saveSpecs: (id: ResourceId, specs: EquipmentSpec[], signal?: AbortSignal) =>
    mutate("PUT", `/equipment/${id}/specs`, { specs }, signal),
  confirmEquipment: (id: ResourceId, signal?: AbortSignal) =>
    mutate("POST", `/equipment/${id}/confirm`, {}, signal),
  deleteEquipment: (id: ResourceId, signal?: AbortSignal) =>
    mutate("DELETE", `/equipment/${id}`, undefined, signal),
  /** 정비·운휴 일정 (장비 보유 조직·관리자) */
  downtimes: (id: ResourceId, signal?: AbortSignal) =>
    getData<{ id: number; startAt: string; endAt: string; reason?: string | null }[]>(`/equipment/${id}/downtimes`, undefined, signal),
  addDowntime: (id: ResourceId, body: { startAt: string; endAt: string; reason: string }, signal?: AbortSignal) =>
    mutate<{ id: number }>("POST", `/equipment/${id}/downtimes`, body, signal),
  deleteDowntime: (id: ResourceId, downtimeId: number, signal?: AbortSignal) =>
    mutate("DELETE", `/equipment/${id}/downtimes/${downtimeId}`, undefined, signal),
};
