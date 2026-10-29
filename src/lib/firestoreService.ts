import initialCatalogos from "./seedData.json";
import {
  auth,
  salvarMilitarFirestore,
  buscarMilitarFirestore,
  buscarTodosMilitaresFirestore,
  salvarDadosCorporacaoFirestore,
  buscarDadosCorporacaoFirestore,
  excluirMilitarFirestore,
  salvarUsuarioFirestore,
  excluirUsuarioFirestore,
  buscarTodosUsuariosFirestore,
  buscarUsuarioPorEmailFirestore,
  registrarAuditoriaFirestore,
  buscarAuditoriaFirestore,
  buscarAuditoriaPorEntidadeFirestore,
} from "./firebase";
import { exportFile } from "./format";
import { queryClient } from "./queryClient";
import type {
  AuditoriaPage,
  Catalogos,
  ChartRow,
  Config,
  CountItem,
  Dashboard,
  DesligamentoIn,
  FaixaItem,
  HistoricoAlteracao,
  HistoricoSituacao,
  ImportAnalise,
  ImportResultado,
  ImportValidacao,
  ImportValidarIn,
  KPIs,
  MatriculaCheck,
  Meta,
  Militar,
  MilitarHistorico,
  MilitarIn,
  MilitarPage,
  MilitarRapidoIn,
  ReativacaoIn,
  Relatorio,
  SituacaoPage,
  UserOut,
  UsuarioIn,
} from "./types";

export { exportFile };

export interface CloudCacheState {
  config: Config;
  categorias: Array<{ id: string; codigo: string; nome: string; ordem: number; ativo: boolean }>;
  cargos: Array<{ id: string; nome: string; categoria: string; ativo: boolean }>;
  lotacoes: Array<{ id: string; nome: string; tipo: string; ativo: boolean }>;
  editais: Array<{ id: string; nome: string; ano: number | null; descricao: string | null; ativo: boolean }>;
  motivos: Array<{ id: string; nome: string; key?: string; ativo: boolean }>;
  militares: Array<{
    id: string;
    matricula: string;
    nome_completo: string;
    cargo_id: string;
    lotacao_id: string;
    edital_id: string;
    data_inclusao: string;
    data_vencimento_contrato: string;
    status: "ATIVO" | "DESLIGADO";
    observacoes: string | null;
    doe_incorporacao: string | null;
    sub_judice: boolean;
    data_desligamento: string | null;
    motivo_desligamento_id: string | null;
    documento_desligamento: string | null;
    criado_em: string | null;
    atualizado_em: string | null;
    criado_por: string | null;
    atualizado_por: string | null;
  }>;
  usuarios: Array<{
    id: string;
    nome: string;
    email: string;
    perfil: "ADMIN" | "GESTOR" | "CONSULTA";
    ativo: boolean;
  }>;
  situacoes: HistoricoSituacao[];
}

const BOOTSTRAP_USERS: CloudCacheState["usuarios"] = [
  { id: "usr_admin", nome: "Administrador do Sistema", email: "admin@cbmmt.mt.gov.br", perfil: "ADMIN", ativo: true },
  { id: "usr_gestor", nome: "Gestor de Pessoal", email: "gestor@cbmmt.mt.gov.br", perfil: "GESTOR", ativo: true },
  { id: "usr_consulta", nome: "Usuário Consulta", email: "consulta@cbmmt.mt.gov.br", perfil: "CONSULTA", ativo: true },
];

// Sessão autenticada em memória sincronizada com Firebase Auth e coleção 'usuarios'
let activeSessionEmail: string | null = null;
let activeSessionUser: UserOut | null = null;

function cleanAvnm<T>(obj: T): T {
  if (typeof obj === "string") {
    return obj.replace(/\s*\(AVNM\)/gi, "").replace(/\bAVNM\b/gi, "Bombeiro Temporário") as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanAvnm) as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = cleanAvnm(v);
    }
    return res as unknown as T;
  }
  return obj;
}

function sanitizeMilitarRecord(raw: Record<string, any>): CloudCacheState["militares"][number] {
  const cleaned = cleanAvnm(raw);
  return {
    id: String(cleaned.id || `mil_${Date.now()}`),
    matricula: String(cleaned.matricula || "").trim(),
    nome_completo: String(cleaned.nome_completo || "").trim().toUpperCase(),
    cargo_id: String(cleaned.cargo_id || ""),
    lotacao_id: String(cleaned.lotacao_id || ""),
    edital_id: String(cleaned.edital_id || ""),
    data_inclusao: cleaned.data_inclusao ? String(cleaned.data_inclusao).slice(0, 10) : "",
    data_vencimento_contrato: cleaned.data_vencimento_contrato ? String(cleaned.data_vencimento_contrato).slice(0, 10) : "",
    status: cleaned.status === "DESLIGADO" ? "DESLIGADO" : "ATIVO",
    observacoes:
      cleaned.observacoes !== null && cleaned.observacoes !== undefined && String(cleaned.observacoes).trim() !== ""
        ? String(cleaned.observacoes)
        : null,
    doe_incorporacao:
      cleaned.doe_incorporacao !== null && cleaned.doe_incorporacao !== undefined && String(cleaned.doe_incorporacao).trim() !== ""
        ? String(cleaned.doe_incorporacao)
        : null,
    sub_judice: Boolean(cleaned.sub_judice),
    data_desligamento:
      cleaned.data_desligamento !== null && cleaned.data_desligamento !== undefined && String(cleaned.data_desligamento).trim() !== ""
        ? String(cleaned.data_desligamento).slice(0, 10)
        : null,
    motivo_desligamento_id: cleaned.motivo_desligamento_id ? String(cleaned.motivo_desligamento_id) : null,
    documento_desligamento:
      cleaned.documento_desligamento !== null && cleaned.documento_desligamento !== undefined && String(cleaned.documento_desligamento).trim() !== ""
        ? String(cleaned.documento_desligamento)
        : null,
    criado_em: cleaned.criado_em ? String(cleaned.criado_em) : null,
    atualizado_em: cleaned.atualizado_em ? String(cleaned.atualizado_em) : null,
    criado_por: cleaned.criado_por ? String(cleaned.criado_por) : null,
    atualizado_por: cleaned.atualizado_por ? String(cleaned.atualizado_por) : null,
  };
}

const state: CloudCacheState = {
  config: initialCatalogos.config ?? { alerta_dias: 30 },
  categorias: initialCatalogos.categorias as any,
  cargos: initialCatalogos.cargos as any,
  lotacoes: initialCatalogos.lotacoes as any,
  editais: initialCatalogos.editais as any,
  motivos: initialCatalogos.motivos as any,
  militares: [],
  usuarios: [...BOOTSTRAP_USERS],
  situacoes: [],
};

function rebuildSituacoesFromMilitares(militaresList: CloudCacheState["militares"] = state.militares) {
  const existingNonSynthetic = (state.situacoes || []).filter((s) => !s.id.startsWith("sit_cloud_"));
  const syntheticDesligamentos: HistoricoSituacao[] = [];

  for (const m of militaresList) {
    if (m.status === "DESLIGADO") {
      const hasManualEvent = existingNonSynthetic.some(
        (s) => s.militar_id === m.id && s.tipo === "DESLIGAMENTO"
      );
      if (!hasManualEvent) {
        const motivoObj = state.motivos.find((mt) => mt.id === m.motivo_desligamento_id);
        const criadorObj = state.usuarios.find((u) => u.id === (m.atualizado_por || m.criado_por));
        const dtEfetiva = m.data_desligamento || (m.atualizado_em ? m.atualizado_em.slice(0, 10) : "2026-10-01");
        syntheticDesligamentos.push({
          id: `sit_cloud_${m.id}`,
          militar_id: m.id,
          matricula: m.matricula,
          nome_completo: m.nome_completo,
          tipo: "DESLIGAMENTO",
          data_efetiva: dtEfetiva,
          motivo_nome: motivoObj?.nome || null,
          documento: m.documento_desligamento || null,
          justificativa: null,
          observacoes: m.observacoes || null,
          usuario_nome: criadorObj?.nome || "Sistema",
          timestamp: m.atualizado_em || m.criado_em || `${dtEfetiva}T12:00:00Z`,
        });
      }
    }
  }

  state.situacoes = [...existingNonSynthetic, ...syntheticDesligamentos]
    .sort((a, b) => (b.data_efetiva || b.timestamp || "").localeCompare(a.data_efetiva || a.timestamp || ""))
    .slice(0, 150);
}

/**
 * Gravação granular direta do militar na coleção 'militares' (militares/${militar.id}).
 */
async function persistMilitarExplicitly(militar: CloudCacheState["militares"][number]) {
  const sanitized = sanitizeMilitarRecord(militar);
  const idx = state.militares.findIndex((m) => m.id === sanitized.id);
  if (idx >= 0) {
    state.militares[idx] = { ...state.militares[idx], ...sanitized };
  } else {
    state.militares.unshift(sanitized);
  }
  rebuildSituacoesFromMilitares(state.militares);
  await salvarMilitarFirestore(sanitized);
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["militares"] });
  void queryClient.invalidateQueries({ queryKey: ["situacao"] });
  void queryClient.invalidateQueries({ queryKey: ["relatorio"] });
}

/**
 * Gravação estrita apenas de dados institucionais e tabelas auxiliares em 'corporacao/dados'.
 * Jamais grava 'usuarios', 'militares', 'alteracoes' ou 'situacoes' em 'corporacao'.
 */
async function persistDadosCorporacaoExplicitly(
  keys: Array<"config" | "categorias" | "cargos" | "lotacoes" | "editais" | "motivos">
) {
  const partial: Record<string, any> = {
    total_registros: state.militares.length,
  };
  for (const k of keys) {
    partial[k] = state[k];
  }
  await salvarDadosCorporacaoFirestore(partial);
}

let lastMilitaresFetchAt = 0;
let militaresFetchPromise: Promise<void> | null = null;
const MILITARES_FETCH_COOLDOWN_MS = 15_000;

/**
 * Sincronização com a coleção 'militares' do Cloud Firestore.
 * Nunca executa gravações automáticas durante a leitura.
 */
export async function sincronizarMilitaresComFirestore(force = false): Promise<void> {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (!force && state.militares.length > 0 && now - lastMilitaresFetchAt < MILITARES_FETCH_COOLDOWN_MS) {
    return;
  }
  if (militaresFetchPromise) return militaresFetchPromise;

  lastMilitaresFetchAt = now;
  militaresFetchPromise = (async () => {
    try {
      const militaresCloud = await buscarTodosMilitaresFirestore();
      if (Array.isArray(militaresCloud) && militaresCloud.length > 0) {
        const cloudMap = new Map<string, CloudCacheState["militares"][number]>();
        for (const raw of militaresCloud) {
          if (raw?.id || raw?.matricula) {
            const m = sanitizeMilitarRecord(raw);
            cloudMap.set(m.id, m);
          }
        }
        const novaLista = Array.from(cloudMap.values());
        state.situacoes = (state.situacoes || []).filter((s) => !s.militar_id || cloudMap.has(s.militar_id));
        state.militares = novaLista;
        rebuildSituacoesFromMilitares(novaLista);
      }
    } catch (e) {
      console.warn("Aviso ao sincronizar militares do Firestore:", e);
    } finally {
      militaresFetchPromise = null;
    }
  })();

  return militaresFetchPromise;
}

export const carregarMilitaresFirestore = sincronizarMilitaresComFirestore;

let lastMetaFetchAt = 0;
let metaFetchPromise: Promise<void> | null = null;
const META_FETCH_COOLDOWN_MS = 300_000;

/**
 * Consulta pontual de tabelas auxiliares em 'corporacao > dados'.
 * Estritamente isolada de 'usuarios' e 'militares'.
 */
export async function carregarMetadadosInstitucionaisFirestore(force = false): Promise<void> {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (!force && now - lastMetaFetchAt < META_FETCH_COOLDOWN_MS) return;
  if (metaFetchPromise) return metaFetchPromise;

  lastMetaFetchAt = now;
  metaFetchPromise = (async () => {
    try {
      const metaSnap = await buscarDadosCorporacaoFirestore();
      if (metaSnap) {
        const cleanedMeta = cleanAvnm(metaSnap);
        if (cleanedMeta.config) state.config = cleanedMeta.config;
        if (Array.isArray(cleanedMeta.categorias) && cleanedMeta.categorias.length > 0) state.categorias = cleanedMeta.categorias;
        if (Array.isArray(cleanedMeta.cargos) && cleanedMeta.cargos.length > 0) state.cargos = cleanedMeta.cargos;
        if (Array.isArray(cleanedMeta.lotacoes) && cleanedMeta.lotacoes.length > 0) state.lotacoes = cleanedMeta.lotacoes;
        if (Array.isArray(cleanedMeta.editais) && cleanedMeta.editais.length > 0) state.editais = cleanedMeta.editais;
        if (Array.isArray(cleanedMeta.motivos) && cleanedMeta.motivos.length > 0) state.motivos = cleanedMeta.motivos;
      }
    } catch (e) {
      console.warn("Aviso ao carregar dados institucionais da corporação:", e);
    } finally {
      metaFetchPromise = null;
    }
  })();

  return metaFetchPromise;
}

let lastUsuariosFetchAt = 0;
let usuariosFetchPromise: Promise<void> | null = null;
const USUARIOS_FETCH_COOLDOWN_MS = 15_000;

/**
 * Consulta pontual diretamente na coleção oficial 'usuarios' do Cloud Firestore.
 * ÚNICA fonte da verdade para a lista de usuários e perfis de acesso.
 */
export async function sincronizarUsuariosComFirestore(force = false): Promise<void> {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (!force && state.usuarios.length > 0 && now - lastUsuariosFetchAt < USUARIOS_FETCH_COOLDOWN_MS) {
    return;
  }
  if (usuariosFetchPromise) return usuariosFetchPromise;

  lastUsuariosFetchAt = now;
  usuariosFetchPromise = (async () => {
    try {
      const usersCloud = await buscarTodosUsuariosFirestore();
      if (Array.isArray(usersCloud) && usersCloud.length > 0) {
        const userMap = new Map<string, CloudCacheState["usuarios"][number]>();
        for (const raw of usersCloud) {
          const u = cleanAvnm(raw) as CloudCacheState["usuarios"][number];
          if (u?.id && u?.email) {
            userMap.set(u.id, {
              id: u.id,
              nome: u.nome || u.email.split("@")[0],
              email: u.email.toLowerCase().trim(),
              perfil: u.perfil === "ADMIN" || u.perfil === "GESTOR" ? u.perfil : "CONSULTA",
              ativo: u.ativo !== false,
            });
          }
        }
        state.usuarios = Array.from(userMap.values());

        if (activeSessionUser) {
          const fresh = state.usuarios.find(
            (u) =>
              u.email.toLowerCase() === activeSessionUser!.email.toLowerCase() ||
              u.id === activeSessionUser!.id
          );
          if (fresh) {
            activeSessionUser = {
              id: fresh.id,
              nome: fresh.nome,
              email: fresh.email,
              perfil: fresh.perfil,
              ativo: fresh.ativo,
            };
          }
        }
      }
    } catch (e) {
      console.warn("Aviso ao sincronizar usuários do Firestore:", e);
    } finally {
      usuariosFetchPromise = null;
    }
  })();

  return usuariosFetchPromise;
}

export function getCurrentUser(): UserOut | null {
  const emailTarget = activeSessionEmail || auth.currentUser?.email?.toLowerCase() || null;
  if (emailTarget) {
    const found = state.usuarios.find(
      (u) => u.email.toLowerCase() === emailTarget.toLowerCase() && u.ativo
    );
    if (found) {
      activeSessionUser = {
        id: found.id,
        nome: found.nome,
        email: found.email,
        perfil: found.perfil,
        ativo: found.ativo,
      };
      return activeSessionUser;
    }
  }
  if (activeSessionUser) {
    const foundById = state.usuarios.find(
      (u) =>
        (u.id === activeSessionUser!.id ||
          u.email.toLowerCase() === activeSessionUser!.email.toLowerCase()) &&
        u.ativo
    );
    if (foundById) {
      activeSessionUser = {
        id: foundById.id,
        nome: foundById.nome,
        email: foundById.email,
        perfil: foundById.perfil,
        ativo: foundById.ativo,
      };
    }
    return activeSessionUser;
  }
  return null;
}

export function setCurrentUser(user: UserOut | null) {
  if (!user) {
    activeSessionEmail = null;
    activeSessionUser = null;
  } else {
    activeSessionEmail = user.email.toLowerCase().trim();
    activeSessionUser = { ...user, email: activeSessionEmail };
  }
}

function fmtDateLocal(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const d = iso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

function fmtDateTimeBr(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const s = iso.trim();
  if (!s || s === "-" || s === "—" || s.toLowerCase() === "null") return "—";
  if (/^\d{2}\/\d{2}\/\d{4}\s+às\s+\d{2}:\d{2}/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} às 08:00`;
  }
  const fixedUtcMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})T(00:00|08:00|10:00|12:00):\d{2}(?:\.\d+)?Z$/);
  if (fixedUtcMatch) {
    return `${fixedUtcMatch[3]}/${fixedUtcMatch[2]}/${fixedUtcMatch[1]} às ${fixedUtcMatch[4]}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const parts = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Cuiaba",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(dt);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
    return `${get("day")}/${get("month")}/${get("year")} às ${get("hour")}:${get("minute")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} às ${s.slice(11, 16)}`;
  }
  return s;
}

export function getHoje(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function diasEntre(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const cleanA = String(a).trim().slice(0, 10);
  const cleanB = String(b).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanA) || !/^\d{4}-\d{2}-\d{2}$/.test(cleanB)) return 0;
  const da = new Date(cleanA + "T00:00:00Z");
  const db = new Date(cleanB + "T00:00:00Z");
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function alertaContrato(
  m: { status: string; data_vencimento_contrato?: string | null },
  hoje: string,
  alertaDias: number
): "VENCIDO" | "A_VENCER" | null {
  if (m.status !== "ATIVO" || !m.data_vencimento_contrato) return null;
  const dias = diasEntre(hoje, m.data_vencimento_contrato);
  if (dias < 0) return "VENCIDO";
  if (dias <= alertaDias) return "A_VENCER";
  return null;
}

function ativoEm(
  m: { status: string; data_inclusao?: string | null; data_desligamento?: string | null },
  ref: string,
  hoje: string
): boolean {
  if (ref >= hoje) return m.status === "ATIVO";
  if (m.data_inclusao && m.data_inclusao > ref) return false;
  if (m.status === "ATIVO") return true;
  return Boolean(m.data_desligamento && m.data_desligamento > ref);
}

function noPeriodo(
  d: string | null | undefined,
  ini: string | null | undefined,
  fim: string | null | undefined
): boolean {
  if (!ini && !fim) return true;
  if (!d) return false;
  return (!ini || d >= ini) && (!fim || d <= fim);
}

function normKey(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°ª]/g, "o")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function normMatricula(s: string | null | undefined): string {
  return (s || "").replace(/\s+/g, "").toUpperCase();
}

function cleanAlphanumeric(s: string | null | undefined): string {
  return (s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function getBaseMatricula(s: string | null | undefined): string {
  return (s || "").split(/[\/\-]/)[0].replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function matchMatriculaFlexible(inputQuery: string, targetMatricula: string): boolean {
  if (!inputQuery || !targetMatricula) return false;
  const qNorm = normMatricula(inputQuery);
  const tNorm = normMatricula(targetMatricula);
  if (qNorm === tNorm) return true;

  const qClean = cleanAlphanumeric(inputQuery);
  const tClean = cleanAlphanumeric(targetMatricula);
  if (qClean && tClean) {
    if (qClean === tClean) return true;
    if (tClean.includes(qClean) || (qClean.length >= 4 && tClean.startsWith(qClean))) return true;
  }

  const qBase = getBaseMatricula(inputQuery);
  const tBase = getBaseMatricula(targetMatricula);
  if (qBase && tBase) {
    if (qBase === tBase) return true;
    if (qBase.length >= 4 && (tBase.startsWith(qBase) || qBase.startsWith(tBase))) return true;
  }

  return false;
}

function enrichMilitar(m: CloudCacheState["militares"][number], hoje: string, alertaDias: number): Militar {
  const cargo = state.cargos.find((c) => c.id === m.cargo_id);
  const cat = cargo?.categoria || "OUTROS";
  const categoria = state.categorias.find((c) => c.codigo === cat);
  const lotacao = state.lotacoes.find((l) => l.id === m.lotacao_id);
  const edital = state.editais.find((e) => e.id === m.edital_id);
  const motivo = state.motivos.find((mt) => mt.id === m.motivo_desligamento_id);
  const criador = state.usuarios.find((u) => u.id === m.criado_por);
  const atualizador = state.usuarios.find((u) => u.id === m.atualizado_por);

  return {
    ...m,
    data_inclusao: m.data_inclusao || "",
    data_vencimento_contrato: m.data_vencimento_contrato || "",
    data_desligamento: m.data_desligamento || null,
    doe_incorporacao: m.doe_incorporacao || null,
    observacoes: m.observacoes || null,
    documento_desligamento: m.documento_desligamento || null,
    cargo_nome: cargo?.nome || "—",
    categoria: cat,
    categoria_nome: categoria?.nome || cat,
    lotacao_nome: lotacao?.nome || "—",
    edital_nome: edital?.nome || "—",
    motivo_desligamento_nome: motivo?.nome || null,
    sub_judice: Boolean(m.sub_judice),
    dias_para_vencer: diasEntre(hoje, m.data_vencimento_contrato),
    alerta: alertaContrato(m, hoje, alertaDias),
    criado_por_nome: criador?.nome || "Sistema",
    atualizado_por_nome: atualizador?.nome || "Sistema",
  };
}

export async function logAudit(entry: {
  entidade: string;
  entidade_id?: string | null;
  matricula?: string | null;
  operacao: string;
  usuario_nome?: string;
  usuario_email?: string;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  descricao?: string | null;
}): Promise<HistoricoAlteracao> {
  const user = getCurrentUser() || BOOTSTRAP_USERS[0];
  const usuarioNome = entry.usuario_nome || user.nome || "Sistema";
  const usuarioEmail = entry.usuario_email || user.email || "";

  const saved = await registrarAuditoriaFirestore({
    entidade: entry.entidade,
    entidade_id: entry.entidade_id ?? entry.matricula ?? null,
    matricula: entry.matricula ?? null,
    operacao: entry.operacao,
    usuario_nome: usuarioNome,
    usuario_email: usuarioEmail,
    antes: entry.antes ?? null,
    depois: entry.depois ?? null,
    descricao: entry.descricao ?? null,
  });

  void queryClient.invalidateQueries({ queryKey: ["auditoria"] });
  void queryClient.invalidateQueries({ queryKey: ["meta"] });

  const nowIso = new Date().toISOString();
  return (
    (saved as HistoricoAlteracao) || {
      id: `alt_${Date.now()}`,
      entidade: entry.entidade,
      entidade_id: entry.entidade_id ?? null,
      matricula: entry.matricula ?? null,
      operacao: entry.operacao,
      usuario_nome: usuarioNome,
      usuario_email: usuarioEmail,
      timestamp: nowIso,
      data_hora: nowIso,
      antes: entry.antes ?? null,
      depois: entry.depois ?? null,
      detalhes: {
        antes: entry.antes ?? null,
        depois: entry.depois ?? null,
        descricao: entry.descricao ?? null,
      },
    }
  );
}

// ----------------- CLOUD FIRESTORE SERVICE ENDPOINTS -----------------

export async function handleBackendRequest<T>(method: string, path: string, body?: any): Promise<T> {
  const url = new URL(path.startsWith("/") ? `http://localhost${path}` : `http://localhost/${path}`);

  const pathname = url.pathname.replace(/^\/api/, "");
  const searchParams = url.searchParams;

  const hoje = getHoje();
  const alertaDias = state.config.alerta_dias || 30;

  // 1. AUTH & PERMISSÕES (Fonte única da verdade: coleção 'usuarios' no Firestore)
  if (pathname === "/auth/me" && method === "GET") {
    await sincronizarUsuariosComFirestore();
    const user = getCurrentUser();
    if (!user) {
      throw { status: 401, body: { detail: "Sessão expirada ou não autenticado" } };
    }
    const freshUser = state.usuarios.find(
      (u) => u.email.toLowerCase() === user.email.toLowerCase() || u.id === user.id
    );
    if (freshUser) {
      user.perfil = freshUser.perfil;
      user.nome = freshUser.nome;
      user.ativo = freshUser.ativo;
      setCurrentUser(user);
    }
    return user as T;
  }

  if (pathname === "/auth/login" && method === "POST") {
    const email = (body?.email || "").trim().toLowerCase();
    await sincronizarUsuariosComFirestore(true);
    let user = state.usuarios.find((u) => u.email.toLowerCase() === email && u.ativo);
    if (!user) {
      const cloudUser = await buscarUsuarioPorEmailFirestore(email);
      if (cloudUser && cloudUser.ativo !== false) {
        user = {
          id: cloudUser.id,
          nome: cloudUser.nome || email.split("@")[0],
          email: cloudUser.email.toLowerCase(),
          perfil: cloudUser.perfil === "ADMIN" || cloudUser.perfil === "GESTOR" ? cloudUser.perfil : "CONSULTA",
          ativo: true,
        };
        state.usuarios.push(user);
      }
    }
    if (!user) {
      throw { status: 401, body: { detail: "E-mail ou senha inválidos" } };
    }
    const userOut: UserOut = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
      ativo: user.ativo,
    };
    setCurrentUser(userOut);
    return userOut as T;
  }

  if (pathname === "/auth/signup" && method === "POST") {
    const email = (body?.email || "").trim().toLowerCase();
    const nome = (body?.nome || "").trim();

    if (!email || !nome) {
      throw { status: 400, body: { detail: "Preencha todos os campos obrigatórios." } };
    }
    await sincronizarUsuariosComFirestore(true);
    const existing = state.usuarios.find((u) => u.email.toLowerCase() === email);
    if (existing) {
      throw { status: 409, body: { detail: "Já existe uma conta cadastrada com este e-mail." } };
    }

    const isSystemAdmin =
      email === "admin@cbmmt.mt.gov.br" ||
      email === "joao1canavarros@gmail.com" ||
      email === "rodrigues11-30@hotmail.com";
    const newUser: CloudCacheState["usuarios"][number] = {
      id: `usr_${Date.now()}`,
      nome,
      email,
      perfil: isSystemAdmin ? "ADMIN" : "CONSULTA",
      ativo: true,
    };
    state.usuarios.push(newUser);
    await salvarUsuarioFirestore(newUser);
    await logAudit({
      entidade: "Usuario",
      entidade_id: newUser.id,
      operacao: "CRIACAO_USUARIO",
      usuario_nome: newUser.nome,
      usuario_email: newUser.email,
      antes: null,
      depois: { Nome: newUser.nome, "E-mail": newUser.email, Perfil: newUser.perfil, Ativo: "Sim" },
    });

    const userOut: UserOut = {
      id: newUser.id,
      nome: newUser.nome,
      email: newUser.email,
      perfil: newUser.perfil,
      ativo: newUser.ativo,
    };
    setCurrentUser(userOut);
    return userOut as T;
  }

  if (pathname === "/auth/google" && method === "POST") {
    const email = (body?.email || "").trim().toLowerCase();
    const nome = (body?.nome || "").trim() || email.split("@")[0];

    if (!email) {
      throw { status: 400, body: { detail: "E-mail da conta Google não recebido." } };
    }

    await sincronizarUsuariosComFirestore(true);
    let user = state.usuarios.find((u) => u.email.toLowerCase() === email);
    const isSystemAdmin =
      email === "admin@cbmmt.mt.gov.br" ||
      email === "joao1canavarros@gmail.com" ||
      email === "rodrigues11-30@hotmail.com";

    if (!user) {
      const cloudUser = await buscarUsuarioPorEmailFirestore(email);
      if (cloudUser) {
        user = {
          id: cloudUser.id,
          nome: cloudUser.nome || nome,
          email: cloudUser.email.toLowerCase(),
          perfil:
            cloudUser.perfil === "ADMIN" || cloudUser.perfil === "GESTOR"
              ? cloudUser.perfil
              : isSystemAdmin
              ? "ADMIN"
              : "CONSULTA",
          ativo: cloudUser.ativo !== false,
        };
        state.usuarios.push(user);
      } else {
        user = {
          id: `usr_g_${Date.now()}`,
          nome,
          email,
          perfil: isSystemAdmin ? "ADMIN" : "CONSULTA",
          ativo: true,
        };
        state.usuarios.push(user);
        await salvarUsuarioFirestore(user);
        await logAudit({
          entidade: "Usuario",
          entidade_id: user.id,
          operacao: "CRIACAO_USUARIO",
          usuario_nome: user.nome,
          usuario_email: user.email,
          antes: null,
          depois: { Nome: user.nome, "E-mail": user.email, Perfil: user.perfil, Origem: "Google OAuth" },
        });
      }
    } else {
      let userModified = false;
      if (!user.nome && nome) {
        user.nome = nome;
        userModified = true;
      }
      if (isSystemAdmin && user.perfil !== "ADMIN") {
        user.perfil = "ADMIN";
        userModified = true;
      }
      if (userModified) {
        await salvarUsuarioFirestore(user);
      }
    }

    const userOut: UserOut = {
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
      ativo: user.ativo,
    };
    setCurrentUser(userOut);
    return userOut as T;
  }

  if (pathname === "/auth/logout" && method === "POST") {
    setCurrentUser(null);
    return { ok: true } as T;
  }

  // 2. CATÁLOGOS, DADOS INSTITUCIONAIS ('corporacao > dados') & CONFIG
  if (pathname === "/catalogos" && method === "GET") {
    await carregarMetadadosInstitucionaisFirestore();
    const res: Catalogos = {
      categorias: [...state.categorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)),
      cargos: [...state.cargos].sort((a, b) => a.nome.localeCompare(b.nome)),
      lotacoes: [...state.lotacoes].sort((a, b) => a.nome.localeCompare(b.nome)),
      editais: [...state.editais].sort((a, b) => a.nome.localeCompare(b.nome)),
      motivos: [...state.motivos].sort((a, b) => a.nome.localeCompare(b.nome)),
      config: { ...state.config },
    };
    return res as T;
  }

  if (pathname === "/meta" && method === "GET") {
    const ultimaAtualizacao = state.militares?.[0]?.atualizado_em || new Date().toISOString();
    const res: Meta = {
      data_hoje: hoje,
      ultima_atualizacao: ultimaAtualizacao,
      total_registros: state.militares.length,
    };
    return res as T;
  }

  if (pathname === "/config" && method === "PUT") {
    const oldAlerta = state.config.alerta_dias;
    const newAlerta = Number(body?.alerta_dias) || 30;
    state.config = { alerta_dias: newAlerta };
    await logAudit({
      entidade: "Configurações",
      entidade_id: "config",
      operacao: "ALTERACAO_CONFIGURACAO",
      antes: { "Prazo de alerta (dias)": oldAlerta },
      depois: { "Prazo de alerta (dias)": newAlerta },
    });
    await persistDadosCorporacaoExplicitly(["config"]);
    return state.config as T;
  }

  // Catálogos CRUD em 'corporacao > dados'
  const catMatch = pathname.match(/^\/(categorias|cargos|lotacoes|editais|motivos)(\/(.+))?$/);
  if (catMatch) {
    const coll = catMatch[1] as "categorias" | "cargos" | "lotacoes" | "editais" | "motivos";
    const itemId = catMatch[3];
    if (method === "POST") {
      const newId = `${coll.slice(0, 3)}_${Date.now()}`;
      const item = { id: newId, ...body, ativo: true };
      (state[coll] as any).push(item);
      await logAudit({
        entidade: coll,
        entidade_id: newId,
        operacao: `INSERCAO_${coll.toUpperCase()}`,
        antes: null,
        depois: { Nome: item.nome || item.codigo, ...item },
      });
      await persistDadosCorporacaoExplicitly([coll]);
      return item as T;
    }
    if (method === "PUT" && itemId) {
      const idx = (state[coll] as any).findIndex((x: any) => x.id === itemId);
      if (idx >= 0) {
        const oldItem = { ...state[coll][idx] };
        state[coll][idx] = { ...state[coll][idx], ...body, id: itemId };
        await logAudit({
          entidade: coll,
          entidade_id: itemId,
          operacao: `EDICAO_${coll.toUpperCase()}`,
          antes: oldItem,
          depois: state[coll][idx],
        });
        await persistDadosCorporacaoExplicitly([coll]);
        return state[coll][idx] as T;
      }
    }
    if (method === "DELETE" && itemId) {
      const idx = (state[coll] as any).findIndex((x: any) => x.id === itemId);
      if (idx >= 0) {
        if (coll === "categorias") {
          const cat = state.categorias[idx];
          const cargosUsando = state.cargos.filter((c) => c.categoria === cat.codigo);
          if (cargosUsando.length > 0) {
            throw {
              status: 400,
              body: {
                detail: `Não é possível excluir a categoria "${cat.nome}" pois existem ${cargosUsando.length} cargo(s) vinculado(s) a ela. Desvincule ou exclua os cargos primeiro.`,
              },
            };
          }
        }
        if (coll === "cargos") {
          const milUsando = state.militares.filter((m) => m.cargo_id === itemId);
          if (milUsando.length > 0) {
            throw {
              status: 400,
              body: {
                detail: `Não é possível excluir o cargo pois existem ${milUsando.length} militar(es) vinculado(s).`,
              },
            };
          }
        }
        if (coll === "lotacoes") {
          const milUsando = state.militares.filter((m) => m.lotacao_id === itemId);
          if (milUsando.length > 0) {
            throw {
              status: 400,
              body: {
                detail: `Não é possível excluir a lotação pois existem ${milUsando.length} militar(es) vinculado(s).`,
              },
            };
          }
        }
        if (coll === "editais") {
          const milUsando = state.militares.filter((m) => m.edital_id === itemId);
          if (milUsando.length > 0) {
            throw {
              status: 400,
              body: {
                detail: `Não é possível excluir o edital pois existem ${milUsando.length} militar(es) vinculado(s).`,
              },
            };
          }
        }
        const oldItem = { ...state[coll][idx] };
        const removed = state[coll].splice(idx, 1);
        await logAudit({
          entidade: coll,
          entidade_id: itemId,
          operacao: `EXCLUSAO_${coll.toUpperCase()}`,
          antes: { Nome: oldItem.nome || oldItem.codigo, ...oldItem },
          depois: null,
        });
        await persistDadosCorporacaoExplicitly([coll]);
        return { ok: true, removed } as T;
      }
      throw { status: 404, body: { detail: "Registro não encontrado" } };
    }
  }

  // 3. DASHBOARD
  if (pathname === "/dashboard" && method === "GET") {
    await sincronizarMilitaresComFirestore();
    await carregarMetadadosInstitucionaisFirestore();

    const categoria = searchParams.get("categoria");
    const cargo_id = searchParams.get("cargo_id");
    const lotacao_id = searchParams.get("lotacao_id");
    const edital_id = searchParams.get("edital_id");
    const status = searchParams.get("status");
    const ano = searchParams.get("ano");
    const data_inicio = searchParams.get("data_inicio");
    const data_fim = searchParams.get("data_fim");

    let ini = data_inicio;
    let fim = data_fim;
    if (ano && !ini && !fim) {
      ini = `${ano}-01-01`;
      fim = `${ano}-12-31`;
    }
    const ref = fim && fim < hoje ? fim : hoje;

    let records = state.militares.map((m) => enrichMilitar(m, hoje, alertaDias));
    if (categoria) records = records.filter((m) => m.categoria === categoria);
    if (cargo_id) records = records.filter((m) => m.cargo_id === cargo_id);
    if (lotacao_id) records = records.filter((m) => m.lotacao_id === lotacao_id);
    if (edital_id) records = records.filter((m) => m.edital_id === edital_id);
    if (status) records = records.filter((m) => m.status === status);

    const ativosRef = records.filter((m) => ativoEm(m, ref, hoje));
    const ativosHoje = records.filter((m) => m.status === "ATIVO");
    const desligPeriodo = records.filter((m) => m.status === "DESLIGADO" && noPeriodo(m.data_desligamento, ini, fim));
    const inclusoesPeriodo = records.filter((m) => noPeriodo(m.data_inclusao, ini, fim));

    const porCat: Record<string, number> = {};
    for (const c of state.categorias) porCat[c.codigo] = 0;
    for (const m of ativosRef) {
      porCat[m.categoria] = (porCat[m.categoria] || 0) + 1;
    }

    const ubmCount: Record<string, { nome: string; total: number }> = {};
    for (const m of ativosRef) {
      if (!ubmCount[m.lotacao_id]) {
        ubmCount[m.lotacao_id] = { nome: m.lotacao_nome, total: 0 };
      }
      ubmCount[m.lotacao_id].total += 1;
    }
    const porUbm: CountItem[] = Object.entries(ubmCount)
      .map(([k, v]) => ({ chave: k, nome: v.nome, total: v.total }))
      .sort((a, b) => b.total - a.total);

    const editalCount: Record<string, { nome: string; total: number }> = {};
    for (const m of ativosRef) {
      if (!editalCount[m.edital_id]) {
        editalCount[m.edital_id] = { nome: m.edital_nome, total: 0 };
      }
      editalCount[m.edital_id].total += 1;
    }
    const distEdital: CountItem[] = Object.entries(editalCount)
      .map(([k, v]) => ({ chave: k, nome: v.nome, total: v.total }))
      .sort((a, b) => b.total - a.total);

    const FAIXAS: Array<[string, number | null, number | null]> = [
      ["Vencidos", null, -1],
      ["0–30 dias", 0, 30],
      ["31–60 dias", 31, 60],
      ["61–90 dias", 61, 90],
      ["91–180 dias", 91, 180],
      ["> 180 dias", 181, null],
    ];
    const faixasVencimento: FaixaItem[] = FAIXAS.map(([label, min, max]) => {
      const tot = ativosHoje.filter((m) => {
        const d = m.dias_para_vencer;
        if (min !== null && d < min) return false;
        if (max !== null && d > max) return false;
        return true;
      }).length;
      return { faixa: label, min, max, total: tot };
    });

    const anosInclusao = records.map((m) => parseInt((m.data_inclusao || "").slice(0, 4), 10)).filter(Boolean);
    const minAno = anosInclusao.length ? Math.min(...anosInclusao) : 2022;
    const refAno = parseInt(ref.slice(0, 4), 10);
    const efetivoCargoAno: ChartRow[] = [];
    for (let a = minAno; a <= refAno; a++) {
      const d =
        Math.min(new Date(`${a}-12-31`).getTime(), new Date(ref).getTime()) === new Date(`${a}-12-31`).getTime()
          ? `${a}-12-31`
          : ref;
      const row: ChartRow = { ano: String(a), data: d };
      let tot = 0;
      for (const cat of state.categorias) {
        const c = records.filter((m) => m.categoria === cat.codigo && ativoEm(m, d, hoje)).length;
        row[cat.codigo] = c;
        tot += c;
      }
      row.total = tot;
      efetivoCargoAno.push(row);
    }

    const totMotivo: Record<string, number> = {};
    for (const m of desligPeriodo) {
      const mid = m.motivo_desligamento_id || "sem_motivo";
      totMotivo[mid] = (totMotivo[mid] || 0) + 1;
    }
    const desligMotivos: CountItem[] = state.motivos.map((mot) => ({
      chave: mot.id,
      nome: mot.nome,
      total: totMotivo[mot.id] || 0,
    }));
    if (totMotivo["sem_motivo"]) {
      desligMotivos.push({
        chave: "sem_motivo",
        nome: "Não informado",
        total: totMotivo["sem_motivo"],
      });
    }

    const activeMotivoIds = desligMotivos.filter((mt) => mt.total > 0).map((mt) => mt.chave);

    const desligAnosMap = new Map<string, ChartRow>();
    for (const m of desligPeriodo) {
      const dt = m.data_desligamento || (m.atualizado_em ? m.atualizado_em.slice(0, 10) : hoje);
      const anoDesl = dt.slice(0, 4);
      const mid = m.motivo_desligamento_id || "sem_motivo";
      if (!desligAnosMap.has(anoDesl)) {
        const initRow: ChartRow = { ano: anoDesl, total: 0 };
        for (const mk of activeMotivoIds) initRow[mk] = 0;
        desligAnosMap.set(anoDesl, initRow);
      }
      const row = desligAnosMap.get(anoDesl)!;
      row[mid] = Number(row[mid] || 0) + 1;
      row.total = Number(row.total || 0) + 1;
    }
    const desligPorAno: ChartRow[] = Array.from(desligAnosMap.values()).sort((a, b) =>
      String(a.ano).localeCompare(String(b.ano))
    );

    const desligCargoMap = new Map<string, ChartRow>();
    for (const cat of state.categorias) {
      const initRow: ChartRow = { categoria: cat.codigo, nome: cat.nome, total: 0 };
      for (const mk of activeMotivoIds) initRow[mk] = 0;
      desligCargoMap.set(cat.codigo, initRow);
    }
    for (const m of desligPeriodo) {
      const catCode = m.categoria || "OUTROS";
      const mid = m.motivo_desligamento_id || "sem_motivo";
      if (!desligCargoMap.has(catCode)) {
        const initRow: ChartRow = { categoria: catCode, nome: m.categoria_nome || catCode, total: 0 };
        for (const mk of activeMotivoIds) initRow[mk] = 0;
        desligCargoMap.set(catCode, initRow);
      }
      const row = desligCargoMap.get(catCode)!;
      row[mid] = Number(row[mid] || 0) + 1;
      row.total = Number(row.total || 0) + 1;
    }
    const desligPorCargo: ChartRow[] = Array.from(desligCargoMap.values()).filter(
      (r) => Number(r.total || 0) > 0
    );

    const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const evolucaoMensal: ChartRow[] = [];
    const currYear = parseInt(ref.slice(0, 4), 10);
    const currMonth = parseInt(ref.slice(5, 7), 10);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(currYear, currMonth - 1 - i, 1);
      const y = d.getFullYear();
      const mm = d.getMonth() + 1;
      const pref = `${y}-${String(mm).padStart(2, "0")}`;
      evolucaoMensal.push({
        mes: pref,
        rotulo: `${MESES[mm - 1]}/${String(y).slice(2)}`,
        inclusoes: records.filter((m) => (m.data_inclusao || "").startsWith(pref)).length,
        desligamentos: records.filter((m) => m.status === "DESLIGADO" && (m.data_desligamento || "").startsWith(pref)).length,
        efetivo: records.filter((m) => ativoEm(m, `${pref}-28`, hoje)).length,
      });
    }

    const evolucaoAnual: ChartRow[] = [];
    for (let a = minAno; a <= refAno; a++) {
      const dFim =
        Math.min(new Date(`${a}-12-31`).getTime(), new Date(ref).getTime()) === new Date(`${a}-12-31`).getTime()
          ? `${a}-12-31`
          : ref;
      const aStr = String(a);
      evolucaoAnual.push({
        ano: aStr,
        inclusoes: records.filter((m) => (m.data_inclusao || "").startsWith(aStr)).length,
        desligamentos: records.filter((m) => m.status === "DESLIGADO" && (m.data_desligamento || "").startsWith(aStr)).length,
        efetivo: records.filter((m) => ativoEm(m, dFim, hoje)).length,
      });
    }

    const top = porUbm[0];
    const kpis: KPIs = {
      ativos: ativosRef.length,
      desligamentos_periodo: desligPeriodo.length,
      inclusoes_periodo: inclusoesPeriodo.length,
      top_ubm_id: top ? top.chave : null,
      top_ubm_nome: top ? top.nome : null,
      top_ubm_total: top ? top.total : 0,
      por_categoria: porCat,
      a_vencer: ativosHoje.filter((m) => m.alerta === "A_VENCER").length,
      vencidos: ativosHoje.filter((m) => m.alerta === "VENCIDO").length,
      sub_judice: ativosRef.filter((m) => m.sub_judice).length,
    };

    const dashboardRes: Dashboard = {
      data_hoje: hoje,
      data_referencia: ref,
      periodo_inicio: ini || null,
      periodo_fim: fim || null,
      alerta_dias: alertaDias,
      kpis,
      categorias: state.categorias.map((c) => ({ chave: c.codigo, nome: c.nome, total: porCat[c.codigo] || 0 })),
      motivos: desligMotivos,
      efetivo_cargo_ano: efetivoCargoAno,
      deslig_por_ano: desligPorAno,
      deslig_por_cargo: desligPorCargo,
      deslig_motivos: desligMotivos,
      por_ubm: porUbm,
      evolucao_mensal: evolucaoMensal,
      evolucao_anual: evolucaoAnual,
      dist_categoria: state.categorias.map((c) => ({ chave: c.codigo, nome: c.nome, total: porCat[c.codigo] || 0 })),
      dist_edital: distEdital,
      faixas_vencimento: faixasVencimento,
    };
    return dashboardRes as T;
  }

  // 4. MILITARES (Coleção dedicada 'militares')
  if ((pathname === "/militares/sincronizar" || pathname === "/sincronizar") && (method === "POST" || method === "GET")) {
    await sincronizarMilitaresComFirestore(true);
    await carregarMetadadosInstitucionaisFirestore(true);
    return { ok: true, total: state.militares.length } as T;
  }

  if (pathname === "/militares/verificar-matricula" && method === "GET") {
    const matricula = normMatricula(searchParams.get("matricula") || "");
    const excluirId = searchParams.get("excluir_id");
    const found = state.militares.find(
      (m) => normMatricula(m.matricula) === matricula && (!excluirId || m.id !== excluirId)
    );
    const check: MatriculaCheck = {
      existe: Boolean(found),
      militar_id: found ? found.id : null,
      nome_completo: found ? found.nome_completo : null,
    };
    return check as T;
  }

  if (pathname === "/militares/situacao" && method === "GET") {
    await sincronizarMilitaresComFirestore();
    const items = [...state.situacoes].sort((a, b) =>
      (b.data_efetiva || b.timestamp || "").localeCompare(a.data_efetiva || a.timestamp || "")
    );
    const res: SituacaoPage = { items, total: items.length };
    return res as T;
  }

  if (pathname === "/militares" && method === "GET") {
    await sincronizarMilitaresComFirestore();

    let list = state.militares.map((m) => enrichMilitar(m, hoje, alertaDias));

    const q = searchParams.get("q");
    if (q) {
      const qNorm = normKey(q);
      const qClean = cleanAlphanumeric(q);
      list = list.filter(
        (m) =>
          normKey(m.nome_completo).includes(qNorm) ||
          normMatricula(m.matricula).includes(qNorm) ||
          (qClean && cleanAlphanumeric(m.matricula).includes(qClean)) ||
          matchMatriculaFlexible(q, m.matricula)
      );
    }
    const categoria = searchParams.get("categoria");
    if (categoria) list = list.filter((m) => m.categoria === categoria);
    const cargo_id = searchParams.get("cargo_id");
    if (cargo_id) list = list.filter((m) => m.cargo_id === cargo_id);
    const lotacao_id = searchParams.get("lotacao_id");
    if (lotacao_id) list = list.filter((m) => m.lotacao_id === lotacao_id);
    const edital_id = searchParams.get("edital_id");
    if (edital_id) list = list.filter((m) => m.edital_id === edital_id);
    const status = searchParams.get("status");
    if (status) list = list.filter((m) => m.status === status);
    const motivo_id = searchParams.get("motivo_id");
    if (motivo_id) {
      list = list.filter((m) =>
        motivo_id === "sem_motivo" || motivo_id === "NAO_INFORMADO"
          ? !m.motivo_desligamento_id
          : m.motivo_desligamento_id === motivo_id
      );
    }

    const faixaVenc = searchParams.get("faixa_venc");
    const venc = searchParams.get("venc");
    const vencMinDiasRaw = searchParams.get("venc_min_dias");
    const vencMaxDiasRaw = searchParams.get("venc_max_dias");

    if (faixaVenc === "Vencidos" || venc === "vencidos" || venc === "vencido") {
      list = list.filter((m) => m.status === "ATIVO" && (m.alerta === "VENCIDO" || m.dias_para_vencer < 0));
    } else if (faixaVenc === "0–30 dias" || faixaVenc === "0-30 dias") {
      list = list.filter((m) => m.status === "ATIVO" && m.dias_para_vencer >= 0 && m.dias_para_vencer <= 30);
    } else if (faixaVenc === "31–60 dias" || faixaVenc === "31-60 dias") {
      list = list.filter((m) => m.status === "ATIVO" && m.dias_para_vencer >= 31 && m.dias_para_vencer <= 60);
    } else if (faixaVenc === "61–90 dias" || faixaVenc === "61-90 dias") {
      list = list.filter((m) => m.status === "ATIVO" && m.dias_para_vencer >= 61 && m.dias_para_vencer <= 90);
    } else if (faixaVenc === "91–180 dias" || faixaVenc === "91-180 dias") {
      list = list.filter((m) => m.status === "ATIVO" && m.dias_para_vencer >= 91 && m.dias_para_vencer <= 180);
    } else if (faixaVenc === "> 180 dias" || faixaVenc === ">180 dias") {
      list = list.filter((m) => m.status === "ATIVO" && m.dias_para_vencer > 180);
    } else if (vencMinDiasRaw !== null || vencMaxDiasRaw !== null) {
      const minDias =
        vencMinDiasRaw !== null && vencMinDiasRaw !== "" && vencMinDiasRaw !== "null"
          ? parseInt(vencMinDiasRaw, 10)
          : null;
      const maxDias =
        vencMaxDiasRaw !== null && vencMaxDiasRaw !== "" && vencMaxDiasRaw !== "null"
          ? parseInt(vencMaxDiasRaw, 10)
          : null;
      list = list.filter((m) => {
        if (m.status !== "ATIVO") return false;
        const d = m.dias_para_vencer;
        if (minDias !== null && !isNaN(minDias) && d < minDias) return false;
        if (maxDias !== null && !isNaN(maxDias) && d > maxDias) return false;
        return true;
      });
    } else if (venc === "a_vencer") {
      list = list.filter(
        (m) => m.status === "ATIVO" && (m.alerta === "A_VENCER" || (m.dias_para_vencer >= 0 && m.dias_para_vencer <= alertaDias))
      );
    } else if (venc === "regular" || venc === "em_dia") {
      list = list.filter((m) => m.status === "ATIVO" && m.dias_para_vencer > alertaDias);
    }

    const sub_judice = searchParams.get("sub_judice");
    if (sub_judice === "true") list = list.filter((m) => m.sub_judice);
    else if (sub_judice === "false") list = list.filter((m) => !m.sub_judice);

    const ativo_em = searchParams.get("ativo_em");
    if (ativo_em) {
      list = list.filter((m) => ativoEm(m, ativo_em, hoje));
    }

    const inclusao_ini = searchParams.get("inclusao_ini");
    const inclusao_fim = searchParams.get("inclusao_fim");
    if (inclusao_ini) list = list.filter((m) => m.data_inclusao >= inclusao_ini);
    if (inclusao_fim) list = list.filter((m) => m.data_inclusao <= inclusao_fim);

    const deslig_ini = searchParams.get("deslig_ini");
    const deslig_fim = searchParams.get("deslig_fim");
    if (deslig_ini) list = list.filter((m) => m.data_desligamento && m.data_desligamento >= deslig_ini);
    if (deslig_fim) list = list.filter((m) => m.data_desligamento && m.data_desligamento <= deslig_fim);

    const ano = searchParams.get("ano");
    const data_inicio = searchParams.get("data_inicio");
    const data_fim = searchParams.get("data_fim");

    if (ano) {
      list = list.filter((m) => {
        const incAno = m.data_inclusao ? m.data_inclusao.slice(0, 4) : "";
        const edital = state.editais.find((e) => e.id === m.edital_id);
        const editalAno = edital?.ano ? String(edital.ano) : "";
        const activeInYear =
          m.data_inclusao <= `${ano}-12-31` && (!m.data_desligamento || m.data_desligamento >= `${ano}-01-01`);
        return incAno === ano || editalAno === ano || activeInYear;
      });
    } else {
      if (data_inicio) {
        list = list.filter(
          (m) =>
            m.data_inclusao >= data_inicio ||
            (m.data_vencimento_contrato && m.data_vencimento_contrato >= data_inicio) ||
            (!m.data_desligamento || m.data_desligamento >= data_inicio)
        );
      }
      if (data_fim) {
        list = list.filter((m) => m.data_inclusao <= data_fim);
      }
    }

    const sort = searchParams.get("sort") || "nome_completo";
    const direction = searchParams.get("direction") || "asc";
    list.sort((a: any, b: any) => {
      const valA = a[sort] ?? "";
      const valB = b[sort] ?? "";
      const cmp = String(valA).localeCompare(String(valB), "pt-BR", { numeric: true });
      return direction === "desc" ? -cmp : cmp;
    });

    // Exportação sob demanda apenas quando all=true / export=true; caso contrário, limite estrito de 20 ou 30 registros
    const isAll =
      searchParams.get("all") === "true" ||
      searchParams.get("export") === "true" ||
      searchParams.get("page_size") === "all";
    const total = list.length;
    let items = list;
    let page = 1;
    let pageSize = total;

    if (!isAll) {
      page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
      pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("page_size") || "20", 10)));
      const start = (page - 1) * pageSize;
      items = list.slice(start, start + pageSize);
    }

    const pageRes: MilitarPage = { items, total, page, page_size: pageSize };
    return pageRes as T;
  }

  // Create militar
  if (pathname === "/militares" && method === "POST") {
    const b = body as MilitarIn;
    const mat = normMatricula(b.matricula);
    const exists = state.militares.find((m) => normMatricula(m.matricula) === mat);
    if (exists) {
      throw {
        status: 409,
        body: {
          detail: {
            message: `Já existe cadastro para a matrícula ${b.matricula} (${exists.nome_completo}).`,
            militar_id: exists.id,
          },
        },
      };
    }
    const user = getCurrentUser() || BOOTSTRAP_USERS[0];
    const newDoc: CloudCacheState["militares"][number] = {
      id: `mil_${Date.now()}`,
      matricula: b.matricula.trim(),
      nome_completo: b.nome_completo.trim().toUpperCase(),
      cargo_id: b.cargo_id,
      lotacao_id: b.lotacao_id,
      edital_id: b.edital_id,
      data_inclusao: b.data_inclusao,
      data_vencimento_contrato: b.data_vencimento_contrato,
      status: b.status || "ATIVO",
      observacoes: b.observacoes || null,
      doe_incorporacao: b.doe_incorporacao || null,
      sub_judice: Boolean(b.sub_judice),
      data_desligamento: b.data_desligamento || null,
      motivo_desligamento_id: b.motivo_desligamento_id || null,
      documento_desligamento: b.documento_desligamento || null,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
      criado_por: user.id,
      atualizado_por: user.id,
    };
    state.militares.unshift(newDoc);
    state.situacoes.unshift({
      id: `sit_${Date.now()}`,
      militar_id: newDoc.id,
      matricula: newDoc.matricula,
      nome_completo: newDoc.nome_completo,
      tipo: "INCLUSAO",
      data_efetiva: newDoc.data_inclusao,
      motivo_nome: null,
      documento: newDoc.doe_incorporacao,
      justificativa: null,
      observacoes: "Cadastro manual no sistema",
      usuario_nome: user.nome,
      timestamp: new Date().toISOString(),
    });
    await logAudit({
      entidade: "Militar",
      entidade_id: newDoc.id,
      matricula: newDoc.matricula,
      operacao: "NOVO_CADASTRO",
      usuario_nome: user.nome,
      usuario_email: user.email,
      antes: null,
      depois: {
        Nome: newDoc.nome_completo,
        Matrícula: newDoc.matricula,
        "Vencimento do contrato": newDoc.data_vencimento_contrato,
        "Data de inclusão": newDoc.data_inclusao,
        Situação: newDoc.status,
      },
    });
    await persistMilitarExplicitly(newDoc);
    return enrichMilitar(newDoc, hoje, alertaDias) as T;
  }

  // Single militar routes
  const milDetailMatch = pathname.match(/^\/militares\/([^/]+)$/);
  if (milDetailMatch) {
    const id = milDetailMatch[1];

    if (method === "GET") {
      const cloudMil = await buscarMilitarFirestore(id);
      if (cloudMil && cloudMil.id) {
        const cleaned = sanitizeMilitarRecord(cloudMil);
        const existingIdx = state.militares.findIndex((m) => m.id === id);
        if (existingIdx >= 0) {
          state.militares[existingIdx] = { ...state.militares[existingIdx], ...cleaned };
        } else {
          state.militares.unshift(cleaned);
        }
      }
      const doc = state.militares.find((m) => m.id === id);
      if (!doc) throw { status: 404, body: { detail: "Militar não encontrado" } };
      return enrichMilitar(doc, hoje, alertaDias) as T;
    }

    const doc = state.militares.find((m) => m.id === id);
    if (!doc) throw { status: 404, body: { detail: "Militar não encontrado" } };

    if (method === "PUT") {
      const b = body as MilitarIn;
      const user = getCurrentUser() || BOOTSTRAP_USERS[0];
      const antes: Record<string, unknown> = {};
      const depois: Record<string, unknown> = {};
      let isVencChange = false;

      const checkField = (label: string, oldVal: unknown, newVal: unknown) => {
        if (oldVal !== newVal && (oldVal || newVal)) {
          antes[label] = oldVal ?? "—";
          depois[label] = newVal ?? "—";
        }
      };

      checkField("Nome completo", doc.nome_completo, b.nome_completo?.trim().toUpperCase());
      checkField("Matrícula", doc.matricula, b.matricula?.trim());
      if (doc.cargo_id !== b.cargo_id) {
        antes["Cargo"] = state.cargos.find((c) => c.id === doc.cargo_id)?.nome || doc.cargo_id;
        depois["Cargo"] = state.cargos.find((c) => c.id === b.cargo_id)?.nome || b.cargo_id;
      }
      if (doc.lotacao_id !== b.lotacao_id) {
        antes["Lotação/UBM"] = state.lotacoes.find((l) => l.id === doc.lotacao_id)?.nome || doc.lotacao_id;
        depois["Lotação/UBM"] = state.lotacoes.find((l) => l.id === b.lotacao_id)?.nome || b.lotacao_id;
      }
      if (doc.edital_id !== b.edital_id) {
        antes["Edital"] = state.editais.find((e) => e.id === doc.edital_id)?.nome || doc.edital_id;
        depois["Edital"] = state.editais.find((e) => e.id === b.edital_id)?.nome || b.edital_id;
      }
      checkField("Data de inclusão", doc.data_inclusao, b.data_inclusao);
      if (doc.data_vencimento_contrato !== b.data_vencimento_contrato) {
        antes["Data de vencimento"] = doc.data_vencimento_contrato;
        depois["Data de vencimento"] = b.data_vencimento_contrato;
        isVencChange = true;
      }
      checkField("Situação", doc.status, b.status);
      checkField("Sub judice", doc.sub_judice ? "Sim" : "Não", b.sub_judice ? "Sim" : "Não");
      checkField("DOE Incorporação", doc.doe_incorporacao, b.doe_incorporacao);
      checkField("Observações", doc.observacoes, b.observacoes);

      Object.assign(doc, {
        matricula: b.matricula.trim(),
        nome_completo: b.nome_completo.trim().toUpperCase(),
        cargo_id: b.cargo_id,
        lotacao_id: b.lotacao_id,
        edital_id: b.edital_id,
        data_inclusao: b.data_inclusao,
        data_vencimento_contrato: b.data_vencimento_contrato,
        status: b.status,
        observacoes: b.observacoes || null,
        doe_incorporacao: b.doe_incorporacao || null,
        sub_judice: Boolean(b.sub_judice),
        data_desligamento: b.data_desligamento || null,
        motivo_desligamento_id: b.motivo_desligamento_id || null,
        documento_desligamento: b.documento_desligamento || null,
        atualizado_em: new Date().toISOString(),
        atualizado_por: user.id,
      });

      await logAudit({
        entidade: "Militar",
        entidade_id: doc.id,
        matricula: doc.matricula,
        operacao: isVencChange ? "ALTERACAO_VENCIMENTO" : "EDICAO_CADASTRO",
        usuario_nome: user.nome,
        usuario_email: user.email,
        antes: Object.keys(antes).length > 0 ? antes : null,
        depois: Object.keys(depois).length > 0 ? depois : { Militar: doc.nome_completo },
      });

      await persistMilitarExplicitly(doc);
      return enrichMilitar(doc, hoje, alertaDias) as T;
    }

    if (method === "DELETE") {
      const user = getCurrentUser() || BOOTSTRAP_USERS[0];
      const docIdx = state.militares.findIndex((m) => m.id === id);
      if (docIdx >= 0) {
        const removed = state.militares.splice(docIdx, 1)[0];
        state.situacoes = (state.situacoes || []).filter((s) => s.militar_id !== id);
        await logAudit({
          entidade: "Militar",
          entidade_id: id,
          matricula: removed.matricula,
          operacao: "EXCLUSAO_CADASTRO",
          usuario_nome: user.nome,
          usuario_email: user.email,
          antes: { Nome: removed.nome_completo, Matrícula: removed.matricula },
          depois: null,
        });
        rebuildSituacoesFromMilitares();
        await excluirMilitarFirestore(id);
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["militares"] });
        void queryClient.invalidateQueries({ queryKey: ["situacao"] });
        void queryClient.invalidateQueries({ queryKey: ["relatorio"] });
        return { ok: true, id } as T;
      }
      throw { status: 404, body: { detail: "Militar não encontrado" } };
    }
  }

  const milQuickMatch = pathname.match(/^\/militares\/([^/]+)\/rapido$/);
  if (milQuickMatch && method === "PATCH") {
    const id = milQuickMatch[1];
    const doc = state.militares.find((m) => m.id === id);
    if (!doc) throw { status: 404, body: { detail: "Militar não encontrado" } };
    const b = body as MilitarRapidoIn;
    const user = getCurrentUser() || BOOTSTRAP_USERS[0];
    const antes: Record<string, unknown> = {};
    const depois: Record<string, unknown> = {};
    let isVencChange = false;

    if (b.data_vencimento_contrato && b.data_vencimento_contrato !== doc.data_vencimento_contrato) {
      antes["Data de vencimento"] = doc.data_vencimento_contrato;
      depois["Data de vencimento"] = b.data_vencimento_contrato;
      doc.data_vencimento_contrato = b.data_vencimento_contrato;
      isVencChange = true;
    }
    if (b.lotacao_id && b.lotacao_id !== doc.lotacao_id) {
      const oldLot = state.lotacoes.find((l) => l.id === doc.lotacao_id)?.nome || doc.lotacao_id;
      const newLot = state.lotacoes.find((l) => l.id === b.lotacao_id)?.nome || b.lotacao_id;
      antes["Lotação/UBM"] = oldLot;
      depois["Lotação/UBM"] = newLot;
      doc.lotacao_id = b.lotacao_id;
    }
    if (b.edital_id && b.edital_id !== doc.edital_id) {
      const oldEd = state.editais.find((e) => e.id === doc.edital_id)?.nome || doc.edital_id;
      const newEd = state.editais.find((e) => e.id === b.edital_id)?.nome || b.edital_id;
      antes["Edital"] = oldEd;
      depois["Edital"] = newEd;
      doc.edital_id = b.edital_id;
    }
    if (b.observacoes !== undefined && b.observacoes !== doc.observacoes) {
      antes["Observações"] = doc.observacoes || "—";
      depois["Observações"] = b.observacoes || "—";
      doc.observacoes = b.observacoes;
    }

    doc.atualizado_em = new Date().toISOString();
    doc.atualizado_por = user.id;

    await logAudit({
      entidade: "Militar",
      entidade_id: doc.id,
      matricula: doc.matricula,
      operacao: isVencChange ? "ALTERACAO_VENCIMENTO" : "EDICAO_RAPIDA",
      usuario_nome: user.nome,
      usuario_email: user.email,
      antes: Object.keys(antes).length > 0 ? antes : null,
      depois: Object.keys(depois).length > 0 ? depois : { Militar: doc.nome_completo },
    });

    await persistMilitarExplicitly(doc);
    return enrichMilitar(doc, hoje, alertaDias) as T;
  }

  const milDesligMatch = pathname.match(/^\/militares\/([^/]+)\/(desligar|desligamento)$/);
  if (milDesligMatch && method === "POST") {
    const id = milDesligMatch[1];
    const doc = state.militares.find((m) => m.id === id);
    if (!doc) throw { status: 404, body: { detail: "Militar não encontrado" } };
    const b = body as DesligamentoIn;
    const user = getCurrentUser() || BOOTSTRAP_USERS[0];
    const motivo = state.motivos.find((mt) => mt.id === b.motivo_id);

    const oldStatus = doc.status;
    doc.status = "DESLIGADO";
    doc.data_desligamento = b.data_desligamento;
    doc.motivo_desligamento_id = b.motivo_id;
    doc.documento_desligamento = b.documento || null;
    if (b.observacoes) doc.observacoes = b.observacoes;
    doc.atualizado_em = new Date().toISOString();
    doc.atualizado_por = user.id;

    state.situacoes.unshift({
      id: `sit_${Date.now()}`,
      militar_id: doc.id,
      matricula: doc.matricula,
      nome_completo: doc.nome_completo,
      tipo: "DESLIGAMENTO",
      data_efetiva: b.data_desligamento,
      motivo_nome: motivo?.nome || null,
      documento: b.documento || null,
      justificativa: null,
      observacoes: b.observacoes || null,
      usuario_nome: user.nome,
      timestamp: new Date().toISOString(),
    });

    await logAudit({
      entidade: "Militar",
      entidade_id: doc.id,
      matricula: doc.matricula,
      operacao: "DESLIGAMENTO",
      usuario_nome: user.nome,
      usuario_email: user.email,
      antes: { Situação: oldStatus },
      depois: {
        Situação: "DESLIGADO",
        "Data do desligamento": b.data_desligamento,
        "Status de desligamento": motivo?.nome || b.motivo_id,
        Documento: b.documento || "—",
        "Motivo do desligamento": b.observacoes || "—",
      },
    });

    await persistMilitarExplicitly(doc);
    return enrichMilitar(doc, hoje, alertaDias) as T;
  }

  const milReativarMatch = pathname.match(/^\/militares\/([^/]+)\/(reativar|reativacao)$/);
  if (milReativarMatch && method === "POST") {
    const id = milReativarMatch[1];
    const doc = state.militares.find((m) => m.id === id);
    if (!doc) throw { status: 404, body: { detail: "Militar não encontrado" } };
    const b = body as ReativacaoIn;
    const user = getCurrentUser() || BOOTSTRAP_USERS[0];

    const oldStatus = doc.status;
    const oldVenc = doc.data_vencimento_contrato;
    doc.status = "ATIVO";
    doc.data_desligamento = null;
    doc.motivo_desligamento_id = null;
    doc.documento_desligamento = null;
    if (b.data_vencimento_contrato) doc.data_vencimento_contrato = b.data_vencimento_contrato;
    doc.atualizado_em = new Date().toISOString();
    doc.atualizado_por = user.id;

    state.situacoes.unshift({
      id: `sit_${Date.now()}`,
      militar_id: doc.id,
      matricula: doc.matricula,
      nome_completo: doc.nome_completo,
      tipo: "REATIVACAO",
      data_efetiva: hoje,
      motivo_nome: null,
      documento: b.documento || null,
      justificativa: b.justificativa,
      observacoes: null,
      usuario_nome: user.nome,
      timestamp: new Date().toISOString(),
    });

    await logAudit({
      entidade: "Militar",
      entidade_id: doc.id,
      matricula: doc.matricula,
      operacao: "REATIVACAO",
      usuario_nome: user.nome,
      usuario_email: user.email,
      antes: { Situação: oldStatus, "Data de vencimento": oldVenc },
      depois: {
        Situação: "ATIVO",
        "Data da reativação": hoje,
        "Novo vencimento": doc.data_vencimento_contrato,
        Justificativa: b.justificativa,
        Documento: b.documento || "—",
      },
    });

    await persistMilitarExplicitly(doc);
    return enrichMilitar(doc, hoje, alertaDias) as T;
  }

  const milHistMatch = pathname.match(/^\/militares\/([^/]+)\/historico$/);
  if (milHistMatch && method === "GET") {
    const id = milHistMatch[1];
    const doc = state.militares.find((m) => m.id === id);
    const situacao = state.situacoes.filter((s) => s.militar_id === id);
    const alteracoes = await buscarAuditoriaPorEntidadeFirestore(id, doc?.matricula ?? null, 30);
    const hist: MilitarHistorico = { alteracoes: alteracoes as HistoricoAlteracao[], situacao };
    return hist as T;
  }

  // 5. RELATÓRIOS
  const relMatch = pathname.match(/^\/relatorios\/([^/]+)$/);
  if (relMatch && method === "GET") {
    await sincronizarMilitaresComFirestore();
    const tipo = relMatch[1];
    const matriculaParam = searchParams.get("matricula");
    let recs = state.militares.map((m) => enrichMilitar(m, hoje, alertaDias));

    const categoria = searchParams.get("categoria");
    if (categoria) recs = recs.filter((m) => m.categoria === categoria);
    const cargo_id = searchParams.get("cargo_id");
    if (cargo_id) recs = recs.filter((m) => m.cargo_id === cargo_id);
    const lotacao_id = searchParams.get("lotacao_id");
    if (lotacao_id) recs = recs.filter((m) => m.lotacao_id === lotacao_id);
    const edital_id = searchParams.get("edital_id");
    if (edital_id) recs = recs.filter((m) => m.edital_id === edital_id);
    const status = searchParams.get("status");
    if (status) recs = recs.filter((m) => m.status === status);

    let titulo = "Relatório";
    let descricao = "";
    let colunas: { key: string; label: string }[] = [];
    let linhas: any[] = [];

    if (tipo === "efetivo-cargo") {
      titulo = "Efetivo ativo por cargo";
      descricao = "Militares ativos na data de referência, agrupados por cargo.";
      const ativos = recs.filter((m) => m.status === "ATIVO");
      const counts: Record<string, { categoria: string; cargo: string; total: number }> = {};
      for (const m of ativos) {
        const k = `${m.categoria_nome}|${m.cargo_nome}`;
        if (!counts[k]) counts[k] = { categoria: m.categoria_nome, cargo: m.cargo_nome, total: 0 };
        counts[k].total += 1;
      }
      colunas = [
        { key: "categoria", label: "Categoria" },
        { key: "cargo", label: "Cargo" },
        { key: "total", label: "Ativos" },
      ];
      linhas = Object.values(counts).sort((a, b) => a.cargo.localeCompare(b.cargo));
      linhas.push({ categoria: "TOTAL", cargo: "", total: ativos.length });
    } else if (tipo === "efetivo-ubm") {
      titulo = "Efetivo ativo por UBM";
      descricao = "Militares ativos na data de referência, agrupados por lotação.";
      const ativos = recs.filter((m) => m.status === "ATIVO");
      const counts: Record<string, number> = {};
      for (const m of ativos) {
        counts[m.lotacao_nome] = (counts[m.lotacao_nome] || 0) + 1;
      }
      colunas = [
        { key: "lotacao", label: "Lotação/UBM" },
        { key: "total", label: "Quantidade" },
      ];
      linhas = Object.entries(counts)
        .map(([k, v]) => ({ lotacao: k, total: v }))
        .sort((a, b) => b.total - a.total);
      linhas.push({ lotacao: "TOTAL", total: ativos.length });
    } else if (tipo === "por-edital") {
      titulo = "Temporários por edital";
      descricao = "Registros que integraram o efetivo no período, por edital/processo seletivo.";
      const counts: Record<string, { edital: string; ativos: number; desligados: number; total: number }> = {};
      for (const m of recs) {
        if (!counts[m.edital_nome]) {
          counts[m.edital_nome] = { edital: m.edital_nome, ativos: 0, desligados: 0, total: 0 };
        }
        if (m.status === "ATIVO") counts[m.edital_nome].ativos += 1;
        else counts[m.edital_nome].desligados += 1;
        counts[m.edital_nome].total += 1;
      }
      colunas = [
        { key: "edital", label: "Edital/Processo seletivo" },
        { key: "ativos", label: "Ativos" },
        { key: "desligados", label: "Desligados" },
        { key: "total", label: "Total" },
      ];
      linhas = Object.values(counts).sort((a, b) => a.edital.localeCompare(b.edital));
    } else if (tipo === "a-vencer") {
      titulo = "Contratos a vencer";
      descricao = `Contratos ativos com vencimento dentro do prazo de alerta configurado (${alertaDias} dias).`;
      linhas = recs
        .filter((m) => m.status === "ATIVO" && m.alerta === "A_VENCER")
        .sort((a, b) => (a.data_vencimento_contrato || "").localeCompare(b.data_vencimento_contrato || ""));
      colunas = [
        { key: "matricula", label: "Matrícula" },
        { key: "nome_completo", label: "Nome completo" },
        { key: "cargo_nome", label: "Cargo" },
        { key: "lotacao_nome", label: "Lotação/UBM" },
        { key: "edital_nome", label: "Edital" },
        { key: "data_vencimento_contrato", label: "Vencimento" },
        { key: "dias_para_vencer", label: "Dias p/ vencer" },
      ];
    } else if (tipo === "vencidos") {
      titulo = "Contratos vencidos pendentes de conferência";
      descricao = "Cadastros ativos cuja data final do vínculo já passou.";
      linhas = recs
        .filter((m) => m.status === "ATIVO" && m.alerta === "VENCIDO")
        .sort((a, b) => (a.data_vencimento_contrato || "").localeCompare(b.data_vencimento_contrato || ""));
      colunas = [
        { key: "matricula", label: "Matrícula" },
        { key: "nome_completo", label: "Nome completo" },
        { key: "cargo_nome", label: "Cargo" },
        { key: "lotacao_nome", label: "Lotação/UBM" },
        { key: "edital_nome", label: "Edital" },
        { key: "data_vencimento_contrato", label: "Vencimento" },
        { key: "dias_para_vencer", label: "Dias p/ vencer" },
      ];
    } else if (tipo === "inclusoes") {
      titulo = "Inclusões por período";
      descricao = "Militares cuja data de inclusão está no período selecionado.";
      linhas = [...recs].sort((a, b) => (b.data_inclusao || "").localeCompare(a.data_inclusao || ""));
      colunas = [
        { key: "matricula", label: "Matrícula" },
        { key: "nome_completo", label: "Nome completo" },
        { key: "cargo_nome", label: "Cargo" },
        { key: "lotacao_nome", label: "Lotação/UBM" },
        { key: "data_inclusao", label: "Inclusão" },
        { key: "status", label: "Situação" },
      ];
    } else if (tipo === "desligamentos") {
      titulo = "Desligamentos por período e motivo";
      descricao = "Desligamentos com data efetiva no período selecionado.";
      linhas = recs
        .filter((m) => m.status === "DESLIGADO")
        .sort((a, b) => (b.data_desligamento || "").localeCompare(a.data_desligamento || ""));
      colunas = [
        { key: "matricula", label: "Matrícula" },
        { key: "nome_completo", label: "Nome completo" },
        { key: "cargo_nome", label: "Cargo" },
        { key: "lotacao_nome", label: "Lotação/UBM" },
        { key: "data_desligamento", label: "Data do desligamento" },
        { key: "motivo_desligamento_nome", label: "Status de desligamento" },
      ];
    } else if (tipo === "historico") {
      titulo = "Histórico individual por matrícula";
      descricao = "Inclusões, desligamentos, reativações e alterações do cadastro.";
      colunas = [
        { key: "quando", label: "Data/hora do registro" },
        { key: "evento", label: "Evento" },
        { key: "data_efetiva", label: "Data efetiva" },
        { key: "detalhes", label: "Detalhes" },
        { key: "observacoes", label: "Observações" },
      ];
      let militarEncontrado: CloudCacheState["militares"][number] | null = null;
      if (matriculaParam) {
        const queryRaw = matriculaParam.trim();
        militarEncontrado =
          state.militares.find(
            (x) =>
              normMatricula(x.matricula) === normMatricula(queryRaw) ||
              cleanAlphanumeric(x.matricula) === cleanAlphanumeric(queryRaw) ||
              matchMatriculaFlexible(queryRaw, x.matricula)
          ) || null;

        if (!militarEncontrado && queryRaw.length >= 3) {
          const qNorm = normKey(queryRaw);
          const qClean = cleanAlphanumeric(queryRaw);
          militarEncontrado =
            state.militares.find(
              (x) =>
                normKey(x.nome_completo).includes(qNorm) ||
                (qClean && cleanAlphanumeric(x.matricula).includes(qClean))
            ) || null;
        }

        if (militarEncontrado) {
          const m = enrichMilitar(militarEncontrado, hoje, alertaDias);
          titulo = `Histórico Funcional — ${m.nome_completo} (${m.matricula})`;
          descricao = `Cargo/Posto: ${m.cargo_nome} · UBM/Lotação: ${m.lotacao_nome} · Situação: ${m.status}`;

          const cleanObs = (val: unknown): string | null => {
            if (val === null || val === undefined) return null;
            const trimmed = String(val).trim();
            if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed.toLowerCase() === "null") return null;
            return trimmed;
          };
          const obsFicha = cleanObs(m.observacoes);

          const historyItems: {
            _sortKey: string;
            quando: string;
            evento: string;
            data_efetiva: string;
            detalhes: string;
            observacoes: string;
          }[] = [];

          const inclusaoDate = m.data_inclusao || "2025-04-29";
          const criadoIso = m.criado_em || `${inclusaoDate}T08:00:00Z`;
          historyItems.push({
            _sortKey: `${inclusaoDate}_1_${criadoIso}`,
            quando: fmtDateTimeBr(criadoIso),
            evento: "INCLUSÃO / ADMISSÃO",
            data_efetiva: inclusaoDate,
            detalhes: `Inclusão no CBMMT como ${m.cargo_nome} · UBM: ${m.lotacao_nome} · Edital: ${m.edital_nome}${
              m.doe_incorporacao && m.doe_incorporacao !== "-" ? ` · DOE: ${m.doe_incorporacao}` : ""
            }`,
            observacoes: m.status === "ATIVO" && obsFicha ? obsFicha : "—",
          });

          if (m.data_vencimento_contrato) {
            historyItems.push({
              _sortKey: `${m.data_vencimento_contrato}_2_${criadoIso}`,
              quando: fmtDateTimeBr(criadoIso),
              evento: "VIGÊNCIA CONTRATUAL",
              data_efetiva: m.data_vencimento_contrato,
              detalhes: `Vigência do contrato de Bombeiro Temporário fixada para ${fmtDateLocal(
                m.data_vencimento_contrato
              )}.`,
              observacoes: m.sub_judice ? obsFicha || "Contrato sob condição Sub Júdice" : "—",
            });
          }

          const sits = state.situacoes.filter((s) => s.militar_id === m.id);
          for (const s of sits) {
            const sitObs =
              cleanObs(s.observacoes) ||
              cleanObs(s.justificativa) ||
              (s.tipo === "DESLIGAMENTO" && obsFicha ? obsFicha : null) ||
              "—";
            const sitDetalhes =
              s.tipo === "DESLIGAMENTO"
                ? `Desligamento do serviço ativo · Status: ${
                    s.motivo_nome || m.motivo_desligamento_nome || "Término de Contrato"
                  }${
                    (s.documento && s.documento !== "-") ||
                    (m.documento_desligamento && m.documento_desligamento !== "-")
                      ? ` · Doc/BG: ${s.documento || m.documento_desligamento}`
                      : ""
                  }`
                : [
                    s.motivo_nome ? `Status: ${s.motivo_nome}` : null,
                    s.documento && s.documento !== "-" ? `Doc: ${s.documento}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Situação funcional registrada";

            historyItems.push({
              _sortKey: `${s.data_efetiva || s.timestamp}_3_${s.timestamp}`,
              quando: fmtDateTimeBr(s.timestamp),
              evento: s.tipo,
              data_efetiva: s.data_efetiva,
              detalhes: sitDetalhes,
              observacoes: sitObs,
            });
          }

          const alts = await buscarAuditoriaPorEntidadeFirestore(m.id, m.matricula, 30);
          for (const a of alts) {
            if (a.operacao === "IMPORTACAO_CSV" && !a.entidade_id) continue;
            const antesObj = a.detalhes?.antes ?? a.antes;
            const depoisObj = a.detalhes?.depois ?? a.depois;
            let det = "";
            if (depoisObj) {
              const diffs = Object.entries(depoisObj)
                .filter(([k]) => k !== "Observações" && k !== "Motivo do desligamento" && k !== "Justificativa")
                .map(([k, v]) =>
                  antesObj && antesObj[k] !== undefined ? `${k}: de "${antesObj[k]}" para "${v}"` : `${k}: ${v}`
                )
                .join("; ");
              det = diffs || a.operacao.replace(/_/g, " ");
            } else {
              det = a.operacao.replace(/_/g, " ");
            }

            const obsAlt =
              cleanObs(depoisObj?.["Motivo do desligamento"]) ||
              cleanObs(depoisObj?.["Observações"]) ||
              cleanObs(depoisObj?.["Justificativa"]) ||
              cleanObs(a.detalhes?.descricao) ||
              obsFicha ||
              "—";
            const rawTs = a.data_hora || a.timestamp;

            historyItems.push({
              _sortKey: `${rawTs ? rawTs.slice(0, 10) : ""}_4_${rawTs}`,
              quando: fmtDateTimeBr(rawTs),
              evento: a.operacao.replace(/_/g, " "),
              data_efetiva: rawTs ? rawTs.slice(0, 10) : "",
              detalhes: det,
              observacoes: obsAlt,
            });
          }

          if (m.status === "DESLIGADO" && m.data_desligamento && !sits.some((s) => s.tipo === "DESLIGAMENTO")) {
            const deslIso = m.atualizado_em || `${m.data_desligamento}T08:00:00Z`;
            historyItems.push({
              _sortKey: `${m.data_desligamento}_5_${deslIso}`,
              quando: fmtDateTimeBr(deslIso),
              evento: "DESLIGAMENTO",
              data_efetiva: m.data_desligamento,
              detalhes: `Desligamento do serviço ativo · Status: ${
                m.motivo_desligamento_nome || "Término de Contrato"
              }${
                m.documento_desligamento && m.documento_desligamento !== "-"
                  ? ` · Boletim Geral/Doc: ${m.documento_desligamento}`
                  : ""
              }`,
              observacoes: obsFicha || "—",
            });
          }

          historyItems.sort((a, b) => b._sortKey.localeCompare(a._sortKey));
          linhas = historyItems.map(({ _sortKey, ...rest }) => rest);
        } else {
          descricao = `Nenhum militar localizado para o critério "${queryRaw}". Verifique a matrícula ou selecione na lista.`;
        }
      }

      const mFinal = militarEncontrado ? enrichMilitar(militarEncontrado, hoje, alertaDias) : undefined;
      const relatorio: Relatorio = {
        tipo,
        titulo,
        descricao,
        colunas,
        linhas,
        gerado_em: fmtDateTimeBr(new Date().toISOString()),
        filtros: matriculaParam ? `Matrícula: ${matriculaParam}` : "Todos os registros",
        ...(mFinal ? { militar: mFinal } : {}),
      };
      return relatorio as T;
    }

    const rel: Relatorio = {
      tipo,
      titulo,
      descricao,
      colunas,
      linhas,
      gerado_em: fmtDateTimeBr(new Date().toISOString()),
      filtros: "Filtros aplicados",
    };
    return rel as T;
  }

  // 6. USUÁRIOS & AUDITORIA (Coleções dedicadas 'usuarios' e 'auditoria')
  if (pathname === "/usuarios" && method === "GET") {
    await sincronizarUsuariosComFirestore(true);
    const list: UserOut[] = state.usuarios.map(({ ...u }) => u);
    return list as T;
  }

  if (pathname === "/usuarios" && method === "POST") {
    const b = body as UsuarioIn;
    const cleanEmail = b.email.trim().toLowerCase();
    await sincronizarUsuariosComFirestore(true);
    const exists = state.usuarios.find((u) => u.email.toLowerCase() === cleanEmail);
    if (exists) {
      throw { status: 409, body: { detail: "Já existe um usuário com este e-mail." } };
    }
    const user: CloudCacheState["usuarios"][number] = {
      id: `usr_${Date.now()}`,
      nome: b.nome.trim(),
      email: cleanEmail,
      perfil: b.perfil,
      ativo: b.ativo,
    };
    state.usuarios.push(user);

    await salvarUsuarioFirestore(user);

    await logAudit({
      entidade: "Usuario",
      entidade_id: user.id,
      operacao: "CRIACAO_USUARIO",
      antes: null,
      depois: { Nome: user.nome, "E-mail": user.email, Perfil: user.perfil, Ativo: user.ativo ? "Sim" : "Não" },
    });

    return user as T;
  }

  if (pathname.startsWith("/usuarios/") && method === "PUT") {
    const id = pathname.replace("/usuarios/", "");
    const b = body as UsuarioIn;
    await sincronizarUsuariosComFirestore(true);
    let user = state.usuarios.find((u) => u.id === id);
    if (!user) {
      user = state.usuarios.find((u) => u.email.toLowerCase() === b.email?.trim().toLowerCase());
    }
    if (!user) throw { status: 404, body: { detail: "Usuário não encontrado" } };
    const oldU = { Nome: user.nome, "E-mail": user.email, Perfil: user.perfil, Ativo: user.ativo ? "Sim" : "Não" };
    user.nome = b.nome.trim();
    user.email = b.email.trim().toLowerCase();
    user.perfil = b.perfil;
    user.ativo = b.ativo;

    await salvarUsuarioFirestore(user);

    const curr = getCurrentUser();
    if (curr && (curr.id === user.id || curr.email.toLowerCase() === user.email.toLowerCase())) {
      setCurrentUser({ ...curr, perfil: user.perfil, nome: user.nome, ativo: user.ativo });
    }

    await logAudit({
      entidade: "Usuario",
      entidade_id: user.id,
      operacao: "EDICAO_USUARIO",
      antes: oldU,
      depois: { Nome: user.nome, "E-mail": user.email, Perfil: user.perfil, Ativo: user.ativo ? "Sim" : "Não" },
    });

    return user as T;
  }

  if (pathname.startsWith("/usuarios/") && method === "DELETE") {
    const id = pathname.replace("/usuarios/", "");
    const user = state.usuarios.find((u) => u.id === id);
    if (user) {
      state.usuarios = state.usuarios.filter((u) => u.id !== id);
      await excluirUsuarioFirestore(id);
      await logAudit({
        entidade: "Usuario",
        entidade_id: id,
        operacao: "EXCLUSAO_USUARIO",
        antes: { Nome: user.nome, "E-mail": user.email, Perfil: user.perfil },
        depois: null,
      });
    }
    return { ok: true } as T;
  }

  if (pathname === "/auditoria" && method === "GET") {
    const rawLimit = parseInt(searchParams.get("limit") || "30", 10);
    const safeLimit = Math.min(150, Math.max(1, isNaN(rawLimit) ? 30 : rawLimit));
    const cloudItems = await buscarAuditoriaFirestore(safeLimit);

    let items: HistoricoAlteracao[] = [...cloudItems];
    const q = searchParams.get("q");
    if (q) {
      const qN = normKey(q);
      items = items.filter(
        (a) =>
          normKey(a.usuario_nome).includes(qN) ||
          (a.usuario_email && normKey(a.usuario_email).includes(qN)) ||
          normKey(a.operacao).includes(qN) ||
          normKey(a.entidade).includes(qN) ||
          (a.matricula && normMatricula(a.matricula).includes(qN)) ||
          JSON.stringify(a.depois || {}).toLowerCase().includes(q.toLowerCase()) ||
          JSON.stringify(a.antes || {}).toLowerCase().includes(q.toLowerCase())
      );
    }
    const entidade = searchParams.get("entidade");
    if (entidade) {
      items = items.filter((a) => a.entidade.toLowerCase() === entidade.toLowerCase());
    }
    const operacao = searchParams.get("operacao");
    if (operacao) {
      items = items.filter((a) => a.operacao.toLowerCase() === operacao.toLowerCase());
    }
    items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    const res: AuditoriaPage = {
      items,
      total: items.length,
      limit: safeLimit,
      has_more: cloudItems.length >= safeLimit,
    };
    return res as T;
  }

  // 7. IMPORTAÇÃO
  if (pathname === "/importacao/analisar" && method === "POST") {
    const content = body?.content || "";
    const lines = content.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
    const delim = content.includes(";") ? ";" : ",";
    const headerRow = lines[0]
      ? lines[0].split(delim).map((c: string) => c.replace(/^["']|["']$/g, "").trim())
      : [];

    const camposDef = [
      { key: "matricula", label: "Matrícula / Vínculo", obrigatorio: true },
      { key: "nome_completo", label: "Nome completo", obrigatorio: true },
      { key: "cargo", label: "Cargo / Função", obrigatorio: true },
      { key: "lotacao", label: "Lotação / UBM", obrigatorio: true },
      { key: "edital", label: "Edital / Processo seletivo", obrigatorio: true },
      { key: "data_inclusao", label: "Data de inclusão", obrigatorio: true },
      { key: "data_vencimento_contrato", label: "Data final / Vencimento", obrigatorio: true },
      { key: "observacoes", label: "Observações", obrigatorio: false },
      { key: "doe_incorporacao", label: "DOE - Incorporação", obrigatorio: false },
      { key: "status", label: "Situação", obrigatorio: false },
    ];

    const mapping: Record<string, number | null> = {};
    for (const c of camposDef) {
      const idx = headerRow.findIndex((h: string) => {
        const k = normKey(h);
        if (c.key === "matricula") return k.includes("VINCULO") || k.includes("MATRICULA");
        if (c.key === "nome_completo") return k.includes("NOME");
        if (c.key === "cargo") return k.includes("CARGO") || k.includes("FUNCAO");
        if (c.key === "lotacao") return k.includes("LOTACAO") || k.includes("UBM");
        if (c.key === "edital") return k.includes("EDITAL") || k.includes("PROCESSO");
        if (c.key === "data_inclusao") return k.includes("INCLUSAO");
        if (c.key === "data_vencimento_contrato") return k.includes("FINAL") || k.includes("VENCIMENTO");
        if (c.key === "observacoes") return k.includes("OBS");
        if (c.key === "doe_incorporacao") return k.includes("DOE");
        if (c.key === "status") return k.includes("STATUS") || k.includes("SITUACAO");
        return false;
      });
      mapping[c.key] = idx >= 0 ? idx : null;
    }

    const amostra = lines
      .slice(0, 5)
      .map((l: string) => l.split(delim).map((c: string) => c.replace(/^["']|["']$/g, "").trim()));
    const analise: ImportAnalise = {
      delimitador: delim,
      linha_cabecalho: 1,
      cabecalho: headerRow,
      mapeamento: mapping,
      amostra,
      total_linhas: lines.length,
      campos: camposDef,
    };
    return analise as T;
  }

  if (pathname === "/importacao/validar" && method === "POST") {
    const b = body as ImportValidarIn;
    const content = b.content || "";
    const lines = content.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
    const delim = content.includes(";") ? ";" : ",";
    const headerIdx = (b.linha_cabecalho || 1) - 1;

    const dataLines = lines.slice(headerIdx + 1);
    const existingMap = new Map(state.militares.map((m) => [normMatricula(m.matricula), m]));

    const importLinhas: any[] = [];
    const novosCargos: string[] = [];
    const novasLotacoes: string[] = [];
    const novosEditais: string[] = [];

    dataLines.forEach((line: string, i: number) => {
      const parts = line.split(delim).map((c: string) => c.replace(/^["']|["']$/g, "").trim());
      const rec: Record<string, string> = {};
      for (const [k, idx] of Object.entries(b.mapeamento)) {
        if (idx !== null && idx !== undefined && parts[idx] !== undefined) {
          rec[k] = parts[idx];
        } else {
          rec[k] = "";
        }
      }

      const mat = normMatricula(rec.matricula);
      const nome = rec.nome_completo || "";
      if (!mat && !nome) return;

      const erros: string[] = [];
      const avisos: string[] = [];
      const diferencas: any[] = [];

      if (!mat) erros.push("Matrícula não informada");
      if (!nome) erros.push("Nome não informado");

      let acao: "INSERIR" | "ATUALIZAR" | "IGNORAR" | "REJEITAR" = "INSERIR";
      if (erros.length > 0) {
        acao = "REJEITAR";
      } else if (existingMap.has(mat)) {
        acao = "IGNORAR";
      }

      importLinhas.push({
        linha: i + headerIdx + 2,
        matricula: mat,
        nome_completo: nome,
        acao,
        erros,
        avisos,
        diferencas,
        dados: rec,
      });
    });

    const resumo = {
      inserir: importLinhas.filter((l) => l.acao === "INSERIR").length,
      atualizar: importLinhas.filter((l) => l.acao === "ATUALIZAR").length,
      ignorar: importLinhas.filter((l) => l.acao === "IGNORAR").length,
      rejeitar: importLinhas.filter((l) => l.acao === "REJEITAR").length,
    };

    const validacao: ImportValidacao = {
      linhas: importLinhas,
      resumo,
      novos_cargos: novosCargos,
      novas_lotacoes: novasLotacoes,
      novos_editais: novosEditais,
    };
    return validacao as T;
  }

  if ((pathname === "/importacao/aplicar" || pathname === "/importacao/confirmar") && method === "POST") {
    const validacao = body?.validacao as ImportValidacao | undefined;
    let inseridos = 0;
    const novosDocs: Array<CloudCacheState["militares"][number]> = [];
    const user = getCurrentUser() || BOOTSTRAP_USERS[0];

    if (validacao && validacao.linhas) {
      for (const li of validacao.linhas) {
        if (li.acao === "INSERIR") {
          const rec = li.dados;
          const cargo = state.cargos[0];
          const lot = state.lotacoes[0];
          const ed = state.editais[0];
          const newDoc: CloudCacheState["militares"][number] = {
            id: `mil_${Date.now()}_${inseridos}`,
            matricula: rec.matricula,
            nome_completo: rec.nome_completo.toUpperCase(),
            cargo_id: cargo ? cargo.id : "crg_1",
            lotacao_id: lot ? lot.id : "lot_1",
            edital_id: ed ? ed.id : "ed_1",
            data_inclusao: rec.data_inclusao || hoje,
            data_vencimento_contrato: rec.data_vencimento_contrato || hoje,
            status: "ATIVO",
            observacoes: rec.observacoes || null,
            doe_incorporacao: rec.doe_incorporacao || null,
            sub_judice: false,
            data_desligamento: null,
            motivo_desligamento_id: null,
            documento_desligamento: null,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
            criado_por: user.id,
            atualizado_por: user.id,
          };
          state.militares.push(newDoc);
          novosDocs.push(newDoc);
          inseridos++;
        }
      }
      if (inseridos > 0) {
        await logAudit({
          entidade: "Militar",
          entidade_id: "importacao_csv",
          operacao: "IMPORTACAO_CSV",
          usuario_nome: user.nome,
          usuario_email: user.email,
          antes: null,
          depois: { "Militares importados": inseridos },
        });
      }
      rebuildSituacoesFromMilitares();
      for (const docToSave of novosDocs) {
        await salvarMilitarFirestore(docToSave);
      }
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["militares"] });
      void queryClient.invalidateQueries({ queryKey: ["situacao"] });
      void queryClient.invalidateQueries({ queryKey: ["relatorio"] });
    }

    const resultado: ImportResultado = {
      inseridos,
      atualizados: 0,
      ignorados: 0,
      rejeitados: 0,
      atualizacoes_nao_aprovadas: 0,
    };
    return resultado as T;
  }

  console.warn(`[firestoreService] Unhandled route: ${method} ${pathname}`);
  return {} as T;
}
