import { useEffect, useState } from "react";
import {
  NavLink,
  Outlet,
  useNavigate,
  useLocation,
  Link,
} from "react-router-dom";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  Library,
  Radio,
  UsersRound,
  ChartNoAxesCombined,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
  ArrowRight,
  HelpCircle,
  ChevronRight,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { useAuth, Brand } from "./auth";
import { Avatar, Button, ErrorBox, Modal } from "./ui";
import WorkspaceSearch from "./components/WorkspaceSearch";

const links = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/drives", label: "Interview drives", icon: Radio },
  { to: "/candidates", label: "Candidates", icon: UsersRound },
  { to: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
];
const setup = [
  { to: "/positions", label: "Positions", icon: BriefcaseBusiness },
  { to: "/questions", label: "Question bank", icon: Library },
];
export default function Layout() {
  const { user, logout } = useAuth(),
    navigate = useNavigate(),
    location = useLocation();
  const [open, setOpen] = useState(false),
    [profile, setProfile] = useState(false),
    [help, setHelp] = useState(false),
    [error, setError] = useState("");
  const current = [...links, ...setup].find((l) =>
    l.to === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(l.to),
  );
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open]);
  async function exit() {
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="app-shell">
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            {user?.organization?.slice(0, 1) || "H"}
          </span>
          <div>
            <strong>{user?.organization || "My workspace"}</strong>
            <small>Hiring workspace</small>
          </div>
          <span className="workspace-plan">DEMO</span>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                isActive ? "nav-item active" : "nav-item"
              }
            >
              <l.icon size={19} />
              {l.label}
              <span className="nav-active-dot" />
            </NavLink>
          ))}
        </nav>
        <div className="nav-section-heading">
          <span className="nav-label">YOUR TOOLKIT</span>
          <span>02</span>
        </div>
        <nav aria-label="Recruiter setup">
          {setup.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                isActive ? "nav-item active" : "nav-item"
              }
            >
              <l.icon size={19} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-studio">
            <span className="studio-label">
              <span /> THE INTERVIEW STUDIO
            </span>
            <h3>
              Better questions.
              <br />
              <em>Brighter possibilities.</em>
            </h3>
            <Link to="/questions">
              Build your question bank <ArrowUpRight size={15} />
            </Link>
            <span className="studio-orbit" aria-hidden="true" />
          </div>
          <button className="sidebar-help" onClick={() => setHelp(true)}>
            <HelpCircle size={17} />
            Workspace guide
            <ArrowUpRight size={14} />
          </button>
          <button
            className="user-menu"
            onClick={() => setProfile(true)}
            aria-label="Open profile"
          >
            <Avatar name={user?.name || "Recruiter"} />
            <div>
              <strong>{user?.name}</strong>
              <small>Workspace administrator</small>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-workspace">Workspace</span>
            <ChevronRight size={13} />
            <strong>{current?.label || "Candidate report"}</strong>
          </div>
          <div className="topbar-right">
            <WorkspaceSearch />
            <span className="topbar-divider" />
            <button
              className="topbar-profile"
              aria-label="Open account details"
              onClick={() => setProfile(true)}
            >
              <Avatar name={user?.name || "Recruiter"} size="small" />
            </button>
          </div>
        </header>
        <main
          className="main-content"
          id="main-content"
          data-view={current?.to.slice(1) || "overview"}
        >
          {error && <ErrorBox message={error} />}
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>
            HireLens <span className="footer-dot">/</span> Human potential, in
            focus.
          </span>
          <span>
            <ShieldCheck size={13} />
            Your judgment. Better informed.
          </span>
        </footer>
      </div>
      <Modal
        open={profile}
        onOpenChange={setProfile}
        title="Your workspace, your perspective"
        description="Account details and workspace access."
      >
        <div className="profile-card">
          <Avatar name={user?.name || ""} size="large" />
          <h3>{user?.name}</h3>
          <p>{user?.email}</p>
          <span>{user?.organization}</span>
        </div>
        <div className="profile-facts">
          <span>
            Access<strong>Recruiter / Administrator</strong>
          </span>
          <span>
            Email
            <strong>
              <ShieldCheck size={14} />
              Verified
            </strong>
          </span>
        </div>
        <Button variant="secondary" className="full-width" onClick={exit}>
          <LogOut size={16} />
          Sign out of HireLens
        </Button>
      </Modal>
      <Modal
        open={help}
        onOpenChange={setHelp}
        title="From first question to next conversation"
        description="A short guide to a thoughtful screening process."
      >
        <div className="guide-steps">
          {[
            {
              n: "01",
              title: "Define what matters",
              text: "Create a position with the skills and experience you are hiring for.",
              to: "/positions",
            },
            {
              n: "02",
              title: "Give good thinking room",
              text: "Build your rubric, publish a drive, and share a unique invitation.",
              to: "/drives",
            },
            {
              n: "03",
              title: "Read the evidence",
              text: "Compare scorecards, explore the answers, and record your own decision.",
              to: "/candidates",
            },
          ].map((s) => (
            <Link key={s.n} to={s.to} onClick={() => setHelp(false)}>
              <span>{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
              <ArrowRight size={18} />
            </Link>
          ))}
        </div>
        <Link
          className="button primary full-width"
          to="/drives?create=1"
          onClick={() => setHelp(false)}
        >
          <Plus size={17} />
          Create an interview drive
        </Link>
      </Modal>
    </div>
  );
}
