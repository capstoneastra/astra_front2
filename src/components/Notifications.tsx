import { Button, PageHeader, Panel } from "./ui/index";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { notificationService } from "../services/notificationService";
import { DemoNotice, Feedback } from "./workflow/Feedback";
import { formatDate } from "../domain/constants";
import ApiState from "./ui/ApiState";
export default function Notifications() {
  const query = useApiQuery(
      (signal) => notificationService.list(signal),
      "notifications",
    ),
    action = useAction();
  return (
    <div className="content-page page-enter">
      <PageHeader
        title="업무 알림"
      >
        <Button
          variant="secondary"
          disabled={action.busy || !query.data?.content.some((n) => !n.isRead)}
          onClick={() => action.run(() => notificationService.readAll())}
        >
          모두 읽음
        </Button>
      </PageHeader>
      <DemoNotice />
      {(query.loading || query.error) && (
        <ApiState
          loading={query.loading}
          error={query.error}
          onRetry={query.reload}
        />
      )}
      <Feedback action={action} />
      {query.data?.content.map((n) => (
        <Panel
          key={n.id}
          className="form-panel"
          title={n.message}
          description={formatDate(n.createdAt)}
          action={
            <Button
              variant="secondary"
              disabled={n.isRead || action.busy}
              onClick={() => action.run(() => notificationService.read(n.id))}
            >
              {n.isRead ? "읽음" : "읽음 표시"}
            </Button>
          }
        />
      ))}
      {query.data?.totalElements === 0 && (
        <Panel className="form-panel">
          <p>새로운 업무 알림이 없습니다.</p>
        </Panel>
      )}
    </div>
  );
}
