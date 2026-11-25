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
    if (typeof d === "string" && d.trim()) return d;
    if (d && typeof d === "object" && "message" in d) return String((d as { message: string }).message);
    if (Array.isArray(d)) {
      const joined = d
        .map((x: { msg?: string; loc?: unknown[] }) => (x.msg ?? "").replace(/^Value error, /, ""))
        .filter(Boolean)
        .join("; ");
      if (joined) return joined;
    }
    if (e.status === 401) return "Sessão expirada. Faça login novamente.";
    if (e.status === 403) return "Seu perfil não tem permissão para esta operação.";
    if (e.status === 404) return "Registro não encontrado.";
    if (e.status >= 500) return "Erro interno ao processar a solicitação. Tente novamente em instantes.";
  }
  if (e instanceof Error && e.message) {
    const raw = e.message.trim();
    const lower = raw.toLowerCase();
    // Never expose raw FirestoreErrorInfo JSON dumps, Firebase internal errors, or stack traces
    if (raw.startsWith("{") && raw.includes("\"operationType\"")) {
      if (lower.includes("permission-denied") || lower.includes("missing or insufficient permissions")) {
        return "Sem permissão para acessar ou gravar estes dados no servidor.";
      }
      return "Não foi possível concluir a comunicação com o banco de dados. Tente novamente.";
    }
    if (lower.includes("permission-denied") || lower.includes("insufficient permissions")) {
      return "Sem permissão para executar esta ação.";
    }
    if (lower.includes("unauthenticated")) {
      return "Sessão expirada. Faça login novamente.";
    }
    if (
      lower.includes("failed to fetch") ||
      lower.includes("networkerror") ||
      lower.includes("network request failed") ||
      lower.includes("client is offline") ||
      lower.includes("unavailable")
    ) {
      return "Falha de conexão com o servidor. Verifique sua internet e tente novamente.";
    }
    if (lower.includes("resource-exhausted") || lower.includes("quota")) {
      return "Limite temporário de requisições atingido. Aguarde alguns instantes e tente novamente.";
    }
    if (
      lower.startsWith("firebaseerror") ||
      lower.includes("firestore (") ||
      raw.includes("\n    at ") ||
      raw.length > 260
    ) {
      return fallback;
    }
    return raw;
  }
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

/**
 * Neutralizes CSV / Excel formula injection (cells starting with =, +, -, @, \t, \r)
 * and strips unsafe control characters while preserving normal values and lone placeholders.
 */
export function sanitizeSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const cleaned = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (cleaned === "-" || cleaned === "—") return cleaned;
  if (/^\s*[=+\-@\t\r]/.test(cleaned)) {
    return `'${cleaned}`;
  }
  return cleaned;
}

export function sanitizeSpreadsheetValue(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return sanitizeSpreadsheetCell(value);
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) => r.map((c) => `"${sanitizeSpreadsheetCell(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}

