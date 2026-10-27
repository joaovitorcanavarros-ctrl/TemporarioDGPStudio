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

function getInitialStore(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.militares && parsed.militares.length > 0) {
        return cleanAvnm(parsed);
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

let isSavingToFirestore = false;
let pendingSave: StoredData | null = null;

async function syncToFirestore(dataToSave: StoredData) {
  if (isSavingToFirestore) {
    pendingSave = dataToSave;
    return;
  }
  isSavingToFirestore = true;
  try {
    const docRef = doc(db, "corporacao", "dados");
    const payload = JSON.parse(JSON.stringify(dataToSave));
    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    console.error("Erro ao salvar dados corporativos no Firestore:", err);
    try {
      handleFirestoreError(err, OperationType.WRITE, "corporacao/dados");
    } catch {}
  } finally {
    isSavingToFirestore = false;
    if (pendingSave) {
      const next = pendingSave;
      pendingSave = null;
      syncToFirestore(next);
    }
  }
}

function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn("Failed to persist store to localStorage", e);
  }
  // Persist to Cloud Firestore so all users and devices immediately get the update
  syncToFirestore(store);
}

let firestoreInitialized = false;

export function initFirestoreSync() {
  if (firestoreInitialized || typeof window === "undefined") return;
  firestoreInitialized = true;

  try {
    const docRef = doc(db, "corporacao", "dados");
    onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const cloudData = snapshot.data() as StoredData;
          if (cloudData && Array.isArray(cloudData.militares) && cloudData.militares.length > 0) {
            store = cleanAvnm(cloudData);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
            } catch {}
            // Invalidate queries so every connected user gets updated data in real time
            queryClient.invalidateQueries();
          }
        } else {
          // Document does not exist yet in Firestore: seed initial CBMMT dataset
          console.log("Realizando seed inicial dos dados oficiais do CBMMT no Firestore...");
          const initialPayload = JSON.parse(JSON.stringify(store));
          setDoc(docRef, initialPayload, { merge: true }).catch((err) => {
            console.error("Erro no seed inicial do Firestore:", err);
          });
        }
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
        try {
          handleFirestoreError(error, OperationType.GET, "corporacao/dados");
        } catch {}
      }
    );
  } catch (e) {
    console.warn("Falha ao inicializar listener de sincronização em tempo real do Firestore:", e);
  }
}

if (typeof window !== "undefined") {
  initFirestoreSync();
}

export function getCurrentUser(): UserOut | null {
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
  // If the user has not logged in or logged out, return null so unauthenticated state is respected
  return null;
}

export function setCurrentUser(user: UserOut | null) {
  if (!user) {
    localStorage.removeItem(SESSION_KEY);
  } else {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }
}

function fmtDateLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
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

function cleanAlphanumeric(s: string): string {
  return (s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function getBaseMatricula(s: string): string {
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

export function logAudit(entry: {
  entidade: string;
  entidade_id?: string | null;
  matricula?: string | null;
  operacao: string;
  usuario_nome?: string;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
}): HistoricoAlteracao {
  const user = getCurrentUser() || DEFAULT_USERS[0];
  const item: HistoricoAlteracao = {
    id: `alt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    entidade: entry.entidade,
    entidade_id: entry.entidade_id ?? null,
    matricula: entry.matricula ?? null,
    operacao: entry.operacao,
    usuario_nome: entry.usuario_nome || user.nome || "Sistema",
    timestamp: new Date().toISOString(),
    antes: entry.antes ?? null,
    depois: entry.depois ?? null,
  };
  if (!store.alteracoes) {
    store.alteracoes = [];
  }
  store.alteracoes.unshift(item);
  if (store.alteracoes.length > 1000) {
    store.alteracoes = store.alteracoes.slice(0, 1000);
  }
  return item;
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
    const user = getCurrentUser();
    if (!user) {
      throw { status: 401, body: { detail: "Sessão expirada ou não autenticado" } };
    }
    return user as T;
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

  if (pathname === "/auth/signup" && method === "POST") {
    const email = (body?.email || "").trim().toLowerCase();
    const nome = (body?.nome || "").trim();
    const senha = (body?.senha || "").trim();

    if (!email || !nome) {
      throw { status: 400, body: { detail: "Preencha todos os campos obrigatórios." } };
    }
    const existing = store.usuarios.find((u) => u.email.toLowerCase() === email);
    if (existing) {
      throw { status: 409, body: { detail: "Já existe uma conta cadastrada com este e-mail." } };
    }

    const isSystemAdmin = email === "admin@cbmmt.mt.gov.br" || email === "joao1canavarros@gmail.com";
    const newUser: StoredData["usuarios"][number] = {
      id: `usr_${Date.now()}`,
      nome,
      email,
      perfil: isSystemAdmin ? "ADMIN" : "CONSULTA",
      ativo: true,
    };
    store.usuarios.push(newUser);
    saveStore();

    const userOut: UserOut = { id: newUser.id, nome: newUser.nome, email: newUser.email, perfil: newUser.perfil, ativo: newUser.ativo };
    setCurrentUser(userOut);
    return userOut as T;
  }

  if (pathname === "/auth/google" && method === "POST") {
    const email = (body?.email || "").trim().toLowerCase();
    const nome = (body?.nome || "").trim() || email.split("@")[0];

    if (!email) {
      throw { status: 400, body: { detail: "E-mail da conta Google não recebido." } };
    }

    let user = store.usuarios.find((u) => u.email.toLowerCase() === email);
    const isSystemAdmin = email === "admin@cbmmt.mt.gov.br" || email === "joao1canavarros@gmail.com";

    if (!user) {
      user = {
        id: `usr_g_${Date.now()}`,
        nome,
        email,
        perfil: isSystemAdmin ? "ADMIN" : "CONSULTA",
        ativo: true,
      };
      store.usuarios.push(user);
      saveStore();
    } else {
      if (!user.nome) user.nome = nome;
      if (isSystemAdmin) user.perfil = "ADMIN";
      saveStore();
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
    const ultimaAtualizacao =
      store.alteracoes?.[0]?.timestamp ||
      store.militares?.[0]?.atualizado_em ||
      "2026-10-14T10:00:00Z";
    const res: Meta = {
      data_hoje: hoje,
      ultima_atualizacao: ultimaAtualizacao,
      total_registros: store.militares.length,
    };
    return res as T;
  }

  if (pathname === "/config" && method === "PUT") {
    const oldAlerta = store.config.alerta_dias;
    const newAlerta = Number(body?.alerta_dias) || 30;
    store.config = { alerta_dias: newAlerta };
    logAudit({
      entidade: "Configurações",
      operacao: "ALTERACAO_CONFIGURACAO",
      antes: { "Prazo de alerta (dias)": oldAlerta },
      depois: { "Prazo de alerta (dias)": newAlerta },
    });
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
      logAudit({
        entidade: coll,
        entidade_id: newId,
        operacao: `INSERCAO_${coll.toUpperCase()}`,
        antes: null,
        depois: { Nome: item.nome || item.codigo, ...item },
      });
      saveStore();
      return item as T;
    }
    if (method === "PUT" && itemId) {
      const idx = (store[coll] as any).findIndex((x: any) => x.id === itemId);
      if (idx >= 0) {
        const oldItem = { ...store[coll][idx] };
        store[coll][idx] = { ...store[coll][idx], ...body, id: itemId };
        logAudit({
          entidade: coll,
          entidade_id: itemId,
          operacao: `EDICAO_${coll.toUpperCase()}`,
          antes: oldItem,
          depois: store[coll][idx],
        });
        saveStore();
        return store[coll][idx] as T;
      }
    }
    if (method === "DELETE" && itemId) {
      const idx = (store[coll] as any).findIndex((x: any) => x.id === itemId);
      if (idx >= 0) {
        if (coll === "categorias") {
          const cat = store.categorias[idx];
          const cargosUsando = store.cargos.filter((c) => c.categoria === cat.codigo);
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
          const milUsando = store.militares.filter((m) => m.cargo_id === itemId);
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
          const milUsando = store.militares.filter((m) => m.lotacao_id === itemId);
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
          const milUsando = store.militares.filter((m) => m.edital_id === itemId);
          if (milUsando.length > 0) {
            throw {
              status: 400,
              body: {
                detail: `Não é possível excluir o edital pois existem ${milUsando.length} militar(es) vinculado(s).`,
              },
            };
          }
        }
        const oldItem = { ...store[coll][idx] };
        const removed = store[coll].splice(idx, 1);
        logAudit({
          entidade: coll,
          entidade_id: itemId,
          operacao: `EXCLUSAO_${coll.toUpperCase()}`,
          antes: { Nome: oldItem.nome || oldItem.codigo, ...oldItem },
          depois: null,
        });
        saveStore();
        return { ok: true, removed } as T;
      }
      throw { status: 404, body: { detail: "Registro não encontrado" } };
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
      const qClean = cleanAlphanumeric(q);
      list = list.filter((m) =>
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

    const ativo_em = searchParams.get("ativo_em");
    if (ativo_em) {
      list = list.filter((m) => ativoEm(m, ativo_em, hoje));
    }

    const ano = searchParams.get("ano");
    const data_inicio = searchParams.get("data_inicio");
    const data_fim = searchParams.get("data_fim");

    if (ano) {
      list = list.filter((m) => {
        const incAno = m.data_inclusao ? m.data_inclusao.slice(0, 4) : "";
        const edital = store.editais.find((e) => e.id === m.edital_id);
        const editalAno = edital?.ano ? String(edital.ano) : "";
        const activeInYear = m.data_inclusao <= `${ano}-12-31` && (!m.data_desligamento || m.data_desligamento >= `${ano}-01-01`);
        return incAno === ano || editalAno === ano || activeInYear;
      });
    } else {
      if (data_inicio) {
        list = list.filter((m) => m.data_inclusao >= data_inicio || (m.data_vencimento_contrato && m.data_vencimento_contrato >= data_inicio) || (!m.data_desligamento || m.data_desligamento >= data_inicio));
      }
      if (data_fim) {
        list = list.filter((m) => m.data_inclusao <= data_fim);
      }
    }

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
    const user = getCurrentUser() || DEFAULT_USERS[0];
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
    logAudit({
      entidade: "militar",
      entidade_id: newDoc.id,
      matricula: newDoc.matricula,
      operacao: "NOVO_CADASTRO",
      usuario_nome: user.nome,
      antes: null,
      depois: {
        "Nome": newDoc.nome_completo,
        "Matrícula": newDoc.matricula,
        "Vencimento do contrato": newDoc.data_vencimento_contrato,
        "Data de inclusão": newDoc.data_inclusao,
        "Situação": newDoc.status,
      },
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
      const user = getCurrentUser() || DEFAULT_USERS[0];
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
        antes["Cargo"] = store.cargos.find((c) => c.id === doc.cargo_id)?.nome || doc.cargo_id;
        depois["Cargo"] = store.cargos.find((c) => c.id === b.cargo_id)?.nome || b.cargo_id;
      }
      if (doc.lotacao_id !== b.lotacao_id) {
        antes["Lotação/UBM"] = store.lotacoes.find((l) => l.id === doc.lotacao_id)?.nome || doc.lotacao_id;
        depois["Lotação/UBM"] = store.lotacoes.find((l) => l.id === b.lotacao_id)?.nome || b.lotacao_id;
      }
      if (doc.edital_id !== b.edital_id) {
        antes["Edital"] = store.editais.find((e) => e.id === doc.edital_id)?.nome || doc.edital_id;
        depois["Edital"] = store.editais.find((e) => e.id === b.edital_id)?.nome || b.edital_id;
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

      logAudit({
        entidade: "militar",
        entidade_id: doc.id,
        matricula: doc.matricula,
        operacao: isVencChange ? "ALTERACAO_VENCIMENTO" : "EDICAO_CADASTRO",
        usuario_nome: user.nome,
        antes: Object.keys(antes).length > 0 ? antes : null,
        depois: Object.keys(depois).length > 0 ? depois : { "Militar": doc.nome_completo },
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
    const user = getCurrentUser() || DEFAULT_USERS[0];
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
      const oldLot = store.lotacoes.find((l) => l.id === doc.lotacao_id)?.nome || doc.lotacao_id;
      const newLot = store.lotacoes.find((l) => l.id === b.lotacao_id)?.nome || b.lotacao_id;
      antes["Lotação/UBM"] = oldLot;
      depois["Lotação/UBM"] = newLot;
      doc.lotacao_id = b.lotacao_id;
    }
    if (b.edital_id && b.edital_id !== doc.edital_id) {
      const oldEd = store.editais.find((e) => e.id === doc.edital_id)?.nome || doc.edital_id;
      const newEd = store.editais.find((e) => e.id === b.edital_id)?.nome || b.edital_id;
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

    logAudit({
      entidade: "militar",
      entidade_id: doc.id,
      matricula: doc.matricula,
      operacao: isVencChange ? "ALTERACAO_VENCIMENTO" : "EDICAO_RAPIDA",
      usuario_nome: user.nome,
      antes: Object.keys(antes).length > 0 ? antes : null,
      depois: Object.keys(depois).length > 0 ? depois : { "Militar": doc.nome_completo },
    });

    saveStore();
    return enrichMilitar(doc, hoje, alertaDias) as T;
  }

  const milDesligMatch = pathname.match(/^\/militares\/([^/]+)\/(desligar|desligamento)$/);
  if (milDesligMatch && method === "POST") {
    const id = milDesligMatch[1];
    const doc = store.militares.find((m) => m.id === id);
    if (!doc) throw { status: 404, body: { detail: "Militar não encontrado" } };
    const b = body as DesligamentoIn;
    const user = getCurrentUser() || DEFAULT_USERS[0];
    const motivo = store.motivos.find((mt) => mt.id === b.motivo_id);

    const oldStatus = doc.status;
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

    logAudit({
      entidade: "militar",
      entidade_id: doc.id,
      matricula: doc.matricula,
      operacao: "DESLIGAMENTO",
      usuario_nome: user.nome,
      antes: { "Situação": oldStatus },
      depois: {
        "Situação": "DESLIGADO",
        "Data do desligamento": b.data_desligamento,
        "Motivo": motivo?.nome || b.motivo_id,
        "Documento": b.documento || "—",
        "Observações": b.observacoes || "—",
      },
    });

    saveStore();
    return enrichMilitar(doc, hoje, alertaDias) as T;
  }

  const milReativarMatch = pathname.match(/^\/militares\/([^/]+)\/(reativar|reativacao)$/);
  if (milReativarMatch && method === "POST") {
    const id = milReativarMatch[1];
    const doc = store.militares.find((m) => m.id === id);
    if (!doc) throw { status: 404, body: { detail: "Militar não encontrado" } };
    const b = body as ReativacaoIn;
    const user = getCurrentUser() || DEFAULT_USERS[0];

    const oldStatus = doc.status;
    const oldVenc = doc.data_vencimento_contrato;
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

    logAudit({
      entidade: "militar",
      entidade_id: doc.id,
      matricula: doc.matricula,
      operacao: "REATIVACAO",
      usuario_nome: user.nome,
      antes: { "Situação": oldStatus, "Data de vencimento": oldVenc },
      depois: {
        "Situação": "ATIVO",
        "Data da reativação": hoje,
        "Novo vencimento": doc.data_vencimento_contrato,
        "Justificativa": b.justificativa,
        "Documento": b.documento || "—",
      },
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
        { key: "usuario", label: "Usuário / Responsável" },
      ];
      let militarEncontrado: StoredData["militares"][number] | null = null;
      if (matriculaParam) {
        const queryRaw = matriculaParam.trim();
        // 1. Try exact or flexible matching by matricula
        militarEncontrado = store.militares.find((x) =>
          normMatricula(x.matricula) === normMatricula(queryRaw) ||
          cleanAlphanumeric(x.matricula) === cleanAlphanumeric(queryRaw) ||
          matchMatriculaFlexible(queryRaw, x.matricula)
        ) || null;

        // 2. If still not found and query has at least 3 chars, search by name or partial clean matricula
        if (!militarEncontrado && queryRaw.length >= 3) {
          const qNorm = normKey(queryRaw);
          const qClean = cleanAlphanumeric(queryRaw);
          militarEncontrado = store.militares.find((x) =>
            normKey(x.nome_completo).includes(qNorm) ||
            (qClean && cleanAlphanumeric(x.matricula).includes(qClean))
          ) || null;
        }

        if (militarEncontrado) {
          const m = enrichMilitar(militarEncontrado, hoje, alertaDias);
          titulo = `Histórico Funcional — ${m.nome_completo} (${m.matricula})`;
          descricao = `Cargo/Posto: ${m.cargo_nome} · UBM/Lotação: ${m.lotacao_nome} · Situação: ${m.status}`;

          const historyItems: { quando: string; evento: string; data_efetiva: string; detalhes: string; usuario: string }[] = [];

          // 1. Evento de Inclusão / Admissão Oficial
          const inclusaoDate = m.data_inclusao || "2025-04-29";
          historyItems.push({
            quando: m.criado_em || `${inclusaoDate}T08:00:00Z`,
            evento: "INCLUSÃO / ADMISSÃO",
            data_efetiva: inclusaoDate,
            detalhes: `Inclusão no CBMMT como ${m.cargo_nome} · UBM: ${m.lotacao_nome} · Edital: ${m.edital_nome}${m.doe_incorporacao && m.doe_incorporacao !== "-" ? ` · DOE: ${m.doe_incorporacao}` : ""}`,
            usuario: m.criado_por_nome || "DGP / CBMMT",
          });

          // 2. Vigência Contratual Prevista
          if (m.data_vencimento_contrato) {
            historyItems.push({
              quando: m.criado_em || `${inclusaoDate}T08:00:00Z`,
              evento: "VIGÊNCIA CONTRATUAL",
              data_efetiva: m.data_vencimento_contrato,
              detalhes: `Vigência do contrato de Bombeiro Temporário fixada para ${fmtDateLocal(m.data_vencimento_contrato)}.`,
              usuario: "Sistema DGP",
            });
          }

          // 3. Situações Funcionais Registradas (store.situacoes)
          const sits = store.situacoes.filter((s) => s.militar_id === m.id);
          for (const s of sits) {
            historyItems.push({
              quando: s.timestamp,
              evento: s.tipo,
              data_efetiva: s.data_efetiva,
              detalhes: [s.motivo_nome, s.documento, s.justificativa, s.observacoes].filter(Boolean).join(" · ") || "Situação funcional registrada",
              usuario: s.usuario_nome,
            });
          }

          // 4. Auditoria e Alterações Cadastrais (store.alteracoes)
          const alts = store.alteracoes.filter((a) =>
            a.entidade === "militar" &&
            (a.entidade_id === m.id || a.matricula === m.matricula || matchMatriculaFlexible(a.matricula || "", m.matricula))
          );
          for (const a of alts) {
            if (a.operacao === "IMPORTACAO_CSV" && !a.entidade_id) continue;
            let det = "";
            if (a.depois) {
              const diffs = Object.entries(a.depois)
                .map(([k, v]) => a.antes && a.antes[k] !== undefined ? `${k}: de "${a.antes[k]}" para "${v}"` : `${k}: ${v}`)
                .join("; ");
              det = diffs || a.operacao.replace(/_/g, " ");
            } else {
              det = a.operacao.replace(/_/g, " ");
            }

            historyItems.push({
              quando: a.timestamp,
              evento: a.operacao.replace(/_/g, " "),
              data_efetiva: a.timestamp ? a.timestamp.slice(0, 10) : "",
              detalhes: det,
              usuario: a.usuario_nome,
            });
          }

          // 5. Se estiver desligado e não constar em situações
          if (m.status === "DESLIGADO" && m.data_desligamento && !sits.some((s) => s.tipo === "DESLIGAMENTO")) {
            historyItems.push({
              quando: m.atualizado_em || `${m.data_desligamento}T08:00:00Z`,
              evento: "DESLIGAMENTO",
              data_efetiva: m.data_desligamento,
              detalhes: `Desligamento do serviço ativo · Motivo: ${m.motivo_desligamento_nome || "Término de Contrato"}${m.documento_desligamento ? ` · Boletim Geral/Doc: ${m.documento_desligamento}` : ""}`,
              usuario: m.atualizado_por_nome || "DGP / CBMMT",
            });
          }

          // Ordenar cronologicamente decrescente (mais recente primeiro)
          historyItems.sort((a, b) => (b.data_efetiva || b.quando).localeCompare(a.data_efetiva || a.quando));

          linhas = historyItems;
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
        gerado_em: new Date().toISOString(),
        filtros: mFinal ? `Matrícula: ${mFinal.matricula} (${mFinal.nome_completo})` : (matriculaParam ? `Matrícula: ${matriculaParam}` : "Informe a matrícula"),
        militar: mFinal,
      };
      return relatorio as T;
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
    logAudit({
      entidade: "usuario",
      entidade_id: user.id,
      operacao: "CRIACAO_USUARIO",
      antes: null,
      depois: { Nome: user.nome, "E-mail": user.email, Perfil: user.perfil, Ativo: user.ativo ? "Sim" : "Não" },
    });
    saveStore();
    const { senha_hash, ...out } = user;
    return out as T;
  }

  if (pathname.startsWith("/usuarios/") && method === "PUT") {
    const id = pathname.replace("/usuarios/", "");
    const b = body as UsuarioIn;
    const user = store.usuarios.find((u) => u.id === id);
    if (!user) throw { status: 404, body: { detail: "Usuário não encontrado" } };
    const oldU = { Nome: user.nome, "E-mail": user.email, Perfil: user.perfil, Ativo: user.ativo ? "Sim" : "Não" };
    user.nome = b.nome.trim();
    user.email = b.email.trim().toLowerCase();
    user.perfil = b.perfil;
    user.ativo = b.ativo;
    logAudit({
      entidade: "usuario",
      entidade_id: user.id,
      operacao: "EDICAO_USUARIO",
      antes: oldU,
      depois: { Nome: user.nome, "E-mail": user.email, Perfil: user.perfil, Ativo: user.ativo ? "Sim" : "Não" },
    });
    saveStore();
    const { senha_hash, ...out } = user;
    return out as T;
  }

  if (pathname === "/auditoria" && method === "GET") {
    let items = [...(store.alteracoes || [])];
    const q = searchParams.get("q");
    if (q) {
      const qN = normKey(q);
      items = items.filter(
        (a) =>
          normKey(a.usuario_nome).includes(qN) ||
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
    const user = getCurrentUser() || DEFAULT_USERS[0];

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
      if (inseridos > 0) {
        logAudit({
          entidade: "militar",
          operacao: "IMPORTACAO_CSV",
          usuario_nome: user.nome,
          antes: null,
          depois: { "Militares importados": inseridos },
        });
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
