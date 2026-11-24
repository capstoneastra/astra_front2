/**
 * 의뢰 진행 단계. 대시보드 숫자와 그 숫자를 눌러 여는 의뢰 목록이 같은 묶음을 쓴다.
 * id는 의뢰 목록의 상태 필터 값으로 그대로 넘긴다.
 */
export interface RequestStage {
  id: string;
  label: string;
  statuses: string[];
}

export const requestStages: RequestStage[] = [
  { id: "DRAFT", label: "작성 중", statuses: ["DRAFT"] },
  { id: "IN_REVIEW", label: "접수·검토", statuses: ["SUBMITTED", "UNDER_REVIEW", "RESUBMITTED"] },
  { id: "SUPPLEMENT_REQUESTED", label: "보완 요청", statuses: ["SUPPLEMENT_REQUESTED"] },
  { id: "SCHEDULING", label: "일정 협의", statuses: ["SCHEDULING"] },
  { id: "CONFIRMED", label: "예약 확정", statuses: ["CONFIRMED"] },
  { id: "COMPLETED", label: "시험 완료", statuses: ["COMPLETED"] },
  { id: "CLOSED", label: "반려·취소", statuses: ["REJECTED", "CANCELED"] },
];

/** 상태 여러 개를 묶은 단계만 (개별 상태 선택지와 겹치지 않는 것) */
export const groupedStages = requestStages.filter((stage) => stage.statuses.length > 1);
