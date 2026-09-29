import { useState } from "react";
import { Link } from "react-router-dom";
import { GitCompareArrows, ArrowUpRight, UsersRound } from "lucide-react";
import { api, useResource } from "../api";
import type { Candidate, Report } from "../types";
import {
  PageHeader,
  Button,
  Modal,
  ErrorBox,
  Loading,
  Empty,
  SearchInput,
  CandidateTable,
  Avatar,
  Status,
  Score,
} from "../ui";

export default function Candidates() {
  const { data, error, loading, reload } =
      useResource<Candidate[]>("/candidates/"),
    [search, setSearch] = useState(""),
    [drive, setDrive] = useState("all"),
    [status, setStatus] = useState("all"),
    [compare, setCompare] = useState(false);
  const rows = (data || []).filter(
    (c) =>
      (drive === "all" || c.drive_id === drive) &&
      (status === "all" || c.status === status) &&
      `${c.name} ${c.email} ${c.position}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const drives = [
    ...new Map(data?.map((c) => [c.drive_id, c.drive])).entries(),
  ];
  return (
    <>
      <PageHeader
        eyebrow="PEOPLE, NOT JUST PROFILES"
        title="Your next great hire is here."
        description="Follow each candidate’s progress and explore the evidence behind their work."
        action={
          <Button
            variant="secondary"
            onClick={() => setCompare(true)}
            disabled={!data?.some((c) => c.report_id)}
          >
            <GitCompareArrows size={17} />
            Compare candidates
          </Button>
        }
      />
      <div
        className="candidate-overview"
        aria-label="Candidate pipeline filters"
      >
        {[
          ["all", "Everyone", "The whole talent picture"],
          ["invited", "Invited", "An opportunity is waiting"],
          ["in_progress", "In conversation", "Thinking in progress"],
          ["completed", "Ready to review", "New evidence to explore"],
        ].map(([value, label, description], i) => (
          <button
            key={value}
            className={status === value ? "selected" : ""}
            onClick={() => setStatus(value)}
          >
            <span className="pipeline-card-label">
              <i className={`pipeline-dot dot-${i}`} />
              {label}
              <ArrowUpRight size={16} />
            </span>
            <strong>
              {data?.filter((c) => value === "all" || c.status === value)
                .length || 0}
              <span>{description}</span>
            </strong>
          </button>
        ))}
      </div>
      <section className="panel">
        <div className="filter-bar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, email, or position…"
          />
          <div className="filter-selects">
            <select
              aria-label="Filter by interview drive"
              value={drive}
              onChange={(e) => setDrive(e.target.value)}
            >
              <option value="all">All drives</option>
              {drives.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="invited">Invited</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : rows.length ? (
          <CandidateTable rows={rows} showDrive />
        ) : (
          <Empty
            title="No candidates in this view"
            description="Adjust your filters or invite candidates through an interview drive."
            action={
              <Link className="button secondary" to="/drives">
                Go to drives <ArrowUpRight size={16} />
              </Link>
            }
          />
        )}
        <div className="table-footer">
          <span>
            {rows.length} candidate{rows.length !== 1 ? "s" : ""}
          </span>
          <span>
            <UsersRound size={14} /> Every person deserves a considered review.
          </span>
        </div>
      </section>
      <Modal
        wide
        open={compare}
        onOpenChange={setCompare}
        title="Compare the evidence"
        description="Compare up to three completed interviews from the same drive."
      >
        {compare && (
          <Comparison
            candidates={data || []}
            initialDrive={drive === "all" ? drives[0]?.[0] : drive}
          />
        )}
      </Modal>
    </>
  );
}
function Comparison({
  candidates,
  initialDrive,
}: {
  candidates: Candidate[];
  initialDrive: string;
}) {
  const [drive, setDrive] = useState(initialDrive),
    [selected, setSelected] = useState<string[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const drives = [
      ...new Map(candidates.map((c) => [c.drive_id, c.drive])).entries(),
    ],
    available = candidates.filter((c) => c.drive_id === drive && c.report_id);
  async function compare() {
    setBusy(true);
    setError("");
    try {
      setReports(
        await Promise.all(selected.map((id) => api<Report>(`/reports/${id}/`))),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-stack">
      <select
        aria-label="Comparison drive"
        value={drive}
        onChange={(e) => {
          setDrive(e.target.value);
          setSelected([]);
          setReports([]);
        }}
      >
        {drives.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <div className="comparison-picker">
        {available.map((c) => (
          <label className="comparison-option" key={c.id}>
            <input
              type="checkbox"
              checked={selected.includes(c.report_id!)}
              disabled={
                !selected.includes(c.report_id!) && selected.length >= 3
              }
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, c.report_id!]
                    : selected.filter((id) => id !== c.report_id),
                )
              }
            />
            <Avatar name={c.name} />
            <span>{c.name}</span>
            <strong>{c.score}</strong>
          </label>
        ))}
      </div>
      <Button onClick={compare} disabled={busy || selected.length < 2}>
        {busy ? "Loading evidence…" : "Compare selected candidates"}
      </Button>
      {error && <ErrorBox message={error} />}
      <div
        className="comparison-grid"
        style={{
          gridTemplateColumns: `repeat(${reports.length || 1},minmax(0,1fr))`,
        }}
      >
        {reports.map((r) => (
          <article className="compare-report" key={r.id}>
            <Avatar name={r.candidate.name} />
            <h3>{r.candidate.name}</h3>
            <div className="compare-score">
              {r.overall}
              <small>/100</small>
            </div>
            <Status value={r.recommendation} />
            {r.topics.map((t) => (
              <div className="compare-topic" key={t.topic}>
                <span>{t.topic}</span>
                <Score value={t.score} />
              </div>
            ))}
            <p className="small muted">{r.summary}</p>
            <Link className="text-link" to={`/reports/${r.id}`}>
              Read full evidence <ArrowUpRight size={15} />
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
