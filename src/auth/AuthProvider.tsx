import { useCallback, useEffect, useRef, useState } from "react";
import { AuthContext } from "./context";
import type { AuthState } from "./context";
import type { ReactNode } from "react";
import { tokenStore } from "./tokenStore";
import { authService } from "../services/authService";
import { ApiError, contractError, toApiError } from "../api/errors";
import { queryClient } from "../api/cache";
import type { User } from "../services/authService";

function activeUser(user: User) {
  if (user.status !== "ACTIVE")
    throw new ApiError(
      "계정이 활성화되지 않았습니다. 관리자 승인 상태를 확인해주세요.",
      {
        status: 403,
        code: "ACCOUNT_NOT_ACTIVE",
        details: { status: user.status },
      },
    );
  return user;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "checking",
    user: null,
    error: null,
  });
  const operation = useRef(0);
  const request = useRef<AbortController | null>(null);

  const checkSession = useCallback(async () => {
    const sequence = ++operation.current;
    request.current?.abort();
    if (!tokenStore.getToken()) {
      setState({ status: "anonymous", user: null, error: null });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setState({ status: "checking", user: null, error: null });
    try {
      const user = activeUser(await authService.me(controller.signal));
      if (sequence === operation.current && !controller.signal.aborted)
        setState({ status: "authenticated", user, error: null });
    } catch (failure) {
      if (sequence !== operation.current || controller.signal.aborted) return;
      const error = toApiError(failure);
      if (error.status === 401 || error.code === "ACCOUNT_NOT_ACTIVE") {
        tokenStore.clear("invalid");
        setState({ status: "anonymous", user: null, error });
      } else setState({ status: "error", user: null, error });
    }
  }, []);

  useEffect(
    () =>
      tokenStore.subscribe((reason) => {
        operation.current += 1;
        request.current?.abort();
        queryClient.clear();
        setState({
          status: "anonymous",
          user: null,
          error:
            typeof reason === "object" && reason.type === "account_inactive"
              ? reason.error
              : reason === "expired"
                ? new ApiError(
                    "로그인이 만료되었습니다. 다시 로그인해주세요.",
                    {
                      status: 401,
                      code: "TOKEN_EXPIRED",
                    },
                  )
                : null,
        });
      }),
    [],
  );

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) checkSession();
    });
    return () => {
      active = false;
      operation.current += 1;
      request.current?.abort();
    };
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string) => {
    const sequence = ++operation.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ status: "anonymous", user: null, error: null });
    try {
      const session = await authService.login(
        email,
        password,
        controller.signal,
      );
      if (sequence !== operation.current || controller.signal.aborted)
        return false;
      tokenStore.set(session.accessToken, session.refreshToken);
      const user = activeUser(await authService.me(controller.signal));
      if (sequence !== operation.current || controller.signal.aborted)
        return false;
      if (user.id !== session.user.id)
        throw contractError("로그인 응답과 현재 사용자 정보가 일치하지 않습니다.");
      setState({ status: "authenticated", user, error: null });
      return true;
    } catch (error) {
      if (sequence !== operation.current || controller.signal.aborted)
        return false;
      tokenStore.clear("login_failed");
      setState({ status: "anonymous", user: null, error: toApiError(error) });
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    const pending = authService.logout();
    tokenStore.clear("logout");
    try {
      await pending;
    } catch {
      /* Local logout has already completed, even offline. */
    }
  }, []);
  return (
    <AuthContext.Provider value={{ ...state, login, logout, checkSession,
      updateUser: (user) => setState((previous) => previous.status === "authenticated" ? { ...previous, user } : previous) }}>
      {children}
    </AuthContext.Provider>
  );
}
