const env = import.meta.env;

export const apiConfig = {
  baseURL: (env.VITE_API_BASE_URL || "/api/v1").replace(/\/+$/, ""),
  // 명세: includeMock 기본 true(시연 데이터 포함). 운영에서 빼려면 VITE_INCLUDE_MOCK_DATA=false
  includeMock: env.VITE_INCLUDE_MOCK_DATA !== "false",
};
