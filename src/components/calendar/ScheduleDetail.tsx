import { useEffect, useRef, useState } from "react";
import { X, CalendarDays, Clock3, Building2 } from "lucide-react";
import { useApiQuery } from "../../hooks/useApiQuery";
import { requestService } from "../../services/requestService";
import { reservationStatuses, dateLabel, dayTimeLabel } from "../../domain/calendar";
import { requestStatusLabels, formatDate } from "../../domain/constants";
import { Badge, Button, EmptyState } from "../ui/index";
import ApiState from "../ui/ApiState";
import ReservationControls from "../workflow/ReservationControls";
import { useAuth } from "../../auth/context";
import { ownsOrganization } from "../../auth/permissions";
import { formatRange } from "../../domain/format";

export default function ScheduleDetail({ date, events, busy = [], initialId, eligibleRequests, testName, requestBox, onClose, onRequest }) {
  const dialog = useRef(null);
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState(initialId ?? events[0]?.id ?? null);
  const selected = events.find((event) => event.id === selectedId);
  const query = useApiQuery((signal) => requestService.get(selected.requestId, signal),
    `calendar-detail:${selected?.requestId}`, Boolean(selected));
  const request = query.data;
  const reservation = request?.reservations?.find((item) => item.id === selectedId);
  useEffect(() => { dialog.current.showModal(); }, []);
  return (
    <dialog className="dialog schedule-detail" ref={dialog} aria-labelledby="schedule-detail-title" onClose={onClose}
      onClick={(e) => { if (e.target === dialog.current) dialog.current.close(); }}>
      <header className="schedule-detail__header"><div><h2 id="schedule-detail-title">{dateLabel(date)}</h2><span>{events.length}건의 시험 일정</span></div>
        <button type="button" className="icon-button" aria-label="일정 상세 닫기" onClick={() => dialog.current.close()}><X size={21} /></button></header>
      {busy.length > 0 && <section className="schedule-detail__busy"><h3>선택 장비의 확정 점유 시간</h3><p>이 구간은 예약할 수 없습니다. 다른 기업의 비공개 의뢰 정보는 표시하지 않습니다.</p>{busy.map((interval, index) => <p key={index}>{formatDate(interval.startAt)} ~ {formatDate(interval.endAt)}</p>)}</section>}
      {events.length > 0 ? <div className="schedule-detail__layout">
        <div className="schedule-detail__list" aria-label="선택 날짜의 예약 목록">{events.map((event) => <button type="button" key={event.id} data-reservation-id={event.id} onClick={() => setSelectedId(event.id)} aria-pressed={selectedId === event.id}>
          <span className={`schedule-status schedule-status--${reservationStatuses[event.status].tone}`}>{reservationStatuses[event.status].label}</span>
          <strong>{testName(event.testType)}</strong><span>{event.equipment?.name}</span><small><Clock3 size={14} />{dayTimeLabel(event, date)}</small>
        </button>)}</div>
        <div className="schedule-detail__content">
          {query.loading || query.error ? <ApiState loading={query.loading} error={query.error} onRetry={query.reload} /> : reservation && request ? <>
            <Badge tone={reservationStatuses[reservation.status]?.tone}>{reservationStatuses[reservation.status]?.label}</Badge>
            <h3>{testName(request.revision?.content?.test?.testTypeCode)}</h3>
            <p className="schedule-detail__request-number">{request.requestNo ?? "의뢰번호 확인 필요"}</p>
            <dl className="schedule-detail__facts">
              <div><dt><CalendarDays size={15} />예약 기간</dt><dd>{formatRange(reservation.startAt, reservation.endAt)}</dd></div>
              <div><dt>시험장비</dt><dd>{request.equipment?.name ?? "확인 필요"}</dd></div>
              <div><dt><Building2 size={15} />수행기관</dt><dd>{request.institution?.name ?? "확인 필요"}</dd></div>
              <div><dt>신청 기업</dt><dd>{request.revision?.content?.applicant?.companyName ?? "확인 필요"}</dd></div>
              <div><dt>의뢰 진행</dt><dd>{requestStatusLabels[request.status] ?? "확인 필요"}</dd></div>
              <div><dt>예약 확정 여부</dt><dd>{reservation.status === "CONFIRMED" ? "기관 확인 완료 · 예약 확정" : reservation.status === "CANCELED" ? "취소된 일정" : "미확정 · 기관 확인 필요"}</dd></div>
            </dl>
            <Button variant="secondary" onClick={() => onRequest(request.id, date)}>시험 의뢰 상세보기</Button>
            {["SCHEDULING", "CONFIRMED", "COMPLETED"].includes(request.status) && <fieldset className="schedule-detail__controls" disabled={query.refreshing}>
              <ReservationControls request={request} initialDate={date} canConfirm={user.role === "ADMIN" || (requestBox === "RECEIVED" && ownsOrganization(user, request.institution?.id))} />
            </fieldset>}
          </> : <EmptyState title="예약 정보를 다시 확인해주세요" description="예약이 변경되었거나 더 이상 조회할 수 없습니다." />}
        </div>
      </div> : <EmptyState icon={CalendarDays} title="등록된 시험 일정이 없습니다" description="이 날짜에 조회 가능한 예약이 없습니다. 검토가 완료된 의뢰에서 일정을 제안할 수 있습니다." />}
      {eligibleRequests.length > 0 && <section className="schedule-detail__eligible"><h3>일정 협의가 가능한 의뢰</h3><p>기관 검토를 통과한 의뢰만 표시합니다. 선택한 날짜는 제안서에 입력되며 자동 제출되지 않습니다.</p>
        {eligibleRequests.map((item) => <div key={item.id}><span><strong>{item.equipment?.name}</strong><small>{item.requestNo}</small></span><Button variant="secondary" onClick={() => onRequest(item.id, date)}>일정 신청·협의</Button></div>)}
      </section>}
    </dialog>
  );
}
