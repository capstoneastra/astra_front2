import { useWorkspace } from "../context/AppContext";
import Matching from "./Matching";
import Reservation from "./Reservation";
import type { RequestBox } from "../services/contracts";

// 시험 맡기기: 조건 → 추천 장비 → 의뢰서 (5단계에서 하나의 흐름으로 합친다)
export default function RequestFlow({ setActiveMenu }: {
  setActiveMenu: (menu: string) => void;
  openRequest: (box: RequestBox, requestId?: number) => void;
}) {
  const { draftRequestId, selectedEquipment } = useWorkspace();
  if (draftRequestId || selectedEquipment) return <Reservation setActiveMenu={setActiveMenu} />;
  return <Matching setActiveMenu={setActiveMenu} />;
}
