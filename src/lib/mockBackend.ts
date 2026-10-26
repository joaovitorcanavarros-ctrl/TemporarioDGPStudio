import initialData from "./seedData.json";
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

const STORAGE_KEY = "cbmmt_db_v1";
const SESSION_KEY = "cbmmt_current_user_v1";

export interface StoredData {
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
    senha_hash?: string;
  }>;
  alteracoes: HistoricoAlteracao[];
  situacoes: HistoricoSituacao[];
}

const DEFAULT_USERS: StoredData["usuarios"] = [
  { id: "usr_admin", nome: "Administrador do Sistema", email: "admin@cbmmt.mt.gov.br", perfil: "ADMIN", ativo: true },
  { id: "usr_gestor", nome: "Gestor de Pessoal", email: "gestor@cbmmt.mt.gov.br", perfil: "GESTOR", ativo: true },
  { id: "usr_consulta", nome: "Usuário Consulta", email: "consulta@cbmmt.mt.gov.br", perfil: "CONSULTA", ativo: true },
];

function getInitialStore(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.militares && parsed.militares.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to read stored data from localStorage", e);
  }

  // Pre-fill initial state
  const data: StoredData = {
    config: initialData.config ?? { alerta_dias: 30 },
    categorias: initialData.categorias as any,
    cargos: initialData.cargos as any,
    lotacoes: initialData.lotacoes as any,
    editais: initialData.editais as any,
    motivos: initialData.motivos as any,
    militares: (initialData.militares as any) || [],
    usuarios: DEFAULT_USERS,
    alteracoes: [
      {
        id: "alt_init",
        entidade: "militar",
        entidade_id: null,
        matricula: null,
        operacao: "IMPORTACAO_CSV",
        usuario_nome: "Administrador do Sistema",
        timestamp: "2026-10-14T10:00:00Z",
        antes: null,
        depois: { Arquivo: "Carga inicial oficial — 421 militares", inseridos: 421 },
      },
    ],
    situacoes: [],
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to persist store to localStorage", e);
  }
  return data;
}

let store: StoredData = getInitialStore();

function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn("Failed to persist store", e);
  }
}

export function getCurrentUser(): UserOut {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      const found = store.usuarios.find((u) => u.id === user.id && u.ativo);
      if (found) {
        return { id: found.id, nome: found.nome, email: found.email, perfil: found.perfil, ativo: found.ativo };
      }
    }
  } catch (e) {
    console.warn("Failed to get current user session", e);
  }
  // Default to Admin
  const admin = store.usuarios.find((u) => u.perfil === "ADMIN") || DEFAULT_USERS[0];
  return { id: admin.id, nome: admin.nome, email: admin.email, perfil: admin.perfil, ativo: admin.ativo };
}

export function setCurrentUser(user: UserOut | null) {
  if (!user) {
    localStorage.removeItem(SESSION_KEY);
  } else {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }
}

// Today date in Mato Grosso / Cuiaba (YYYY-MM-DD)
export function getHoje(): string {
  // Use today's local date or 2026-10-26
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function diasEntre(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function alertaContrato(m: { status: string; data_vencimento_contrato: string }, hoje: string, alertaDias: number): "VENCIDO" | "A_VENCER" | null {
  if (m.status !== "ATIVO") return null;
  const dias = diasEntre(hoje, m.data_vencimento_contrato);
  if (dias < 0) return "VENCIDO";
  if (dias <= alertaDias) return "A_VENCER";
  return null;
}

function ativoEm(m: { status: string; data_inclusao: string; data_desligamento?: string | null }, ref: string, hoje: string): boolean {
  if (ref >= hoje) return m.status === "ATIVO";
  if (m.data_inclusao > ref) return false;
  if (m.status === "ATIVO") return true;
  return Boolean(m.data_desligamento && m.data_desligamento > ref);
}

function noPeriodo(d: string | null | undefined, ini: string | null | undefined, fim: string | null | undefined): boolean {
  if (!d) return false;
  return (!ini || d >= ini) && (!fim || d <= fim);
}

function normKey(s: string): string {
  return (s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°ª]/g, "o")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function normMatricula(s: string): string {
  return (s || "").replace(/\s+/g, "").toUpperCase();
}

function enrichMilitar(m: StoredData["militares"][number], hoje: string, alertaDias: number): Militar {
  const cargo = store.cargos.find((c) => c.id === m.cargo_id);
  const cat = cargo?.categoria || "OUTROS";
  const categoria = store.categorias.find((c) => c.codigo === cat);
  const lotacao = store.lotacoes.find((l) => l.id === m.lotacao_id);
  const edital = store.editais.find((e) => e.id === m.edital_id);
  const motivo = store.motivos.find((mt) => mt.id === m.motivo_desligamento_id);
  const criador = store.usuarios.find((u) => u.id === m.criado_por);
  const atualizador = store.usuarios.find((u) => u.id === m.atualizado_por);

  return {
    ...m,
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

// ----------------- BACKEND ENDPOINT IMPLEMENTATIONS -----------------

export async function handleBackendRequest<T>(method: string, path: string, body?: any): Promise<T> {
  const url = new URL(path.startsWith("/") ? `http://localhost${path}` : `http://localhost/${path}`);
  const pathname = url.pathname.replace(/^\/api/, "");
  const searchParams = url.searchParams;

  const hoje = getHoje();
  const alertaDias = store.config.alerta_dias || 30;

  // 1. AUTH
  if (pathname === "/auth/me" && method === "GET") {
    return getCurrentUser() as T;
  }

  if (pathname === "/auth/login" && method === "POST") {
    const email = (body?.email || "").trim().toLowerCase();
    const user = store.usuarios.find((u) => u.email.toLowerCase() === email && u.ativo);
    if (!user) {
      throw { status: 401, body: { detail: "E-mail ou senha inválidos" } };
    }
    const userOut: UserOut = { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, ativo: user.ativo };
    setCurrentUser(userOut);
    return userOut as T;
  }

  if (pathname === "/auth/logout" && method === "POST") {
    setCurrentUser(null);
    return { ok: true } as T;
  }

  // 2. CATALOGOS & META & CONFIG
  if (pathname === "/catalogos" && method === "GET") {
    const res: Catalogos = {
      categorias: [...store.categorias].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)),
      cargos: [...store.cargos].sort((a, b) => a.nome.localeCompare(b.nome)),
      lotacoes: [...store.lotacoes].sort((a, b) => a.nome.localeCompare(b.nome)),
      editais: [...store.editais].sort((a, b) => a.nome.localeCompare(b.nome)),
      motivos: [...store.motivos].sort((a, b) => a.nome.localeCompare(b.nome)),
      config: { ...store.config },
    };
    return res as T;
  }

  if (pathname === "/meta" && method === "GET") {
    const res: Meta = {
      data_hoje: hoje,
      ultima_atualizacao: store.militares[0]?.atualizado_em || "2026-10-14T10:00:00Z",
      total_registros: store.militares.length,
    };
    return res as T;
  }

  if (pathname === "/config" && method === "PUT") {
    store.config = { alerta_dias: Number(body?.alerta_dias) || 30 };
    saveStore();
    return store.config as T;
  }

  // Catálogos CRUD
  const catMatch = pathname.match(/^\/(categorias|cargos|lotacoes|editais|motivos)(\/(.+))?$/);
  if (catMatch) {
    const coll = catMatch[1] as "categorias" | "cargos" | "lotacoes" | "editais" | "motivos";
    const itemId = catMatch[3];
    if (method === "POST") {
      const newId = `${coll.slice(0, 3)}_${Date.now()}`;
      const item = { id: newId, ...body, ativo: true };
      (store[coll] as any).push(item);
      saveStore();
      return item as T;
    }
    if (method === "PUT" && itemId) {
      const idx = (store[coll] as any).findIndex((x: any) => x.id === itemId);
      if (idx >= 0) {
        store[coll][idx] = { ...store[coll][idx], ...body, id: itemId };
        saveStore();
        return store[coll][idx] as T;
      }
    }
  }

  // 3. DASHBOARD
  if (pathname === "/dashboard" && method === "GET") {
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

    // Filter records
    let records = store.militares.map((m) => enrichMilitar(m, hoje, alertaDias));
    if (categoria) records = records.filter((m) => m.categoria === categoria);
    if (cargo_id) records = records.filter((m) => m.cargo_id === cargo_id);
    if (lotacao_id) records = records.filter((m) => m.lotacao_id === lotacao_id);
    if (edital_id) records = records.filter((m) => m.edital_id === edital_id);
    if (status) records = records.filter((m) => m.status === status);

    const ativosRef = records.filter((m) => ativoEm(m, ref, hoje));
    const ativosHoje = records.filter((m) => m.status === "ATIVO");
    const desligPeriodo = records.filter((m) => m.status === "DESLIGADO" && noPeriodo(m.data_desligamento, ini, fim));
    const inclusoesPeriodo = records.filter((m) => noPeriodo(m.data_inclusao, ini, fim));

    // Por categoria
    const porCat: Record<string, number> = {};
    for (const c of store.categorias) porCat[c.codigo] = 0;
    for (const m of ativosRef) {
      porCat[m.categoria] = (porCat[m.categoria] || 0) + 1;
    }

    // Por UBM
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

    // Por Edital
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

    // Faixas de vencimento
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

    // Efetivo cargo ano
    const anosInclusao = records.map((m) => parseInt(m.data_inclusao.slice(0, 4), 10)).filter(Boolean);
    const minAno = anosInclusao.length ? Math.min(...anosInclusao) : 2022;
    const refAno = parseInt(ref.slice(0, 4), 10);
    const efetivoCargoAno: ChartRow[] = [];
    for (let a = minAno; a <= refAno; a++) {
      const d = Math.min(new Date(`${a}-12-31`).getTime(), new Date(ref).getTime()) === new Date(`${a}-12-31`).getTime() ? `${a}-12-31` : ref;
      const row: ChartRow = { ano: String(a), data: d };
      let tot = 0;
      for (const cat of store.categorias) {
        const c = records.filter((m) => m.categoria === cat.codigo && ativoEm(m, d, hoje)).length;
        row[cat.codigo] = c;
        tot += c;
      }
      row.total = tot;
      efetivoCargoAno.push(row);
    }

    // Desligamentos por ano / motivo
    const totMotivo: Record<string, number> = {};
    for (const m of desligPeriodo) {
      const mid = m.motivo_desligamento_id || "sem_motivo";
      totMotivo[mid] = (totMotivo[mid] || 0) + 1;
    }
    const desligMotivos: CountItem[] = store.motivos.map((mot) => ({
      chave: mot.id,
      nome: mot.nome,
      total: totMotivo[mot.id] || 0,
    }));

    // Evolução mensal (últimos 12 meses)
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
        inclusoes: records.filter((m) => m.data_inclusao.startsWith(pref)).length,
        desligamentos: records.filter((m) => (m.data_desligamento || "").startsWith(pref)).length,
        efetivo: records.filter((m) => ativoEm(m, `${pref}-28`, hoje)).length,
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
      categorias: store.categorias.map((c) => ({ chave: c.codigo, nome: c.nome, total: porCat[c.codigo] || 0 })),
      motivos: desligMotivos,
      efetivo_cargo_ano: efetivoCargoAno,
      deslig_por_ano: [],
      deslig_por_cargo: [],
      deslig_motivos: desligMotivos,
      por_ubm: porUbm,
      evolucao_mensal: evolucaoMensal,
      evolucao_anual: [],
      dist_categoria: store.categorias.map((c) => ({ chave: c.codigo, nome: c.nome, total: porCat[c.codigo] || 0 })),
      dist_edital: distEdital,
      faixas_vencimento: faixasVencimento,
    };
    return dashboardRes as T;
  }

  // 4. MILITARES
  if (pathname === "/militares/verificar-matricula" && method === "GET") {
    const matricula = normMatricula(searchParams.get("matricula") || "");
    const excluirId = searchParams.get("excluir_id");
    const found = store.militares.find((m) => normMatricula(m.matricula) === matricula && (!excluirId || m.id !== excluirId));
    const check: MatriculaCheck = {
      existe: Boolean(found),
      militar_id: found ? found.id : null,
      nome_completo: found ? found.nome_completo : null,
    };
    return check as T;
  }

  if (pathname === "/militares/situacao" && method === "GET") {
    const items = [...store.situacoes].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const res: SituacaoPage = { items, total: items.length };
    return res as T;
  }

  if (pathname === "/militares" && method === "GET") {
    let list = store.militares.map((m) => enrichMilitar(m, hoje, alertaDias));

    // Filters
    const q = searchParams.get("q");
    if (q) {
      const qNorm = normKey(q);
      list = list.filter((m) => normKey(m.nome_completo).includes(qNorm) || normMatricula(m.matricula).includes(qNorm));
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
    if (motivo_id) list = list.filter((m) => (motivo_id === "sem_motivo" ? !m.motivo_desligamento_id : m.motivo_desligamento_id === motivo_id));

    const venc = searchParams.get("venc");
    if (venc === "a_vencer") {
      list = list.filter((m) => m.status === "ATIVO" && m.alerta === "A_VENCER");
    } else if (venc === "vencidos") {
      list = list.filter((m) => m.status === "ATIVO" && m.alerta === "VENCIDO");
    }

    const sub_judice = searchParams.get("sub_judice");
    if (sub_judice === "true") list = list.filter((m) => m.sub_judice);
    else if (sub_judice === "false") list = list.filter((m) => !m.sub_judice);

    // Sorting
    const sort = searchParams.get("sort") || "nome_completo";
    const direction = searchParams.get("direction") || "asc";
    list.sort((a: any, b: any) => {
      const valA = a[sort] ?? "";
      const valB = b[sort] ?? "";
      const cmp = String(valA).localeCompare(String(valB), "pt-BR", { numeric: true });
      return direction === "desc" ? -cmp : cmp;
    });

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.max(1, parseInt(searchParams.get("page_size") || "25", 10));
    const total = list.length;
    const start = (page - 1) * pageSize;
    const items = list.slice(start, start + pageSize);

    const pageRes: MilitarPage = { items, total, page, page_size: pageSize };
    return pageRes as T;
  }

  // Create militar
  if (pathname === "/militares" && method === "POST") {
    const b = body as MilitarIn;
    const mat = normMatricula(b.matricula);
    const exists = store.militares.find((m) => normMatricula(m.matricula) === mat);
    if (exists) {
      throw {
        status: 409,
        body: { detail: { message: `Já existe cadastro para a matrícula ${b.matricula} (${exists.nome_completo}).`, militar_id: exists.id } },
      };
    }
    const user = getCurrentUser();
    const newDoc: StoredData["militares"][number] = {
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
    store.militares.unshift(newDoc);
    store.situacoes.unshift({
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
    saveStore();
    return enrichMilitar(newDoc, hoje, alertaDias) as T;
  }

  // Single militar routes
  const milDetailMatch = pathname.match(/^\/militares\/([^/]+)$/);
  if (milDetailMatch) {
    const id = milDetailMatch[1];
    const doc = store.militares.find((m) => m.id === id);
    if (!doc) throw { status: 404, body: { detail: "Militar não encontrado" } };

    if (method === "GET") {
      return enrichMilitar(doc, hoje, alertaDias) as T;
    }

    if (method === "PUT") {
      const b = body as MilitarIn;
      const user = getCurrentUser();
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
      saveStore();
      return enrichMilitar(doc, hoje, alertaDias) as T;
    }
  }

  const milQuickMatch = pathname.match(/^\/militares\/([^/]+)\/rapido$/);
  if (milQuickMatch && method === "PATCH") {
    const id = milQuickMatch[1];
    const doc = store.militares.find((m) => m.id === id);
    if (!doc) throw { status: 404, body: { detail: "Militar não encontrado" } };
    const b = body as MilitarRapidoIn;
    if (b.lotacao_id) doc.lotacao_id = b.lotacao_id;
    if (b.edital_id) doc.edital_id = b.edital_id;
    if (b.data_vencimento_contrato) doc.data_vencimento_contrato = b.data_vencimento_contrato;
    if (b.observacoes !== undefined) doc.observacoes = b.observacoes;
    doc.atualizado_em = new Date().toISOString();
    doc.atualizado_por = getCurrentUser().id;
    saveStore();
    return enrichMilitar(doc, hoje, alertaDias) as T;
  }

  const milDesligMatch = pathname.match(/^\/militares\/([^/]+)\/desligamento$/);
  if (milDesligMatch && method === "POST") {
    const id = milDesligMatch[1];
    const doc = store.militares.find((m) => m.id === id);
    if (!doc) throw { status: 404, body: { detail: "Militar não encontrado" } };
    const b = body as DesligamentoIn;
    const user = getCurrentUser();
    const motivo = store.motivos.find((mt) => mt.id === b.motivo_id);

    doc.status = "DESLIGADO";
    doc.data_desligamento = b.data_desligamento;
    doc.motivo_desligamento_id = b.motivo_id;
    doc.documento_desligamento = b.documento || null;
    if (b.observacoes) doc.observacoes = b.observacoes;
    doc.atualizado_em = new Date().toISOString();
    doc.atualizado_por = user.id;

    store.situacoes.unshift({
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
    saveStore();
    return enrichMilitar(doc, hoje, alertaDias) as T;
  }

  const milReativarMatch = pathname.match(/^\/militares\/([^/]+)\/reativacao$/);
  if (milReativarMatch && method === "POST") {
    const id = milReativarMatch[1];
    const doc = store.militares.find((m) => m.id === id);
    if (!doc) throw { status: 404, body: { detail: "Militar não encontrado" } };
    const b = body as ReativacaoIn;
    const user = getCurrentUser();

    doc.status = "ATIVO";
    doc.data_desligamento = null;
    doc.motivo_desligamento_id = null;
    doc.documento_desligamento = null;
    if (b.data_vencimento_contrato) doc.data_vencimento_contrato = b.data_vencimento_contrato;
    doc.atualizado_em = new Date().toISOString();
    doc.atualizado_por = user.id;

    store.situacoes.unshift({
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
    saveStore();
    return enrichMilitar(doc, hoje, alertaDias) as T;
  }

  const milHistMatch = pathname.match(/^\/militares\/([^/]+)\/historico$/);
  if (milHistMatch && method === "GET") {
    const id = milHistMatch[1];
    const doc = store.militares.find((m) => m.id === id);
    const situacao = store.situacoes.filter((s) => s.militar_id === id);
    const alteracoes = store.alteracoes.filter((a) => a.entidade_id === id || (doc && a.matricula === doc.matricula));
    const hist: MilitarHistorico = { alteracoes, situacao };
    return hist as T;
  }

  // 5. RELATÓRIOS
  const relMatch = pathname.match(/^\/relatorios\/([^/]+)$/);
  if (relMatch && method === "GET") {
    const tipo = relMatch[1];
    const matriculaParam = searchParams.get("matricula");
    let recs = store.militares.map((m) => enrichMilitar(m, hoje, alertaDias));

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
      linhas = recs.filter((m) => m.status === "ATIVO" && m.alerta === "A_VENCER").sort((a, b) => a.data_vencimento_contrato.localeCompare(b.data_vencimento_contrato));
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
      linhas = recs.filter((m) => m.status === "ATIVO" && m.alerta === "VENCIDO").sort((a, b) => a.data_vencimento_contrato.localeCompare(b.data_vencimento_contrato));
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
      linhas = [...recs].sort((a, b) => b.data_inclusao.localeCompare(a.data_inclusao));
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
      linhas = recs.filter((m) => m.status === "DESLIGADO").sort((a, b) => (b.data_desligamento || "").localeCompare(a.data_desligamento || ""));
      colunas = [
        { key: "matricula", label: "Matrícula" },
        { key: "nome_completo", label: "Nome completo" },
        { key: "cargo_nome", label: "Cargo" },
        { key: "lotacao_nome", label: "Lotação/UBM" },
        { key: "data_desligamento", label: "Data do desligamento" },
        { key: "motivo_desligamento_nome", label: "Motivo" },
      ];
    } else if (tipo === "historico") {
      titulo = "Histórico individual por matrícula";
      descricao = "Inclusões, desligamentos, reativações e alterações do cadastro.";
      colunas = [
        { key: "quando", label: "Data/hora do registro" },
        { key: "evento", label: "Evento" },
        { key: "data_efetiva", label: "Data efetiva" },
        { key: "detalhes", label: "Detalhes" },
        { key: "usuario", label: "Usuário" },
      ];
      if (matriculaParam) {
        const mat = normMatricula(matriculaParam);
        const m = store.militares.find((x) => normMatricula(x.matricula) === mat);
        if (m) {
          const sits = store.situacoes.filter((s) => s.militar_id === m.id);
          linhas = sits.map((s) => ({
            quando: s.timestamp,
            evento: s.tipo,
            data_efetiva: s.data_efetiva,
            detalhes: s.motivo_nome || s.justificativa || s.observacoes || "—",
            usuario: s.usuario_nome,
          }));
        }
      }
    }

    const relatorio: Relatorio = {
      tipo,
      titulo,
      descricao,
      colunas,
      linhas,
      gerado_em: new Date().toISOString(),
      filtros: "Filtros aplicados",
    };
    return relatorio as T;
  }

  // 6. USUÁRIOS & AUDITORIA
  if (pathname === "/usuarios" && method === "GET") {
    return store.usuarios.map(({ senha_hash, ...u }) => u) as T;
  }

  if (pathname === "/usuarios" && method === "POST") {
    const b = body as UsuarioIn;
    const exists = store.usuarios.find((u) => u.email.toLowerCase() === b.email.trim().toLowerCase());
    if (exists) throw { status: 409, body: { detail: "Já existe um usuário com este e-mail" } };
    const user: StoredData["usuarios"][number] = {
      id: `usr_${Date.now()}`,
      nome: b.nome.trim(),
      email: b.email.trim().toLowerCase(),
      perfil: b.perfil,
      ativo: b.ativo,
    };
    store.usuarios.push(user);
    saveStore();
    const { senha_hash, ...out } = user;
    return out as T;
  }

  if (pathname.startsWith("/usuarios/") && method === "PUT") {
    const id = pathname.replace("/usuarios/", "");
    const b = body as UsuarioIn;
    const user = store.usuarios.find((u) => u.id === id);
    if (!user) throw { status: 404, body: { detail: "Usuário não encontrado" } };
    user.nome = b.nome.trim();
    user.email = b.email.trim().toLowerCase();
    user.perfil = b.perfil;
    user.ativo = b.ativo;
    saveStore();
    const { senha_hash, ...out } = user;
    return out as T;
  }

  if (pathname === "/auditoria" && method === "GET") {
    const res: AuditoriaPage = {
      items: store.alteracoes,
      total: store.alteracoes.length,
    };
    return res as T;
  }

  // 7. IMPORTAÇÃO
  if (pathname === "/importacao/analisar" && method === "POST") {
    const content = body?.content || "";
    const lines = content.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
    const delim = content.includes(";") ? ";" : ",";
    const headerRow = lines[0] ? lines[0].split(delim).map((c: string) => c.replace(/^["']|["']$/g, "").trim()) : [];

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

    const amostra = lines.slice(0, 5).map((l: string) => l.split(delim).map((c: string) => c.replace(/^["']|["']$/g, "").trim()));
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
    const existingMap = new Map(store.militares.map((m) => [normMatricula(m.matricula), m]));

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

  if (pathname === "/importacao/aplicar" && method === "POST") {
    const validacao = body?.validacao as ImportValidacao;
    let inseridos = 0;
    const user = getCurrentUser();

    if (validacao && validacao.linhas) {
      for (const li of validacao.linhas) {
        if (li.acao === "INSERIR") {
          const rec = li.dados;
          const cargo = store.cargos[0];
          const lot = store.lotacoes[0];
          const ed = store.editais[0];
          const newDoc: StoredData["militares"][number] = {
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
          store.militares.push(newDoc);
          inseridos++;
        }
      }
      saveStore();
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

  console.warn(`[mockBackend] Unhandled route: ${method} ${pathname}`);
  return {} as T;
}

// Client-side file exporter
export function exportFile(filename: string, content: string, mimeType = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
