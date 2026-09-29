import { lazy, Suspense, Component } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  Link,
} from "react-router-dom";
import AuthPage, { AuthProvider, useAuth } from "./auth";
import { ToastProvider, Loading, ErrorBox } from "./ui";
import Layout from "./layout";
import "./styles.css";
import "./design.css";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Positions = lazy(() => import("./pages/Positions"));
const Questions = lazy(() => import("./pages/Questions"));
const Drives = lazy(() => import("./pages/Drives"));
const DriveDetail = lazy(() =>
  import("./pages/Drives").then((m) => ({ default: m.DriveDetail })),
);
const Candidates = lazy(() => import("./pages/Candidates"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Report = lazy(() => import("./pages/Report"));
const Interview = lazy(() => import("./pages/Interview"));
const InvitePage = lazy(() =>
  import("./pages/Interview").then((m) => ({ default: m.InvitePage })),
);
const MyInterviews = lazy(() =>
  import("./pages/Interview").then((m) => ({ default: m.MyInterviews })),
);
const CandidateWorkspace = lazy(() => import("./pages/CandidateWorkspace"));
function Guard({ role }: { role: "recruiter" | "candidate" }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role)
    return (
      <Navigate
        to={user.role === "recruiter" ? "/" : "/my-interviews"}
        replace
      />
    );
  return <Outlet />;
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="standalone">
        <ErrorBox
          message="This screen couldn’t load. Refresh the page to continue; saved work is safe."
          retry={() => location.reload()}
        />
      </div>
    ) : (
      this.props.children
    );
  }
}
function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <a className="skip-link" href="#main-content">
              Skip to content
            </a>
            <Suspense fallback={<Loading />}>
              <Routes>
                {[
                  "/login",
                  "/signup",
                  "/forgot-password",
                  "/reset-password",
                  "/verify-email",
                ].map((path) => (
                  <Route path={path} element={<AuthPage />} key={path} />
                ))}
                <Route path="/invite" element={<InvitePage />} />
                <Route element={<Guard role="recruiter" />}>
                  <Route element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="positions" element={<Positions />} />
                    <Route path="questions" element={<Questions />} />
                    <Route path="drives" element={<Drives />} />
                    <Route path="drives/:id" element={<DriveDetail />} />
                    <Route path="candidates" element={<Candidates />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="reports/:id" element={<Report />} />
                  </Route>
                </Route>
                <Route element={<Guard role="candidate" />}>
                  <Route path="my-interviews" element={<MyInterviews />} />
                  <Route path="candidate-workspace" element={<CandidateWorkspace />} />
                  <Route path="interview/:id" element={<Interview />} />
                </Route>
                <Route
                  path="*"
                  element={
                    <div className="standalone">
                      <h1>This page is out of focus.</h1>
                      <p>
                        The link may have changed. Your workspace is still here.
                      </p>
                      <Link className="button primary" to="/">
                        Back to HireLens
                      </Link>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
