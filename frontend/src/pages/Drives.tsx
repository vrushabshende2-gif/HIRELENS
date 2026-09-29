import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  Radio,
  Clock3,
  UsersRound,
  ArrowLeft,
  Send,
  Copy,
  Check,
  CalendarDays,
  PauseCircle,
  Play,
  Pencil,
} from "lucide-react";
import { send, useResource } from "../api";
import type { Drive, Position } from "../types";
import {
  PageHeader,
  Button,
  Modal,
  Field,
  ErrorBox,
  Loading,
  Empty,
  Badge,
  Status,
  CandidateTable,
  formatDate,
  useToast,
} from "../ui";

export default function Drives() {
  const { data, error, loading, reload } = useResource<Drive[]>("/drives/"),
    [params, setParams] = useSearchParams(),
    [open, setOpen] = useState(params.get("create") === "1"),
    [tab, setTab] = useState("all");
  const rows = data?.filter((d) => tab === "all" || d.status === tab) || [];
  return (
    <>
      <PageHeader
        eyebrow="YOUR HIRING PIPELINE"
        title="Great conversations start here."
        description="Bring your position, questions, and candidates together."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={17} />
            Create interview drive
          </Button>
        }
      />
      <div className="tabs" aria-label="Filter drives">
        {["all", "active", "draft", "closed"].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t === "all" ? "All drives" : t[0].toUpperCase() + t.slice(1)}
            <span>
              {data?.filter((d) => t === "all" || d.status === t).length || 0}
            </span>
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} retry={reload} />
      ) : rows.length ? (
        <div className="drive-grid">
          {rows.map((d, i) => (
            <article className="panel drive-card" key={d.id}>
              <div className="card-top">
                <span className={`position-icon tone-${i % 3}`}>
                  <Radio size={23} />
                </span>
                <Status value={d.status} />
              </div>
              <Link to={`/drives/${d.id}`}>
                <h2>{d.name}</h2>
              </Link>
              <p className="muted">{d.position}</p>
              <div className="skill-tags">
                {d.skills.map((s) => (
                  <Badge key={s.topic}>{s.topic}</Badge>
                ))}
              </div>
              <div className="drive-card-stats">
                <span>
                  <UsersRound size={15} />
                  {d.invited} candidates
                </span>
                <span>
                  <Clock3 size={15} />
                  {d.duration_minutes} min
                </span>
              </div>
              <div className="drive-progress">
                <span>
                  <i
                    style={{
                      width: `${d.invited ? (d.completed / d.invited) * 100 : 0}%`,
                    }}
                  />
                </span>
                <small>{d.completed} completed</small>
              </div>
              <div className="position-card-footer">
                <span>Closes {formatDate(d.expires_at)}</span>
                <Link className="text-link" to={`/drives/${d.id}`}>
                  Open drive <ArrowUpRight size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="Your next chapter starts with a drive"
            description="Launch an interview drive and invite candidates to show what they know."
            action={
              <Button onClick={() => setOpen(true)}>
                Create interview drive
              </Button>
            }
          />
        </section>
      )}
      <Modal
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setParams({});
        }}
        title="Create an interview drive"
        description="Set the role, timing, and interview instructions."
      >
        {open && (
          <DriveForm
            defaultPosition={params.get("position") || ""}
            done={() => {
              setOpen(false);
              setParams({});
              reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}

export function DriveDetail() {
  const { id } = useParams(),
    { data, error, loading, reload } = useResource<Drive>(`/drives/${id}/`),
    [inviteOpen, setInviteOpen] = useState(false),
    [editOpen, setEditOpen] = useState(false),
    [closeOpen, setCloseOpen] = useState(false),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false),
    toast = useToast();
  async function action(kind: string) {
    setBusy(true);
    setActionError("");
    try {
      await send(`/drives/${id}/${kind}/`);
      setCloseOpen(false);
      reload();
      toast(
        kind === "publish"
          ? "Drive published. You can now invite candidates."
          : "Drive closed to new interviews.",
      );
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error} retry={reload} />;
  return (
    <>
      <Link className="back-link" to="/drives">
        <ArrowLeft size={16} />
        All interview drives
      </Link>
      <PageHeader
        eyebrow={data.position.toUpperCase()}
        title={data.name}
        description="A clear view of every candidate, from invitation to decision."
        action={
          <div className="button-row">
            {data.status === "draft" ? (
              <>
                <Button variant="secondary" onClick={() => setEditOpen(true)}>
                  <Pencil size={16} />
                  Edit
                </Button>
                <Button disabled={busy} onClick={() => action("publish")}>
                  <Play size={16} />
                  Publish drive
                </Button>
              </>
            ) : data.status === "active" ? (
              <>
                <Button variant="secondary" onClick={() => setCloseOpen(true)}>
                  <PauseCircle size={16} />
                  Close drive
                </Button>
                <Button onClick={() => setInviteOpen(true)}>
                  <Plus size={17} />
                  Invite candidate
                </Button>
              </>
            ) : (
              <Status value="closed" />
            )}
          </div>
        }
      />
      {actionError && <ErrorBox message={actionError} />}
      <div className="drive-detail-summary panel">
        <div>
          <Status value={data.status} />
          <p>
            {data.demo_data ? "Demonstration drive" : "Candidate interviews"}
          </p>
        </div>
        <div>
          <span>
            <UsersRound size={16} />
            Candidates
          </span>
          <strong>
            {data.invited}
            <small>{data.completed} completed</small>
          </strong>
        </div>
        <div>
          <span>
            <Clock3 size={16} />
            Interview format
          </span>
          <strong>
            {data.question_count} questions
            <small>{data.duration_minutes} minutes</small>
          </strong>
        </div>
        <div>
          <span>
            <CalendarDays size={16} />
            Closing date
          </span>
          <strong>
            {formatDate(data.expires_at)}
            <small>Opens {formatDate(data.opens_at)}</small>
          </strong>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Candidates <span className="count-pill">{data.invited}</span>
            </h2>
            <p>Consistent criteria. Individual stories.</p>
          </div>
          <Link to={`/analytics?drive=${id}`} className="text-link">
            Drive analytics <ArrowUpRight size={15} />
          </Link>
        </div>
        {data.candidates?.length ? (
          <CandidateTable rows={data.candidates} />
        ) : (
          <Empty
            title={
              data.status === "draft"
                ? "Your drive is almost ready"
                : "Make the first introduction"
            }
            description={
              data.status === "draft"
                ? "Publish this drive to freeze the question pool and begin inviting candidates."
                : "Send a personal interview invitation or copy a unique link."
            }
            action={
              data.status === "active" ? (
                <Button onClick={() => setInviteOpen(true)}>
                  <Send size={16} />
                  Invite candidate
                </Button>
              ) : undefined
            }
          />
        )}
      </section>
      <section className="panel instructions-panel">
        <h2>What candidates will see</h2>
        <p className="preserve-whitespace">{data.instructions}</p>
        <div className="skill-tags">
          {data.skills.map((s) => (
            <Badge key={s.topic}>{s.topic}</Badge>
          ))}
        </div>
      </section>
      <Modal
        open={inviteOpen}
        onOpenChange={(v) => {
          setInviteOpen(v);
          if (!v) reload();
        }}
        title="Invite a candidate"
        description="Each invitation is unique, account-bound, and expires with the drive."
      >
        {inviteOpen && <InviteForm driveId={data.id} />}
      </Modal>
      <Modal
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit interview drive"
      >
        {editOpen && (
          <DriveForm
            value={data}
            done={() => {
              setEditOpen(false);
              reload();
            }}
          />
        )}
      </Modal>
      <Modal
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title="Close this drive?"
        description="New candidates will no longer be able to start. Active interviews can finish."
      >
        <div className="form-actions">
          <Button variant="secondary" onClick={() => setCloseOpen(false)}>
            Keep open
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => action("close")}
          >
            Close drive
          </Button>
        </div>
      </Modal>
    </>
  );
}

function DriveForm({
  defaultPosition = "",
  value,
  done,
}: {
  defaultPosition?: string;
  value?: Drive;
  done: () => void;
}) {
  const { data: positions, error: loadError } =
      useResource<Position[]>("/positions/"),
    [name, setName] = useState(value?.name || ""),
    [position, setPosition] = useState(value?.position_id || defaultPosition),
    [opens, setOpens] = useState(
      value
        ? value.opens_at.slice(0, 16)
        : new Date().toISOString().slice(0, 16),
    ),
    [expires, setExpires] = useState(
      value
        ? value.expires_at.slice(0, 16)
        : new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 16),
    ),
    [count, setCount] = useState(value?.question_count || 12),
    [duration, setDuration] = useState(value?.duration_minutes || 35),
    [instructions, setInstructions] = useState(
      value?.instructions ||
        "Answer independently, without external tools or assistance. Explain your reasoning and any trade-offs you consider. Your answers are saved as you go. Take a breath — this is a chance to show how you think.",
    ),
    [demo, setDemo] = useState(value?.demo_data ?? true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send(
        value ? `/drives/${value.id}/` : "/drives/",
        {
          name,
          position_id: position,
          opens_at: new Date(opens + "Z").toISOString(),
          expires_at: new Date(expires + "Z").toISOString(),
          question_count: count,
          duration_minutes: duration,
          instructions,
          demo_data: demo,
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
      <Field label="Drive name">
        <input
          required
          maxLength={180}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Backend hiring · September"
        />
      </Field>
      <Field label="Position">
        <select
          required
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        >
          <option value="">Choose a position</option>
          {positions
            ?.filter((p) => !p.archived)
            .map((p) => (
              <option value={p.id} key={p.id}>
                {p.title}
              </option>
            ))}
        </select>
      </Field>
      {positions?.length === 0 && (
        <p className="muted">
          Create a position first in the Positions workspace.
        </p>
      )}
      <div className="form-two">
        <Field label="Opens at (UTC)">
          <input
            type="datetime-local"
            required
            value={opens}
            onChange={(e) => setOpens(e.target.value)}
          />
        </Field>
        <Field label="Closes at (UTC)">
          <input
            type="datetime-local"
            required
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </Field>
      </div>
      <div className="form-two">
        <Field label="Question count">
          <input
            type="number"
            required
            min="3"
            max="24"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </Field>
        <Field label="Answering time (minutes)">
          <input
            type="number"
            required
            min="5"
            max="90"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </Field>
      </div>
      <Field label="Candidate instructions">
        <textarea
          required
          rows={4}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={4000}
        />
      </Field>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={demo}
          onChange={(e) => setDemo(e.target.checked)}
        />
        Demonstration drive using non-sensitive answers
      </label>
      {(error || loadError) && <ErrorBox message={error || loadError} />}
      <div className="form-actions">
        <Button disabled={busy || !positions?.length} type="submit">
          {busy ? "Saving…" : value ? "Save changes" : "Create draft drive"}
        </Button>
      </div>
    </form>
  );
}
function InviteForm({ driveId }: { driveId: string }) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [multiplier, setMultiplier] = useState(1),
    [emailSend, setEmailSend] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [link, setLink] = useState(""),
    [copied, setCopied] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await send<{ link: string }>(`/drives/${driveId}/invite/`, {
        name,
        email,
        accommodation_multiplier: multiplier,
        send_email: emailSend,
      });
      setLink(d.link);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Copy the link from the field below.");
    }
  }
  return link ? (
    <div className="form-stack">
      <div className="success-icon">
        <Check size={28} />
      </div>
      <h3>{name}’s invitation is ready.</h3>
      <p className="muted">
        Share this link with {email}. They’ll need to sign in with that email
        address.
      </p>
      <Field label="Unique interview link">
        <input readOnly value={link} onFocus={(e) => e.target.select()} />
      </Field>
      <Button onClick={copy}>
        {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
        {copied ? "Copied" : "Copy invitation link"}
      </Button>
      {error && <ErrorBox message={error} />}
      <button
        className="text-button"
        onClick={() => {
          setLink("");
          setName("");
          setEmail("");
          setCopied(false);
        }}
      >
        Invite another candidate
      </button>
    </div>
  ) : (
    <form className="form-stack" onSubmit={submit}>
      <Field label="Candidate name">
        <input
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alex Morgan"
        />
      </Field>
      <Field label="Candidate email">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="alex@example.com"
        />
      </Field>
      <Field label="Time accommodation">
        <select
          value={multiplier}
          onChange={(e) => setMultiplier(Number(e.target.value))}
        >
          <option value={1}>Standard time</option>
          <option value={1.5}>1.5× time</option>
          <option value={2}>2× time</option>
          <option value={3}>3× time</option>
        </select>
      </Field>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={emailSend}
          onChange={(e) => setEmailSend(e.target.checked)}
        />
        Also send the invitation by email
      </label>
      {error && <ErrorBox message={error} />}
      <div className="form-actions">
        <Button type="submit" disabled={busy}>
          <Send size={16} />
          {busy ? "Creating…" : "Create invitation"}
        </Button>
      </div>
    </form>
  );
}
