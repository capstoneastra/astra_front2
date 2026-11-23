import axios from "axios";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { apiConfig } from "./config";
import { ApiError, errorFromEnvelope, validateEnvelope } from "./errors";
import { tokenStore } from "../auth/tokenStore";
import { validateSession } from "../auth/session";
import type { AuthSession } from "../auth/session";

declare module "axios" {
  // Axios propagates custom request fields through its interceptors.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface AxiosRequestConfig<D, P> {
    authToken?: string | null;
    requiresAuth?: boolean;
    sessionVersion?: number;
    retriedAfterRefresh?: boolean;
  }
}

interface ApiClientOptions {
  baseURL?: string;
  store?: typeof tokenStore;
  adapter?: AxiosRequestConfig["adapter"];
}

const localWorkspaceAdapter = () => Promise.reject(new ApiError("백엔드 연결 후 이 기능을 이용할 수 있습니다.", { code: "LOCAL_WORKSPACE" }));

export function createApiClient({
  baseURL = apiConfig.baseURL,
  store = tokenStore,
  adapter,
}: ApiClientOptions = {}) {
  const client = axios.create({
    baseURL,
    timeout: 15000,
    withCredentials: false,
    headers: { Accept: "application/json" },
    ...(adapter ? { adapter } : {}),
  });
  let refreshing: { version: number; promise: Promise<AuthSession> } | undefined;
  const aborted = () => new ApiError("요청이 취소되었습니다.", { code: "ABORTED" });

  async function exchangeRefreshToken(refreshToken: string) {
    const response = await client.post("/auth/refresh", { refreshToken }, { requiresAuth: false });
    return validateSession(responseData<AuthSession>(response));
  }

  function refreshSession(refreshToken: string, version: number) {
    if (refreshing?.version === version) return refreshing.promise;
    const promise = exchangeRefreshToken(refreshToken)
      .then((session) => {
        store.rotate(session.accessToken, session.refreshToken, version);
        return session;
      })
      .finally(() => {
        if (refreshing?.version === version) refreshing = undefined;
      });
    refreshing = { version, promise };
    return promise;
  }

  async function revokeSession() {
    const accessToken = store.getToken();
    const refreshToken = store.getRefreshToken();
    if (!accessToken || !refreshToken) return;

    const version = store.getVersion();
    const current = { accessToken, refreshToken };
    const pendingRefresh = refreshing?.version === version ? refreshing.promise : null;
    const session = pendingRefresh ? await pendingRefresh.catch(() => current) : current;
    const revoke = (tokens: typeof current) => client.post(
      "/auth/logout",
      { refreshToken: tokens.refreshToken },
      { authToken: tokens.accessToken, sessionVersion: version },
    );

    try {
      await revoke(session);
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "TOKEN_EXPIRED") throw error;
      await revoke(await exchangeRefreshToken(session.refreshToken));
    }
  }

  function clearRejectedSession(error: ApiError) {
    if (error.status === 403 && error.code === "ACCOUNT_NOT_ACTIVE")
      store.clear({ type: "account_inactive", error });
    else if (error.status === 401) store.clear("expired");
  }

  client.interceptors.request.use((config) => {
    if (config.adapter === localWorkspaceAdapter) return config;
    config.sessionVersion ??= store.getVersion();
    if (config.retriedAfterRefresh && config.sessionVersion !== store.getVersion())
      throw aborted();
    const accessToken = config.authToken ?? store.getToken();
    if (config.requiresAuth !== false && accessToken)
      config.headers.set("Authorization", `Bearer ${accessToken}`);
    else config.headers.delete("Authorization");
    return config;
  });
  client.interceptors.response.use(
    (response) => {
      // 파일 내려받기(responseType: "blob")는 JSON 봉투가 없다.
      if (response.config.responseType === "blob") return response;
      validateEnvelope(response.data, response.status);
      return response;
    },
    async (failure) => {
      if (failure instanceof ApiError) throw failure;
      if (axios.isCancel(failure)) throw aborted();
      const status = failure.response?.status ?? 0;
      const timedOut = ["ECONNABORTED", "ETIMEDOUT"].includes(failure.code);
      const error = status
        ? errorFromEnvelope(failure.response?.data, status)
        : new ApiError(
            timedOut
              ? "서버 응답 시간이 초과되었습니다. 다시 시도해주세요."
              : "서버에 연결할 수 없습니다. 백엔드 주소와 실행 상태를 확인해주세요.",
            { code: timedOut ? "TIMEOUT" : "NETWORK_ERROR" },
          );
      const config = failure.config;
      const version = config?.sessionVersion;
      if (!config || config.requiresAuth === false || version !== store.getVersion())
        throw error;

      const accessToken = store.getToken();
      const usedCurrentToken = config.headers.get("Authorization") === `Bearer ${accessToken}`;
      const refreshToken = store.getRefreshToken();
      if (
        status === 401 && error.code === "TOKEN_EXPIRED" &&
        !config.authToken && !config.retriedAfterRefresh && accessToken && refreshToken
      ) {
        try {
          // Another request may already have rotated the token after this request was sent.
          if (usedCurrentToken) await refreshSession(refreshToken, version);
        } catch (refreshError) {
          if (version === store.getVersion() && refreshError instanceof ApiError)
            clearRejectedSession(refreshError);
          throw refreshError;
        }
        if (config.signal?.aborted || version !== store.getVersion()) throw aborted();
        return client.request({ ...config, retriedAfterRefresh: true });
      }
      if (usedCurrentToken || error.code === "ACCOUNT_NOT_ACTIVE") clearRejectedSession(error);
      throw error;
    },
  );
  return Object.assign(client, { revokeSession });
}

export const apiClient = createApiClient();

export function blockLocalWorkspaceRequests() {
  const adapter = apiClient.defaults.adapter;
  apiClient.defaults.adapter = localWorkspaceAdapter;

  return () => {
    if (apiClient.defaults.adapter === localWorkspaceAdapter) apiClient.defaults.adapter = adapter;
  };
}

export function responseData<T = unknown>(response: AxiosResponse<unknown>) {
  return validateEnvelope<T>(response.data, response.status);
}
