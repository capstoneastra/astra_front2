import { useEffect, useState } from "react";
import { useAction } from "../../hooks/useAction";
import { useApiQuery } from "../../hooks/useApiQuery";
import { requestService } from "../../services/requestService";
import { Button, FormField } from "../ui/index";
import { Feedback } from "./Feedback";
import ApiState from "../ui/ApiState";
import { invalidateData } from "../../api/cache";
import { overlaps } from "../../domain/calendar";
import { formatRange } from "../../domain/format";
export default function ReservationControls({ request, initialDate, canConfirm }) {
  const [startAt, setStart] = useState(initialDate ? `${initialDate}T09:00` : ""),
    [endAt, setEnd] = useState(initialDate ? `${initialDate}T18:00` : ""),
    [note, setNote] = useState(""),
    action = useAction();
  const busy = useApiQuery(
    (signal) => requestService.availability(request.equipment.id, {}, signal),
    `availability:${request.equipment.id}`,
  );
  const scheduling = request.status === "SCHEDULING";
  useEffect(() => {
    // A concurrent confirmation/version change must invalidate both the request and busy intervals.
    if (action.error?.status === 409) invalidateData();
  }, [action.error]);
  const availabilityBlocked = busy.loading || busy.refreshing || Boolean(busy.error);
  const start = Date.parse(startAt ? `${startAt}+09:00` : ""),
    end = Date.parse(endAt ? `${endAt}+09:00` : ""),
    valid = Number.isFinite(start) && Number.isFinite(end) && start < end;
  const overlap =
    valid &&
    busy.data?.some(
      (r) => start < Date.parse(r.endAt) && end > Date.parse(r.startAt),
    );
  const body = () => ({
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    note,
  });
  return (
    <section>
      <h3>예약 일정 협의</h3>
      <p className="field-hint">
        일정은 한국 시간으로 표시합니다. 최종 예약 확정은 시험기관에서 할 수
        있습니다.
      </p>
      {(busy.loading || busy.error) && (
        <ApiState
          loading={busy.loading}
          error={busy.error}
          onRetry={busy.reload}
        />
      )}
      {busy.data?.length > 0 && (
        <div className="content-note">
          <div>
            <strong>이 장비의 확정된 구간</strong>
            {busy.data.map((r, i) => (
              <p key={i}>
                {formatRange(r.startAt, r.endAt)}
              </p>
            ))}
          </div>
        </div>
      )}
      {scheduling && (
        <>
          <div className="form-grid">
            <FormField id="reservation-start" label="시작 시간">
              <input
                id="reservation-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStart(e.target.value)}
                disabled={action.busy}
              />
            </FormField>
            <FormField id="reservation-end" label="종료 시간">
              <input
                id="reservation-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEnd(e.target.value)}
                disabled={action.busy}
              />
            </FormField>
            <FormField
              id="reservation-note"
              label="일정 협의 메모"
              className="form-field--full"
            >
              <input
                id="reservation-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </FormField>
          </div>
          {overlap && (
            <p className="content-note" role="alert">
              이미 확정된 예약과 겹칩니다. 다른 시간대를 선택해주세요.
            </p>
          )}
          {startAt && endAt && !valid && (
            <p role="alert">종료 시간은 시작 시간보다 뒤여야 합니다.</p>
          )}
          <div className="form-actions">
            <Button
              disabled={
                !valid ||
                overlap ||
                busy.loading ||
                busy.refreshing ||
                Boolean(busy.error) ||
                action.busy
              }
              onClick={() =>
                action.run(
                  (signal) =>
                    requestService.propose(request.id, request.version, body(), signal),
                  "일정을 제안했습니다. 아직 확정되지 않았습니다.",
                )
              }
            >
              일정 제안
            </Button>
          </div>
        </>
      )}
      <div className="request-list">
        {request.reservations.map((r) => {
          const conflicting = busy.data?.some((interval) => overlaps(r, interval));
          return (
          <div className="content-note" key={r.id}>
            <div>
              <strong>
                {formatRange(r.startAt, r.endAt)}
              </strong>
              <p>
                {
                  {
                    PROPOSED: "제안",
                    COUNTER_PROPOSED: "대안 제안",
                    CONFIRMED: "확정",
                    CANCELED: "취소",
                  }[r.status]
                }{" "}
                · {r.note}
              </p>
              <div className="form-actions">
                {scheduling &&
                  ["PROPOSED", "COUNTER_PROPOSED"].includes(r.status) && (
                    <>
                      <Button
                        variant="secondary"
                        disabled={!valid || overlap || availabilityBlocked || action.busy}
                        onClick={() =>
                          action.run(
                            (signal) =>
                              requestService.reservationAction(
                                r.id,
                                "counter",
                                request.version,
                                body(),
                                signal,
                              ),
                            "대안 일정을 제안했습니다.",
                          )
                        }
                      >
                        입력한 시간으로 대안 제안
                      </Button>
                      {canConfirm && (
                        <Button
                          disabled={action.busy || availabilityBlocked || conflicting}
                          onClick={() =>
                            action.run(
                              (signal) =>
                                requestService.reservationAction(
                                  r.id,
                                  "confirm",
                                  request.version,
                                  {},
                                  signal,
                                ),
                              "예약을 확정했습니다.",
                            )
                          }
                        >
                          예약 확정
                        </Button>
                      )}
                      {conflicting && <p role="status">이 제안은 장비의 확정 예약과 겹쳐 확정할 수 없습니다. 다른 시간으로 대안을 제안해주세요.</p>}
                    </>
                  )}
                {r.status !== "CANCELED" && request.status !== "COMPLETED" && (
                  <Button
                    variant="danger"
                    disabled={action.busy}
                    onClick={() =>
                      action.run(
                        (signal) =>
                          requestService.reservationAction(
                            r.id,
                            "cancel",
                            request.version,
                            {},
                            signal,
                          ),
                        "예약 일정을 취소했습니다.",
                      )
                    }
                  >
                    일정 취소
                  </Button>
                )}
              </div>
            </div>
          </div>
        );})}
      </div>
      <Feedback action={action} />
    </section>
  );
}
