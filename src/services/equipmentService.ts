import { apiClient, responseData } from "../api/client";
import { contractError } from "../api/errors";
import { apiConfig } from "../api/config";
import type { EquipmentDto, Page, ResourceId } from "./contracts";

export interface OwnedEquipment {
  id: number;
  externalId?: string | null;
  name: string;
  model?: string | null;
  equipmentType?: string | null;
  testTypes: string[];
  availability?: string | null;
  verificationStatus?: string | null;
  isMock?: boolean;
  infoUpdatedAt?: string | null;
  daysSinceUpdate?: number | null;
  needsUpdate?: boolean;
  updateReasons?: string[];
}

interface EquipmentFilters {
  q?: string;
  page?: number;
  size?: number;
  sort?: string;
  institutionId?: number | null;
  region?: string | string[];
  testType?: string;
  availability?: string;
  equipmentType?: string;
  externalOnly?: boolean;
  accreditedOnly?: boolean;
  includeMock?: boolean;
}

const testLabels: Record<string, string> = {
  VIBRATION: "진동시험",
  TEMPERATURE_HUMIDITY: "온습도시험",
  ELECTRICAL_RF_ANALYSIS: "전기·RF 측정",
  X_RAY_INSPECTION: "X선 비파괴검사",
  ACOUSTIC_NOISE: "음향·소음 시험",
  BATTERY_TEST: "배터리 시험",
};
export const testTypeLabel = (code: string) => testLabels[code] ?? code;
const optionalText = (value: unknown) => value == null || typeof value === "string";
const optionalNumber = (value: unknown) =>
  value == null || (typeof value === "number" && Number.isFinite(value));

export function equipmentView(dto: EquipmentDto | undefined) {
  if (
    !dto ||
    !Number.isSafeInteger(dto.id) ||
    typeof dto.name !== "string" ||
    !Array.isArray(dto.testTypes) ||
    !dto.testTypes.every((code) => typeof code === "string")
  )
    throw contractError("장비 응답의 id·name·testTypes를 확인해주세요.");
  if (
    typeof dto.isMock !== "boolean" ||
    (dto.specs !== undefined &&
      (!Array.isArray(dto.specs) ||
        !dto.specs.every(
          (spec) =>
            spec &&
            typeof spec.key === "string" &&
            ["REAL", "MOCK"].includes(spec.sourceType) &&
            (["label", "unit", "valueText", "verificationStatus"] as const).every((key) =>
              optionalText(spec[key]),
            ) &&
            (["value", "min", "max"] as const).every((key) => optionalNumber(spec[key])),
        ))) ||
    !(["description", "model", "externalId", "infoUpdatedAt"] as const).every((key) =>
      optionalText(dto[key]),
    ) ||
    (dto.usage != null &&
      (typeof dto.usage !== "object" ||
        !(["feeText", "durationText", "accessScope", "availability"] as const).every(
          (key) => optionalText(dto.usage?.[key]),
        )))
  )
    throw contractError("장비의 isMock·specs 형식이 명세와 다릅니다.");
  if (
    dto.institution !== null &&
    dto.institution !== undefined &&
    (typeof dto.institution.name !== "string" ||
      !Number.isSafeInteger(dto.institution.id))
  )
    throw contractError("장비 보유기관 응답이 명세와 다릅니다.");
  return {
    ...dto,
    // Explicit UI projection. The untouched backend DTO remains available as raw.
    raw: dto,
    institution: dto.institution?.name ?? "",
    institutionId: dto.institution?.id ?? null,
    testItem: dto.testTypes.map(testTypeLabel).join(" · "),
    reason: dto.description ?? "",
    updateDate:
      typeof dto.infoUpdatedAt === "string"
        ? dto.infoUpdatedAt.slice(0, 10)
        : null,
    isMock:
      dto.isMock === true ||
      dto.specs?.some((spec) => spec.sourceType === "MOCK") === true,
  };
}

export type Equipment = ReturnType<typeof equipmentView>;

export function equipmentPage(data: Page<EquipmentDto> | undefined) {
  if (
    !data ||
    !Array.isArray(data.content) ||
    ![data.page, data.size, data.totalElements, data.totalPages].every(
      Number.isSafeInteger,
    ) ||
    data.page < 0 ||
    data.size < 1 ||
    data.totalElements < 0 ||
    data.totalPages < 0 ||
    data.content.length > data.size
  )
    throw contractError("장비 목록의 페이지 응답이 명세와 다릅니다.");
  if (data.totalPages !== Math.ceil(data.totalElements / data.size))
    throw contractError("장비 페이지의 전체 페이지 수를 확인해주세요.");
  return { ...data, content: data.content.map(equipmentView) };
}

export const equipmentService = {
  async list(
    {
      q,
      page = 0,
      size = 20,
      sort = "infoUpdatedAt,desc",
      institutionId,
      region,
      testType,
      availability,
      equipmentType,
      externalOnly,
      accreditedOnly,
      includeMock = apiConfig.includeMock,
    }: EquipmentFilters = {},
    signal?: AbortSignal,
  ) {
    return equipmentPage(
      responseData<Page<EquipmentDto>>(
        await apiClient.get("/equipment", {
          signal,
          params: {
            ...(q ? { q } : {}),
            page,
            size,
            sort,
            includeMock,
            ...(institutionId ? { institutionId } : {}),
            ...(region?.length ? { region } : {}),
            ...(testType ? { testType } : {}),
            ...(availability ? { availability } : {}),
            ...(equipmentType ? { equipmentType } : {}),
            ...(externalOnly ? { externalOnly } : {}),
            ...(accreditedOnly ? { accreditedOnly } : {}),
          },
          // region=대전&region=진주 처럼 같은 이름으로 여러 번 보낸다
          paramsSerializer: { indexes: null },
        }),
      ),
    );
  },
  async catalog(signal?: AbortSignal) {
    const first = await this.list({}, signal);
    if (first.totalPages > 200)
      throw contractError(
        "전체 목록이 너무 큽니다. 서버 페이지 검색을 이용해주세요.",
      );
    const items = [...first.content];
    for (let page = 1; page < first.totalPages; page++) {
      const next = await this.list({ page }, signal);
      if (next.totalElements !== first.totalElements)
        throw contractError(
          "장비 목록이 조회 중 변경되었습니다. 다시 조회해주세요.",
        );
      items.push(...next.content);
    }
    if (new Set(items.map((item) => item.id)).size !== first.totalElements)
      throw contractError(
        "장비 페이지의 전체 건수와 항목이 일치하지 않습니다. 다시 조회해주세요.",
      );
    return items;
  },
  // 우리 조직 장비. 1대 이상이면 "장비를 가진 조직"으로 본다.
  async mine(params: { page?: number; size?: number } = {}, signal?: AbortSignal) {
    const data = responseData<Page<OwnedEquipment>>(
      await apiClient.get("/institutions/me/equipment", { signal, params: { size: 100, ...params } }),
    );
    if (!data || !Array.isArray(data.content) || !Number.isSafeInteger(data.totalElements))
      throw contractError("우리 조직 장비 목록 응답이 명세와 다릅니다.");
    return data;
  },
  async detail(id: ResourceId, signal?: AbortSignal) {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0)
      throw contractError("장비 ID가 유효하지 않습니다.");
    return equipmentView(
      responseData<EquipmentDto>(await apiClient.get(`/equipment/${Number(id)}`, { signal })),
    );
  },
};
