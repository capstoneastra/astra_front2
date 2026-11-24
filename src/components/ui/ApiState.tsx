import { AlertCircle, LoaderCircle } from "lucide-react";
import { Button, EmptyState } from "./index";

export interface ApiStateProps {
  loading?: boolean;
  error?: { message?: string; status?: number; code?: string } | null;
  onRetry?: () => void;
}

export default function ApiState({ loading = false, error, onRetry }: ApiStateProps) {
  if (error?.code === "LOCAL_WORKSPACE")
    return <EmptyState title="미리보기 모드" description="데이터 조회·업무 처리는 서버 연결 후 이용할 수 있습니다." />;

  const title = loading
    ? "데이터를 불러오고 있습니다"
    : error && ["NETWORK_ERROR", "TIMEOUT"].includes(error.code ?? "")
      ? "서버 연결 대기"
      : error?.status === 403
        ? "403 · 접근 권한이 없습니다"
        : error?.status === 404
          ? "404 · 정보를 찾을 수 없습니다"
          : error?.status === 409
            ? "409 · 요청 상태가 충돌했습니다"
            : error?.code === "TOO_MANY_REQUESTS"
              ? "요청이 많아 잠시 쉬어 갑니다"
            : error?.code === "AI_UPSTREAM_ERROR"
              ? "AI가 응답하지 못했습니다"
            : (error?.status ?? 0) >= 500
              ? "500 · 서버 오류가 발생했습니다"
            : error?.status === 400 || error?.status === 422
              ? "입력한 내용을 확인해주세요"
              : "정보를 불러오지 못했습니다";
  return (
    <div role={loading ? "status" : "alert"} aria-live="polite">
      <EmptyState
        icon={loading ? LoaderCircle : AlertCircle}
        title={title}
        description={
          loading
            ? "서버 응답을 기다리고 있습니다."
            : (error?.message ?? "잠시 후 다시 시도해주세요.")
        }
      >
        {!loading && onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            다시 시도
          </Button>
        )}
      </EmptyState>
    </div>
  );
}
