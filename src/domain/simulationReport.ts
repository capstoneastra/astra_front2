import type { SimulationResult } from "../services/simulationService";

export type ReportCell = string | number | boolean | null | undefined;
export interface ReportSheet { name: string; rows: ReportCell[][] }

interface ReportOptions {
  equipmentName?: string;
  institutionName?: string;
  source?: string;
  exportedAt?: Date;
}

export const simulationInputLabels: Record<string, string> = {
  massKg: "시료 질량 (kg)", fixtureMassKg: "고정구 질량 (kg)", stiffnessNPerM: "가상 강성 (N/m)",
  dampingRatio: "감쇠비", frequencyMinHz: "시작 주파수 (Hz)", frequencyMaxHz: "종료 주파수 (Hz)",
  startTempC: "시작 온도 (°C)", targetTempC: "목표 온도 (°C)", rampMin: "승온 시간 (분)",
  holdMin: "유지 시간 (분)", targetHumidityPct: "목표 습도 (%)", currentA: "전류 (A)",
  voltageV: "전압 (V)", capacityAh: "용량 (Ah)", initialSocPct: "시작 SOC (%)", finalSocPct: "종료 SOC (%)",
  dropHeightM: "낙하 높이 (m)", maxDisplacementMm: "최대 변위 (mm)",
  specimenStiffnessNPerMm: "시편 강성 (N/mm)", targetForceKN: "목표 하중 (kN)",
  rampSeconds: "상승 시간 (초)", holdSeconds: "유지 시간 (초)",
};
const summaryLabels: Record<string, string> = { naturalFrequencyHz: "가상 고유진동수 (Hz)", targetHumidityPct: "목표 습도 (%)", energyJ: "가상 에너지 (J)", hours: "소요 시간 (h)", decibels: "가상 음압 레벨 (dB)", powerW: "가상 전력 (W)" };
const checkLabels = { MET: "가상 범위 내", NOT_MET: "가상 범위 초과", UNKNOWN: "미확인" };
export function reportValue(value: unknown): ReportCell {
  if (value == null) return "정보 없음";
  if (typeof value === "number" || typeof value === "boolean") return value;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function buildSimulationReport(result: SimulationResult, {
  equipmentName, institutionName, source = "API", exportedAt = new Date(),
}: ReportOptions = {}) {
  if (!result?.id || result.status !== "SUCCEEDED" || !result.output || typeof result.output !== "object")
    throw new Error("완료된 시뮬레이션 결과가 있어야 내보낼 수 있습니다.");
  const time = (value) => value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) + " KST" : "정보 없음";
  const warning = result.warning || "참고용 계산 결과이며 실제 시험 성적서나 장비 적합성 판정이 아닙니다.";
  const sheets: ReportSheet[] = [{ name: "실행 정보", rows: [["항목", "값"], ["보고서", "ASTRA 가상 시뮬레이션 결과"],
    ["결과 구분", "참고용, 실제 시험 결과 아님"], ["데이터 출처", source], ["실행 ID", result.id],
    ["장비 ID", reportValue(result.equipmentId)], ["장비명", equipmentName || "정보 없음"],
    ["보유기관", institutionName || "정보 없음"], ["입력 예시", reportValue(result.presetId)],
    ["모델", reportValue(result.modelType)], ["모델 버전", reportValue(result.modelVersion)],
    ["모델 범위", reportValue(result.capability)], ["실행 시각", time(result.createdAt)],
    ["내보낸 시각", time(exportedAt.toISOString())], ["안내", warning], ["모델 한계", result.limitation || "정보 없음"]] },
  { name: "입력 조건", rows: [["입력 항목", "필드", "값"], ...Object.entries(result.inputParameters ?? {}).map(([key, value]) => [simulationInputLabels[key] ?? key, key, reportValue(value)])] }];
  const output = result.output;
  const summary: ReportCell[][] = [["항목", "값"]];
  for (const [key, value] of Object.entries(output.summary ?? {})) summary.push([summaryLabels[key] ?? key, reportValue(value)]);
  if (output.concept) summary.push([output.concept.label ?? "개념 결과", `${reportValue(output.concept.value)} ${output.concept.unit ?? ""}`.trim()]);
  if (output.steps) output.steps.forEach((step, index) => summary.push([`예시 단계 ${index + 1}`, reportValue(step)]));
  for (const [key, value] of Object.entries(output)) {
    if (!["summary", "chart", "checks", "concept", "steps", "inputParameters"].includes(key)) summary.push([key, reportValue(value)]);
  }
  if (summary.length > 1) sheets.push({ name: "결과 요약", rows: summary });
  if (output.chart) {
    if (!Array.isArray(output.chart.series) || output.chart.series.some((point) => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)))
      throw new Error("그래프 데이터 형식이 올바르지 않아 결과를 내보낼 수 없습니다.");
    sheets.push({ name: "그래프 데이터", rows: [[output.chart.xLabel ?? "X", output.chart.yLabel ?? "Y"], ...output.chart.series.map((point) => [...point])] });
  }
  if (Array.isArray(output.checks)) sheets.push({ name: "사양 비교", rows: [["예시 사양", "입력", "가상 비교", "출처"],
    ...output.checks.map((item) => [item.key, reportValue(item.input), checkLabels[item.result] ?? item.result, item.sourceType ?? "정보 없음"])] });
  const raw = JSON.stringify(result, null, 2);
  const characters = Array.from(raw);
  const rawRows: ReportCell[][] = [["구간", "원본 결과 JSON (순서대로 연결)"]];
  for (let i = 0; i < characters.length; i += 16000) rawRows.push([rawRows.length, characters.slice(i, i + 16000).join("")]);
  sheets.push({ name: "원본 결과", rows: rawRows });
  const safeId = String(result.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "result";
  return { title: "가상 시뮬레이션 결과 보고서", filename: `ASTRA_SIM_${safeId}_DEMO`, warning,
    resultId: result.id, chart: output.chart ?? null, sheets };
}

export type SimulationReport = ReturnType<typeof buildSimulationReport>;
