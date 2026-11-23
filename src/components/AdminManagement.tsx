import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/context";
import { Button, FormField, PageHeader, Panel } from "./ui/index";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAction } from "../hooks/useAction";
import { adminService } from "../services/adminService";
import { DemoNotice, Feedback } from "./workflow/Feedback";
import { accountStatusLabels, roleLabels } from "../domain/constants";
import ApiState from "./ui/ApiState";
import type { ApprovalFocus } from "../hooks/useWorkspaceNavigation";
import DuplicateEquipment from "./DuplicateEquipment";

const organizationTypeLabels = {
  COMPANY: "기업",
  INSTITUTION: "기관",
  UNIVERSITY: "대학",
};

export default function AdminManagement({ approvalFocus, initialTab = "approvals", setActiveMenu }: {
  approvalFocus?: ApprovalFocus;
  initialTab?: "approvals" | "duplicates";
  setActiveMenu: (menu: string) => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const tabs = <div className="segmented" role="group" aria-label="관리 화면">
    <button type="button" aria-pressed={tab === "approvals"} onClick={() => setTab("approvals")}>회원·기관 승인</button>
    <button type="button" aria-pressed={tab === "duplicates"} onClick={() => setTab("duplicates")}>중복·유사 장비</button>
  </div>;
  if (tab === "duplicates")
    return <div className="content-page page-enter">
      <PageHeader title="관리">{tabs}</PageHeader>
      <DuplicateEquipment setActiveMenu={setActiveMenu} embedded />
    </div>;
  return <AdminApprovals approvalFocus={approvalFocus} tabs={tabs} />;
}

function AdminApprovals({ approvalFocus, tabs }: { approvalFocus?: ApprovalFocus; tabs: ReactNode }) {
  const { user } = useAuth(),
    [status, setStatus] = useState(approvalFocus === "members" ? "PENDING" : ""),
    [unverifiedOnly, setUnverifiedOnly] = useState(approvalFocus === "organizations"),
    [reasons, setReasons] = useState({}),
    action = useAction();
  const members = useApiQuery(
      (signal) => adminService.users(status ? { status } : {}, signal),
      `admin-users:${status}`,
    ),
    organizations = useApiQuery(
      async (signal) => {
        if (!unverifiedOnly) return (await adminService.organizations({}, signal)).content;
        const pages = await Promise.all(["INSTITUTION", "UNIVERSITY"].map((orgType) =>
          adminService.organizations({ orgType, verified: false }, signal)));
        return pages.flatMap((page) => page.content).filter((organization) => !organization.isVerified);
      },
      `admin-organizations:${unverifiedOnly}`,
    );
  const organizationRows = organizations.data ?? [];

  useEffect(() => {
    if (approvalFocus !== "organizations") return;
    const panel = document.getElementById("organization-approvals");
    panel?.focus({ preventScroll: true });
    panel?.scrollIntoView({ block: "start" });
  }, [approvalFocus]);
  return (
    <div className="content-page page-enter">
      <PageHeader title="관리">{tabs}</PageHeader>
      <DemoNotice />
      <Panel className="form-panel">
        <FormField id="admin-status" label="계정 상태">
          <select
            id="admin-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">전체 상태</option>
            {Object.entries(accountStatusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
      </Panel>
      <Feedback action={action} />
      <Panel className="form-panel" title="회원 관리">
        {members.loading || members.error ? (
          <ApiState
            loading={members.loading}
            error={members.error}
            onRetry={members.reload}
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>계정</th>
                  <th>역할·소속</th>
                  <th>상태</th>
                  <th>처리</th>
                </tr>
              </thead>
              <tbody>
                {members.data?.content.map((member) => (
                  <tr key={member.id}>
                    <td>
                      {member.name}
                      <small>{member.email}</small>
                    </td>
                    <td>
                      {roleLabels[member.role]}
                      <small>{member.organization?.name ?? "플랫폼"}</small>
                    </td>
                    <td>{accountStatusLabels[member.status]}</td>
                    <td>
                      {member.status === "PENDING" ? (
                        <>
                          <Button
                            disabled={action.busy}
                            onClick={() =>
                              action.run(
                                () => adminService.approve(member.id),
                                "회원을 승인했습니다.",
                              )
                            }
                          >
                            승인
                          </Button>
                          <input
                            aria-label={`거절 사유 ${member.email}`}
                            placeholder="거절 사유"
                            value={reasons[member.id] ?? ""}
                            onChange={(e) =>
                              setReasons({
                                ...reasons,
                                [member.id]: e.target.value,
                              })
                            }
                          />
                          <Button
                            variant="danger"
                            disabled={
                              action.busy || !reasons[member.id]?.trim()
                            }
                            onClick={() =>
                              action.run(
                                () =>
                                  adminService.reject(
                                    member.id,
                                    reasons[member.id],
                                  ),
                                "가입을 거절했습니다.",
                              )
                            }
                          >
                            거절
                          </Button>
                        </>
                      ) : ["ACTIVE", "SUSPENDED"].includes(member.status) &&
                        member.id !== user.id ? (
                        <Button
                          variant="secondary"
                          disabled={action.busy}
                          onClick={() =>
                            action.run(
                              () =>
                                adminService.status(
                                  member.id,
                                  member.status === "ACTIVE"
                                    ? "SUSPENDED"
                                    : "ACTIVE",
                                ),
                              "계정 상태를 변경했습니다.",
                            )
                          }
                        >
                          {member.status === "ACTIVE"
                            ? "이용 정지"
                            : "정지 해제"}
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {members.data?.totalElements === 0 && (
          <p>해당 상태의 회원이 없습니다.</p>
        )}
      </Panel>
      <Panel id="organization-approvals" tabIndex={-1} className="form-panel" title="기관 승인 현황"
        action={<label className="equipment-card__compare"><input type="checkbox" checked={unverifiedOnly}
          onChange={(event) => setUnverifiedOnly(event.target.checked)} />미승인 기관·대학만</label>}>
        {organizations.loading || organizations.error ? (
          <ApiState
            loading={organizations.loading}
            error={organizations.error}
            onRetry={organizations.reload}
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>기관·기업</th>
                  <th>유형</th>
                  <th>승인 상태</th>
                  <th>처리</th>
                </tr>
              </thead>
              <tbody>
                {organizationRows.map((org) => (
                  <tr key={org.id}>
                    <td>{org.name}</td>
                    <td>{organizationTypeLabels[org.orgType] ?? org.orgType}</td>
                    <td>{org.isVerified ? "승인" : "확인 필요"}</td>
                    <td>
                      {["INSTITUTION", "UNIVERSITY"].includes(org.orgType) && !org.isVerified ? (
                        <Button
                          disabled={action.busy}
                          onClick={() =>
                            action.run(
                              () => adminService.verify(org.id),
                              "기관을 승인했습니다.",
                            )
                          }
                        >
                          기관 승인
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!organizations.loading && !organizations.error && !organizationRows.length && <p>조회된 기관이 없습니다.</p>}
      </Panel>
    </div>
  );
}
