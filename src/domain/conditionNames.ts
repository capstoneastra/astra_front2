/** 시험 조건 키의 화면 이름 (GET /test-types/{code} conditionRules.label 기준). 응답에 label이 없을 때 쓴다. */
export const conditionNames: Record<string, string> = {
  sound_level: "측정 소음 범위", accredited_required: "공인성적서", voltage: "시험 전압", current: "시험 전류",
  impact_energy: "충격 에너지", test_load: "시험 하중", stroke: "변위(스트로크)", specimen_material: "시편 재질",
  sample_size_x: "시료 크기 X", sample_size_y: "시료 크기 Y", sample_size_z: "시료 크기 Z", frequency: "주파수 범위",
  test_force: "시험 하중", analysis_item: "분석 항목", daily_sample_count: "하루 시료 수", magnification: "배율",
  resolution: "분해능", temperature: "온도 범위", humidity: "습도 범위", temperature_change_rate: "온도 변화율",
  sample_mass: "시료 질량", fixture_mass: "고정구 질량", excitation_axis: "가진 축", xray_voltage: "관전압",
};
export const conditionName = (key: string) => conditionNames[key] ?? key;
