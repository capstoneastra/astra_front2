import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
// CSS 순서가 중요하다: 레이어 선언 → Astryx → 기존 화면 CSS
import "./styles/layers.css";
import "./styles/astryx.css";
import "./styles/legacy.css";
import ThemeRoot from "./theme/ThemeRoot";
import App from "./App";
import { initializeApi } from "./api/bootstrap";
import { queryClient } from "./api/cache";
import ApiState from "./components/ui/ApiState";
import { Panel } from "./components/ui/index";
import { initializeTheme } from "./theme/useTheme";

const container = document.getElementById("root");
if (!container) throw new Error("ASTRA를 연결할 루트 요소가 없습니다.");
initializeTheme();
const root = createRoot(container);
initializeApi()
  .then(() =>
    root.render(
      <StrictMode>
        <ThemeRoot>
          <BrowserRouter>
            <QueryClientProvider client={queryClient}>
              <App />
            </QueryClientProvider>
          </BrowserRouter>
        </ThemeRoot>
      </StrictMode>,
    ),
  )
  .catch(() =>
    root.render(
      <main className="main-content">
        <Panel>
          <ApiState
            error={{
              message:
                "서비스를 시작하지 못했습니다. 페이지를 새로고침해 다시 시도해주세요.",
            }}
            onRetry={() => window.location.reload()}
          />
        </Panel>
      </main>,
    ),
  );
