import { useSearchParams, Link } from "react-router-dom";
import {
  Download,
  UsersRound,
  Clock3,
  Target,
  CheckCheck,
  ArrowUpRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useResource } from "../api";
import type { Analytics as AnalyticsData } from "../types";
import {
  PageHeader,
  Loading,
  ErrorBox,
  Empty,
  CandidateTable,
  formatTime,
} from "../ui";

export default function Analytics() {
  const [params, setParams] = useSearchParams(),
    drive = params.get("drive") || "",
    { data, error, loading, reload } = useResource<AnalyticsData>(
      `/analytics/${drive ? "?drive=" + drive : ""}`,
    );
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error} retry={reload} />;
  const stats = [
    { label: "Candidates invited", value: data.total, icon: UsersRound },
    { label: "Average score", value: data.average_score, icon: Target },
    {
      label: "Average interview time",
      value: formatTime(data.average_seconds),
      icon: Clock3,
    },
    {
      label: "Completion rate",
      value: data.completion_rate + "%",
      icon: CheckCheck,
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="UNDERSTAND THE BIGGER PICTURE"
        title="Patterns worth paying attention to."
        description="See how your hiring process is working, one drive at a time."
        action={
          <a
            className="button secondary"
            href={`/api/analytics/?export=csv${drive ? "&drive=" + drive : ""}`}
          >
            <Download size={17} />
            Export CSV
          </a>
        }
      />
      <div className="analytics-filter">
        <label htmlFor="analytics-drive">Interview drive</label>
        <select
          id="analytics-drive"
          value={drive}
          onChange={(e) =>
            setParams(e.target.value ? { drive: e.target.value } : {})
          }
        >
          <option value="">All drives</option>
          {data.drives.map((d) => (
            <option value={d.id} key={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <section className="stats-grid">
        {stats.map((s) => (
          <article className="stat-card" key={s.label}>
            <div className="stat-label">
              {s.label}
              <span className="stat-icon teal">
                <s.icon size={18} />
              </span>
            </div>
            <div className="stat-value">{s.value}</div>
            <p>
              {drive ? "Within this interview drive" : "Across your workspace"}
            </p>
          </article>
        ))}
      </section>
      <div className="analytics-charts">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Score distribution</h2>
              <p>The range of performance across completed interviews.</p>
            </div>
          </div>
          {data.distribution.some((b) => b.count) ? (
            <div
              className="chart-box"
              role="img"
              aria-label={`Score distribution: ${data.distribution.map((b) => `${b.label}: ${b.count} candidates`).join(", ")}`}
            >
              <ResponsiveContainer width="100%" height={270}>
                <BarChart
                  data={data.distribution}
                  margin={{ top: 15, right: 25, left: -10, bottom: 8 }}
                >
                  <CartesianGrid vertical={false} stroke="#e9ece8" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#5b695a" }}
                    dy={8}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#5b695a" }}
                  />
                  <Tooltip
                    cursor={{ fill: "#f2f5f0" }}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e4e9e2",
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name="Candidates"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={58}
                  >
                    {data.distribution.map((b, i) => (
                      <Cell
                        key={b.label}
                        fill={
                          [
                            "#d8e7dd",
                            "#b7d5c1",
                            "#91bfa4",
                            "#51957b",
                            "#175f50",
                          ][i]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              title="A picture is forming"
              description="Complete interviews to see how scores are distributed."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Skills in focus</h2>
              <p>Average difficulty-adjusted technical performance.</p>
            </div>
          </div>
          <div className="topic-bars">
            {data.topics.length ? (
              data.topics.map((t, i) => (
                <div className="topic-bar-row" key={t.topic}>
                  <div>
                    <span>{t.topic}</span>
                    <strong>
                      {t.score}
                      <small>/100</small>
                    </strong>
                  </div>
                  <div className="topic-track">
                    <i
                      style={{
                        width: `${t.score}%`,
                        background: [
                          "#215f50",
                          "#799e73",
                          "#cfac6e",
                          "#739ab2",
                        ][i % 4],
                      }}
                    />
                  </div>
                  <small>
                    {t.candidates} assessed candidate
                    {t.candidates === 1 ? "" : "s"}
                  </small>
                </div>
              ))
            ) : (
              <Empty
                title="Skills tell the story"
                description="Topic insights will appear after candidates complete interviews."
              />
            )}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>The people behind the numbers</h2>
            <p>Open a scorecard to understand each result.</p>
          </div>
          <Link to="/candidates" className="text-link">
            Compare candidates <ArrowUpRight size={15} />
          </Link>
        </div>
        {data.candidates.length ? (
          <CandidateTable rows={data.candidates} />
        ) : (
          <Empty
            title="No candidates yet"
            description="Invite candidates to begin building your picture."
          />
        )}
      </section>
      <p className="analytics-note">
        Scores support a human review. Comparisons are most meaningful within
        the same drive and scoring policy.
      </p>
    </>
  );
}
