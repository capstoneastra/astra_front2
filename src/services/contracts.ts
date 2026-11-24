export type ResourceId = number | string;

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface NamedResource {
  id: number;
  name: string;
}

export interface EquipmentSpec {
  key: string;
  label?: string | null;
  unit?: string | null;
  value?: number | null;
  min?: number | null;
  max?: number | null;
  valueText?: string | null;
  sourceType: string;
  verificationStatus?: string | null;
  usageScope?: string | null;
}

export interface EquipmentDto {
  id: number;
  name: string;
  testTypes: string[];
  isMock: boolean;
  institution?: NamedResource | null;
  model?: string | null;
  externalId?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  region?: string | null;
  equipmentType?: string | null;
  availability?: string | null;
  isActive?: boolean;
  infoUpdatedAt?: string | null;
  verificationStatus?: string | null;
  utilizationRate?: number | null;
  feeText?: string | null;
  specs?: EquipmentSpec[];
  /** 목록 응답의 주요 사양 2개 (GET /equipment) */
  keySpecs?: EquipmentSpec[];
  usage?: {
    feeText?: string | null;
    feeAmount?: number | null;
    feeUnit?: string | null;
    durationText?: string | null;
    accessScope?: string | null;
    vatIncluded?: boolean | null;
    availability?: string | null;
    utilizationRate?: number | null;
  } | null;
  source?: { type?: string; url?: string; file?: string; page?: number } | null;
  simulation?: { capability?: string; presetIds?: (string | number)[] } | null;
}

export interface TimeInterval {
  startAt: string;
  endAt: string;
}

export interface ReservationRecord extends TimeInterval {
  id: number;
  status: string;
  version: number;
  note?: string | null;
  createdAt?: string;
}

export type RequestBox = "SENT" | "RECEIVED";

export interface RequestSummary {
  id: number;
  requestNo: string;
  status: string;
  title: string;
  equipment?: (NamedResource & { externalId?: string }) | null;
  institution?: NamedResource | null;
  submittedAt?: string | null;
  createdAt?: string | null;
  revision: RequestRevision;
}

export interface RequestRevision {
  revisionNo: number;
  isAiGenerated?: boolean;
  changeSummary?: string | null;
  content: RequestContent;
}

export interface ContactPerson { name?: string; phone?: string; email?: string }

export interface RequestContent {
  applicant: { companyName?: string; contactName?: string; email?: string; phone?: string };
  /** 실사용자. 의뢰를 만들 때 서버가 신청자로 미리 채움 */
  actualUser?: ContactPerson;
  /** 회계 담당자. 제출 필수(이름 + 전화 또는 이메일) */
  accounting?: ContactPerson;
  /** 아래 4개는 받는 쪽의 추가 정보 요청(ADDITIONAL_INFO)으로 받는다 */
  responsible?: { name?: string };
  report?: { type?: string };
  billing?: { method?: string };
  test: { testTypeCode?: string; purpose?: string; standard?: string; conditions?: RequirementCondition[] };
  schedule: { desiredStartDate?: string | null; desiredEndDate?: string | null };
  sample: { name?: string; quantity?: number | null; size?: string; weight?: string; notes?: string; readyDate?: string | null; disposal?: string };
  equipment?: { id: number; name?: string; externalId?: string };
  notes?: string;
  conditions: RequirementCondition[];
}

export interface Supplement {
  id: number;
  requestId?: number;
  status: string;
  kind?: "SUPPLEMENT" | "ADDITIONAL_INFO";
  message: string;
  dueDate?: string | null;
  requestedBy?: NamedResource;
  items: { fieldKey: string; label?: string; message?: string; required?: boolean }[];
  responseMessage?: string | null;
  createdAt?: string;
  respondedAt?: string | null;
}

export interface EstimatedFee { amount: number; note?: string | null; updatedAt?: string }

export interface TestResult {
  summary: string;
  reportNo?: string | null;
  reportUrl?: string | null;
  registeredBy?: NamedResource;
  registeredAt?: string;
  updatedAt?: string;
}

export interface Attachment {
  id: number;
  requestId: number;
  category: "GENERAL" | "RESULT_REPORT";
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
  uploadedBy?: NamedResource;
  createdAt: string;
  downloadUrl?: string;
}

export interface RequestDetail extends RequestSummary {
  reservations: ReservationRecord[];
  version: number;
  requester?: NamedResource;
  companyName?: string;
  /** 답변을 기다리는 보완·추가 정보 요청 (없으면 null) */
  openSupplement?: Supplement | null;
  /** 서버가 알려 주는 지금 가능한 동작 (SUBMIT, RESPOND_SUPPLEMENT, ACCEPT, COMPLETE …) */
  availableActions?: string[];
  estimatedFee?: EstimatedFee | null;
  result?: TestResult | null;
}

export interface TestType {
  code: string;
  nameKo: string;
  description?: string | null;
  equipmentCount?: number;
}

export interface ConditionRule {
  conditionKey: string;
  label: string;
  unit?: string | null;
  valueType: string;
  comparator: string;
  isRequired: boolean;
}

export interface TestTypeDetail extends TestType {
  conditionRules: ConditionRule[];
  institutions: (NamedResource & {
    region?: string | null;
    equipmentCount: number;
    estCostMin?: number | null;
    estDurationDays?: number | null;
    accessScope?: string | null;
  })[];
}

export interface MatchRun {
  requirementId: number;
  disclaimer: string;
  results: {
    id: number;
    rank: number;
    equipment: NamedResource & { externalId?: string; institutionName?: string };
    verdict: string;
    reason: string;
    score: number;
    usedMockData: boolean;
    checks: {
      conditionKey: string;
      result: string;
      requiredText?: string;
      equipmentText?: string;
      sourceType?: string;
      note?: string;
    }[];
  }[];
}

export interface RequirementCondition {
  key: string;
  label?: string;
  unit?: string | null;
  status?: string;
  source?: string;
  confidence?: number | null;
  note?: string | null;
  value?: number;
  min?: number;
  max?: number;
  valueText?: string;
}

export interface Requirement {
  id: number;
  testTypeCode: string;
  title: string;
  purpose: string;
  sampleName: string;
  sampleQuantity: number | null;
  conditions: RequirementCondition[];
}
