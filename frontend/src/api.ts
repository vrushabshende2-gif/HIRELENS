import { useCallback, useEffect, useState } from "react";
let csrf = "";
export function setCsrf(token: string) {
  csrf = token;
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
function errorText(data: unknown): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(errorText).join(" ");
  if (data && typeof data === "object")
    return Object.entries(data)
      .map(
        ([k, v]) =>
          (k === "detail" ? "" : `${k.replaceAll("_", " ")}: `) + errorText(v),
      )
      .join(" ");
  return "Something went wrong. Please try again.";
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.method && !["GET", "HEAD"].includes(options.method))
    headers.set("X-CSRFToken", csrf);
  let response: Response;
  const requestController = new AbortController();
  const timeout = window.setTimeout(() => requestController.abort(), 20000);
  const forwardAbort = () => requestController.abort();
  options.signal?.addEventListener("abort", forwardAbort, { once: true });
  try {
    response = await fetch("/api" + path, {
      ...options,
      headers,
      credentials: "same-origin",
      signal: requestController.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "We couldn’t connect. Check your connection and try again.",
      0,
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({
    detail:
      "The server is starting or temporarily unavailable. Please try again.",
  }));
  if (!response.ok) throw new ApiError(errorText(data), response.status);
  if (data.csrf_token) setCsrf(data.csrf_token);
  return data as T;
}
export const send = <T>(path: string, body: unknown = {}, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, error, loading, reload, setData };
}
