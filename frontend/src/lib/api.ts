import { API_BASE, publicAsset, STATIC_CATALOG } from "@/lib/assets";

// Typed fetch layer over the FastAPI backend. Base is the relative "/api" prefix so the
// same code works in dev (Vite proxies /api → :8001) and behind a single origin in prod.
const STATIC_GET_ROUTES: Record<string, string> = {
  "/catalog/products": "catalog/products.json",
  "/catalog/categories": "catalog/categories.json",
};

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  const staticPath = method === "GET" && STATIC_CATALOG ? STATIC_GET_ROUTES[path] : undefined;
  const url = staticPath ? publicAsset(staticPath) : `${API_BASE}${path}`;
  // Auth rides the httpOnly session cookie automatically — never add auth headers here.
  const res = await fetch(url, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // FastAPI reports request-validation failures as 422 with a {detail: [...]} body.
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// The response type is yours to declare: nothing infers across the Python boundary, so a
// TS interface here mirrors the endpoint's Pydantic model by hand — keep the two in sync.
export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);

// Multipart upload (FormData): the browser sets the content-type boundary itself.
export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: form });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }
  return (await res.json()) as T;
}

// Friendly error text for toasts — FastAPI sends 422 validation errors as {detail: [...]}.
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { detail?: unknown } | null;
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) {
      const first = body.detail[0] as { msg?: string } | undefined;
      if (first?.msg) return first.msg;
    }
    return `Erro ${error.status}`;
  }
  if (error instanceof Error) return error.message;
  return "Erro inesperado. Tente novamente.";
}
