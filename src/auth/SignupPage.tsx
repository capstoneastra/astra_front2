import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowUpRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { ApiError, toApiError } from "../api/errors";
import { Button } from "../components/ui";
import ApiState from "../components/ui/ApiState";
import { useAction } from "../hooks/useAction";
import { useApiQuery } from "../hooks/useApiQuery";
import { authService } from "../services/authService";
import type { InstitutionType, SignupRequest } from "../services/authService";
import AuthCardLink from "./AuthCardLink";

const noVerification = { codeExpiresAt: 0, resendAt: 0, token: "", tokenExpiresAt: 0 };
const secondsLeft = (until: number, now: number) => Math.max(0, Math.ceil((until - now) / 1000));
const sixDigits = /^[0-9]{6}$/;
const researcherNoPattern = /^[0-9]{8}$/;
const businessNoPattern = /^[0-9]{3}-?[0-9]{2}-?[0-9]{5}$/;

type Role = SignupRequest["role"];
type Step = 1 | 2 | 3;

// 서버 오류(400 VALIDATION_FAILED details.fields[].field)가 어느 단계의 칸인지
const fieldStep: Record<string, Step> = {
  email: 1, code: 1, verificationToken: 1,
  name: 2, password: 2, phone: 2,
  role: 3, researcherNo: 3, organizationId: 3,
  "organization.name": 3, "organization.businessRegNo": 3, "organization.orgType": 3,
  "organization.address": 3, "organization.phone": 3,
};

/** 비밀번호 강도: 길이와 문자 종류(영문 대·소문자, 숫자, 기호) 수로 매긴다. */
function passwordStrength(password: string) {
  if (!password) return null;
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (password.length < 8 || kinds <= 1) return { level: 1, label: "약함" };
  if (password.length >= 12 && kinds >= 3) return { level: 3, label: "강함" };
  return { level: 2, label: "보통" };
}

const formatBusinessNo = (value: string) => {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 10);
  return [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5)].filter(Boolean).join("-");
};

function Field({ id, label, required, error, hint, children, size }: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  size?: "short" | "medium";
}) {
  return <div className={`form-field signup-field ${size ? `signup-field--${size}` : ""} ${error ? "form-field--invalid" : ""}`}>
    <label htmlFor={id} className={required ? "label-required" : "label-optional"}>
      {label}{required ? <b aria-hidden="true"> *</b> : <span> (선택)</span>}
    </label>
    {children}
    {error ? <p className="field-error" id={`${id}-error`} role="alert">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
  </div>;
}

export default function SignupPage() {
  const emailInput = useRef<HTMLInputElement>(null);
  const [chosenStep, setStep] = useState<Step>(1);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verification, setVerification] = useState(noVerification);
  const [now, setNow] = useState(Date.now);
  const [account, setAccount] = useState({ name: "", password: "", confirm: "", phone: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>("COMPANY_USER");
  const [company, setCompany] = useState({ name: "", businessRegNo: "" });
  const [existing, setExisting] = useState(true);
  const [institution, setInstitution] = useState({ organizationId: "", researcherNo: "", orgType: "INSTITUTION" as InstitutionType, name: "", address: "", phone: "" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const action = useAction();
  const selectInstitution = role === "INSTITUTION_MANAGER" && existing;
  const institutions = useApiQuery(authService.institutions, "signup-institutions", chosenStep === 3 && selectInstitution);
  const resendSeconds = secondsLeft(verification.resendAt, now);
  const codeSeconds = secondsLeft(verification.codeExpiresAt, now);
  const verified = Boolean(verification.token) && verification.tokenExpiresAt > now;
  const ticking = verified || resendSeconds > 0 || codeSeconds > 0;

  useEffect(() => {
    if (!ticking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  // 2·3단계는 이메일 인증이 살아 있을 때만. 인증 토큰이 만료되면 1단계로 돌아간다.
  const step: Step = verified ? chosenStep : 1;

  const serverErrors = action.error?.details?.fieldErrors ?? {};
  const strength = passwordStrength(account.password);
  const local: Record<string, string> = {};
  if (!account.name.trim()) local.name = "이름을 입력해주세요.";
  if (account.password.length < 8) local.password = "8자 이상 입력해주세요.";
  if (account.confirm && account.confirm !== account.password) local.confirm = "비밀번호가 일치하지 않습니다.";
  if (!account.confirm) local.confirm = "비밀번호를 한 번 더 입력해주세요.";
  if (role === "COMPANY_USER") {
    if (!company.name.trim()) local["organization.name"] = "회사명을 입력해주세요.";
    if (!businessNoPattern.test(company.businessRegNo)) local["organization.businessRegNo"] = "숫자 10자리를 입력해주세요. 예: 123-45-67890";
  } else {
    if (!researcherNoPattern.test(institution.researcherNo)) local.researcherNo = "숫자 8자리를 입력해주세요.";
    if (existing) {
      if (!institution.organizationId) local.organizationId = "소속 기관·대학을 선택해주세요.";
    } else {
      if (!institution.name.trim()) local["organization.name"] = "기관·대학 이름을 입력해주세요.";
      if (!institution.address.trim()) local["organization.address"] = "주소를 입력해주세요.";
      if (!institution.phone.trim()) local["organization.phone"] = "대표 연락처를 입력해주세요.";
    }
  }
  // 비밀번호 확인 불일치는 입력하는 즉시 보여 준다. 나머지는 칸을 벗어났거나 '다음'을 누른 뒤에.
  const errorFor = (field: string) => serverErrors[field] ??
    ((touched[field] || (field === "confirm" && account.confirm)) ? local[field] : undefined);
  const touch = (field: string) => () => setTouched((previous) => ({ ...previous, [field]: true }));
  const stepFields: Record<Step, string[]> = {
    1: [],
    2: ["name", "password", "confirm"],
    3: role === "COMPANY_USER" ? ["organization.name", "organization.businessRegNo"]
      : existing ? ["researcherNo", "organizationId"] : ["researcherNo", "organization.name", "organization.address", "organization.phone"],
  };
  const stepValid = (target: Step) => stepFields[target].every((field) => !local[field]);
  const goNext = (target: Step) => {
    setTouched((previous) => ({ ...previous, ...Object.fromEntries(stepFields[target].map((field) => [field, true])) }));
    if (stepValid(target)) {
      action.clearFeedback();
      setStep((target + 1) as Step);
    }
  };

  const updateEmail = (value: string) => {
    setEmail(value);
    setCode("");
    setVerification(noVerification);
    action.clearFeedback();
  };

  const sendCode = () => {
    if (!emailInput.current?.reportValidity() || verification.resendAt > Date.now()) return;
    void action.run(async (signal) => {
      try {
        const result = await authService.sendVerification(email.trim(), signal);
        if (signal.aborted) return;
        const sentAt = Date.now();
        setNow(sentAt);
        setVerification({ ...noVerification, codeExpiresAt: sentAt + result.expiresIn * 1000, resendAt: sentAt + result.resendAvailableIn * 1000 });
        setCode("");
      } catch (failure) {
        const error = toApiError(failure);
        if (error.code === "TOO_MANY_REQUESTS" && error.details?.retryAfter != null) {
          const rejectedAt = Date.now();
          setNow(rejectedAt);
          setVerification((previous) => ({ ...previous, resendAt: rejectedAt + error.details.retryAfter * 1000 }));
        }
        throw error;
      }
    });
  };

  const confirmCode = () => {
    if (!sixDigits.test(code) || verification.codeExpiresAt <= Date.now()) return;
    void action.run(async (signal) => {
      try {
        const result = await authService.confirmVerification(email.trim(), code, signal);
        if (signal.aborted) return;
        const confirmedAt = Date.now();
        setNow(confirmedAt);
        setCode("");
        setVerification((previous) => ({ ...previous, codeExpiresAt: 0, token: result.verificationToken, tokenExpiresAt: confirmedAt + result.expiresIn * 1000 }));
        setStep(2);
      } catch (failure) {
        const error = toApiError(failure);
        if (error.code === "VERIFICATION_CODE_EXPIRED" || error.details?.remainingAttempts === 0) {
          setCode("");
          setVerification((previous) => ({ ...previous, codeExpiresAt: 0 }));
        }
        if (error.details?.remainingAttempts === 0)
          throw new ApiError("인증 시도 횟수를 모두 사용했습니다. 코드를 다시 받으세요.", { code: "VERIFICATION_CODE_EXPIRED" });
        throw error;
      }
    });
  };

  const buildRequest = (): SignupRequest => {
    // 비밀번호 확인 칸은 화면에서만 비교하고 서버에는 password 하나만 보낸다.
    const applicant = {
      email: email.trim(),
      verificationToken: verification.token,
      password: account.password,
      name: account.name.trim(),
      ...(account.phone.trim() ? { phone: account.phone.trim() } : {}),
    };
    if (role === "COMPANY_USER")
      return { ...applicant, role, organization: { name: company.name.trim(), businessRegNo: formatBusinessNo(company.businessRegNo) } };
    if (existing)
      return { ...applicant, role, researcherNo: institution.researcherNo, organizationId: Number(institution.organizationId) };
    return { ...applicant, role, researcherNo: institution.researcherNo, organization: {
      orgType: institution.orgType, name: institution.name.trim(), address: institution.address.trim(), phone: institution.phone.trim() } };
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step !== 3) return goNext(step);
    setTouched((previous) => ({ ...previous, ...Object.fromEntries(stepFields[3].map((field) => [field, true])) }));
    if (!verified || !stepValid(2) || !stepValid(3)) return;
    void action.run(async (signal) => {
      try {
        await authService.signup(buildRequest(), signal);
        if (!signal.aborted) setDone(true);
      } catch (failure) {
        const error = toApiError(failure);
        if (error.code === "EMAIL_NOT_VERIFIED") {
          setCode("");
          setVerification((previous) => ({ ...noVerification, resendAt: previous.resendAt }));
          setStep(1);
        }
        // 오류 난 칸이 있는 가장 앞 단계로 이동
        const steps = Object.keys(error.details?.fieldErrors ?? {}).map((field) => fieldStep[field]).filter(Boolean);
        if (steps.length) setStep(Math.min(...steps) as Step);
        throw error;
      }
    });
  };

  if (done)
    return <div className="login-card login-card--signup">
      <div className="signup-done" role="status">
        <CheckCircle2 size={36} aria-hidden="true" />
        <h1 id="auth-card-heading" tabIndex={-1}>가입 신청이 접수되었습니다</h1>
        <p className="signup-done__notice"><strong>관리자 승인 후 로그인할 수 있습니다.</strong></p>
        <p className="small-note">{email} · 승인되면 이 이메일로 로그인하세요. 승인 전에 로그인하면 '승인 대기' 안내가 나옵니다.</p>
        <AuthCardLink className="button button--primary" to="/auth/login">로그인 화면으로</AuthCardLink>
      </div>
    </div>;

  const steps: { id: Step; label: string }[] = [{ id: 1, label: "이메일 인증" }, { id: 2, label: "계정 정보" }, { id: 3, label: "소속 정보" }];
  const unknownServerErrors = Object.entries(serverErrors).filter(([field]) => !fieldStep[field] || fieldStep[field] !== step);

  return (
    <div className="login-card login-card--signup">
      <h1 id="auth-card-heading" tabIndex={-1}>회원가입</h1>
      <ol className="signup-steps" aria-label="가입 단계">
        {steps.map(({ id, label }) => <li key={id} aria-current={step === id ? "step" : undefined} className={step > id ? "is-done" : ""}>
          <span>{step > id ? "✓" : id}</span>{label}
        </li>)}
      </ol>
      <form onSubmit={submit} aria-busy={action.busy} noValidate>
        <fieldset disabled={action.busy} className="tw:m-0 tw:min-w-0 tw:border-0 tw:p-0">
          {step === 1 && <div className="signup-section">
            <Field id="signup-email" label="이메일" required error={serverErrors.email}
              hint={verified ? "인증을 마쳤습니다." : "가입 후 로그인 아이디로 씁니다."}>
              <div className="signup-inline">
                <input id="signup-email" ref={emailInput} type="email" autoComplete="username" required value={email}
                  readOnly={verified} onChange={(event) => updateEmail(event.target.value)} />
                {!verified && <Button variant="secondary" onClick={sendCode} disabled={!email.trim() || resendSeconds > 0}>
                  {resendSeconds > 0 ? `${resendSeconds}초 후 재발송` : codeSeconds > 0 ? "코드 다시 받기" : "코드 받기"}
                </Button>}
              </div>
            </Field>
            {!verified && codeSeconds > 0 && <Field id="signup-code" label="인증 코드" required error={serverErrors.code}
              hint={`메일로 받은 6자리 · 남은 시간 ${Math.floor(codeSeconds / 60)}:${String(codeSeconds % 60).padStart(2, "0")}`}>
              <div className="signup-inline signup-inline--short">
                <input id="signup-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                  onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))} />
                <Button onClick={confirmCode} disabled={!sixDigits.test(code)}>확인</Button>
              </div>
            </Field>}
            {!verified && verification.codeExpiresAt > 0 && codeSeconds === 0 &&
              <p className="field-error" role="status">인증 시간이 지났습니다. 코드를 다시 받으세요.</p>}
          </div>}

          {step === 2 && <div className="signup-section">
            <h2 className="signup-subtitle">계정</h2>
            <Field id="signup-name" label="이름" required error={errorFor("name")} size="medium">
              <input id="signup-name" autoComplete="name" value={account.name} onBlur={touch("name")}
                onChange={(event) => setAccount({ ...account, name: event.target.value })} />
            </Field>
            <Field id="signup-password" label="비밀번호" required error={errorFor("password")}
              hint={<span className="signup-strength">
                {strength && <span className={`signup-strength__bar signup-strength__bar--${strength.level}`} aria-hidden="true"><i /><i /><i /></span>}
                {strength ? <>강도 <strong>{strength.label}</strong> · </> : null}8자 이상, 영문·숫자·기호를 섞으면 안전합니다.
              </span>}>
              <div className="signup-password">
                <input id="signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={account.password}
                  onBlur={touch("password")} onChange={(event) => setAccount({ ...account, password: event.target.value })} />
                <button type="button" className="icon-button" aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <Field id="signup-password-confirm" label="비밀번호 확인" required error={errorFor("confirm")}
              hint={account.confirm && account.confirm === account.password ? "비밀번호가 일치합니다." : undefined}>
              <input id="signup-password-confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" value={account.confirm}
                onBlur={touch("confirm")} onChange={(event) => setAccount({ ...account, confirm: event.target.value })} />
            </Field>
            <h2 className="signup-subtitle signup-subtitle--optional">추가 정보</h2>
            <Field id="signup-phone" label="개인 연락처" error={serverErrors.phone} size="medium">
              <input id="signup-phone" type="tel" autoComplete="tel" placeholder="010-0000-0000" value={account.phone}
                onChange={(event) => setAccount({ ...account, phone: event.target.value })} />
            </Field>
          </div>}

          {step === 3 && <div className="signup-section">
            <h2 className="signup-subtitle">가입 유형</h2>
            <div className="segmented signup-role" role="radiogroup" aria-label="가입 유형">
              <button type="button" role="radio" aria-checked={role === "COMPANY_USER"} aria-pressed={role === "COMPANY_USER"} onClick={() => setRole("COMPANY_USER")}>기업</button>
              <button type="button" role="radio" aria-checked={role === "INSTITUTION_MANAGER"} aria-pressed={role === "INSTITUTION_MANAGER"} onClick={() => setRole("INSTITUTION_MANAGER")}>기관·대학</button>
            </div>
            <h2 className="signup-subtitle">소속</h2>
            {role === "COMPANY_USER" ? <>
              <Field id="signup-company" label="회사명" required error={errorFor("organization.name")}>
                <input id="signup-company" value={company.name} onBlur={touch("organization.name")}
                  onChange={(event) => setCompany({ ...company, name: event.target.value })} />
              </Field>
              <Field id="signup-business" label="사업자등록번호" required size="medium" error={errorFor("organization.businessRegNo")} hint="형식: 123-45-67890">
                <input id="signup-business" inputMode="numeric" placeholder="123-45-67890" value={company.businessRegNo}
                  onBlur={touch("organization.businessRegNo")} onChange={(event) => setCompany({ ...company, businessRegNo: formatBusinessNo(event.target.value) })} />
              </Field>
            </> : <>
              <Field id="signup-researcher-no" label="국가연구자번호" required size="medium" error={errorFor("researcherNo")}
                hint={<>숫자 8자리 · <a href="https://www.iris.go.kr/mbrs/srch/retrieveSrchNumInfo.do" target="_blank" rel="noopener noreferrer">IRIS에서 조회 <ArrowUpRight size={11} aria-hidden="true" /></a></>}>
                <input id="signup-researcher-no" inputMode="numeric" maxLength={8} value={institution.researcherNo} onBlur={touch("researcherNo")}
                  onChange={(event) => setInstitution({ ...institution, researcherNo: event.target.value.replace(/[^0-9]/g, "") })} />
              </Field>
              <div className="segmented" role="group" aria-label="소속 등록 방식">
                <button type="button" aria-pressed={existing} onClick={() => setExisting(true)}>목록에서 선택</button>
                <button type="button" aria-pressed={!existing} onClick={() => setExisting(false)}>목록에 없음 (새로 신청)</button>
              </div>
              {existing ? <Field id="signup-institution" label="소속 기관·대학" required error={errorFor("organizationId")}
                hint={institutions.data?.length === 0 ? "등록된 기관·대학이 없습니다. '목록에 없음'을 고르세요." : undefined}>
                <select id="signup-institution" value={institution.organizationId} onBlur={touch("organizationId")} disabled={!institutions.data?.length}
                  onChange={(event) => setInstitution({ ...institution, organizationId: event.target.value })}>
                  <option value="">{institutions.loading ? "불러오는 중…" : "기관·대학 선택"}</option>
                  {institutions.data?.map((item) => <option key={item.id} value={item.id}>
                    {item.name} ({item.orgType === "UNIVERSITY" ? "대학" : "기관"}{item.region ? ` · ${item.region}` : ""})
                  </option>)}
                </select>
                {institutions.error && <ApiState error={institutions.error} onRetry={institutions.reload} />}
              </Field> : <>
                <div className="signup-row">
                  <Field id="signup-org-type" label="유형" required size="short">
                    <select id="signup-org-type" value={institution.orgType}
                      onChange={(event) => setInstitution({ ...institution, orgType: event.target.value === "UNIVERSITY" ? "UNIVERSITY" : "INSTITUTION" })}>
                      <option value="INSTITUTION">기관</option><option value="UNIVERSITY">대학</option>
                    </select>
                  </Field>
                  <Field id="signup-org-name" label="기관·대학 이름" required error={errorFor("organization.name")}>
                    <input id="signup-org-name" value={institution.name} onBlur={touch("organization.name")}
                      onChange={(event) => setInstitution({ ...institution, name: event.target.value })} />
                  </Field>
                </div>
                <Field id="signup-org-address" label="주소" required error={errorFor("organization.address")}>
                  <input id="signup-org-address" value={institution.address} onBlur={touch("organization.address")}
                    onChange={(event) => setInstitution({ ...institution, address: event.target.value })} />
                </Field>
                <Field id="signup-org-phone" label="대표 연락처" required size="medium" error={errorFor("organization.phone")}>
                  <input id="signup-org-phone" type="tel" value={institution.phone} onBlur={touch("organization.phone")}
                    onChange={(event) => setInstitution({ ...institution, phone: event.target.value })} />
                </Field>
              </>}
            </>}
          </div>}
        </fieldset>

        {action.error && (unknownServerErrors.length > 0 || !action.error.details?.fieldErrors) && <div className="content-note" role="alert">
          <div>
            {action.error.message}
            {action.error.details?.remainingAttempts > 0 && ` 남은 시도 ${action.error.details.remainingAttempts}회.`}
            {unknownServerErrors.map(([field, message]) => <p key={field}>{message}</p>)}
          </div>
        </div>}

        <div className="form-actions">
          {step === 1 ? <AuthCardLink className="login-signup-link" to="/auth/login">로그인으로 돌아가기</AuthCardLink>
            : <Button variant="ghost" onClick={() => setStep((step - 1) as Step)}>이전</Button>}
          {step === 1 && <Button type="button" disabled={!verified} onClick={() => setStep(2)}>다음</Button>}
          {step === 2 && <Button type="submit" disabled={!account.password || account.confirm !== account.password}>다음</Button>}
          {step === 3 && <Button type="submit" disabled={!verified || action.busy || account.confirm !== account.password ||
            (selectInstitution && !institutions.data?.length)}>가입 신청</Button>}
        </div>
        <p className="small-note signup-footnote">가입 신청 후 관리자 승인이 끝나야 로그인할 수 있습니다.</p>
      </form>
    </div>
  );
}
