const steps = [
  ["시험조건 정리", "시험항목과 시료 질량·크기, 시험 범위를 정리합니다."],
  ["장비 찾기·비교", "조건에 맞는 장비를 찾고 사양·예상 비용을 비교합니다."],
  ["시험 의뢰", "장비를 가진 기관에 의뢰서를 제출합니다."],
  ["검토·일정·결과", "기관 검토와 일정 조율을 거쳐 시험 결과와 성적서를 받습니다."],
];

/** 로그인 카드 안의 접이식 이용 안내 */
export default function LoginGuide() {
  return (
    <details className="login-howto">
      <summary>처음이신가요? 이용 순서 보기</summary>
      <ol>
        {steps.map(([title, description]) => (
          <li key={title}><strong>{title}</strong> {description}</li>
        ))}
      </ol>
      <p>시험 가능 여부와 비용·일정은 기관 검토 후 확정됩니다.</p>
    </details>
  );
}
