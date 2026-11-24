import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, LogOut, Save } from "lucide-react";
import { useAuth } from "../auth/context";
import { useAction } from "../hooks/useAction";
import { authService } from "../services/authService";
import { roleLabels, formatDate } from "../domain/constants";
import { Badge, Button, PageHeader, Panel } from "./ui";
import { Feedback } from "./workflow/Feedback";
import { TextInput } from "@astryxdesign/core/TextInput";
import { HStack } from "@astryxdesign/core/HStack";

/** 비밀번호 변경(PATCH /users/me/password). 새 비밀번호 규칙은 회원가입과 같다(8~72자). */
function PasswordSection({ disabled }: { disabled: boolean }) {
  const empty = { currentPassword: "", newPassword: "", confirm: "" };
  const [form, setForm] = useState(empty);
  const [touched, setTouched] = useState(false);
  const action = useAction();
  const serverErrors = action.error?.details?.fieldErrors ?? {};
  const errors = {
    currentPassword: serverErrors.currentPassword ?? (touched && !form.currentPassword ? "현재 비밀번호를 입력해주세요." : undefined),
    newPassword: serverErrors.newPassword ?? (touched && form.newPassword.length < 8 ? "8자 이상 입력해주세요." :
      touched && form.newPassword === form.currentPassword ? "지금 쓰는 비밀번호와 다르게 정해주세요." : undefined),
    confirm: touched && form.confirm !== form.newPassword ? "새 비밀번호와 같게 입력해주세요." : undefined,
  };
  const ready = form.currentPassword && form.newPassword.length >= 8 && form.newPassword.length <= 72 &&
    form.newPassword === form.confirm && form.newPassword !== form.currentPassword;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!ready) return;
    void action.run(async (signal) => {
      await authService.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword }, signal);
      setForm(empty);
      setTouched(false);
    }, "비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요.");
  };
  const field = (key: keyof typeof empty, label: string, autoComplete: string) =>
    <TextInput key={key} label={label} type="password" isRequired autoComplete={autoComplete} value={form[key]} isDisabled={disabled} width="100%"
      onChange={(value) => setForm({ ...form, [key]: value })}
      status={errors[key] ? { type: "error", message: errors[key] } : undefined} />;
  return <Panel title="비밀번호 변경">
    <form className="profile-form" onSubmit={submit} noValidate>
      <HStack gap={4} wrap="wrap" className="profile-grid">
        {field("currentPassword", "현재 비밀번호", "current-password")}
        {field("newPassword", "새 비밀번호 (8자 이상)", "new-password")}
        {field("confirm", "새 비밀번호 확인", "new-password")}
      </HStack>
      {/* 칸 밑에 이미 보여 준 오류는 아래에 한 번 더 띄우지 않는다 */}
      <Feedback action={{ ...action, error: action.error?.details?.fieldErrors ? null : action.error }} />
      <div className="form-actions">
        <span className="small-note">{disabled ? "미리보기 모드에서는 바꿀 수 없습니다." : ""}</span>
        <Button type="submit" icon={KeyRound} disabled={disabled || action.busy}>비밀번호 변경</Button>
      </div>
    </form>
  </Panel>;
}

const orgTypeLabels: Record<string, string> = { COMPANY: "기업", INSTITUTION: "기관", UNIVERSITY: "대학" };

/**
 * 내 정보: 이름·연락처 수정(PATCH /users/me). 이메일·소속·역할은 바꿀 수 없어 읽기 전용으로 보여 준다.
 */
export default function Profile() {
  const { user, logout, updateUser, status } = useAuth();
  const [form, setForm] = useState({ name: user.name, phone: user.phone ?? "" });
  const action = useAction();
  const local = status === "local";
  const changed = form.name.trim() !== user.name || form.phone.trim() !== (user.phone ?? "");
  const nameError = !form.name.trim() ? "이름을 입력해주세요." : undefined;
  const serverErrors = action.error?.details?.fieldErrors ?? {};
  const role = user.organization?.orgType === "UNIVERSITY" && user.role === "INSTITUTION_MANAGER" ? "대학 담당자" : roleLabels[user.role];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (nameError || !changed) return;
    void action.run(async (signal) => {
      const saved = await authService.updateMe({ name: form.name.trim(), phone: form.phone.trim() }, signal);
      updateUser?.(saved);
      setForm({ name: saved.name, phone: saved.phone ?? "" });
    }, "내 정보를 저장했습니다.");
  };

  return <div className="content-page content-page--narrow page-enter">
    <PageHeader title="내 정보" description={user.email}>
      <Button variant="ghost" icon={LogOut} onClick={() => void logout()}>로그아웃</Button>
    </PageHeader>
    <Panel>
      <form className="profile-form" onSubmit={submit} noValidate>
        <div className="profile-head">
          <span className="profile-avatar" aria-hidden="true">{user.name?.slice(0, 1) || "A"}</span>
          <div>
            <strong>{user.name}</strong>
            <span>{role} · {user.organization?.name ?? "플랫폼"}</span>
          </div>
          <Badge tone={user.status === "ACTIVE" ? "green" : "amber"}>{user.status === "ACTIVE" ? "이용 중" : user.status}</Badge>
        </div>

        <HStack gap={4} wrap="wrap" className="profile-grid">
          <TextInput label="이름" isRequired autoComplete="name" value={form.name} isDisabled={local} width="100%"
            onChange={(name) => setForm({ ...form, name })}
            status={serverErrors.name ?? nameError ? { type: "error", message: serverErrors.name ?? nameError } : undefined} />
          <TextInput label="연락처" type="tel" isOptional autoComplete="tel" placeholder="010-0000-0000" value={form.phone} isDisabled={local} width="100%"
            onChange={(phone) => setForm({ ...form, phone })}
            status={serverErrors.phone ? { type: "error", message: serverErrors.phone } : undefined} />
        </HStack>

        <dl className="kv profile-readonly">
          <dt>이메일 (아이디)</dt><dd>{user.email || "—"}</dd>
          <dt>소속</dt><dd>{user.organization ? `${user.organization.name} (${orgTypeLabels[user.organization.orgType ?? ""] ?? "조직"})` : "소속 없음"}</dd>
          <dt>역할</dt><dd>{role}</dd>
          {user.role === "INSTITUTION_MANAGER" && <><dt>국가연구자번호</dt><dd>{user.researcherNo ?? "미등록"}</dd></>}
          {user.lastLoginAt && <><dt>최근 로그인</dt><dd>{formatDate(user.lastLoginAt)}</dd></>}
        </dl>
        <p className="small-note">이메일·소속·역할을 바꾸려면 관리자에게 요청해주세요.</p>

        <Feedback action={action} />
        <div className="form-actions">
          <span className="small-note">{local ? "미리보기 모드에서는 저장할 수 없습니다." : changed ? "저장하지 않은 변경이 있습니다." : ""}</span>
          <Button type="submit" icon={Save} disabled={local || action.busy || !changed || Boolean(nameError)}>저장</Button>
        </div>
      </form>
    </Panel>
    <PasswordSection disabled={local} />
  </div>;
}
