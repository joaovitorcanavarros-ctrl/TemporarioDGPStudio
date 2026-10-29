import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  serverTimestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { toast } from "sonner";
import firebaseConfig from "../../firebase-applet-config.json";

// 1. Instância dedicada e isolada para o Cloud Firestore
const existingFirestoreApp = getApps().find((a) => a.name === "cbmmt-firestore");
const firestoreApp = existingFirestoreApp || initializeApp(firebaseConfig, "cbmmt-firestore");
export const db = getFirestore(firestoreApp, firebaseConfig.firestoreDatabaseId);

// 2. Instância padrão para serviços de autenticação do Firebase
const existingDefaultApp = getApps().find((a) => a.name === "[DEFAULT]");
const defaultApp = existingDefaultApp || initializeApp(firebaseConfig);
export const auth = getAuth(defaultApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  rethrow = false
): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  if (rethrow) {
    throw new Error(JSON.stringify(errInfo));
  }
  return errInfo;
}

// Validação de conectividade inicial com o Cloud Firestore
if (typeof window !== "undefined") {
  void (async function validateFirestoreConnection() {
    try {
      await getDocFromServer(doc(db, "corporacao", "dados"));
    } catch (error) {
      if (error instanceof Error && error.message.includes("the client is offline")) {
        console.error("Please check your Firebase configuration.");
      }
    }
  })();

  try {
    auth.onIdTokenChanged(async (user) => {
      if (user) {
        try {
          await user.getIdToken();
        } catch (err: any) {
          if (err?.message?.includes("token-service") || err?.message?.includes("securetoken")) {
            console.warn("[Auth] Token expirado ou serviço de token indisponível; limpando sessão residual.");
            void firebaseSignOut(auth).catch(() => {});
          }
        }
      }
    });
  } catch {
    // ignora falha de inicialização do listener de token
  }
}

export async function loginWithGoogle(): Promise<{ user: User; email: string; name: string }> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    return {
      user,
      email: user.email || "",
      name: user.displayName || user.email?.split("@")[0] || "Usuário Google",
    };
  } catch (err: any) {
    if (err?.message?.includes("token-service") || err?.message?.includes("securetoken")) {
      throw new Error("A API de token do Google não está disponível neste projeto. Utilize o acesso com e-mail e senha.");
    }
    throw err;
  }
}

export async function logoutFirebase(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (e) {
    console.warn("Firebase sign out error", e);
  }
}

export async function registerWithFirebaseEmail(nome: string, email: string, pass: string): Promise<User> {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(res.user, { displayName: nome });
    return res.user;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "auth/register");
    throw err;
  }
}

export async function loginWithFirebaseEmail(email: string, pass: string): Promise<User> {
  try {
    const res = await signInWithEmailAndPassword(auth, email, pass);
    return res.user;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, "auth/login");
    throw err;
  }
}

// ============================================================================
// 1. COLEÇÃO `militares` — Repositório exclusivo das fichas funcionais
// ============================================================================

/**
 * Gravação granular direta no documento do militar dentro da coleção 'militares' (militares/${militar.id}).
 */
export async function salvarMilitarFirestore(militar: Record<string, any>): Promise<boolean> {
  if (!militar?.id) return false;
  const path = `militares/${militar.id}`;
  try {
    const ref = doc(db, "militares", String(militar.id));
    const cleanPayload = JSON.parse(JSON.stringify(militar));
    cleanPayload.atualizado_em = cleanPayload.atualizado_em || new Date().toISOString();
    cleanPayload.data_desligamento = cleanPayload.data_desligamento ?? null;
    cleanPayload.doe_incorporacao = cleanPayload.doe_incorporacao ?? null;
    cleanPayload.observacoes = cleanPayload.observacoes ?? null;
    await setDoc(ref, cleanPayload, { merge: true });
    return true;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.WRITE, path);
    toast.error(`Erro ao salvar militar no Cloud Firestore (${militar.matricula || militar.id}).`);
    return false;
  }
}

/**
 * Atualização parcial direta (updateDoc / setDoc merge) de campos de um militar em 'militares/${militarId}'.
 */
export async function atualizarCamposMilitarFirestore(
  militarId: string,
  campos: Record<string, any>
): Promise<boolean> {
  if (!militarId) return false;
  const path = `militares/${militarId}`;
  try {
    const ref = doc(db, "militares", String(militarId));
    const cleanPayload = JSON.parse(
      JSON.stringify({
        ...campos,
        atualizado_em: new Date().toISOString(),
      })
    );
    try {
      await updateDoc(ref, cleanPayload);
    } catch {
      await setDoc(ref, cleanPayload, { merge: true });
    }
    return true;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    toast.error("Não foi possível atualizar os dados do militar no Cloud Firestore.");
    return false;
  }
}

/**
 * Exclusão direta e definitiva do documento do militar em 'militares/${militarId}' no Firestore.
 */
export async function excluirMilitarFirestore(militarId: string): Promise<boolean> {
  if (!militarId) return false;
  const path = `militares/${militarId}`;
  try {
    const ref = doc(db, "militares", String(militarId));
    await deleteDoc(ref);
    return true;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.DELETE, path);
    toast.error("Erro ao excluir registro do militar no Cloud Firestore.");
    return false;
  }
}

/**
 * Busca pontual (getDoc) diretamente no documento do militar em 'militares/${militarId}'.
 * NUNCA dispara escrita automática.
 */
export async function buscarMilitarFirestore(militarId: string): Promise<Record<string, any> | null> {
  if (!militarId) return null;
  const path = `militares/${militarId}`;
  try {
    const ref = doc(db, "militares", String(militarId));
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Record<string, any>;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

// Cache de cursores (QueryDocumentSnapshot) por chave de consulta e página para paginação via startAfter
const militaresCursorCache = new Map<string, QueryDocumentSnapshot<DocumentData>>();

export interface PaginacaoMilitaresResult {
  items: Array<Record<string, any>>;
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Consulta paginada por cursor (`getDocs` + `limit(20 | 30)` + `startAfter`) na coleção `militares`.
 */
export async function buscarMilitaresPaginadosFirestore(options: {
  pageSize?: number;
  page?: number;
  sortField?: string;
  sortDir?: "asc" | "desc";
  cursorKey?: string;
}): Promise<PaginacaoMilitaresResult> {
  const safeLimit = Math.min(30, Math.max(1, options.pageSize || 20));
  const page = Math.max(1, options.page || 1);
  const sortField = options.sortField || "nome_completo";
  const sortDir = options.sortDir || "asc";
  const baseKey = options.cursorKey || `${sortField}:${sortDir}:${safeLimit}`;

  try {
    const colRef = collection(db, "militares");
    const prevCursor = page > 1 ? militaresCursorCache.get(`${baseKey}:p${page - 1}`) : undefined;

    const q = prevCursor
      ? query(colRef, orderBy(sortField, sortDir), startAfter(prevCursor), limit(safeLimit))
      : query(colRef, orderBy(sortField, sortDir), limit(safeLimit));

    const snap = await getDocs(q);
    const items: Array<Record<string, any>> = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        items.push({ id: docSnap.id, ...docSnap.data() });
      }
    });

    const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    if (lastDoc) {
      militaresCursorCache.set(`${baseKey}:p${page}`, lastDoc);
    }

    return {
      items,
      lastDoc,
      hasMore: snap.docs.length === safeLimit,
    };
  } catch (err: any) {
    handleFirestoreError(err, OperationType.LIST, "militares");
    return { items: [], lastDoc: null, hasMore: false };
  }
}

/**
 * Busca de documentos da coleção 'militares' no Firestore para agregações consolidadas e exportações sob demanda.
 */
export async function buscarTodosMilitaresFirestore(): Promise<Array<Record<string, any>>> {
  try {
    const colRef = collection(db, "militares");
    const snap = await getDocs(colRef);
    const results: Array<Record<string, any>> = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        results.push({ id: docSnap.id, ...docSnap.data() } as Record<string, any>);
      }
    });
    return results;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.LIST, "militares");
    return [];
  }
}

/**
 * Busca pontual com limite estrito (getDocs + limit(20..30)) diretamente na coleção 'militares'.
 */
export async function buscarMilitaresLimitadosFirestore(
  limiteResultados: number = 20,
  termoBusca?: string
): Promise<Array<Record<string, any>>> {
  const safeLimit = Math.min(30, Math.max(1, limiteResultados));
  try {
    const colRef = collection(db, "militares");
    const snap = await getDocs(query(colRef, limit(safeLimit)));
    const results: Array<Record<string, any>> = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        results.push({ id: docSnap.id, ...docSnap.data() } as Record<string, any>);
      }
    });

    if (termoBusca && termoBusca.trim().length >= 3) {
      const termo = termoBusca.trim();
      const jaContem = results.some(
        (r) =>
          r.matricula?.toLowerCase().includes(termo.toLowerCase()) ||
          r.id === termo
      );
      if (!jaContem) {
        try {
          const directSnap = await getDocs(query(colRef, where("matricula", "==", termo), limit(5)));
          directSnap.forEach((docSnap) => {
            if (docSnap.exists() && !results.some((r) => r.id === docSnap.id)) {
              results.push({ id: docSnap.id, ...docSnap.data() } as Record<string, any>);
            }
          });
        } catch {
          // ignora caso não haja índice composto
        }
      }
    }
    return results;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.LIST, "militares");
    return [];
  }
}

// ============================================================================
// 2. COLEÇÃO `corporacao > dados` — Dados institucionais e tabelas auxiliares
//    (cargos, lotações/UBMs, editais, motivos de desligamento, categorias, config)
// ============================================================================

/**
 * Gravação estrita apenas de dados institucionais e tabelas auxiliares em 'corporacao/dados'
 * (sincronizando também 'corporacao/metadados' para retrocompatibilidade).
 * Jamais armazena 'usuarios', 'militares', 'alteracoes' ou 'situacoes'.
 */
export async function salvarDadosCorporacaoFirestore(partialMeta: Record<string, any>): Promise<boolean> {
  try {
    const { alteracoes, situacoes, militares, usuarios, ...dadosAuxiliares } = partialMeta;
    void alteracoes;
    void situacoes;
    void militares;
    void usuarios;

    const cleanPayload = JSON.parse(
      JSON.stringify({
        ...dadosAuxiliares,
        ultima_atualizacao: new Date().toISOString(),
      })
    );

    const refDados = doc(db, "corporacao", "dados");
    await setDoc(refDados, cleanPayload, { merge: true });

    // Mantém espelhamento em corporacao/metadados para compatibilidade com documentos já provisionados
    try {
      const refMeta = doc(db, "corporacao", "metadados");
      await setDoc(refMeta, cleanPayload, { merge: true });
    } catch {
      // ignora erro secundário de espelhamento
    }
    return true;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.WRITE, "corporacao/dados");
    toast.error("Erro ao salvar dados institucionais no Cloud Firestore.");
    return false;
  }
}

export const salvarMetadadosFirestore = salvarDadosCorporacaoFirestore;

/**
 * Busca pontual (getDoc) dos dados institucionais e tabelas auxiliares em 'corporacao/dados'
 * (com fallback de leitura em 'corporacao/metadados').
 * NUNCA dispara gravações automáticas durante a leitura.
 */
export async function buscarDadosCorporacaoFirestore(): Promise<Record<string, any> | null> {
  try {
    const refDados = doc(db, "corporacao", "dados");
    const snapDados = await getDoc(refDados);
    if (snapDados.exists()) {
      const data = snapDados.data() as Record<string, any>;
      if (data && (data.cargos || data.lotacoes || data.categorias || data.config)) {
        return data;
      }
    }

    const refMeta = doc(db, "corporacao", "metadados");
    const snapMeta = await getDoc(refMeta);
    if (snapMeta.exists()) {
      return snapMeta.data() as Record<string, any>;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.GET, "corporacao/dados");
    return null;
  }
}

export const buscarMetadadosFirestore = buscarDadosCorporacaoFirestore;

// ============================================================================
// 3. COLEÇÃO `usuarios` — Controle exclusivo de permissões e perfis de acesso
// ============================================================================

/**
 * Gravação e atualização direta no documento do usuário em 'usuarios/${usuario.id}'.
 * ÚNICA fonte da verdade para perfis de acesso (ADMIN, GESTOR, CONSULTA).
 */
export async function salvarUsuarioFirestore(usuario: Record<string, any>): Promise<boolean> {
  if (!usuario?.id && !usuario?.email) return false;
  const docId = String(usuario.id || usuario.email.replace(/[^a-zA-Z0-9_-]/g, "_"));
  const path = `usuarios/${docId}`;
  try {
    const ref = doc(db, "usuarios", docId);
    const cleanPayload = JSON.parse(JSON.stringify(usuario));
    delete cleanPayload.senha;
    delete cleanPayload.senha_hash;
    cleanPayload.id = docId;
    if (cleanPayload.email) {
      cleanPayload.email = String(cleanPayload.email).trim().toLowerCase();
    }
    cleanPayload.atualizado_em = new Date().toISOString();
    await setDoc(ref, cleanPayload, { merge: true });
    return true;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.WRITE, path);
    toast.error("Erro ao salvar permissões do usuário no Cloud Firestore.");
    return false;
  }
}

/**
 * Exclusão direta do documento do usuário em 'usuarios/${usuarioId}'.
 */
export async function excluirUsuarioFirestore(usuarioId: string): Promise<boolean> {
  if (!usuarioId) return false;
  const path = `usuarios/${usuarioId}`;
  try {
    const ref = doc(db, "usuarios", String(usuarioId));
    await deleteDoc(ref);
    return true;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.DELETE, path);
    toast.error("Erro ao excluir usuário no Cloud Firestore.");
    return false;
  }
}

/**
 * Busca de todos os usuários diretamente na coleção oficial 'usuarios' do Firestore.
 */
export async function buscarTodosUsuariosFirestore(): Promise<Array<Record<string, any>>> {
  try {
    const colRef = collection(db, "usuarios");
    const snap = await getDocs(colRef);
    const results: Array<Record<string, any>> = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        results.push({ id: docSnap.id, ...docSnap.data() });
      }
    });
    return results;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.LIST, "usuarios");
    return [];
  }
}

/**
 * Busca pontual de um usuário pelo e-mail na coleção 'usuarios' do Firestore.
 */
export async function buscarUsuarioPorEmailFirestore(email: string): Promise<Record<string, any> | null> {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();
  try {
    const colRef = collection(db, "usuarios");
    const qSnap = await getDocs(query(colRef, where("email", "==", cleanEmail), limit(1)));
    if (!qSnap.empty) {
      const d = qSnap.docs[0];
      return { id: d.id, ...d.data() };
    }
    const docId = cleanEmail.replace(/[^a-zA-Z0-9_-]/g, "_");
    const docSnap = await getDoc(doc(db, "usuarios", docId));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.GET, `usuarios?email=${cleanEmail}`);
    return null;
  }
}

// ============================================================================
// 4. COLEÇÃO `auditoria` — Logs individuais com serverTimestamp()
// ============================================================================

export interface RegistroAuditoriaInput {
  entidade: string;
  entidade_id?: string | null;
  matricula?: string | null;
  operacao: string;
  usuario_nome: string;
  usuario_email?: string | null;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  descricao?: string | null;
}

function parseFirestoreTimestamp(val: any, fallbackIso?: string): string {
  if (!val) return fallbackIso || new Date().toISOString();
  if (typeof val === "string") return val;
  if (typeof val?.toDate === "function") {
    try {
      return val.toDate().toISOString();
    } catch {
      // fallback
    }
  }
  if (typeof val?.seconds === "number") {
    return new Date(val.seconds * 1000).toISOString();
  }
  return fallbackIso || new Date().toISOString();
}

function mapDocToAuditoria(id: string, data: Record<string, any>) {
  const isoTime = parseFirestoreTimestamp(data.data_hora, data.timestamp);
  const detalhesObj = data.detalhes && typeof data.detalhes === "object" ? data.detalhes : null;
  const antes = detalhesObj?.antes !== undefined ? detalhesObj.antes : (data.antes ?? null);
  const depois = detalhesObj?.depois !== undefined ? detalhesObj.depois : (data.depois ?? null);

  return {
    id,
    data_hora: isoTime,
    timestamp: isoTime,
    usuario_nome: String(data.usuario_nome || "Sistema"),
    usuario_email: data.usuario_email ? String(data.usuario_email) : null,
    operacao: String(data.operacao || "ALTERACAO"),
    entidade: String(data.entidade || "Sistema"),
    entidade_id: data.entidade_id ? String(data.entidade_id) : null,
    matricula: data.matricula ? String(data.matricula) : null,
    antes: antes && typeof antes === "object" ? antes : null,
    depois: depois && typeof depois === "object" ? depois : null,
    detalhes: {
      antes: antes && typeof antes === "object" ? antes : null,
      depois: depois && typeof depois === "object" ? depois : null,
      descricao: detalhesObj?.descricao || null,
    },
  };
}

/**
 * Registra um evento de auditoria como documento individual na coleção 'auditoria' com serverTimestamp().
 * Jamais acumula arrays em um único documento.
 */
export async function registrarAuditoriaFirestore(
  entry: RegistroAuditoriaInput
): Promise<Record<string, any> | null> {
  const nowIso = new Date().toISOString();
  const cleanAntes = entry.antes ? JSON.parse(JSON.stringify(entry.antes)) : null;
  const cleanDepois = entry.depois ? JSON.parse(JSON.stringify(entry.depois)) : null;

  const payload = {
    data_hora: serverTimestamp(),
    timestamp: nowIso,
    usuario_nome: entry.usuario_nome || "Sistema",
    usuario_email: entry.usuario_email || "",
    operacao: entry.operacao,
    entidade: entry.entidade,
    entidade_id: entry.entidade_id ?? entry.matricula ?? null,
    matricula: entry.matricula ?? null,
    detalhes: {
      antes: cleanAntes,
      depois: cleanDepois,
      ...(entry.descricao ? { descricao: entry.descricao } : {}),
    },
  };

  try {
    const docRef = await addDoc(collection(db, "auditoria"), payload);
    return mapDocToAuditoria(docRef.id, { ...payload, data_hora: nowIso });
  } catch (err: any) {
    handleFirestoreError(err, OperationType.CREATE, "auditoria");
    return null;
  }
}

// Cache de último documento da auditoria para paginação por cursor (startAfter)
let lastAuditoriaCursor: QueryDocumentSnapshot<DocumentData> | null = null;
let lastAuditoriaLimit = 0;

/**
 * Leitura centralizada e econômica da coleção 'auditoria' ordenada por 'data_hora' desc
 * com limite estrito (30 ou 50) e suporte a paginação por cursor (`startAfter`).
 */
export async function buscarAuditoriaFirestore(
  limiteResultados: number = 30,
  usarCursor: boolean = false
): Promise<Array<ReturnType<typeof mapDocToAuditoria>>> {
  const safeLimit = Math.min(150, Math.max(1, limiteResultados));
  try {
    const colRef = collection(db, "auditoria");
    const q =
      usarCursor && lastAuditoriaCursor && safeLimit > lastAuditoriaLimit
        ? query(colRef, orderBy("data_hora", "desc"), startAfter(lastAuditoriaCursor), limit(30))
        : query(colRef, orderBy("data_hora", "desc"), limit(safeLimit));

    const snap = await getDocs(q);
    if (snap.docs.length > 0) {
      lastAuditoriaCursor = snap.docs[snap.docs.length - 1];
      lastAuditoriaLimit = safeLimit;
    }

    const items: Array<ReturnType<typeof mapDocToAuditoria>> = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        items.push(mapDocToAuditoria(docSnap.id, docSnap.data()));
      }
    });
    items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    return items;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.LIST, "auditoria");
    try {
      const colRef = collection(db, "auditoria");
      const snap = await getDocs(query(colRef, limit(safeLimit)));
      const items: Array<ReturnType<typeof mapDocToAuditoria>> = [];
      snap.forEach((docSnap) => {
        if (docSnap.exists()) {
          items.push(mapDocToAuditoria(docSnap.id, docSnap.data()));
        }
      });
      items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
      return items;
    } catch {
      return [];
    }
  }
}

/**
 * Busca econômica de eventos de auditoria referentes a um militar/entidade específica (limite estrito 30).
 */
export async function buscarAuditoriaPorEntidadeFirestore(
  entidadeId: string,
  matricula?: string | null,
  limiteResultados: number = 30
): Promise<Array<ReturnType<typeof mapDocToAuditoria>>> {
  const safeLimit = Math.min(50, Math.max(1, limiteResultados));
  try {
    const colRef = collection(db, "auditoria");
    if (entidadeId) {
      try {
        const snap = await getDocs(query(colRef, where("entidade_id", "==", entidadeId), limit(safeLimit)));
        if (!snap.empty) {
          const items: Array<ReturnType<typeof mapDocToAuditoria>> = [];
          snap.forEach((docSnap) => {
            if (docSnap.exists()) {
              items.push(mapDocToAuditoria(docSnap.id, docSnap.data()));
            }
          });
          items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
          return items;
        }
      } catch {
        // fallback para busca recente
      }
    }
    const recentes = await buscarAuditoriaFirestore(safeLimit);
    return recentes.filter(
      (a) =>
        (entidadeId && a.entidade_id === entidadeId) ||
        (matricula && a.matricula === matricula) ||
        (matricula && a.entidade_id === matricula)
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `auditoria?entidade_id=${entidadeId}`);
    return [];
  }
}
