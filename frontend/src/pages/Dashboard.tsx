import { Link } from "react-router-dom";
import {
  ArrowRight,
  Plus,
  UsersRound,
  CheckCheck,
  Target,
  Radio,
  ArrowUpRight,
  Clock3,
} from "lucide-react";
import { useResource } from "../api";
import { useAuth } from "../auth";
import type { Overview } from "../types";
import {
  PageHeader,
  Loading,
  ErrorBox,
  Badge,
  Status,
  CandidateTable,
  Empty,
  Avatar,
  Score,
} from "../ui";

export default function Dashboard() {
  const { user } = useAuth(),
    { data, error, loading, reload } = useResource<Overview>("/overview/");
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error} retry={reload} />;
  const stats = [
    {
      label: "Total candidates",
      value: data.stats.candidates,
      icon: UsersRound,
      note: "Across all your interview drives",
      className: "violet",
    },
    {
      label: "Interviews completed",
      value: data.stats.completed,
      icon: CheckCheck,
      note: `${data.stats.completion_rate}% completion rate`,
      className: "teal",
    },
    {
      label: "Average score",
      value: data.stats.completed ? data.stats.average_score : "—",
      icon: Target,
      note: "A signal. The evidence tells more.",
      className: "amber",
    },
    {
      label: "Active drives",
      value: data.stats.active_drives,
      icon: Radio,
      note: "Open for your next great hire",
      className: "blue",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="YOUR WORKSPACE, AT A GLANCE"
        title={`Good to see you, ${user?.name.split(" ")[0]}.`}
        description="Let’s bring your next great hire into focus."
        action={
          <Link className="button primary" to="/drives?create=1">
            <Plus size={17} />
            Create interview drive
          </Link>
        }
      />
      <div className="overview-feature-grid">
        <section className="overview-feature">
          <div className="feature-top">
            <span>
              <span className="live-dot" /> YOUR HIRING, IN MOTION
            </span>
            <span>THE BIGGER PICTURE ↗</span>
          </div>
          <div className="feature-body">
            <h2>
              Every answer.
              <br />
              <em>A clearer picture.</em>
            </h2>
            <p>
              Find the thinking behind the résumé.
              <br />
              Your next conversation starts with the evidence.
            </p>
          </div>
          <div className="feature-bottom">
            <Link to="/candidates">
              Explore your candidates <ArrowUpRight size={17} />
            </Link>
            <div className="feature-people" aria-hidden="true">
              {data.recent_candidates.slice(0, 4).map((c) => (
                <Avatar key={c.id} name={c.name} />
              ))}
              <span>{data.stats.candidates} people. New possibilities.</span>
            </div>
          </div>
          <div className="feature-sculpture" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <i key={i} style={{ transform: `rotate(${i * 15}deg)` }} />
            ))}
          </div>
        </section>
        <section className="pipeline-pulse">
          <div className="pulse-top">
            <span>INTERVIEW PULSE</span>
            <Radio size={17} />
          </div>
          <div className="pulse-chart">
            <svg viewBox="0 0 160 160" aria-hidden="true">
              <circle
                cx="80"
                cy="80"
                r="64"
                fill="none"
                stroke="#eeedf2"
                strokeWidth="13"
              />
              <circle
                cx="80"
                cy="80"
                r="64"
                fill="none"
                stroke="#5960df"
                strokeWidth="13"
                strokeDasharray={`${data.stats.completion_rate * 4.02} 402`}
                strokeLinecap="round"
                transform="rotate(-90 80 80)"
              />
            </svg>
            <div>
              <strong>
                {data.stats.completion_rate}
                <small>%</small>
              </strong>
              <span>completion rate</span>
            </div>
          </div>
          <div className="pulse-legend">
            <span>
              <i />
              {data.stats.completed} completed
            </span>
            <span>
              <i />
              {Math.max(0, data.stats.candidates - data.stats.completed)}{" "}
              remaining
            </span>
          </div>
          <Link to="/analytics">
            See the full picture
            <ArrowUpRight size={15} />
          </Link>
        </section>
      </div>
      <section className="stats-grid" aria-label="Workspace statistics">
        {stats.map((s) => (
          <article className="stat-card" key={s.label}>
            <div className="stat-label">
              {s.label}
              <span className={`stat-icon ${s.className}`}>
                <s.icon size={18} />
              </span>
            </div>
            <div className="stat-value">
              {s.value}
              {s.label === "Average score" && <small>/100</small>}
            </div>
            <p>{s.note}</p>
          </article>
        ))}
      </section>
      <div className="dashboard-columns">
        <section className="panel active-drives">
          <div className="panel-heading">
            <div>
              <h2>
                Interview drives{" "}
                <span className="count-pill">{data.drives.length}</span>
              </h2>
              <p>Your hiring pipeline, moving forward.</p>
            </div>
            <Link to="/drives" className="text-link">
              View all <ArrowUpRight size={15} />
            </Link>
          </div>
          {data.drives.length ? (
            <div className="drive-list">
              {data.drives.slice(0, 3).map((d, i) => (
                <Link className="drive-row" key={d.id} to={`/drives/${d.id}`}>
                  <span className={`position-icon tone-${i % 3}`}>
                    <Radio size={21} />
                  </span>
                  <div className="drive-row-body">
                    <div>
                      <h3>{d.name}</h3>
                      <Status value={d.status} />
                    </div>
                    <p>
                      {d.position} <span>·</span> {d.invited} candidates
                    </p>
                    <div className="drive-progress">
                      <span>
                        <i
                          style={{
                            width: `${d.invited ? (d.completed / d.invited) * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <small>
                        {d.completed}/{d.invited} completed
                      </small>
                    </div>
                  </div>
                  <ArrowUpRight size={18} className="muted" />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title="Your first drive starts here"
              description="Create a position, add questions, and invite your candidates."
              action={
                <Link className="button secondary" to="/positions">
                  Create a position
                </Link>
              }
            />
          )}
        </section>
        <section className="panel review-queue">
          <div className="panel-heading">
            <div>
              <span className="section-overline">YOUR NEXT CONVERSATION</span>
              <h2>Recent scorecards</h2>
            </div>
            <span className="queue-icon">
              <Target size={18} />
            </span>
          </div>
          <div className="review-queue-list">
            {data.recent_candidates
              .filter((c) => c.report_id)
              .slice(0, 3)
              .map((c) => (
                <Link key={c.id} to={`/reports/${c.report_id}`}>
                  <Avatar name={c.name} />
                  <div>
                    <strong>{c.name}</strong>
                    <small>{c.position}</small>
                  </div>
                  <Score value={c.score} />
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            {!data.recent_candidates.some((c) => c.report_id) && (
              <Empty
                title="The next chapter is coming"
                description="Completed interviews will bring new evidence here."
              />
            )}
          </div>
          <div className="system-status">
            <span
              className={`status-light ${data.ai.configured && data.ai.worker_ready ? "ready" : ""}`}
            />
            <div>
              <strong>
                {data.ai.configured && data.ai.worker_ready
                  ? "Interview evaluation is ready"
                  : "Explore the demo scorecards"}
              </strong>
              <small>
                {data.ai.configured
                  ? "Answers are assessed against your rubrics."
                  : "Connect Gemini when you’re ready for live interviews."}
              </small>
            </div>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent candidates</h2>
            <p>Meet the people moving through your process.</p>
          </div>
          <Link to="/candidates" className="text-link">
            All candidates <ArrowUpRight size={15} />
          </Link>
        </div>
        {data.recent_candidates.length ? (
          <CandidateTable rows={data.recent_candidates} />
        ) : (
          <Empty
            title="Good people will show up here"
            description="Share an interview invitation to start your candidate pipeline."
          />
        )}
      </section>
      <div className="insight-strip">
        <span>
          <Clock3 size={17} /> More time for conversations that matter.
        </span>
        <Badge tone="green">Human decisions, supported by evidence</Badge>
      </div>
    </>
  );
}
