import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Plus,
  ArrowUpRight,
  BriefcaseBusiness,
  Pencil,
  Archive,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, send, useResource } from "../api";
import type { Position, Skill } from "../types";
import {
  PageHeader,
  Button,
  Modal,
  Field,
  ErrorBox,
  Loading,
  Empty,
  Badge,
  useToast,
} from "../ui";

type SkillSuggestion = {
  topic: string;
  count: number;
  coding_count: number;
  difficulties: number[];
};

export default function Positions() {
  const { data, error, loading, reload } =
      useResource<Position[]>("/positions/"),
    [editing, setEditing] = useState<Position | null | undefined>(undefined),
    [archive, setArchive] = useState<Position | null>(null),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(""),
    toast = useToast();
  async function archivePosition() {
    if (!archive) return;
    setBusy(true);
    try {
      await send(`/positions/${archive.id}/`, {}, "DELETE");
      setArchive(null);
      reload();
      toast("Position archived. Existing drives are preserved.");
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows = data?.filter((p) => !p.archived) || [];
  return (
    <>
      <PageHeader
        eyebrow="BUILD YOUR PROCESS"
        title="Define what great looks like."
        description="Turn a job title into a clear set of skills and expectations."
        action={
          <Button onClick={() => setEditing(null)}>
            <Plus size={17} />
            New position
          </Button>
        }
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} retry={reload} />
      ) : rows.length ? (
        <div className="position-grid">
          {rows.map((p, i) => (
            <article className="panel position-card" key={p.id}>
              <div className="card-top">
                <span className={`position-icon tone-${i % 3}`}>
                  <BriefcaseBusiness size={23} />
                </span>
                <Badge>{p.experience}</Badge>
              </div>
              <h2>{p.title}</h2>
              <p className="position-description">
                {p.description ||
                  "A thoughtful assessment of technical depth, reasoning, and communication."}
              </p>
              <div className="skill-tags">
                {p.skills.map((s) => (
                  <Badge key={s.topic}>{s.topic}</Badge>
                ))}
              </div>
              <div className="position-skills">
                <span className="section-overline">ASSESSMENT FOCUS</span>
                {p.skills.map((s) => (
                  <div key={s.topic}>
                    <span>
                      {s.topic}
                      <strong>
                        {Math.round(
                          (s.weight /
                            p.skills.reduce(
                              (total, v) => total + v.weight,
                              0,
                            )) *
                            100,
                        )}
                        %
                      </strong>
                    </span>
                    <i>
                      <b
                        style={{
                          width: `${(s.weight / p.skills.reduce((total, v) => total + v.weight, 0)) * 100}%`,
                        }}
                      />
                    </i>
                  </div>
                ))}
              </div>
              <div className="position-card-footer">
                <span>{p.skills.length} skill areas</span>
                <div>
                  <button
                    className="icon-button"
                    aria-label={`Archive ${p.title}`}
                    onClick={() => {
                      setActionError("");
                      setArchive(p);
                    }}
                  >
                    <Archive size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${p.title}`}
                    onClick={() => setEditing(p)}
                  >
                    <Pencil size={16} />
                  </button>
                  <Link
                    to={`/drives?create=1&position=${p.id}`}
                    className="icon-link"
                    aria-label={`Create drive for ${p.title}`}
                  >
                    <ArrowUpRight size={18} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="Start with the role"
            description="Define your first position and the skills you want to understand."
            action={
              <Button onClick={() => setEditing(null)}>
                <Plus size={16} />
                Create position
              </Button>
            }
          />
        </section>
      )}
      <Modal
        open={editing !== undefined}
        onOpenChange={(v) => {
          if (!v) setEditing(undefined);
        }}
        title={editing ? "Edit position" : "Create a position"}
        description="Keep the criteria specific, relevant, and consistent."
      >
        {editing !== undefined && (
          <PositionForm
            key={editing?.id || "new"}
            value={editing}
            done={() => {
              setEditing(undefined);
              reload();
              toast(editing ? "Position updated." : "Position created.");
            }}
          />
        )}
      </Modal>
      <Modal
        open={!!archive}
        onOpenChange={(v) => {
          if (!v) setArchive(null);
        }}
        title="Archive this position?"
        description="The position will be removed from new drive setup. Existing interviews and reports remain available."
      >
        {actionError && <ErrorBox message={actionError} />}
        <div className="form-actions">
          <Button variant="secondary" onClick={() => setArchive(null)}>
            Keep position
          </Button>
          <Button variant="danger" disabled={busy} onClick={archivePosition}>
            Archive position
          </Button>
        </div>
      </Modal>
    </>
  );
}
function PositionForm({
  value,
  done,
}: {
  value: Position | null;
  done: () => void;
}) {
  const [title, setTitle] = useState(value?.title || ""),
    [description, setDescription] = useState(value?.description || ""),
    [experience, setExperience] = useState(value?.experience || "Mid-level"),
    [skills, setSkills] = useState<Skill[]>(
      value?.skills || [{ topic: "", weight: 1, minimum: 40 }],
    ),
    [min, setMin] = useState(value?.difficulty_min ?? -1),
    [max, setMax] = useState(value?.difficulty_max ?? 1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function editSkill(i: number, key: keyof Skill, v: string | number) {
    setSkills(skills.map((s, j) => (j === i ? { ...s, [key]: v } : s)));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send(
        value ? `/positions/${value.id}/` : "/positions/",
        {
          title,
          description,
          experience,
          skills,
          difficulty_min: min,
          difficulty_max: max,
        },
        value ? "PATCH" : "POST",
      );
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <Field label="Position title">
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          placeholder="Backend Engineer — Node.js"
        />
      </Field>
      <Field label="What does this role do?">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Build reliable APIs and services for our growing product."
        />
      </Field>
      <Field label="Experience level">
        <select
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
        >
          <option>Entry-level</option>
          <option>Mid-level</option>
          <option>Senior</option>
          <option>Lead</option>
        </select>
      </Field>
      <div>
        <div className="form-section-heading">
          <strong>Target skills</strong>
          <small>Weight · Minimum score</small>
        </div>
        {skills.map((s, i) => (
          <div className="skill-form-row" key={i}>
            <SkillTopicInput
              value={s.topic}
              label={`Skill ${i + 1}`}
              onChange={(v) => editSkill(i, "topic", v)}
            />
            <input
              aria-label={`Weight for skill ${i + 1}`}
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={s.weight}
              onChange={(e) => editSkill(i, "weight", Number(e.target.value))}
            />
            <input
              aria-label={`Minimum score for skill ${i + 1}`}
              type="number"
              min="0"
              max="100"
              value={s.minimum}
              onChange={(e) => editSkill(i, "minimum", Number(e.target.value))}
            />
            <button
              className="icon-button"
              type="button"
              aria-label={`Remove skill ${i + 1}`}
              disabled={skills.length === 1}
              onClick={() => setSkills(skills.filter((_, j) => j !== i))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
        {skills.length < 6 && (
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setSkills([...skills, { topic: "", weight: 1, minimum: 40 }])
            }
          >
            <Plus size={15} />
            Add skill
          </button>
        )}
      </div>
      <div className="form-two">
        <Field label="Minimum difficulty">
          <select value={min} onChange={(e) => setMin(Number(e.target.value))}>
            <option value={-1}>Easy</option>
            <option value={0}>Medium</option>
          </select>
        </Field>
        <Field label="Maximum difficulty">
          <select value={max} onChange={(e) => setMax(Number(e.target.value))}>
            <option value={0}>Medium</option>
            <option value={1}>Hard</option>
          </select>
        </Field>
      </div>
      {error && <ErrorBox message={error} />}
      <div className="form-actions">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : value ? "Save position" : "Create position"}
          <ArrowUpRight size={16} />
        </Button>
      </div>
    </form>
  );
}

function SkillTopicInput({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([]),
    [open, setOpen] = useState(false),
    [activeIndex, setActiveIndex] = useState(-1),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const query = value.trim();
    if (!query) {
      setSuggestions([]);
      setOpen(false);
      return () => controller.abort();
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      api<{ results: SkillSuggestion[] }>(
        `/questions/skills/?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      )
        .then((response) => {
          setSuggestions(response.results);
          setActiveIndex(-1);
          setOpen(true);
        })
        .catch((error) => {
          if (error.name !== "AbortError") setSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);
  const exact = suggestions.find(
    (suggestion) =>
      suggestion.topic.toLowerCase() === value.trim().toLowerCase(),
  );
  const optionId = (index: number) =>
    `${label.replaceAll(" ", "-")}-skill-option-${index}`;
  function choose(index: number) {
    const suggestion = suggestions[index];
    if (!suggestion) return;
    onChange(suggestion.topic);
    setOpen(false);
  }
  return (
    <div className="skill-topic-field">
      <input
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={`${label.replaceAll(" ", "-")}-skill-options`}
        aria-activedescendant={
          activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
        role="combobox"
        required
        placeholder="Type a skill, e.g. HTML"
        value={value}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && suggestions.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => (index + 1) % suggestions.length);
          } else if (event.key === "ArrowUp" && suggestions.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) =>
              index <= 0 ? suggestions.length - 1 : index - 1,
            );
          } else if (event.key === "Enter" && open && activeIndex >= 0) {
            event.preventDefault();
            choose(activeIndex);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        onChange={(event) => onChange(event.target.value.slice(0, 60))}
        maxLength={60}
      />
      {open && suggestions.length > 0 && (
        <div
          className="skill-suggestion-list"
          role="listbox"
          id={`${label.replaceAll(" ", "-")}-skill-options`}
        >
          {suggestions.map((suggestion, index) => (
            <button
              type="button"
              role="option"
              id={optionId(index)}
              aria-selected={
                activeIndex === index || suggestion.topic === value
              }
              key={suggestion.topic}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <span>
                <strong>{suggestion.topic}</strong>
                <small>
                  {suggestion.count} active questions ·{" "}
                  {suggestion.coding_count} coding
                </small>
              </span>
              <small>
                {suggestion.difficulties
                  .map((difficulty) =>
                    difficulty < 0
                      ? "Easy"
                      : difficulty > 0
                        ? "Hard"
                        : "Medium",
                  )
                  .filter(
                    (difficulty, index, all) =>
                      all.indexOf(difficulty) === index,
                  )
                  .join(" · ")}
              </small>
            </button>
          ))}
        </div>
      )}
      {value.trim() && !loading && !exact && (
        <small className="skill-coverage-hint uncovered">
          No exact active question match. Choose a suggested skill or add
          questions to the bank.
        </small>
      )}
      {exact && (
        <small className="skill-coverage-hint">
          {exact.count} active questions · {exact.coding_count} coding · covered
          at{" "}
          {exact.difficulties
            .map((difficulty) =>
              difficulty < 0 ? "easy" : difficulty > 0 ? "hard" : "medium",
            )
            .filter(
              (difficulty, index, all) => all.indexOf(difficulty) === index,
            )
            .join(", ")}
        </small>
      )}
    </div>
  );
}
