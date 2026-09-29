import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, LogOut, Save, ShieldCheck } from "lucide-react";
import { api, send } from "../api";
import { useAuth, Brand } from "../auth";
import { Button, ErrorBox, Field } from "../ui";

type Profile = {
  name: string;
  phone: string;
  timezone: string;
  resume_url: string;
  portfolio_url: string;
  github_url: string;
  linkedin_url: string;
  accommodation_preferences: string;
  interview_consent: boolean;
  transcript_retention_days: number;
  mfa_enabled: boolean;
  notification_preferences: { interview_reminders?: boolean; product_updates?: boolean };
};

export default function CandidateWorkspace() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<"profile" | "settings" | "privacy">("profile");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwords, setPasswords] = useState({ current_password: "", password: "" });
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRecovery, setMfaRecovery] = useState<string[]>([]);

  useEffect(() => {
    api<Profile>("/auth/profile/").then(setProfile).catch((e) => setError(e.message));
  }, []);

  function update(field: keyof Profile, value: unknown) {
    setProfile((current) => (current ? { ...current, [field]: value } : current));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const saved = await api<Profile>("/auth/profile/", {
        method: "PATCH",
        body: JSON.stringify(profile),
      });
      setProfile(saved);
      if (user) setUser({ ...user, name: saved.name });
      setMessage("Your workspace profile is saved.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await send("/auth/password/", passwords);
      setPasswords({ current_password: "", password: "" });
      setMessage("Password updated. Other devices were signed out.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function setupMfa() {
    try {
      const result = await send<{ secret: string; recovery_codes: string[] }>("/auth/mfa/setup/");
      setMfaSecret(result.secret); setMfaRecovery(result.recovery_codes); setMessage("Scan the secret with an authenticator app, then verify a code.");
    } catch (e) { setError((e as Error).message); }
  }

  async function enableMfa(event: FormEvent) {
    event.preventDefault();
    try { await send("/auth/mfa/enable/", { code: mfaCode }); setMessage("Two-factor authentication is enabled for your account."); setMfaCode(""); }
    catch (e) { setError((e as Error).message); }
  }

  async function requestPrivacy(kind: "export" | "deletion") {
    try { await send("/auth/privacy/", { kind }); setMessage(kind === "export" ? "Your export request is queued." : "Your deletion request is queued for review."); }
    catch (e) { setError((e as Error).message); }
  }

  async function exit() { await logout(); navigate("/login"); }

  if (!profile) return <div className="standalone">{error ? <ErrorBox message={error} /> : <p>Loading your workspace…</p>}</div>;
  return (
    <div className="candidate-page">
      <header className="candidate-header workspace-header">
        <Brand />
        <nav aria-label="Candidate workspace">
          <Link to="/my-interviews">Interviews</Link>
          <Link className="active" to="/candidate-workspace">Profile & settings</Link>
        </nav>
        <div className="workspace-header-actions">
          <span className="candidate-secure"><ShieldCheck size={15} /> Private workspace</span>
          <button className="icon-button" onClick={exit} aria-label="Sign out"><LogOut size={17} /></button>
        </div>
      </header>
      <main id="main-content" className="candidate-workspace">
        <Link className="back-link" to="/my-interviews"><ArrowLeft size={15} /> Back to interviews</Link>
        <span className="eyebrow">CANDIDATE WORKSPACE</span>
        <h1>Make the room feel like yours.</h1>
        <p className="muted">Keep your contact details, accessibility preferences, and account controls in one calm place.</p>
        <div className="workspace-tabs" role="tablist">
          {(["profile", "settings", "privacy"] as const).map((value) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
        </div>
        {error && <ErrorBox message={error} />}
        {message && <div className="success-banner"><Check size={16} /> {message}</div>}
        {tab === "profile" && <form className="workspace-form panel" onSubmit={save}>
          <div className="workspace-form-grid">
            <Field label="Full name"><input value={profile.name} onChange={(e) => update("name", e.target.value)} maxLength={120} required /></Field>
            <Field label="Phone (optional)"><input value={profile.phone} onChange={(e) => update("phone", e.target.value)} maxLength={30} /></Field>
            <Field label="Timezone"><input value={profile.timezone} onChange={(e) => update("timezone", e.target.value)} maxLength={80} /></Field>
            <Field label="Resume link"><input type="url" value={profile.resume_url} onChange={(e) => update("resume_url", e.target.value)} placeholder="https://…" /></Field>
            <Field label="Portfolio"><input type="url" value={profile.portfolio_url} onChange={(e) => update("portfolio_url", e.target.value)} placeholder="https://…" /></Field>
            <Field label="GitHub"><input type="url" value={profile.github_url} onChange={(e) => update("github_url", e.target.value)} placeholder="https://github.com/…" /></Field>
            <Field label="LinkedIn"><input type="url" value={profile.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
          </div>
          <Field label="Accommodation preferences"><textarea value={profile.accommodation_preferences} onChange={(e) => update("accommodation_preferences", e.target.value)} maxLength={2000} placeholder="Anything that helps you interview comfortably…" /></Field>
          <Button type="submit" disabled={busy}><Save size={16} /> {busy ? "Saving…" : "Save profile"}</Button>
        </form>}
        {tab === "settings" && <div className="workspace-settings">
          <form className="panel workspace-form" onSubmit={changePassword}><h2>Password</h2><p className="muted">Changing your password signs out other active devices.</p><Field label="Current password"><input type="password" value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} required /></Field><Field label="New password"><input type="password" value={passwords.password} onChange={(e) => setPasswords({ ...passwords, password: e.target.value })} minLength={10} required /></Field><Button type="submit" disabled={busy}>Update password</Button></form>
          <form className="panel workspace-form" onSubmit={save}><h2>Notifications</h2><label className="toggle-row"><input type="checkbox" checked={profile.notification_preferences.interview_reminders !== false} onChange={(e) => update("notification_preferences", { ...profile.notification_preferences, interview_reminders: e.target.checked })} /> Interview reminders</label><label className="toggle-row"><input type="checkbox" checked={profile.notification_preferences.product_updates !== false} onChange={(e) => update("notification_preferences", { ...profile.notification_preferences, product_updates: e.target.checked })} /> Product updates</label><Button type="submit" variant="secondary" disabled={busy}>Save notification preferences</Button></form>
          <div className="panel workspace-form"><h2>Two-factor authentication</h2><p className="muted">Protect sign-in with any authenticator app. HireLens stores only the encrypted-equivalent seed and recovery codes on the server.</p><Button variant="secondary" onClick={setupMfa}>Set up authenticator</Button>{mfaSecret && <><code className="mfa-secret">{mfaSecret}</code><form onSubmit={enableMfa}><Field label="Six-digit code"><input inputMode="numeric" pattern="[0-9]{6}" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} maxLength={6} required /></Field><Button type="submit">Enable MFA</Button></form><small className="muted">Save these recovery codes somewhere safe: {mfaRecovery.join(" · ")}</small></>}</div>
        </div>}
        {tab === "privacy" && <form className="panel workspace-form" onSubmit={save}><h2>Privacy center</h2><p className="muted">HireLens stores final transcripts and timing metadata for the retention period you choose. It never stores interview video or audio files.</p><label className="toggle-row"><input type="checkbox" checked={profile.interview_consent} onChange={(e) => update("interview_consent", e.target.checked)} /> I consent to transcript-based interview evaluation.</label><Field label="Transcript retention (days)"><input type="number" min={30} max={730} value={profile.transcript_retention_days} onChange={(e) => update("transcript_retention_days", Number(e.target.value))} /></Field><div className="button-row"><Button type="submit" disabled={busy}>Save privacy choices</Button><Button type="button" variant="secondary" onClick={() => requestPrivacy("export")}>Queue export request</Button><a className="button secondary" href="/api/auth/privacy/export/">Download my data</a><Button type="button" variant="secondary" onClick={() => requestPrivacy("deletion")}>Request deletion</Button></div></form>}
      </main>
    </div>
  );
}
