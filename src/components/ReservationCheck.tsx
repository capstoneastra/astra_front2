import { useState } from "react";
import { Building2, ClipboardList, Info, CalendarDays, Plus } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { Badge, Button, EmptyState, PageHeader, Panel } from "./ui";
import { useApiQuery } from "../hooks/useApiQuery";
import { requestService } from "../services/requestService";
import RequestDetailDialog from "./workflow/RequestDetailDialog";
import ApiState from "./ui/ApiState";
import { requestStatusLabels, formatDate } from "../domain/constants";
import type { RequestBox } from "../services/contracts";
import { canAccessMenu } from "../auth/permissions";

export default function ReservationCheck({
  setActiveMenu,
  openCalendar,
  initialStatus = "",
  initialRequestId = undefined,
  institutionView = false,
}: {
  setActiveMenu: (menu: string) => void;
  openCalendar: (box?: RequestBox) => void;
  initialStatus?: string;
  initialRequestId?: number;
  institutionView?: boolean;
}) {
  const { user, setDraftRequestId, setSelectedEquipment, equipmentList } =
    useWorkspace();
  const [selected, setSelected] = useState<number | null>(initialRequestId ?? null),
    [status, setStatus] = useState(initialStatus);
  const admin = user.role === "ADMIN";
  const received = institutionView && !admin;
  const box: RequestBox | undefined = admin ? undefined : received ? "RECEIVED" : "SENT";
  const query = useApiQuery(
    async (signal) => {
      if (received && status === "REVIEW_QUEUE") {
        const pages = await Promise.all(["SUBMITTED", "RESUBMITTED"].map((stage) => requestService.list({ box, status: stage }, signal)));
        return { content: pages.flatMap((page) => page.content), totalElements: pages.reduce((sum, page) => sum + page.totalElements, 0) };
      }
      return requestService.list({ ...(box && { box }), ...(status && { status }) }, signal);
    },
    `requests:${user.id}:${box ?? "ALL"}:${status}`,
  );
  const reservations = query.data?.content ?? [];

  return (
    <div className="content-page page-enter">
      <PageHeader
        eyebrow="MY TEST REQUESTS"
        title="시험 의뢰 관리"
        description={admin ? "전체 시험 의뢰와 진행 상태를 확인하세요." : received ? "소속 조직의 장비로 접수된 의뢰를 검토하세요." : "신청한 시험 의뢰와 진행 상태를 확인하세요."}
      >
        <Button variant="secondary" icon={CalendarDays} onClick={() => openCalendar(box)}>예약 캘린더</Button>
        {canAccessMenu(user.role, "request") && (
          <Button icon={Plus} onClick={() => {
            setDraftRequestId(null);
            setSelectedEquipment(null);
            setActiveMenu("request");
          }}>새 시험 의뢰</Button>
        )}
        <Badge tone="cyan">
          {query.loading ? "조회 중" : (query.data?.totalElements ?? "—")}건
        </Badge>
      </PageHeader>
      <div className="content-note">
        <Info size={16} />
        <span>
          소속 기업·기관의 의뢰만 조회합니다.{" "}
          제출·검토·보완·예약은 각각 별도 상태로 관리합니다.
        </span>
      </div>
      <Panel className="search-toolbar">

        <label htmlFor="requests-status">진행 상태</label>
        <select
          id="requests-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">전체 상태</option>
          {received && <option value="REVIEW_QUEUE">검토 대기 (신규·재제출)</option>}
          {Object.entries(requestStatusLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Panel>
      {query.loading || query.error ? (
        <Panel>
          <ApiState
            loading={query.loading}
            error={query.error}
            onRetry={query.reload}
          />
        </Panel>
      ) : reservations.length === 0 ? (
        <Panel>
          <EmptyState
            icon={ClipboardList}
            title={received ? "접수된 시험 의뢰가 없습니다" : "조회된 시험 의뢰가 없습니다"}
            description={status ? "다른 진행 상태를 선택해 보세요." : undefined}
          />
        </Panel>
      ) : (
        <div className="request-list">
          {reservations.map((item) => (
            <Panel className="request-card" key={item.id}>
              <div className="request-card__header">
                <span className="request-card__number">
                  REQUEST / {item.id}
                </span>
                <div>
                  <Badge tone="amber" dot>
                    {requestStatusLabels[item.status] ?? item.status}
                  </Badge>
                  <Button
                    variant="secondary"
                    onClick={() => setSelected(item.id)}
                  >
                    의뢰 상세
                  </Button>
                </div>
              </div>
              <h2>{item.equipment?.name || item.title || item.requestNo}</h2>
              <p className="request-card__institution">
                <Building2 size={14} />
                {item.institution?.name || "보유기관 미입력"}
              </p>
              <div className="request-card__dates">
                <div>
                  <span>신청일</span>
                  {formatDate(item.createdAt)}
                </div>
                <div>
                  <span>희망 시험일</span>
                  <strong>
                    {item.revision?.content?.schedule?.desiredStartDate ||
                      "기관 협의"}
                  </strong>
                </div>
              </div>
              <div className="request-card__condition">
                <span>요청 시험조건</span>
                <p>{item.revision?.content?.test?.purpose || "확인 필요"}</p>
                <p>
                  {item.revision?.revisionNo != null && `제출본 ${item.revision.revisionNo} · `}{item.requestNo}
                </p>
                {!received && item.status === "DRAFT" && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDraftRequestId(item.id);
                      setSelectedEquipment(
                        equipmentList.find((e) => e.id === item.equipment?.id) ??
                          null,
                      );
                      setActiveMenu("request");
                    }}
                  >
                    초안 이어서 작성
                  </Button>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
      {selected && (
        <RequestDetailDialog
          key={selected}
          requestId={selected}
          requestBox={box}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
