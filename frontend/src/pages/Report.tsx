import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  ArrowUpRight,
  MessageSquareText,
  Clock3,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Quote,
  AlertCircle,
  FileCheck2,
} from "lucide-react";
import { send, useResource } from "../api";
import type { Report as ReportData, Insight } from "../types";
import {
  PageHeader,
  Loading,
  ErrorBox,
  Button,
  Badge,
  Status,
  Avatar,
  Modal,
  Field,
  formatTime,
  formatDate,
  useToast,
} from "../ui";

export default function Report() {
  const { id } = useParams(),
    { data, error, loading, reload } = useResource<ReportData>(
      `/reports/${id}/`,
    ),
    [expanded, setExpanded] = useState<string[]>([]),
    [review, setReview] = useState(false),
    [retryError, setRetryError] = useState(""),
    toast = useToast();
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error} retry={reload} />;
  function openEvidence(attemptId: string) {
    setExpanded((v) => (v.includes(attemptId) ? v : [...v, attemptId]));
    setTimeout(
      () =>
        document
          .getElementById("attempt-" + attemptId)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  }
  async function retry() {
    try {
      await send(`/reports/${id}/retry/`);
      reload();
      toast("Evidence summary queued for processing.");
    } catch (e) {
      setRetryError((e as Error).message);
    }
  }
  return (
    <>
      <Link className="back-link" to={`/drives/${data.drive_id}`}>
        <ArrowLeft size={16} />
        {data.drive}
      </Link>
      <PageHeader
        eyebrow="CANDIDATE SCORECARD"
        title="A closer look at the evidence."
        action={
          <div className="button-row">
            <a
              className="button secondary"
              href={`/api/reports/${id}/export/csv/`}
            >
              <Download size={16} />
              CSV
            </a>
            <a
              className="button primary"
              href={`/api/reports/${id}/export/pdf/`}
            >
              <Download size={16} />
              Download PDF
            </a>
          </div>
        }
      />
      {data.source === "seed" && (
        <div className="demo-notice">
          <AlertCircle size={17} />
          Illustrative demo report · Fictional candidate and sample evaluations.
        </div>
      )}
      <section className="report-profile panel">
        <div className="report-person">
          <Avatar name={data.candidate.name} size="large" />
          <div>
            <h2>{data.candidate.name}</h2>
            <p>{data.position}</p>
            <small>{data.candidate.email}</small>
          </div>
        </div>
        <div className="report-profile-meta">
          <span>
            <Clock3 size={15} />
            {formatTime(data.answering_seconds)}
          </span>
          <span>
            <FileCheck2 size={15} />
            {data.transcript.length} questions
          </span>
          <span>Completed {formatDate(data.completed_at)}</span>
        </div>
        <div className="overall-score">
          <div
            className="score-circle"
            style={{
              background: `conic-gradient(#236955 ${data.overall * 3.6}deg,#e8eee8 0)`,
            }}
          >
            <div>
              <strong>{data.overall}</strong>
              <small>OUT OF 100</small>
            </div>
          </div>
          <Status value={data.recommendation} />
        </div>
      </section>
      <div className="report-columns">
        <section className="panel report-summary">
          <div className="panel-heading">
            <div>
              <h2>Assessment summary</h2>
              <p>What the answers tell us.</p>
            </div>
            <Badge tone="green">
              <ShieldCheck size={13} />
              {data.confidence} confidence
            </Badge>
          </div>
          <div className="report-prose">
            {data.summary ? (
              <p>{data.summary}</p>
            ) : (
              <div className="pending-narrative">
                <p>
                  {data.narrative_status === "failed"
                    ? "The evidence summary needs another attempt. Numeric scores and the transcript are available."
                    : "The evidence summary is being prepared. Numeric scores and the transcript are available."}
                </p>
                <Button
                  variant="secondary"
                  onClick={data.narrative_status === "failed" ? retry : reload}
                >
                  {data.narrative_status === "failed"
                    ? "Retry summary"
                    : "Refresh report"}
                </Button>
              </div>
            )}
            {retryError && <ErrorBox message={retryError} />}
            <div className="report-decision-note">
              <MessageSquareText size={18} />
              <p>
                This recommendation supports your decision. Review the evidence
                and add your own assessment.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setReview(true)}>
              Record your review <ArrowUpRight size={15} />
            </Button>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Score composition</h2>
              <p>Clear criteria, visible weights.</p>
            </div>
          </div>
          <div className="component-list">
            {[
              ["technical", "Technical depth", 60],
              ["reasoning", "Reasoning", 20],
              ["communication", "Communication", 10],
              ["efficiency", "Time efficiency", 5],
              ["consistency", "Topic consistency", 5],
            ].map(([key, label, weight]) => (
              <div key={key}>
                <span>
                  {label}
                  <small>{weight}% weight</small>
                </span>
                <div className="component-track">
                  <i style={{ width: `${data.components[key as string]}%` }} />
                </div>
                <strong>{Math.round(data.components[key as string])}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="evidence-columns">
        <InsightPanel
          title="Where they shine"
          description="Strengths supported by their own words."
          insights={data.strengths}
          positive
          onOpen={openEvidence}
        />
        <InsightPanel
          title="Where to dig deeper"
          description="Topics to explore in a follow-up conversation."
          insights={data.weaknesses}
          onOpen={openEvidence}
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Topic breakdown</h2>
            <p>Adjusted to a common medium-difficulty reference.</p>
          </div>
        </div>
        <div className="topic-score-grid">
          {data.topics.map((t) => (
            <article key={t.topic}>
              <div>
                <h3>{t.topic}</h3>
                <span>
                  {t.count} question{t.count !== 1 ? "s" : ""}
                </span>
              </div>
              <strong>
                {t.score}
                <small>/100</small>
              </strong>
              <div className="topic-track">
                <i style={{ width: `${t.score}%` }} />
              </div>
              <p>
                Raw accuracy {t.raw_score}% · Minimum {t.minimum}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className="panel transcript-panel">
        <div className="panel-heading">
          <div>
            <h2>Interview transcript</h2>
            <p>
              Every question, every answer, and the rubric behind the score.
            </p>
          </div>
          <button
            className="text-button"
            onClick={() =>
              setExpanded(
                expanded.length === data.transcript.length
                  ? []
                  : data.transcript.map((a) => a.id),
              )
            }
          >
            {expanded.length === data.transcript.length
              ? "Collapse all"
              : "Expand all"}
          </button>
        </div>
        {data.transcript.map((a) => (
          <article
            className="transcript-item"
            key={a.id}
            id={"attempt-" + a.id}
          >
            <button
              className="transcript-toggle"
              aria-expanded={expanded.includes(a.id)}
              onClick={() =>
                setExpanded((v) =>
                  v.includes(a.id)
                    ? v.filter((id) => id !== a.id)
                    : [...v, a.id],
                )
              }
            >
              <span className="question-number">
                {String(a.ordinal).padStart(2, "0")}
              </span>
              <div>
                <strong>{a.question.title}</strong>
                <small>
                  {a.question.topic} ·{" "}
                  {a.question.difficulty === 1
                    ? "Hard"
                    : a.question.difficulty === 0
                      ? "Medium"
                      : "Easy"}{" "}
                  · {formatTime(a.elapsed_seconds)}
                </small>
              </div>
              <span className="transcript-score">
                {a.evaluation?.score ?? "—"}
                <small>/100</small>
              </span>
              {expanded.includes(a.id) ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </button>
            {expanded.includes(a.id) && (
              <div className="transcript-content">
                <h4>The question</h4>
                <p className="preserve-whitespace">{a.question.prompt}</p>
                <h4>Candidate’s answer</h4>
                <div
                  className={`answer-block ${a.question.kind === "code" ? "code-answer" : ""}`}
                >
                  {a.answer || "No answer was submitted."}
                </div>
                <div className="adaptive-audit-note">
                  <strong>Why this question was next</strong>
                  <p>{a.selection_reason?.explanation || "Baseline question selected from the approved role pool."}</p>
                  <small>
                    {a.clarification_count ? `${a.clarification_count} clarification turn · ` : ""}
                    {a.submitted_at ? `Submitted ${formatDate(a.submitted_at)}` : "Not submitted"}
                  </small>
                </div>
                {a.evaluation && (
                  <>
                    <h4>Assessment</h4>
                    <p>{a.evaluation.feedback}</p>
                    <div className="evaluation-pills">
                      <Badge>
                        Semantic similarity {a.evaluation.semantic}%
                      </Badge>
                      <Badge>Concept coverage {a.evaluation.coverage}%</Badge>
                      {a.evaluation.code_structure !== null && (
                        <Badge>
                          Static structure {a.evaluation.code_structure}%
                        </Badge>
                      )}
                    </div>
                    <div className="evidence-list">
                      {a.evaluation.evidence.map((e, i) => (
                        <div className="concept-evidence" key={i}>
                          <div>
                            <strong>{e.concept}</strong>
                            <Badge
                              tone={
                                e.contradiction
                                  ? "red"
                                  : e.coverage === 1
                                    ? "green"
                                    : e.coverage === 0
                                      ? "neutral"
                                      : "amber"
                              }
                            >
                              {e.contradiction
                                ? "Contradiction"
                                : `${e.coverage * 100}% covered`}
                            </Badge>
                          </div>
                          <p>{e.explanation}</p>
                          {e.quote && <blockquote>{e.quote}</blockquote>}
                        </div>
                      ))}
                    </div>
                    <details className="rubric-details">
                      <summary>
                        View expected answer and evaluation version
                      </summary>
                      <p className="preserve-whitespace">
                        {a.question.expected_answer}
                      </p>
                      <small>
                        {a.evaluation.model} · Rubric{" "}
                        {a.evaluation.rubric_version}
                      </small>
                    </details>
                  </>
                )}
              </div>
            )}
          </article>
        ))}
      </section>
      {data.reviews.length > 0 && (
        <section className="panel review-history">
          <h2>Recruiter reviews</h2>
          {data.reviews.map((r, i) => (
            <article key={i}>
              <div>
                <strong>{r.reviewer}</strong>
                <Status value={r.decision} />
                <small>{formatDate(r.created_at)}</small>
              </div>
              <p>{r.note}</p>
            </article>
          ))}
        </section>
      )}
      <p className="analytics-note">
        Confidence describes the available evidence, not a statistical
        guarantee. Ability adjustment is a provisional heuristic. Code is
        assessed statically. {data.integrity_events} focus-change events
        recorded; these are context, not proof of misconduct.
      </p>
      <Modal
        open={review}
        onOpenChange={setReview}
        title="Record your assessment"
        description="Your decision is recorded separately from the generated recommendation."
      >
        {review && (
          <ReviewForm
            reportId={data.id}
            done={() => {
              setReview(false);
              reload();
              toast("Your review has been recorded.");
            }}
          />
        )}
      </Modal>
    </>
  );
}
function InsightPanel({
  title,
  description,
  insights,
  positive = false,
  onOpen,
}: {
  title: string;
  description: string;
  insights: Insight[];
  positive?: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <section
      className={`panel insight-panel ${positive ? "positive" : "development"}`}
    >
      <div className="panel-heading">
        <div>
          <h2>
            {positive ? (
              <CheckCircle2 size={18} />
            ) : (
              <MessageSquareText size={18} />
            )}{" "}
            {title}
          </h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="insights-list">
        {insights.length ? (
          insights.map((s, i) => (
            <article key={i}>
              <p>{s.observation}</p>
              <blockquote>
                <Quote size={14} />
                {s.quote}
              </blockquote>
              <button
                className="text-button small"
                onClick={() => onOpen(s.attempt_id)}
              >
                View in transcript <ArrowUpRight size={13} />
              </button>
            </article>
          ))
        ) : (
          <p className="muted">
            Evidence highlights will appear when the summary is ready.
          </p>
        )}
      </div>
    </section>
  );
}
function ReviewForm({
  reportId,
  done,
}: {
  reportId: string;
  done: () => void;
}) {
  const [decision, setDecision] = useState("borderline"),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await send(`/reports/${reportId}/review/`, { decision, note });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <Field label="Your decision">
        <select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="hire">Advance to next stage</option>
          <option value="borderline">Borderline — follow up</option>
          <option value="no_hire">Do not advance</option>
          <option value="needs_review">Needs further review</option>
        </select>
      </Field>
      <Field label="Supporting notes">
        <textarea
          required
          rows={5}
          maxLength={3000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What evidence informed your decision?"
        />
      </Field>
      {error && <ErrorBox message={error} />}
      <div className="form-actions">
        <Button disabled={busy} type="submit">
          {busy ? "Saving…" : "Save review"}
        </Button>
      </div>
    </form>
  );
}
