import {
  createContext,
  useContext,
  useState,
  useId,
  isValidElement,
  cloneElement,
} from "react";
import type { ReactNode, ReactElement, ButtonHTMLAttributes } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  ArrowUpRight,
  AlertCircle,
  Check,
  Search,
  ArrowRight,
  Inbox,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Candidate } from "./types";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button {...props} className={`button ${variant} ${className}`}>
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export const labels: Record<string, string> = {
  in_progress: "In progress",
  completed: "Completed",
  invited: "Invited",
  hire: "Advance",
  borderline: "Borderline",
  no_hire: "Do not advance",
  needs_review: "Needs review",
  active: "Active",
  draft: "Draft",
  closed: "Closed",
};
export function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        ["completed", "hire", "active"].includes(value)
          ? "green"
          : ["borderline", "in_progress", "needs_review"].includes(value)
            ? "amber"
            : value === "no_hire"
              ? "red"
              : "neutral"
      }
    >
      <span className="status-dot" />
      {labels[value] || value}
    </Badge>
  );
}
export function Avatar({
  name,
  size = "normal",
}: {
  name: string;
  size?: string;
}) {
  return (
    <span
      className={`avatar avatar-tone-${[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 6} ${size}`}
      aria-hidden="true"
    >
      {name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={27} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={19} />
      <div>
        <strong>We hit a snag</strong>
        <p>{message}</p>
        {retry && (
          <button onClick={retry}>
            Try again <ArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div
      className="loading-state"
      role="status"
      aria-label="Loading your workspace"
    >
      <div className="skeleton short" />
      <div className="skeleton title" />
      <div className="skeleton-grid">
        {[1, 2, 3, 4].map((n) => (
          <div className="skeleton card" key={n} />
        ))}
      </div>
      <div className="skeleton tall" />
      <span className="sr-only">Loading your workspace…</span>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const control =
    isValidElement(children) &&
    typeof children.type === "string" &&
    ["input", "select", "textarea"].includes(children.type)
      ? cloneElement(
          children as ReactElement<{
            "aria-labelledby"?: string;
            "aria-describedby"?: string;
          }>,
          {
            "aria-labelledby": id,
            "aria-describedby": hint ? id + "-hint" : undefined,
          },
        )
      : children;
  return (
    <label className="field">
      <span id={id}>{label}</span>
      {control}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </label>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog-content ${wide ? "wide" : ""}`}>
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Complete the details below."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="Close dialog">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
const ToastContext = createContext<(message: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  function toast(value: string) {
    setMessage(value);
    window.setTimeout(
      () => setMessage((current) => (current === value ? "" : current)),
      4500,
    );
  }
  return (
    <ToastContext.Provider value={toast}>
      {children}
      {message && (
        <div className="toast" role="status">
          <Check size={18} />
          {message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange("")}>
          <X size={15} />
        </button>
      )}
    </div>
  );
}
export function Score({ value }: { value: number | null }) {
  return value === null ? (
    <span className="muted">—</span>
  ) : (
    <span className={`score ${value >= 75 ? "good" : value < 55 ? "low" : ""}`}>
      <span>{Math.round(value)}</span>
      <span className="score-track">
        <i style={{ width: `${value}%` }} />
      </span>
    </span>
  );
}
export function CandidateTable({
  rows,
  showDrive = false,
}: {
  rows: Candidate[];
  showDrive?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Candidate</th>
            {showDrive && <th>Position</th>}
            <th>Status</th>
            <th>Overall score</th>
            <th>Recommendation</th>
            <th>
              <span className="sr-only">View report</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="person">
                  <Avatar name={row.name} />
                  <div>
                    <strong>{row.name}</strong>
                    <small>{row.email}</small>
                  </div>
                </div>
              </td>
              {showDrive && (
                <td>
                  <span className="table-position">{row.position}</span>
                </td>
              )}
              <td>
                <Status value={row.status} />
              </td>
              <td>
                <Score value={row.score} />
              </td>
              <td>
                {row.recommendation ? (
                  <Status value={row.recommendation} />
                ) : (
                  <span className="muted small">
                    {row.status === "in_progress"
                      ? `${row.progress}/${row.question_count} answered`
                      : "Awaiting interview"}
                  </span>
                )}
              </td>
              <td>
                {row.report_id ? (
                  <Link
                    className="icon-link"
                    to={`/reports/${row.report_id}`}
                    aria-label={`View ${row.name}'s report`}
                  >
                    <ArrowUpRight size={19} />
                  </Link>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}
