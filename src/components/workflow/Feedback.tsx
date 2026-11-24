import { Info } from "lucide-react";
import ApiState from "../ui/ApiState";
import type { ApiStateProps } from "../ui/ApiState";
import type { ReactNode } from "react";

export function Feedback({ action, onRetry }: {
  action: { error: ApiStateProps["error"]; message: string };
  onRetry?: ApiStateProps["onRetry"];
}) {
  return (
    <>
      {action.error && <ApiState error={action.error} onRetry={onRetry} />}{" "}
      {action.message && (
        <p className="content-note" role="status">
          {action.message}
        </p>
      )}
    </>
  );
}
export function DemoNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="content-note content-note--quiet">
      <Info size={13} aria-hidden="true" />
      <span>최종 시험 가능 여부와 일정은 시험기관이 확인합니다.{children && <> {children}</>}</span>
    </p>
  );
}
