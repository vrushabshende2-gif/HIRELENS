import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  ArrowUpRight,
  UsersRound,
  BriefcaseBusiness,
  Library,
  Radio,
} from "lucide-react";
import { api } from "../api";
import { Modal, ErrorBox } from "../ui";
import type { Candidate, Position, Question, Drive } from "../types";

type Entry = {
  id: string;
  title: string;
  detail: string;
  type: "Candidate" | "Position" | "Question" | "Drive";
  url: string;
};
const icons = {
  Candidate: UsersRound,
  Position: BriefcaseBusiness,
  Question: Library,
  Drive: Radio,
};
export default function WorkspaceSearch() {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [entries, setEntries] = useState<Entry[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const hotkey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", hotkey);
    return () => window.removeEventListener("keydown", hotkey);
  }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api<Candidate[]>("/candidates/", { signal: controller.signal }),
      api<Position[]>("/positions/", { signal: controller.signal }),
      api<{ results: Question[] }>("/questions/?limit=100", { signal: controller.signal }),
      api<Drive[]>("/drives/", { signal: controller.signal }),
    ])
      .then(([c, p, q, d]) =>
        setEntries([
          ...c.map((x) => ({
            id: x.id,
            title: x.name,
            detail: x.position,
            type: "Candidate" as const,
            url: x.report_id
              ? `/reports/${x.report_id}`
              : `/drives/${x.drive_id}`,
          })),
          ...p
            .filter((x) => !x.archived)
            .map((x) => ({
              id: x.id,
              title: x.title,
              detail: x.experience,
              type: "Position" as const,
              url: "/positions",
            })),
          ...q.results
            .filter((x) => !x.archived)
            .map((x) => ({
              id: x.id,
              title: x.title,
              detail: x.topic,
              type: "Question" as const,
              url: "/questions?search=" + encodeURIComponent(x.title),
            })),
          ...d.map((x) => ({
            id: x.id,
            title: x.name,
            detail: x.position,
            type: "Drive" as const,
            url: "/drives/" + x.id,
          })),
        ]),
      )
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open]);
  const results = entries
    .filter((x) =>
      (x.title + " " + x.detail + " " + x.type)
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .slice(0, 12);
  return (
    <>
      <button
        className="workspace-search"
        aria-label="Search your workspace"
        onClick={() => setOpen(true)}
      >
        <Search size={16} />
        <span>Search your workspace</span>
        <kbd>⌘ K</kbd>
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Find your next step"
        description="Search candidates, interview drives, positions, and questions."
      >
        <div className="command-input">
          <Search size={20} />
          <input
            aria-label="Search workspace"
            placeholder="A name, a skill, an opportunity…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="command-results">
          {error ? (
            <ErrorBox message={error} />
          ) : loading ? (
            <p className="command-hint" role="status">
              Gathering your workspace…
            </p>
          ) : results.length ? (
            results.map((x) => {
              const Icon = icons[x.type];
              return (
                <button
                  key={x.type + x.id}
                  onClick={() => {
                    navigate(x.url);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="command-icon">
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{x.title}</strong>
                    <small>{x.detail}</small>
                  </span>
                  <em>{x.type}</em>
                  <ArrowUpRight size={16} />
                </button>
              );
            })
          ) : (
            <p className="command-hint">
              No matches yet. Try a different name or skill.
            </p>
          )}
        </div>
        <div className="command-footer">
          <span>Everything in your workspace, one search away.</span>
          <kbd>esc</kbd>
        </div>
      </Modal>
    </>
  );
}
