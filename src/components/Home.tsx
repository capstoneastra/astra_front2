import { RefreshCw } from "lucide-react";
import { useWorkspace } from "../context/AppContext";
import { useAuth } from "../auth/context";
import { invalidateData } from "../api/cache";
import type { RequestBox } from "../services/contracts";
import type { ApprovalFocus } from "../hooks/useWorkspaceNavigation";
import { Button, PageHeader } from "./ui";
import CompanyDashboard from "./dashboard/CompanyDashboard";
import InstitutionDashboard from "./dashboard/InstitutionDashboard";
import AdminDashboard from "./dashboard/AdminDashboard";

interface HomeProps {
  setActiveMenu: (menu: string) => void;
  onSearch: (query: string, options?: { institutionId: number }) => void;
  openRequest: (box: RequestBox, requestId?: number, status?: string) => void;
  openApprovals: (focus: ApprovalFocus) => void;
}

export default function Home(props: HomeProps) {
  const { user } = useWorkspace();
  const local = useAuth().status === "local";
  const role = user.role;
  return <div className="work-dashboard page-enter">
    <PageHeader title="대시보드" description={user.organization?.name ?? "플랫폼 관리자"}>
      <Button variant="ghost" icon={RefreshCw} aria-label="새로고침" title="새로고침" disabled={local} onClick={invalidateData} />
    </PageHeader>
    {role === "COMPANY_USER" ? <CompanyDashboard {...props} /> :
      role === "INSTITUTION_MANAGER" ? <InstitutionDashboard {...props} /> : <AdminDashboard {...props} />}
  </div>;
}
