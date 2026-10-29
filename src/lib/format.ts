import { ApiError } from "./api";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const trimmed = iso.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "undefined") {
    return "—";
  }
  const d = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("pt-BR", { timeZone: "America/Cuiaba" });
    }
    return trimmed;
  }
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const trimmed = iso.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "undefined") {
    return "—";
  }
  if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) return trimmed;
  const dt = new Date(trimmed);
  if (isNaN(dt.getTime())) {
    return fmtDate(trimmed);
  }
  return dt.toLocaleString("pt-BR", { timeZone: "America/Cuiaba", dateStyle: "short", timeStyle: "short" });
}

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("pt-BR");
}

export function errMsg(e: unknown, fallback = "Não foi possível concluir a operação"): string {
  if (e instanceof ApiError) {
    const b = e.body as { detail?: unknown } | null;
    const d = b?.detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && "message" in d) return String((d as { message: string }).message);
    if (Array.isArray(d)) {
      return d
        .map((x: { msg?: string; loc?: unknown[] }) => (x.msg ?? "").replace(/^Value error, /, ""))
        .filter(Boolean)
        .join("; ");
    }
    if (e.status === 403) return "Seu perfil não tem permissão para esta operação";
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function exportFile(filename: string, content: string | Blob | ArrayBuffer, mimeType = "text/csv;charset=utf-8;") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8;") {
  exportFile(filename, "\ufeff" + content, mime);
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}

