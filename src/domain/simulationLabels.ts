/** 가상 시험 입력값·결과값의 화면 이름. 백엔드 SimulationEngine의 키와 맞춘다. */
export const simulationLabels: Record<string, string> = {
  // 입력
  massKg: "시료 질량 (kg)",
  fixtureMassKg: "고정구 질량 (kg)",
  stiffnessNPerM: "강성 (N/m)",
  dampingRatio: "감쇠비 (0 초과~1)",
  frequencyMinHz: "시작 주파수 (Hz)",
  frequencyMaxHz: "종료 주파수 (Hz)",
  startTempC: "시작 온도 (°C)",
  targetTempC: "목표 온도 (°C)",
  rampMin: "온도 올리는 시간 (분)",
  holdMin: "유지 시간 (분)",
  rampSeconds: "가속 시간 (초)",
  holdSeconds: "유지 시간 (초)",
  targetHumidityPct: "목표 습도 (%)",
  dropHeightM: "낙하 높이 (m)",
  targetForceKN: "목표 하중 (kN)",
  specimenStiffnessNPerMm: "시편 강성 (N/mm)",
  maxForceN: "최대 하중 (N)",
  maxDisplacementMm: "최대 변위 (mm)",
  thicknessMm: "두께 (mm)",
  attenuationCoefficientPerMm: "감쇠 계수 (1/mm)",
  partWidthMm: "부품 폭 (mm)",
  partDepthMm: "부품 깊이 (mm)",
  targetDistanceMm: "측정 거리 (mm)",
  targetFrequencyGHz: "측정 주파수 (GHz)",
  capacityAh: "배터리 용량 (Ah)",
  currentA: "전류 (A)",
  voltageV: "전압 (V)",
  initialSocPct: "시작 충전량 (%)",
  durationHours: "시험 시간 (시간)",
  // 결과
  naturalFrequencyHz: "고유진동수 (Hz)",
  totalMassKg: "전체 질량 (kg)",
  peakTransmissibility: "최대 전달률 (배)",
  resonanceInRange: "시험 범위 안 공진",
  amplificationBandHz: "진동이 커지는 구간 (Hz)",
  amplitudeRatio: "진폭 비",
  totalMin: "전체 소요 (분)",
  totalSeconds: "전체 소요 (초)",
  durationMinutes: "소요 시간 (분)",
  rampRateCPerMin: "온도 변화 속도 (°C/분)",
  energyJ: "충격 에너지 (J)",
  impactVelocityMps: "충돌 속도 (m/s)",
  peakForceKN: "최대 하중 (kN)",
  loadRateKNPerS: "하중 증가 속도 (kN/s)",
  halfValueLayerMm: "반가층 두께 (mm)",
  transmissionRatio: "투과율",
  finalSocPct: "끝 충전량 (%)",
  mode: "동작",
};

const modeLabels: Record<string, string> = { CHARGE: "충전", DISCHARGE: "방전" };

export const simulationLabel = (key: string) => simulationLabels[key] ?? key;

/** 결과값을 읽기 쉬운 글로: 참/거짓, 범위, 모드, 긴 소수 */
export function simulationValue(value: unknown): string {
  if (value == null) return "해당 없음";
  if (typeof value === "boolean") return value ? "있음" : "없음";
  if (typeof value === "number") return value.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
  if (typeof value === "string") return modeLabels[value] ?? value;
  if (typeof value === "object" && value && "min" in value && "max" in value)
    return `${simulationValue((value as { min: unknown }).min)} ~ ${simulationValue((value as { max: unknown }).max)}`;
  return JSON.stringify(value);
}
