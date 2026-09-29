import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { FormEvent } from "react";
import {
  Plus,
  Code2,
  AlignLeft,
  Pencil,
  Archive,
  X,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { send, useResource } from "../api";
import type { Question, Concept } from "../types";
import {
  PageHeader,
  Button,
  Modal,
  Field,
  ErrorBox,
  Loading,
  Empty,
  Badge,
  SearchInput,
  useToast,
} from "../ui";

type CatalogStatus = {
  created: number;
  total: number;
  expected: number;
  complete: boolean;
};

export default function Questions() {
  const [params] = useSearchParams();
  const initialSearch = params.get("search") || "";
  const [search, setSearch] = useState(initialSearch),
    [topic, setTopic] = useState("all"),
    [difficulty, setDifficulty] = useState("all"),
    [page, setPage] = useState(0),
    [editing, setEditing] = useState<Question | null | undefined>(undefined),
    [expanded, setExpanded] = useState(""),
    [archive, setArchive] = useState<Question | null>(null),
    [archiveError, setArchiveError] = useState(""),
    toast = useToast();
  const { data, error, loading, reload } =
    useResource<{ results: Question[]; count: number; next_offset: number | null }>(
      `/questions/?limit=100&offset=${page * 100}&search=${encodeURIComponent(search)}${topic !== "all" ? `&topic=${encodeURIComponent(topic)}` : ""}${difficulty !== "all" ? `&difficulty=${difficulty}` : ""}`,
    );
  const {
    data: catalog,
    error: catalogError,
    loading: catalogLoading,
    reload: reloadCatalog,
  } = useResource<CatalogStatus>("/questions/catalog/");
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogProgress, setCatalogProgress] = useState<CatalogStatus | null>(null);
  const [catalogActionError, setCatalogActionError] = useState("");
  useEffect(() => setSearch(initialSearch), [initialSearch]);
  const rows = (data?.results || []).filter(
    (q) =>
      !q.archived &&
      (topic === "all" || q.topic === topic) &&
      (difficulty === "all" || q.difficulty === Number(difficulty)) &&
      `${q.title} ${q.topic} ${q.prompt}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function initializeCatalog() {
    if (catalogBusy) return;
    setCatalogBusy(true);
    setCatalogActionError("");
    try {
      let progress = catalogProgress || catalog;
      for (let attempt = 0; attempt < 12 && !progress?.complete; attempt += 1) {
        progress = await send<CatalogStatus>("/questions/catalog/", {});
        setCatalogProgress(progress);
      }
      reloadCatalog();
      reload();
    } catch (e) {
      setCatalogActionError((e as Error).message);
    } finally {
      setCatalogBusy(false);
    }
  }
  async function archiveQuestion() {
    if (!archive) return;
    try {
      await send(`/questions/${archive.id}/`, {}, "DELETE");
      setArchive(null);
      reload();
      toast(
        "Question archived. Published interviews keep their original version.",
      );
    } catch (e) {
      setArchiveError((e as Error).message);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="BUILD YOUR PROCESS"
        title="Better questions. Clearer signals."
        description="A considered question bank is the foundation of a fair interview."
        action={
          <div className="button-row">
            {!catalogLoading && catalog && !catalog.complete && (
              <Button
                variant="secondary"
                disabled={catalogBusy}
                onClick={initializeCatalog}
              >
                <Sparkles size={16} />
                {catalogBusy ? "Loading catalog…" : "Initialize catalog"}
              </Button>
            )}
            <Button onClick={() => setEditing(null)}>
              <Plus size={17} />
              Add question
            </Button>
          </div>
        }
      />
      <div className="summary-pills">
        <span>
          <BookOpen size={16} />
          <strong>{data?.count || 0}</strong>{" "}
          questions
        </span>
        <span>
          <strong>{new Set(data?.results.map((q) => q.topic)).size}</strong> skill areas
        </span>
        <span>
          <Code2 size={16} />
          <strong>
            {data?.results.filter((q) => q.kind === "code").length || 0}
          </strong>{" "}
          coding questions
        </span>
      </div>
      {!catalogLoading && catalog && !catalog.complete && (
        <section className="catalog-banner panel">
          <div className="catalog-banner-icon">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>Finish your governed question library</strong>
            <p>
              {catalogProgress?.total || catalog.total} of {catalog.expected} questions are ready. Load the catalog in safe batches so drives can meet topic coverage automatically.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={catalogBusy}
            onClick={initializeCatalog}
          >
            {catalogBusy ? "Loading…" : "Load questions"}
          </Button>
        </section>
      )}
      {(catalogError || catalogActionError) && (
        <ErrorBox
          message={catalogError || catalogActionError}
          retry={reloadCatalog}
        />
      )}
      <section className="panel">
        <div className="filter-bar">
          <SearchInput
            value={search}
            onChange={(value) => { setSearch(value); setPage(0); }}
            placeholder="Search your question bank…"
          />
          <div className="filter-selects">
            <select
              aria-label="Filter by topic"
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setPage(0); }}
            >
              <option value="all">All topics</option>
              {[...new Set(data?.results.map((q) => q.topic))].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select
              aria-label="Filter by difficulty"
              value={difficulty}
              onChange={(e) => { setDifficulty(e.target.value); setPage(0); }}
            >
              <option value="all">All difficulties</option>
              <option value="-1">Easy</option>
              <option value="0">Medium</option>
              <option value="1">Hard</option>
            </select>
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : rows.length ? (
          <div className="question-list">
            {rows.map((q) => (
              <article
                className={`question-row ${expanded === q.id ? "expanded" : ""}`}
                key={q.id}
              >
                <div className="question-row-top">
                  <span className={`question-type-icon ${q.kind}`}>
                    {q.kind === "code" ? (
                      <Code2 size={21} />
                    ) : (
                      <AlignLeft size={21} />
                    )}
                  </span>
                  <button
                    className="question-title"
                    onClick={() => setExpanded(expanded === q.id ? "" : q.id)}
                  >
                    <strong>{q.title}</strong>
                    <span>
                      {q.topic} <i>·</i> {Math.round(q.expected_seconds / 60)}{" "}
                      min <i>·</i> {q.concepts.length} rubric concepts
                    </span>
                  </button>
                  <Badge
                    tone={
                      q.difficulty === 1
                        ? "violet"
                        : q.difficulty === 0
                          ? "amber"
                          : "green"
                    }
                  >
                    {q.difficulty === 1
                      ? "Hard"
                      : q.difficulty === 0
                        ? "Medium"
                        : "Easy"}
                  </Badge>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${q.title}`}
                    onClick={() => setEditing(q)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Archive ${q.title}`}
                    onClick={() => {
                      setArchive(q);
                      setArchiveError("");
                    }}
                  >
                    <Archive size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${expanded === q.id ? "Collapse" : "Expand"} ${q.title}`}
                    onClick={() => setExpanded(expanded === q.id ? "" : q.id)}
                  >
                    {expanded === q.id ? (
                      <ChevronUp size={17} />
                    ) : (
                      <ChevronDown size={17} />
                    )}
                  </button>
                </div>
                {expanded === q.id && (
                  <div className="question-details">
                    <h4>Question</h4>
                    <p className="preserve-whitespace">{q.prompt}</p>
                    <h4>Expected answer</h4>
                    <p className="preserve-whitespace">{q.expected_answer}</p>
                    <h4>Evaluation rubric</h4>
                    {q.concepts.map((c) => (
                      <div className="rubric-preview" key={c.name}>
                        <strong>
                          {c.name}
                          {c.critical && <Badge tone="red">Critical</Badge>}
                        </strong>
                        <p>{c.description}</p>
                      </div>
                    ))}
                    <small className="muted">
                      Version {q.version} · Weight {q.weight} · Only recruiters
                      can see the rubric.
                    </small>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={
              search ? "No matching questions" : "A good question opens a door"
            }
            description="Add a question with a clear rubric, or adjust your filters."
            action={
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Add question
              </Button>
            }
          />
        )}
      </section>
      {data && data.count > 100 && (
        <div className="pagination-bar">
          <span>Showing {page * 100 + 1}–{Math.min((page + 1) * 100, data.count)} of {data.count}</span>
          <div className="button-row">
            <Button variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>Previous</Button>
            <Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={!data.next_offset}>Next</Button>
          </div>
        </div>
      )}
      <Modal
        wide
        open={editing !== undefined}
        onOpenChange={(v) => {
          if (!v) setEditing(undefined);
        }}
        title={editing ? "Edit question" : "Add a question"}
        description="Write a question that rewards understanding, then define the evidence to look for."
      >
        {editing !== undefined && (
          <QuestionForm
            key={editing?.id || "new"}
            value={editing}
            done={() => {
              setEditing(undefined);
              reload();
              toast("Question saved.");
            }}
          />
        )}
      </Modal>
      <Modal
        open={!!archive}
        onOpenChange={(v) => {
          if (!v) setArchive(null);
        }}
        title="Archive this question?"
        description="It will be excluded from new drives. Existing interviews keep their frozen copy."
      >
        {archiveError && <ErrorBox message={archiveError} />}
        <div className="form-actions">
          <Button variant="secondary" onClick={() => setArchive(null)}>
            Keep question
          </Button>
          <Button variant="danger" onClick={archiveQuestion}>
            Archive question
          </Button>
        </div>
      </Modal>
    </>
  );
}
function QuestionForm({
  value,
  done,
}: {
  value: Question | null;
  done: () => void;
}) {
  const [form, setForm] = useState({
      title: value?.title || "",
      topic: value?.topic || "",
      difficulty: value?.difficulty ?? 0,
      kind: value?.kind || "text",
      language: value?.language || "javascript",
      prompt: value?.prompt || "",
      expected_answer: value?.expected_answer || "",
      reasoning_criteria: value?.reasoning_criteria || "",
      starter_code: value?.starter_code || "",
      weight: value?.weight || 1,
      expected_seconds: value?.expected_seconds || 150,
    }),
    [concepts, setConcepts] = useState<Concept[]>(
      value?.concepts || [
        { name: "", description: "", weight: 1, critical: false },
      ],
    ),
    [checks, setChecks] = useState<string[]>(
      value?.code_checks.map((c) => c.kind) || [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function change(key: string, v: string | number) {
    setForm({ ...form, [key]: v });
  }
  function concept(i: number, key: string, v: string | number | boolean) {
    setConcepts(concepts.map((c, j) => (j === i ? { ...c, [key]: v } : c)));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send(
        value ? `/questions/${value.id}/` : "/questions/",
        {
          ...form,
          concepts,
          code_checks: checks.map((kind) => ({
            kind,
            description: `Uses ${kind} structure where required by the question.`,
          })),
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
    <form className="form-stack" onSubmit={submit}>
      <Field label="Question title">
        <input
          required
          maxLength={180}
          value={form.title}
          onChange={(e) => change("title", e.target.value)}
          placeholder="Understanding the event loop"
        />
      </Field>
      <div className="form-three">
        <Field label="Topic">
          <input
            required
            maxLength={60}
            value={form.topic}
            onChange={(e) => change("topic", e.target.value)}
            placeholder="JavaScript"
          />
        </Field>
        <Field label="Difficulty">
          <select
            value={form.difficulty}
            onChange={(e) => change("difficulty", Number(e.target.value))}
          >
            <option value={-1}>Easy</option>
            <option value={0}>Medium</option>
            <option value={1}>Hard</option>
          </select>
        </Field>
        <Field label="Answer format">
          <select
            value={form.kind}
            onChange={(e) => change("kind", e.target.value)}
          >
            <option value="text">Written explanation</option>
            <option value="code">Code</option>
          </select>
        </Field>
      </div>
      <Field label="Question prompt">
        <textarea
          required
          rows={4}
          maxLength={6000}
          value={form.prompt}
          onChange={(e) => change("prompt", e.target.value)}
          placeholder="What would you ask the candidate?"
        />
      </Field>
      {form.kind === "code" && (
        <>
          <Field label="Language">
            <select
              value={form.language}
              onChange={(e) => change("language", e.target.value)}
            >
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
            </select>
          </Field>
          <Field label="Starter code (optional)">
            <textarea
              className="code-textarea"
              rows={4}
              value={form.starter_code}
              onChange={(e) => change("starter_code", e.target.value)}
            />
          </Field>
          <fieldset className="checks-fieldset">
            <legend>Required code structures</legend>
            {[
              "function",
              "loop",
              "conditional",
              "return",
              "exception",
              "async",
            ].map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={checks.includes(c)}
                  onChange={(e) =>
                    setChecks(
                      e.target.checked
                        ? [...checks, c]
                        : checks.filter((x) => x !== c),
                    )
                  }
                />
                {c}
              </label>
            ))}
          </fieldset>
        </>
      )}
      <Field
        label="Expected answer"
        hint="Include acceptable alternative approaches. This stays private."
      >
        <textarea
          required
          rows={4}
          maxLength={6000}
          value={form.expected_answer}
          onChange={(e) => change("expected_answer", e.target.value)}
        />
      </Field>
      <div>
        <div className="form-section-heading">
          <strong>Required concepts</strong>
          <small>Evidence that earns credit</small>
        </div>
        {concepts.map((c, i) => (
          <div className="concept-editor" key={i}>
            <div className="concept-title">
              <input
                aria-label={`Concept ${i + 1} name`}
                required
                placeholder="Concept name"
                value={c.name}
                onChange={(e) => concept(i, "name", e.target.value)}
                maxLength={120}
              />
              <button
                className="icon-button"
                type="button"
                disabled={concepts.length === 1}
                aria-label={`Remove concept ${i + 1}`}
                onClick={() => setConcepts(concepts.filter((_, j) => j !== i))}
              >
                <X size={16} />
              </button>
            </div>
            <textarea
              aria-label={`Concept ${i + 1} rubric`}
              required
              rows={2}
              placeholder="What should a correct explanation demonstrate?"
              value={c.description}
              onChange={(e) => concept(i, "description", e.target.value)}
              maxLength={1000}
            />
            <div className="concept-options">
              <label>
                Weight{" "}
                <input
                  aria-label={`Concept ${i + 1} weight`}
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={c.weight}
                  onChange={(e) => concept(i, "weight", Number(e.target.value))}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={c.critical}
                  onChange={(e) => concept(i, "critical", e.target.checked)}
                />
                Critical misconception caps the score
              </label>
            </div>
          </div>
        ))}
        {concepts.length < 15 && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setConcepts([
                ...concepts,
                { name: "", description: "", weight: 1, critical: false },
              ])
            }
          >
            <Plus size={15} />
            Add concept
          </button>
        )}
      </div>
      <Field label="Reasoning criteria">
        <textarea
          rows={2}
          maxLength={2000}
          value={form.reasoning_criteria}
          onChange={(e) => change("reasoning_criteria", e.target.value)}
          placeholder="Explain the trade-offs and consider failure cases."
        />
      </Field>
      <div className="form-two">
        <Field label="Expected time (seconds)">
          <input
            type="number"
            min="30"
            max="900"
            value={form.expected_seconds}
            onChange={(e) => change("expected_seconds", Number(e.target.value))}
          />
        </Field>
        <Field label="Question weight">
          <input
            type="number"
            min="0.1"
            max="5"
            step="0.1"
            value={form.weight}
            onChange={(e) => change("weight", Number(e.target.value))}
          />
        </Field>
      </div>
      {error && <ErrorBox message={error} />}
      <div className="form-actions">
        <Button disabled={busy} type="submit">
          {busy ? "Saving…" : "Save question"}
        </Button>
      </div>
    </form>
  );
}
