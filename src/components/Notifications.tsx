import { useState } from "react";
import { List, ListItem } from "@astryxdesign/core/List";
import { Badge as AxBadge } from "@astryxdesign/core/Badge";
import { Text } from "@astryxdesign/core/Text";
import { HStack } from "@astryxdesign/core/HStack";
import { Button, PageHeader, Panel } from "./ui/index";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { notificationService } from "../services/notificationService";
import { Feedback } from "./workflow/Feedback";
import { formatDate } from "../domain/constants";
import ApiState from "./ui/ApiState";
import { notificationTypeLabels, useOpenNotification } from "../domain/notifications";

export default function Notifications({ onOpenRequest }: { onOpenRequest: (requestId: number) => void }) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useApiQuery((signal) => notificationService.list({ unreadOnly }, signal), `notifications:${unreadOnly}`);
  const action = useAction();
  const open = useOpenNotification(onOpenRequest);
  const items = query.data?.content ?? [];
  const unread = items.filter((item) => !item.isRead).length;
  return (
    <div className="content-page content-page--narrow page-enter">
      <PageHeader title="업무 알림" description={query.data ? `${query.data.totalElements}건` : undefined}>
        <div className="segmented" role="group" aria-label="보기">
          <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>전체</button>
          <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>안 읽은 알림</button>
        </div>
        <Button variant="secondary" disabled={action.busy || unread === 0}
          onClick={() => action.run(() => notificationService.readAll(), "모든 알림을 읽음으로 표시했습니다.")}>모두 읽음</Button>
      </PageHeader>
      <Feedback action={action} />
      <Panel>
        {query.loading || query.error ? <ApiState loading={query.loading} error={query.error} onRetry={query.reload} /> :
          items.length === 0 ? <p className="inline-empty">{unreadOnly ? "안 읽은 알림이 없습니다." : "알림이 없습니다."}</p> :
          <List hasDividers density="compact">
            {items.map((item) => <ListItem key={item.id} itemKey={item.id} onClick={() => void open(item)}
              label={<Text weight={item.isRead ? "normal" : "semibold"} color={item.isRead ? "secondary" : "primary"}>{item.title}</Text>}
              description={[item.body, formatDate(item.createdAt)].filter(Boolean).join(", ")}
              endContent={<HStack gap={1} vAlign="center">
                <AxBadge variant="neutral" label={notificationTypeLabels[item.type] ?? "알림"} />
                {!item.isRead && <AxBadge variant="orange" label="새 알림" />}
              </HStack>} />)}
          </List>}
      </Panel>
    </div>
  );
}
