import { useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router";
import ThemeToggle from "../components/ui/ThemeToggle";
import AstraBrand from "../components/ui/AstraBrand";
import LoginOrbit from "./LoginOrbit";
import "./login.css";

// 이용 안내는 별도 화면 대신 로그인 카드 안의 접이식 안내(LoginGuide)로 넣었다.
export default function AuthLayout() {
  const { pathname, search, state } = useLocation();
  const previousPath = useRef(pathname);
  const cardFrame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    window.scrollTo(0, 0);
    cardFrame.current?.querySelector("h1")?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="login-experience">
      <LoginOrbit />
      <header className="login-topbar">
        <Link
          className="login-brand"
          to={{ pathname: "/auth/login", search }}
          state={pathname === "/auth/login" ? state : undefined}
          aria-label="ASTRA 로그인"
        >
          <AstraBrand />
        </Link>
        <div className="login-topbar__actions">
          <ThemeToggle />
        </div>
      </header>

      <main className="login-viewport">
        <section id="login-view" className="login-screen login-screen--single" aria-labelledby="auth-card-heading">
          <div key={pathname} ref={cardFrame} className="auth-card-frame">
            <Outlet />
          </div>
        </section>
      </main>

      <footer className="login-footer">
        <span>© 2026 ASTRA</span>
      </footer>
    </div>
  );
}
