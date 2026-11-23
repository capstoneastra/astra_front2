import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { User } from "../services/authService";
import type { Equipment } from "../services/equipmentService";
import type { useApiQuery } from "../hooks/useApiQuery";
import type { MatchRun, ResourceId } from "../services/contracts";

type Setter<T> = Dispatch<SetStateAction<T>>;

interface WorkspaceContext {
  testCondition: string;
  setTestCondition: Setter<string>;
  selectedEquipment: Equipment | null;
  setSelectedEquipment: Setter<Equipment | null>;
  equipmentList: Equipment[];
  catalogQuery: ReturnType<typeof useApiQuery<Equipment[]>>;
  user: User;
  /** 우리 조직이 장비를 1대 이상 가졌는지 (관리자는 항상 true) */
  ownsEquipment: boolean;
  resolveEquipment: (id: ResourceId, signal?: AbortSignal) => Promise<Equipment | undefined>;
  requirementId: number | null;
  setRequirementId: Setter<number | null>;
  chatSessionId: number | null;
  setChatSessionId: Setter<number | null>;
  matchRun: MatchRun | null;
  setMatchRun: Setter<MatchRun | null>;
  draftRequestId: number | null;
  setDraftRequestId: Setter<number | null>;
  comparisonIds: number[];
  setComparisonIds: Setter<number[]>;
  testTypeCode: string;
  setTestTypeCode: Setter<string>;
  simulationEquipmentId: number | null;
  setSimulationEquipmentId: Setter<number | null>;
  autoRunId: number | null;
  setAutoRunId: Setter<number | null>;
  openSimulation: (id: number) => void;
  openTestInfo: (code: string) => void;
}

export const AppContext = createContext<WorkspaceContext | null>(null);

export function useWorkspace() {
  const workspace = useContext(AppContext);
  if (!workspace) throw new Error("AppContext.Provider가 필요합니다.");
  return workspace;
}
