import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useLocation } from "react-router";
import AuthCardLink from "./AuthCardLink";
import { useAuth } from "./context";
import { localWorkspaceAccounts } from "./localWorkspace";
import type { LocalWorkspaceAccount } from "./localWorkspace";
import LoginGuide from "./LoginGuide";

const rememberedEmailKey = "astra.auth.remembered-email";
const accountStatus: Record<string, string> = {
  PENDING: "관리자 승인 대기 중입니다.",
  REJECTED: "가입이 반려되었습니다.",
  SUSPENDED: "이용이 정지된 계정입니다.",
};

function readRememberedEmail() {
  try {
    return window.localStorage.getItem(rememberedEmailKey) ?? "";
  } catch {
    return "";
  }
}

function rememberEmail(email: string) {
  try {
    if (email) window.localStorage.setItem(rememberedEmailKey, email);
    else window.localStorage.removeItem(rememberedEmailKey);
  } catch {
    // Remembering an email address is optional.
  }
}

export default function LoginPage({ onEnterLocal }: { onEnterLocal?: (account: LocalWorkspaceAccount) => void }) {
  const { login, error } = useAuth();
  const signupPending = useLocation().state?.signupPending === true;
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(readRememberedEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(Boolean(email));
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<{ field: "email" | "password"; message: string } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const address = email.trim();
    if (!address || emailInput.current?.validity.typeMismatch) {
      setValidation({
        field: "email",
        message: address ? "이메일 형식을 확인해 주세요." : "이메일을 입력해 주세요.",
      });
      emailInput.current?.focus();
      return;
    }
    if (!password) {
      setValidation({ field: "password", message: "비밀번호를 입력해 주세요." });
      passwordInput.current?.focus();
      return;
    }
    setValidation(null);
    setBusy(true);
    try {
      if (await login(address, password)) rememberEmail(remember ? address : "");
    } finally {
      setBusy(false);
      setPassword("");
      setShowPassword(false);
    }
  };

  const account = error?.code === "ACCOUNT_NOT_ACTIVE" ? error.details : null;
  const message = validation?.message ?? (account && accountStatus[account.status]) ?? error?.message;

  return (
    <div className="login-card">
      <h1 id="auth-card-heading" tabIndex={-1}>로그인</h1>
      <p className="login-card__intro">등록한 이메일로 로그인해 주세요.</p>
      {signupPending && (
        <p className="login-feedback login-feedback--success" role="status">
          가입 신청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.
        </p>
      )}
      <form noValidate onSubmit={submit} aria-busy={busy}>
        <label className="login-card__label" htmlFor="login-email">이메일</label>
        <div className="login-input" data-invalid={validation?.field === "email"}>
          <Mail size={17} aria-hidden="true" />
          <input
            ref={emailInput}
            id="login-email"
            name="email"
            type="email"
            placeholder="name@company.com"
            autoComplete="username"
            required
            value={email}
            disabled={busy}
            aria-invalid={validation?.field === "email" || undefined}
            aria-describedby={validation?.field === "email" ? "login-message" : undefined}
            onChange={(event) => { setEmail(event.target.value); setValidation(null); }}
          />
        </div>
        <label className="login-card__label login-card__label--password" htmlFor="login-password">비밀번호</label>
        <div className="login-input" data-invalid={validation?.field === "password"}>
          <LockKeyhole size={17} aria-hidden="true" />
          <input
            ref={passwordInput}
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="비밀번호를 입력하세요"
            autoComplete="current-password"
            required
            value={password}
            disabled={busy}
            aria-invalid={validation?.field === "password" || undefined}
            aria-describedby={validation?.field === "password" ? "login-message" : undefined}
            onChange={(event) => { setPassword(event.target.value); setValidation(null); }}
          />
          <button
            type="button"
            className="login-password-toggle"
            aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
            aria-pressed={showPassword}
            disabled={busy}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
          </button>
        </div>
        <div className="login-card__options">
          <label className="login-remember">
            <input
              type="checkbox"
              checked={remember}
              disabled={busy}
              onChange={(event) => {
                setRemember(event.target.checked);
                if (!event.target.checked) rememberEmail("");
              }}
            />
            이메일 기억하기
          </label>
          <AuthCardLink className="login-signup-link" to="/auth/signup">회원가입</AuthCardLink>
        </div>
        <button className="login-submit" type="submit" disabled={busy}>
          {busy ? "로그인 확인 중…" : "로그인"}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        {message && (
          <p id="login-message" className="login-feedback" role="alert">
            {message}
            {!validation && account?.rejectReason && <><br />{account.rejectReason}</>}
          </p>
        )}
      </form>
      {onEnterLocal && (
        <div className="login-card__accounts" role="group" aria-labelledby="login-local-workspace">
          <p id="login-local-workspace">서버 없이 화면 열기</p>
          <div className="login-card__account-options">
            {(Object.keys(localWorkspaceAccounts) as LocalWorkspaceAccount[]).map((account) => (
              <button key={account} type="button" disabled={busy} onClick={() => onEnterLocal(account)}>
                {localWorkspaceAccounts[account].label}
              </button>
            ))}
          </div>
        </div>
      )}
      <LoginGuide />
      <p className="login-card__note">신규 계정은 관리자 승인 후 이용할 수 있습니다.</p>
    </div>
  );
}
