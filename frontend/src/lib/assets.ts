const normalizedBase = `${import.meta.env.BASE_URL || "/"}`.replace(/\/*$/, "/");

export const STATIC_CATALOG = import.meta.env.VITE_STATIC_CATALOG === "true";
export const API_BASE =
  import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "") || "/api";

export function publicAsset(path: string): string {
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
}

export function catalogFileUrl(fileId: string): string {
  if (STATIC_CATALOG) {
    return publicAsset(`catalog/${encodeURIComponent(fileId)}.webp`);
  }
  return `${API_BASE}/files/${encodeURIComponent(fileId)}`;
}
