import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { api, send } from "./api";
import type { User } from "./types";
import { Button, ErrorBox, Field, Loading } from "./ui";
import LensArtwork, { LensMark } from "./components/LensArtwork";

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: async () => {},
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ user: User | null }>("/auth/session/")
      .then((d) => setUser(d.user))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function logout() {
    await send("/auth/logout/");
    setUser(null);
  }
  if (error)
    return (
      <div className="standalone">
        <ErrorBox message={error} retry={() => location.reload()} />
      </div>
    );
  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className={`brand ${light ? "light" : ""}`}>
      <span className="brand-symbol">
        <LensMark size={32} />
      </span>
      hirelens<span className="brand-period">.</span>
    </Link>
  );
}

export default function AuthPage() {
  const location = useLocation(),
    navigate = useNavigate(),
    { user, setUser, loading } = useAuth();
  const mode = location.pathname.includes("signup")
    ? "signup"
    : location.pathname.includes("forgot")
      ? "forgot"
      : location.pathname.includes("reset-password")
        ? "reset"
        : location.pathname.includes("verify-email")
          ? "verify"
          : "login";
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [totpCode, setTotpCode] = useState(""),
    [name, setName] = useState(""),
    [organization, setOrganization] = useState(""),
    [role, setRole] = useState<"recruiter" | "candidate">(
      new URLSearchParams(location.search).get("next")?.startsWith("/invite")
        ? "candidate"
        : "recruiter",
    ),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [showMfa, setShowMfa] = useState(false);
  const token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
  const destination = new URLSearchParams(location.search).get("next");
  function go(u: User) {
    navigate(
      destination?.startsWith("/invite")
        ? destination
        : u.role === "recruiter"
          ? "/"
          : "/my-interviews",
      { replace: true },
    );
  }
  useEffect(() => {
    setError("");
    setMessage("");
    setShowMfa(false);
    setTotpCode("");
  }, [mode]);
  useEffect(() => {
    if (user && (mode === "login" || mode === "signup")) go(user);
  }, [user, mode]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        const result = await send<{ user: User }>("/auth/login/", {
          email,
          password,
          ...(totpCode ? { totp_code: totpCode } : {}),
        });
        setUser(result.user);
        go(result.user);
      } else if (mode === "signup") {
        const result = await send<{ detail: string }>("/auth/signup/", {
          email,
          password,
          name,
          role,
          organization: organization || "My workspace",
        });
        setMessage(result.detail);
      } else {
        const path =
          mode === "forgot" ? "forgot" : mode === "verify" ? "verify" : "reset";
        const body =
          mode === "forgot"
            ? { email }
            : mode === "verify"
              ? { token }
              : { token, password };
        const result = await send<{ detail: string }>(`/auth/${path}/`, body);
        setMessage(result.detail);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError("");
    try {
      const d = await send<{ detail: string }>("/auth/resend/", { email });
      setMessage(d.detail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  const titles = {
    login: "Welcome back.",
    signup: "Make your next hire count.",
    forgot: "Let’s get you back in.",
    reset: "A fresh start.",
    verify: "One last step.",
  };
  const descriptions = {
    login: "Your next great hire starts with a clearer picture.",
    signup: "Create your workspace. Bring great people into focus.",
    forgot: "We’ll send a secure link to reset your password.",
    reset: "Choose a new password for your account.",
    verify: "Confirm your email address to activate your account.",
  };
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Brand light />
        <div className="auth-story-main">
          <div className="auth-kicker">
            <span /> THE HUMAN SIDE OF HIRING
          </div>
          <h1>
            See beyond
            <br />
            the résumé.
            <em> Find the person.</em>
          </h1>
          <p>
            Good interviews open a conversation.
            <br />
            Great evidence moves it forward.
          </p>
          <LensArtwork className="auth-lens" />
        </div>
        <div className="auth-foot">
          <ShieldCheck size={16} /> Built around evidence. Centered on people.
        </div>
      </aside>
      <main id="main-content" className="auth-main">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="auth-top">
          {mode === "login" ? (
            <>
              New to HireLens?{" "}
              <Link to={"/signup" + location.search}>
                Create an account <ArrowUpRight size={14} />
              </Link>
            </>
          ) : (
            <Link to={"/login" + location.search}>
              Back to sign in <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
        <div className="auth-form-wrap">
          <span className="eyebrow">YOUR HIRING WORKSPACE</span>
          <h2>{titles[mode]}</h2>
          <p className="muted">{descriptions[mode]}</p>
          {message ? (
            <div className="success-panel">
              <CheckCircle2 size={32} />
              <h3>Check, and you’re all set.</h3>
              <p>{message}</p>
              <Link className="button secondary" to="/login">
                Back to sign in <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="form-stack">
              {mode === "signup" && (
                <>
                  <div className="role-switch" aria-label="Account type">
                    <button
                      type="button"
                      className={role === "recruiter" ? "selected" : ""}
                      onClick={() => setRole("recruiter")}
                    >
                      I’m hiring
                    </button>
                    <button
                      type="button"
                      className={role === "candidate" ? "selected" : ""}
                      onClick={() => setRole("candidate")}
                    >
                      I’m interviewing
                    </button>
                  </div>
                  <Field label="Full name">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={120}
                      autoComplete="name"
                      placeholder="Alex Morgan"
                    />
                  </Field>
                  {role === "recruiter" && (
                    <Field label="Organization">
                      <input
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        required
                        maxLength={120}
                        placeholder="Your company"
                        autoComplete="organization"
                      />
                    </Field>
                  )}
                </>
              )}
              {["login", "signup", "forgot"].includes(mode) && (
                <Field label="Email address">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                  />
                </Field>
              )}
              {["login", "signup", "reset"].includes(mode) && (
                <Field
                  label="Password"
                  hint={
                    mode === "login"
                      ? undefined
                      : "Use at least 10 characters. Avoid common passwords."
                  }
                >
                  <div className="password-input">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={mode === "login" ? 1 : 10}
                      maxLength={256}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </Field>
              )}
              {mode === "login" && !showMfa && (
                <button type="button" className="text-button auth-mfa-toggle" onClick={() => setShowMfa(true)}>
                  Sign in with an authenticator code
                </button>
              )}
              {mode === "login" && showMfa && (
                <Field label="Authenticator code (if enabled)">
                  <input inputMode="numeric" pattern="[0-9]{6}" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} maxLength={6} placeholder="123456" />
                </Field>
              )}
              {mode === "login" && (
                <Link className="forgot-link" to="/forgot-password">
                  Forgot password?
                </Link>
              )}
              {error && <ErrorBox message={error} />}
              <Button disabled={busy} type="submit" className="full-width">
                {busy
                  ? "One moment…"
                  : mode === "login"
                    ? "Sign in to HireLens"
                    : mode === "signup"
                      ? "Create account"
                      : mode === "forgot"
                        ? "Send reset link"
                        : mode === "verify"
                          ? "Verify email"
                          : "Update password"}
                <ArrowRight size={17} />
              </Button>
              {mode === "login" && (
                <button
                  type="button"
                  className="text-button small"
                  disabled={busy || !email}
                  onClick={resend}
                >
                  Resend verification email
                </button>
              )}
            </form>
          )}
          <p className="auth-note">
            <ShieldCheck size={15} /> Your workspace is private. Your decisions
            stay yours.
          </p>
        </div>
        <footer>
          © {new Date().getFullYear()} HireLens{" "}
          <span>Built around people.</span>
        </footer>
      </main>
    </div>
  );
}
