import type { SimulationInput } from "../services/simulationService";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function simulationSceneKind(modelType: string) {
  if (modelType === "SDOF_BASE_EXCITATION") return "vibration";
  if (["CHAMBER_SETPOINT_PROFILE", "AUTOCLAVE_CYCLE_WORKFLOW"].includes(modelType)) return "thermal";
  if (["LINEAR_FORCE_DISPLACEMENT", "PRESS_LOAD_PROFILE"].includes(modelType)) return "load";
  if (modelType === "IMPACT_ENERGY_BUDGET") return "impact";
  return "inspection";
}

export type SceneKind = ReturnType<typeof simulationSceneKind>;

interface SimulationFrame {
  kind: SceneKind;
  progress: number;
  valid: boolean;
  movement: number;
  compression: number;
  label: string;
  value: number | string;
  unit: string;
  temperature?: number;
  secondaryLabel?: string;
  secondaryValue?: number | null;
}

// Presentation time is normalized to a 12-second cycle. Physical frequency is
// shown as a value; movement is deliberately slowed and exaggerated for viewing.
export function simulationFrame(modelType: string, input: SimulationInput | null, progress: number): SimulationFrame {
  // Each model checks its numeric inputs before doing arithmetic.
  const p = (input ?? {}) as Record<string, number>;
  const t = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  const kind = simulationSceneKind(modelType);
  const base = { kind, progress: t, valid: true, movement: 0, compression: 0 } as const;
  const invalid = { ...base, valid: false, label: "입력 조건", value: "정보 없음", unit: "" };
  const finite = (...keys: string[]) => keys.every((key) => Number.isFinite(p[key]));

  if (kind === "vibration") {
    if (!finite("massKg", "fixtureMassKg", "stiffnessNPerM", "dampingRatio", "frequencyMinHz", "frequencyMaxHz") ||
      p.massKg <= 0 || p.fixtureMassKg < 0 || p.stiffnessNPerM <= 0 ||
      p.dampingRatio <= 0 || p.dampingRatio > 1 || p.frequencyMinHz <= 0 || p.frequencyMaxHz <= p.frequencyMinHz) return invalid;
    const natural = Math.sqrt(p.stiffnessNPerM / (p.massKg + p.fixtureMassKg)) / (2 * Math.PI);
    const frequency = p.frequencyMinHz * (p.frequencyMaxHz / p.frequencyMinHz) ** t;
    const ratio = frequency / natural;
    const damping = 2 * p.dampingRatio * ratio;
    const response = Math.sqrt((1 + damping ** 2) / ((1 - ratio ** 2) ** 2 + damping ** 2));
    if (![natural, frequency, response].every(Number.isFinite)) return invalid;
    return { ...base, label: "순회 주파수", value: frequency, unit: "Hz", secondaryLabel: "가상 응답비", secondaryValue: response,
      movement: Math.sin(t * Math.PI * 48) * clamp(response * 0.022, 0.008, 0.16) };
  }
  if (kind === "thermal") {
    const cycleOnly = modelType === "AUTOCLAVE_CYCLE_WORKFLOW";
    if (!finite("targetTempC") || (!cycleOnly && (!finite("startTempC", "rampMin", "holdMin") || p.rampMin < 0 || p.holdMin < 0))) return invalid;
    const ramp = cycleOnly ? 0.35 : p.rampMin / (p.rampMin + p.holdMin || 1);
    const start = cycleOnly ? 20 : p.startTempC;
    const temperature = start + (p.targetTempC - start) * Math.min(1, t / (ramp || 0.00001));
    return { ...base, label: "설정 온도", value: temperature, unit: "°C", temperature,
      secondaryLabel: t < ramp ? "온도 변경 구간" : "설정 온도 유지", secondaryValue: null };
  }
  if (kind === "load") {
    const press = modelType === "PRESS_LOAD_PROFILE";
    if (press ? !finite("targetForceKN", "rampSeconds", "holdSeconds") || p.targetForceKN < 0 || p.rampSeconds < 0 || p.holdSeconds < 0
      : !finite("maxDisplacementMm", "specimenStiffnessNPerMm") || p.maxDisplacementMm < 0 || p.specimenStiffnessNPerMm < 0) return invalid;
    const ramp = press ? p.rampSeconds / (p.rampSeconds + p.holdSeconds || 1) : 1;
    const factor = Math.min(1, t / (ramp || 0.00001));
    const value = press ? p.targetForceKN * factor : p.specimenStiffnessNPerMm * p.maxDisplacementMm * factor;
    if (!Number.isFinite(value)) return invalid;
    return { ...base, label: press ? "설정 하중" : "가상 힘", value, unit: press ? "kN" : "N", compression: factor * 0.22 };
  }
  if (kind === "impact") {
    if (!finite("massKg", "dropHeightM") || p.massKg < 0 || p.dropHeightM < 0) return invalid;
    const energy = p.massKg * 9.80665 * p.dropHeightM;
    if (!Number.isFinite(energy)) return invalid;
    return { ...base, label: "낙하 전 위치에너지", value: energy, unit: "J", movement: p.dropHeightM > 0 ? (1 - Math.min(1, (t / 0.7) ** 2)) * 1.6 : 0 };
  }
  return { ...base, label: "보기 모드", value: "3D 외형", unit: "", secondaryLabel: "이 시험은 외형 확인만 지원합니다." };
}
