import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Clock3,
  CheckCircle2,
  ShieldCheck,
  BookOpen,
  LogOut,
  WifiOff,
  Check,
  Info,
  ScanLine,
  ArrowUpRight,
  RotateCcw,
  CalendarDays,
  Sparkles,
  TimerReset,
  CircleHelp,
  UserRound,
} from "lucide-react";
import { api, send, ApiError } from "../api";
import { useAuth, Brand } from "../auth";
import type { InterviewState } from "../types";
import { Button, ErrorBox, Loading, Modal, Badge, Status, Empty, Avatar } from "../ui";
import LiveInterviewRoom from "../components/LiveInterviewRoom";

const CodeEditor = lazy(() => import("../components/CodeEditor"));
const TAB_ID = crypto.randomUUID();
interface InviteInfo {
  position: string;
  experience: string;
  organization: string;
  duration_minutes: number;
  question_count: number;
  instructions: string;
  expires_at: string;
  redeemed: boolean;
  demo_data: boolean;
  ai_ready: boolean;
  skills: string[];
}
function CandidateHeader() {
  const { user, logout } = useAuth(),
    navigate = useNavigate(),
    location = useLocation(),
    [error, setError] = useState("");
  async function exit() {
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <header className="candidate-header">
        <div className="candidate-header-brand">
          <Brand />
          {user && <span className="candidate-header-divider" />}
          {user && <span className="candidate-header-context">Candidate workspace</span>}
        </div>
        <div className="candidate-header-right">
          {user && (
            <nav className="candidate-nav" aria-label="Candidate navigation">
              <Link className={location.pathname === "/my-interviews" ? "active" : ""} to="/my-interviews">My interviews</Link>
              <Link className={location.pathname === "/candidate-workspace" ? "active" : ""} to="/candidate-workspace">Profile & settings</Link>
            </nav>
          )}
          <span className="candidate-secure">
            <ShieldCheck size={15} />
            Private & secure
          </span>
          {user && (
            <div className="candidate-account-menu">
              <Avatar name={user.name} />
              <span>{user.name.split(" ")[0]}</span>
              <button className="icon-button" onClick={exit} aria-label="Sign out" title="Sign out">
                <LogOut size={17} />
              </button>
            </div>
          )}
        </div>
      </header>
      {error && <ErrorBox message={error} />}
    </>
  );
}
export function InvitePage() {
  const location = useLocation(),
    navigate = useNavigate(),
    { user } = useAuth(),
    token = new URLSearchParams(location.hash.slice(1)).get("token") || "",
    [info, setInfo] = useState<InviteInfo | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [demo, setDemo] = useState(false);
  useEffect(() => {
    if (!token) {
      setError(
        "This invitation link is incomplete. Ask your recruiter for the full link.",
      );
      return;
    }
    send<InviteInfo>("/invite/preview/", { token })
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [token]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await send<{ id: string }>("/interviews/start/", {
        token,
        tab_id: TAB_ID,
        consent,
        demo_acknowledged: demo,
      });
      navigate(`/interview/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const next = encodeURIComponent("/invite#token=" + token);
  return (
    <div className="candidate-page invite-page">
      <CandidateHeader />
      <main id="main-content" className="invite-main">
        <div className="invite-intro">
          <span className="eyebrow">YOUR NEXT CHAPTER</span>
          <h1>
            Let your thinking
            <br />
            do the talking.
          </h1>
          <p>
            A little space to show what you know,
            <br />
            and how you approach a challenge.
          </p>
          <div className="invite-lens" aria-hidden="true">
            <div />
            <div />
            <ScanLine size={64} />
          </div>
        </div>
        <section className="panel invite-card">
          {error && <ErrorBox message={error} />}{" "}
          {!info && !error ? (
            <Loading />
          ) : (
            info && (
              <>
                <Badge tone="green">{info.organization}</Badge>
                <h2>{info.position}</h2>
                <p className="muted">
                  {info.experience} · Adaptive technical interview
                </p>
                <div className="invite-facts">
                  <div>
                    <Clock3 size={21} />
                    <strong>{info.duration_minutes} minutes</strong>
                    <small>Your answering time</small>
                  </div>
                  <div>
                    <BookOpen size={21} />
                    <strong>{info.question_count} questions</strong>
                    <small>One at a time</small>
                  </div>
                </div>
                <h3>Before we begin</h3>
                <p className="preserve-whitespace instructions-copy">
                  {info.instructions}
                </p>
                <ul className="interview-expectations">
                  <li>
                    <CheckCircle2 size={16} />
                    Questions adapt as the interview progresses.
                  </li>
                  <li>
                    <CheckCircle2 size={16} />
                    Gemini asks each question aloud and keeps it visible on
                    screen.
                  </li>
                  <li>
                    <CheckCircle2 size={16} />
                    Your camera is a local preview. HireLens does not record or
                    retain camera or microphone media.
                  </li>
                  <li>
                    <CheckCircle2 size={16} />
                    Processing time doesn’t use your answering time.
                  </li>
                  <li>
                    <CheckCircle2 size={16} />
                    Your recruiter receives the results after submission.
                  </li>
                </ul>
                <div className="skill-tags">
                  {info.skills.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                </div>
                {!user ? (
                  <div className="invite-login">
                    <p>
                      Sign in or create a candidate account using the email your
                      invitation was sent to.
                    </p>
                    <Link className="button primary" to={"/login?next=" + next}>
                      Sign in to continue <ArrowRight size={16} />
                    </Link>
                    <Link className="text-link" to={"/signup?next=" + next}>
                      Create a candidate account
                    </Link>
                  </div>
                ) : user.role !== "candidate" ? (
                  <p className="error-text">
                    Sign out and use the candidate account this invitation
                    belongs to.
                  </p>
                ) : (
                  <>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      I understand that my spoken answer is streamed live to
                      Gemini for transcription and AI-assisted evaluation. I
                      understand HireLens stores the final transcript, not a
                      recording.
                    </label>
                    {info.demo_data && (
                      <label className="checkbox-label demo-consent">
                        <input
                          type="checkbox"
                          checked={demo}
                          onChange={(e) => setDemo(e.target.checked)}
                        />
                        I’ll use fictional, non-sensitive answers for this demo.
                        Answers are sent to Google’s Gemini API; its free
                        service may use them to improve products.
                      </label>
                    )}
                    {!info.ai_ready && !info.redeemed && (
                      <p className="notice">
                        <Info size={16} />
                        Evaluation is not ready yet. Your invitation is safe;
                        contact the organizer before starting.
                      </p>
                    )}
                    <Button
                      className="full-width"
                      onClick={start}
                      disabled={
                        busy ||
                        !consent ||
                        (info.demo_data && !demo) ||
                        (!info.ai_ready && !info.redeemed)
                      }
                    >
                      {busy
                        ? "Preparing your interview…"
                        : info.redeemed
                          ? "Return to your interview"
                          : "I’m ready to begin"}
                      <ArrowRight size={17} />
                    </Button>
                  </>
                )}
              </>
            )
          )}
        </section>
      </main>
      <footer className="candidate-footer">
        Take a breath. Be yourself. Show your thinking.
      </footer>
    </div>
  );
}

export function MyInterviews() {
  const { user } = useAuth(),
    [data, setData] = useState<{
      interviews: {
        id: string;
        position: string;
        drive: string;
        status: string;
        created_at: string;
        expires_at: string;
        question_count: number;
        completed_questions: number;
        duration_minutes: number;
      }[];
      invitations: {
        position: string;
        drive: string;
        expires_at: string;
        organization: string;
        duration_minutes: number;
        question_count: number;
      }[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<typeof data>("/interviews/")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const active = data?.interviews.find((item) => item.status === "in_progress");
  const pending = data?.invitations[0];
  const completed = data?.interviews.filter((item) => item.status === "completed").length || 0;
  const daysLeft = (value: string) => Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000));
  return (
    <div className="candidate-page candidate-dashboard-page">
      <CandidateHeader />
      <main id="main-content" className="candidate-dashboard">
        <section className="candidate-welcome-row">
          <div>
            <span className="eyebrow">CANDIDATE HOME</span>
            <h1>Good to see you, {user?.name.split(" ")[0]}.</h1>
            <p>Everything you need for your next conversation, in one clear place.</p>
          </div>
          <div className="candidate-welcome-mark" aria-hidden="true"><Sparkles size={24} /><span>Show your thinking.</span></div>
        </section>
        {error && <ErrorBox message={error} />}
        <section className="candidate-stat-grid" aria-label="Interview overview">
          <article className="candidate-stat-card accent"><span className="candidate-stat-icon"><TimerReset size={18} /></span><strong>{active ? "In progress" : pending ? "Ready when you are" : "All caught up"}</strong><small>Next step</small></article>
          <article className="candidate-stat-card"><span className="candidate-stat-icon"><CalendarDays size={18} /></span><strong>{data?.interviews.length || 0}</strong><small>Total interviews</small></article>
          <article className="candidate-stat-card"><span className="candidate-stat-icon"><CheckCircle2 size={18} /></span><strong>{completed}</strong><small>Completed</small></article>
        </section>
        {active ? (
          <section className="candidate-hero-card active-card">
            <div className="candidate-hero-glow" aria-hidden="true" />
            <div className="candidate-hero-copy">
              <div className="candidate-card-label"><span className="live-dot" /> INTERVIEW IN PROGRESS</div>
              <h2>Pick up where you left off.</h2>
              <p>{active.position} · {active.completed_questions} of {active.question_count} questions complete</p>
              <div className="candidate-progress-track"><i style={{ width: `${Math.min(100, active.completed_questions / active.question_count * 100)}%` }} /></div>
              <Link className="button primary" to={`/interview/${active.id}`}>Continue interview <ArrowRight size={17} /></Link>
            </div>
            <div className="candidate-hero-meta"><span><Clock3 size={16} /> {active.duration_minutes} min total</span><span><ShieldCheck size={16} /> Private session</span></div>
          </section>
        ) : pending ? (
          <section className="candidate-hero-card invite-card-dashboard">
            <div className="candidate-hero-copy">
              <div className="candidate-card-label">NEW INVITATION</div>
              <h2>{pending.position}</h2>
              <p>{pending.organization} · {pending.drive}</p>
              <div className="candidate-invite-meta"><span><Clock3 size={16} /> {pending.duration_minutes} minutes</span><span><BookOpen size={16} /> {pending.question_count} questions</span><span><CalendarDays size={16} /> {daysLeft(pending.expires_at)} days left</span></div>
              <p className="candidate-invite-note">Open the invitation link from your recruiter to review the instructions and begin.</p>
            </div>
            <div className="candidate-invite-art" aria-hidden="true"><Sparkles size={35} /></div>
          </section>
        ) : null}
        <section className="candidate-section-heading"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>Interview history</h2></div><Link className="text-link" to="/candidate-workspace">Manage your profile <ArrowUpRight size={14} /></Link></section>
        <div className="candidate-history-list">
          {data?.interviews.map((item) => (
            <article className="candidate-history-card" key={item.id}>
              <div className="candidate-history-icon"><UserRound size={18} /></div>
              <div className="candidate-history-main"><div className="candidate-history-title"><h3>{item.position}</h3><Status value={item.status} /></div><p>{item.drive}</p><small>{item.status === "completed" ? `Completed ${new Date(item.created_at).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}` : `${item.completed_questions}/${item.question_count} questions complete · ${daysLeft(item.expires_at)} days left`}</small></div>
              <Link className="button secondary" to={`/interview/${item.id}`}>{item.status === "completed" ? "View confirmation" : "Continue"}<ArrowUpRight size={16} /></Link>
            </article>
          ))}
          {!data && !error && <Loading />}
          {data && !data.interviews.length && !data.invitations.length && <section className="panel candidate-empty-panel"><Empty title="Your next opportunity will appear here" description="When a recruiter sends you an invitation, this is where you’ll find the details and next step." action={<Link className="button secondary" to="/candidate-workspace">Complete your profile</Link>} /></section>}
        </div>
        <section className="candidate-privacy-strip"><ShieldCheck size={20} /><div><strong>Your interview space is private by design.</strong><p>HireLens stores final transcripts and timing metadata. Camera and microphone media are never recorded.</p></div><Link to="/candidate-workspace">Privacy center <ArrowUpRight size={14} /></Link></section>
      </main>
    </div>
  );
}

export default function Interview() {
  const { id } = useParams(),
    [data, setData] = useState<InterviewState | null>(null),
    [error, setError] = useState(""),
    [answer, setAnswer] = useState(""),
    [saving, setSaving] = useState("saved"),
    [saveRetry, setSaveRetry] = useState(0),
    [submitting, setSubmitting] = useState(false),
    [codeBriefedAttempt, setCodeBriefedAttempt] = useState(""),
    [instructions, setInstructions] = useState(false),
    [confirm, setConfirm] = useState(false),
    [tabConflict, setTabConflict] = useState(false),
    [now, setNow] = useState(Date.now()),
    [offset, setOffset] = useState(0);
  const currentAttempt = useRef(""),
    submissionIds = useRef<Record<string, string>>({}),
    lastSaved = useRef(""),
    answerRef = useRef(""),
    submitRef = useRef<() => void>(() => {}),
    mounted = useRef(true);
  const attempt = data?.attempt;
  const elapsed = attempt
    ? Math.max(0, (now + offset - new Date(attempt.issued_at).getTime()) / 1000)
    : 0;
  const remaining = Math.max(
    0,
    Math.floor(
      (data?.budget_seconds || 0) - (data?.answering_seconds || 0) - elapsed,
    ),
  );
  async function refresh() {
    try {
      const d = await api<InterviewState>(`/interviews/${id}/`);
      if (!mounted.current) return;
      setData(d);
      setOffset(new Date(d.server_time).getTime() - Date.now());
      if (d.attempt && currentAttempt.current !== d.attempt.id) {
        currentAttempt.current = d.attempt.id;
        const draft = sessionStorage.getItem("hirelens:draft:" + d.attempt.id);
        const text = draft ?? d.attempt.draft ?? d.attempt.starter_code;
        setAnswer(text || d.attempt.starter_code || "");
        answerRef.current = text || d.attempt.starter_code || "";
        lastSaved.current = d.attempt.draft;
        setSaving(draft && draft !== d.attempt.draft ? "unsaved" : "saved");
      }
      if (d.status === "completed") {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const key = sessionStorage.key(i);
          if (key?.startsWith("hirelens:draft:"))
            sessionStorage.removeItem(key);
        }
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    }
  }
  async function heartbeat(takeOver = false, focusLost = false) {
    try {
      await send(`/interviews/${id}/heartbeat/`, {
        tab_id: TAB_ID,
        take_over: takeOver,
        focus_lost: focusLost,
      });
      if (mounted.current) setTabConflict(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setTabConflict(true);
    }
  }
  useEffect(() => {
    mounted.current = true;
    refresh();
    heartbeat();
    const polling = setInterval(refresh, 4000),
      heart = setInterval(() => heartbeat(), 20000),
      clock = setInterval(() => setNow(Date.now()), 1000);
    function visibility() {
      if (document.hidden) heartbeat(false, true);
    }
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      clearInterval(polling);
      clearInterval(heart);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [id]);
  useEffect(() => {
    if (!attempt || submitting || tabConflict || answer === lastSaved.current)
      return;
    setSaving("unsaved");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSaving("saving");
      try {
        await api(`/interviews/${id}/answer/`, {
          method: "PUT",
          body: JSON.stringify({
            attempt_id: attempt.id,
            answer,
            tab_id: TAB_ID,
          }),
          signal: controller.signal,
        });
        lastSaved.current = answer;
        setSaving("saved");
        sessionStorage.removeItem("hirelens:draft:" + attempt.id);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setSaving("offline");
          if (e instanceof ApiError && e.status === 409) setTabConflict(true);
        }
      }
    }, 1000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [answer, attempt?.id, submitting, tabConflict, saveRetry]);
  useEffect(() => {
    if (saving !== "offline") return;
    const retry = () => setSaveRetry((v) => v + 1);
    const timer = setTimeout(retry, 5000);
    window.addEventListener("online", retry);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", retry);
    };
  }, [saving, saveRetry]);
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (data?.status === "in_progress" && !data.processing) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [data?.status, data?.processing]);
  async function submit(finalAnswer = answerRef.current) {
    if (!attempt || submitting || tabConflict) return;
    setSubmitting(true);
    setConfirm(false);
    setError("");
    submissionIds.current[attempt.id] ??= crypto.randomUUID();
    try {
      const d = await send<InterviewState>(`/interviews/${id}/answer/`, {
        attempt_id: attempt.id,
        answer: finalAnswer,
        tab_id: TAB_ID,
        submission_id: submissionIds.current[attempt.id],
      });
      sessionStorage.removeItem("hirelens:draft:" + attempt.id);
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  submitRef.current = submit;
  useEffect(() => {
    if (attempt && remaining === 0 && !submitting && !tabConflict)
      submitRef.current();
  }, [remaining, attempt?.id, tabConflict]);
  function change(value: string) {
    setAnswer(value);
    answerRef.current = value;
    if (attempt) sessionStorage.setItem("hirelens:draft:" + attempt.id, value);
  }
  async function retry() {
    try {
      await send(`/interviews/${id}/retry/`);
      setError("");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!data)
    return (
      <div className="candidate-page">
        <CandidateHeader />
        <div className="standalone">
          {error ? <ErrorBox message={error} retry={refresh} /> : <Loading />}
        </div>
      </div>
    );
  if (data.status === "completed")
    return (
      <div className="candidate-page">
        <CandidateHeader />
        <main id="main-content" className="completion-card">
          <div className="completion-orbit">
            <CheckCircle2 size={54} />
          </div>
          <span className="eyebrow">INTERVIEW SUBMITTED</span>
          <h1>
            Your part is done.
            <br />
            Thank you for showing up.
          </h1>
          <p>
            Your answers for <strong>{data.position}</strong> have been saved.
            Your recruiter will review the results and share the next steps.
          </p>
          <div className="completion-details">
            <span>
              <Check size={17} />
              {data.completed_questions} answers received
            </span>
            <span>
              <ShieldCheck size={17} />
              Your responses are securely stored
            </span>
          </div>
          <Link className="button primary" to="/my-interviews">
            Back to your interviews <ArrowRight size={17} />
          </Link>
          <small>You can safely close this window.</small>
        </main>
      </div>
    );
  return (
    <div className="candidate-page interview-page">
      <CandidateHeader />
      <div className="interview-topline">
        <div>
          <span className="eyebrow">TECHNICAL INTERVIEW</span>
          <h1>{data.position}</h1>
          <div className="interview-session-meta"><span><ShieldCheck size={13} /> Private session</span><span><CircleHelp size={13} /> Need help? Open instructions</span></div>
        </div>
        <button className="button ghost" onClick={() => setInstructions(true)}>
          <BookOpen size={16} />
          Instructions
        </button>
      </div>
      <main id="main-content" className="interview-main">
        <aside className="interview-sidebar">
          <div className="interview-progress-heading">
            <span>Your progress</span>
            <strong>
              {data.completed_questions}/{data.question_count}
            </strong>
          </div>
          <div className="segmented-progress">
            {Array.from({ length: data.question_count }, (_, i) => (
              <span
                key={i}
                className={
                  i < data.completed_questions
                    ? "done"
                    : i === data.completed_questions
                      ? "current"
                      : ""
                }
              />
            ))}
          </div>
          <p className="muted small">
            One question at a time.
            <br />
            Room to show how you think.
          </p>
          <div className={`interview-timer ${remaining < 120 ? "urgent" : ""}`}>
            <Clock3 size={19} />
            <div>
              <strong>
                {String(Math.floor(remaining / 60)).padStart(2, "0")}
                <span>:</span>
                {String(remaining % 60).padStart(2, "0")}
              </strong>
              <small>
                {data.processing
                  ? "Timer paused while processing"
                  : "Answering time remaining"}
              </small>
            </div>
          </div>
          <div className="candidate-tip">
            <span>
              <Info size={16} />A small reminder
            </span>
            <p>
              Explain your approach and the trade-offs you considered. A clear
              thought process matters.
            </p>
          </div>
        </aside>
        <section className="interview-workspace">
          {error && (
            <ErrorBox
              message={error}
              retry={() => {
                setError("");
                refresh();
              }}
            />
          )}
          {tabConflict ? (
            <div className="panel interview-pause">
              <ScanLine size={38} />
              <h2>Your interview is open elsewhere.</h2>
              <p>Use one tab at a time to keep your answers in sync.</p>
              <Button onClick={() => heartbeat(true)}>
                Continue in this tab
              </Button>
            </div>
          ) : data.processing ? (
            <div className="panel processing-panel">
              <div className="processing-lens">
                <ScanLine size={35} />
              </div>
              <Badge tone="green">Answer received</Badge>
              <h2>
                {data.processing_failed
                  ? "Your answer is safe."
                  : "A moment to consider your answer."}
              </h2>
              <p>
                {data.processing_failed
                  ? "Evaluation couldn’t finish. You can retry without resubmitting your answer."
                  : data.processing_error
                    ? "Evaluation is taking a little longer. We’ll continue when processing is available."
                    : "We’re reviewing your response and preparing the next question."}
              </p>
              <span className="muted small">
                <Clock3 size={14} />
                Your answering timer is paused.
              </span>
              {data.processing_failed && (
                <Button onClick={retry}>
                  <RotateCcw size={16} />
                  Retry evaluation
                </Button>
              )}
            </div>
          ) : attempt ? (
            attempt.kind === "text" ? (
              <LiveInterviewRoom
                key={attempt.id}
                interviewId={id || ""}
                tabId={TAB_ID}
                attempt={attempt}
                disabled={submitting}
                onTranscript={change}
                onFinalAnswer={(value) => {
                  change(value);
                  submit(value);
                }}
              />
            ) : codeBriefedAttempt !== attempt.id ? (
              <LiveInterviewRoom
                key={attempt.id}
                interviewId={id || ""}
                tabId={TAB_ID}
                attempt={attempt}
                disabled={submitting}
                questionOnly
                onQuestionReady={() => setCodeBriefedAttempt(attempt.id)}
                onTranscript={() => undefined}
                onFinalAnswer={() => undefined}
              />
            ) : (
              <div className="panel question-workspace">
                <div className="question-context">
                  <Badge tone="green">
                    Question {attempt.ordinal} of {data.question_count}
                  </Badge>
                  <span>{attempt.topic}</span>
                </div>
                <h2>{attempt.title}</h2>
                <p className="question-prompt">{attempt.prompt}</p>
                <div className="answer-label">
                  <label htmlFor="candidate-answer">
                    {attempt.kind === "code" ? "Your solution" : "Your answer"}
                  </label>
                  <span
                    className={`save-state ${saving === "offline" ? "offline" : ""}`}
                    role="status"
                  >
                    {saving === "offline" ? (
                      <WifiOff size={13} />
                    ) : (
                      <Check size={13} />
                    )}{" "}
                    {saving === "saved"
                      ? "Saved"
                      : saving === "saving"
                        ? "Saving…"
                        : saving === "offline"
                          ? "Saved on this device · reconnect to sync"
                          : "Unsaved changes"}
                  </span>
                </div>
                <Suspense fallback={<div className="skeleton tall" />}>
                  <CodeEditor
                    value={answer}
                    onChange={change}
                    language={attempt.language}
                    disabled={submitting}
                  />
                </Suspense>
                <div className="answer-footer">
                  <span>
                    {answer.length.toLocaleString()} / 16,000 characters
                  </span>
                  <span>Answers are final once submitted.</span>
                </div>
                <div className="question-actions">
                  <span>
                    <ShieldCheck size={14} />
                    Saved to your interview
                  </span>
                  <Button
                    onClick={() =>
                      answer.trim() ? submit() : setConfirm(true)
                    }
                    disabled={submitting || answer.length > 16000}
                  >
                    {submitting
                      ? "Submitting…"
                      : attempt.ordinal === data.question_count
                        ? "Submit final answer"
                        : "Submit answer"}
                    <ArrowRight size={17} />
                  </Button>
                </div>
              </div>
            )
          ) : (
            <Loading />
          )}
        </section>
      </main>
      <Modal
        open={instructions}
        onOpenChange={setInstructions}
        title="Your interview instructions"
        description="A quick reminder of what to expect."
      >
        <p className="preserve-whitespace instructions-copy">
          {data.instructions}
        </p>
        <p className="muted small">
          Your answering timer continues while these instructions are open.
          Processing time is excluded.
        </p>
        <div className="form-actions">
          <Button onClick={() => setInstructions(false)}>
            Back to the question
          </Button>
        </div>
      </Modal>
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Submit without an answer?"
        description="This question will be recorded as unanswered. You can continue to the next one."
      >
        <div className="form-actions">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Keep working
          </Button>
          <Button onClick={() => submit()}>Submit unanswered</Button>
        </div>
      </Modal>
    </div>
  );
}
