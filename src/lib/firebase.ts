import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  setDoc,
  addDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  serverTimestamp,
  type Firestore,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { toast } from "sonner";
import firebaseConfig from "../../firebase-applet-config.json";

// 1. Instância dedicada e isolada para o Cloud Firestore com persistência local IndexedDB multi-abas
const existingFirestoreApp = getApps().find((a) => a.name === "cbmmt-firestore");
const firestoreApp = existingFirestoreApp || initializeApp(firebaseConfig, "cbmmt-firestore");

let dbInstance: Firestore;

if (typeof window !== "undefined") {
  try {
    dbInstance = initializeFirestore(
      firestoreApp,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    // Em HMR ou se o IndexedDB estiver indisponível no navegador, reaproveita instância existente
    dbInstance = getFirestore(firestoreApp, firebaseConfig.firestoreDatabaseId);
  }
} else {
  dbInstance = getFirestore(firestoreApp, firebaseConfig.firestoreDatabaseId);
}

export const db = dbInstance;

const DELTA_TS_STORAGE_KEY = `cbmmt_militares_delta_ts_${firebaseConfig.firestoreDatabaseId}`;

function readMilitaresDeltaTs(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DELTA_TS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeMilitaresDeltaTs(ts: string): void {
  if (typeof window === "undefined" || !ts) return;
  try {
    const current = window.localStorage.getItem(DELTA_TS_STORAGE_KEY);
    if (!current || ts > current) {
      window.localStorage.setItem(DELTA_TS_STORAGE_KEY, ts);
    }
  } catch {
    // ignora restrições de storage
  }
}

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

function maskEmailForLog(email?: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const prefix = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***`;
  return `${prefix}@${domain}`;
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
      email: maskEmailForLog(auth.currentUser?.email),
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: maskEmailForLog(provider.email),
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error:", JSON.stringify({
    operationType: errInfo.operationType,
    path: errInfo.path,
    authenticated: Boolean(errInfo.authInfo.userId),
    error: errInfo.error,
  }));
  if (rethrow) {
    throw new Error(JSON.stringify(errInfo));
  }
  return errInfo;
}

// Validação de conectividade inicial com o Cloud Firestore (e reaproveitamento da leitura inicial)
let bootDadosPromise: Promise<Record<string, any> | null> | null = null;
let bootDadosConsumed = false;

if (typeof window !== "undefined") {
  bootDadosPromise = (async function validateFirestoreConnection() {
    try {
      const snap = await getDocFromServer(doc(db, "corporacao", "dados"));
      if (snap.exists()) {
        const data = snap.data() as Record<string, any>;
        if (data && (data.cargos || data.lotacoes || data.categorias || data.config)) {
          return data;
        }
      }
      return null;
    } catch (error) {
      if (error instanceof Error && error.message.includes("the client is offline")) {
        console.error("Please check your Firebase configuration.");
      }
      return null;
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
 * Gravação granular direta em lote (writeBatch) na coleção 'militares' para importações em massa.
 */
export async function salvarMilitaresEmLoteFirestore(
  militares: Array<Record<string, any>>
): Promise<{ ok: boolean; count: number }> {
  if (!Array.isArray(militares) || militares.length === 0) return { ok: true, count: 0 };
  const CHUNK_SIZE = 400;
  let savedCount = 0;
  try {
    for (let i = 0; i < militares.length; i += CHUNK_SIZE) {
      const chunk = militares.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const militar of chunk) {
        if (!militar?.id) continue;
        const ref = doc(db, "militares", String(militar.id));
        const cleanPayload = JSON.parse(JSON.stringify(militar));
        cleanPayload.atualizado_em = cleanPayload.atualizado_em || new Date().toISOString();
        cleanPayload.data_desligamento = cleanPayload.data_desligamento ?? null;
        cleanPayload.doe_incorporacao = cleanPayload.doe_incorporacao ?? null;
        cleanPayload.observacoes = cleanPayload.observacoes ?? null;
        batch.set(ref, cleanPayload, { merge: true });
        savedCount++;
      }
      await batch.commit();
    }
    return { ok: true, count: savedCount };
  } catch (err: any) {
    handleFirestoreError(err, OperationType.WRITE, "militares/batch");
    toast.error("Erro ao gravar lote de militares no Cloud Firestore.");
    return { ok: false, count: savedCount };
  }
}

/**
 * Verificação pontual no Firestore se já existe militar com a mesma matrícula (concorrência multiusuário).
 * Consome no máximo 1 leitura de rede quando há registro correspondente.
 */
export async function verificarMatriculaFirestore(
  matricula: string,
  excluirId?: string | null
): Promise<Record<string, any> | null> {
  const trimmed = String(matricula || "").trim();
  if (!trimmed) return null;
  const upperNoSpace = trimmed.replace(/\s+/g, "").toUpperCase();
  const variants = Array.from(new Set([trimmed, trimmed.toUpperCase(), upperNoSpace])).filter(Boolean);
  try {
    const colRef = collection(db, "militares");
    const q = query(colRef, where("matricula", "in", variants.slice(0, 10)), limit(5));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      if (!excluirId || d.id !== excluirId) {
        return { id: d.id, ...d.data() } as Record<string, any>;
      }
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.GET, `militares?matricula=${trimmed}`);
    return null;
  }
}

/**
 * Busca pontual (cache IndexedDB primeiro, fallback servidor) no documento 'militares/${militarId}'.
 * NUNCA dispara escrita automática.
 */
export async function buscarMilitarFirestore(
  militarId: string,
  forceServer = false
): Promise<Record<string, any> | null> {
  if (!militarId) return null;
  const path = `militares/${militarId}`;
  const ref = doc(db, "militares", String(militarId));
  try {
    if (!forceServer && typeof window !== "undefined") {
      try {
        const cached = await getDocFromCache(ref);
        if (cached.exists()) {
          return { id: cached.id, ...cached.data() } as Record<string, any>;
        }
      } catch {
        // Documento ainda não está no cache local; busca na rede/cache padrão
      }
    }
    const snap = forceServer ? await getDocFromServer(ref) : await getDoc(ref);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Record<string, any>;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

/**
 * Busca otimizada da coleção 'militares':
 * 1) Quando !forceServer e há cache local IndexedDB + timestamp delta, lê tudo do IndexedDB (0 leituras de rede)
 *    e consulta na rede apenas documentos com `atualizado_em > lastDeltaTs`.
 * 2) Em força bruta (botão "Sincronizar Firestore") ou primeiro acesso no dispositivo, lê da rede e atualiza o marcador delta.
 */
export async function buscarTodosMilitaresFirestore(
  forceServer = false
): Promise<Array<Record<string, any>>> {
  const colRef = collection(db, "militares");
  try {
    if (!forceServer && typeof window !== "undefined") {
      const lastDeltaTs = readMilitaresDeltaTs();
      if (lastDeltaTs) {
        try {
          const cacheSnap = await getDocsFromCache(colRef);
          if (!cacheSnap.empty) {
            const docMap = new Map<string, Record<string, any>>();
            let maxTs = lastDeltaTs;
            cacheSnap.forEach((docSnap) => {
              if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() } as Record<string, any>;
                docMap.set(docSnap.id, data);
                if (typeof data.atualizado_em === "string" && data.atualizado_em > maxTs) {
                  maxTs = data.atualizado_em;
                }
              }
            });

            // Busca incremental apenas dos documentos alterados/inseridos desde o último sync
            try {
              const deltaQuery = query(colRef, where("atualizado_em", ">", lastDeltaTs));
              const deltaSnap = await getDocs(deltaQuery);
              deltaSnap.forEach((docSnap) => {
                if (docSnap.exists()) {
                  const data = { id: docSnap.id, ...docSnap.data() } as Record<string, any>;
                  docMap.set(docSnap.id, data);
                  if (typeof data.atualizado_em === "string" && data.atualizado_em > maxTs) {
                    maxTs = data.atualizado_em;
                  }
                }
              });
            } catch {
              // Se offline ou falha momentânea na delta query, retorna o cache IndexedDB integralmente
            }

            if (maxTs) writeMilitaresDeltaTs(maxTs);
            return Array.from(docMap.values());
          }
        } catch {
          // Cache IndexedDB vazio ou indisponível; segue para leitura completa abaixo
        }
      }
    }

    let snap;
    if (forceServer) {
      try {
        snap = await getDocsFromServer(colRef);
      } catch {
        snap = await getDocs(colRef);
      }
    } else {
      snap = await getDocs(colRef);
    }

    const results: Array<Record<string, any>> = [];
    let maxTs = "";
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as Record<string, any>;
        results.push(data);
        if (typeof data.atualizado_em === "string" && data.atualizado_em > maxTs) {
          maxTs = data.atualizado_em;
        }
      }
    });
    if (maxTs) {
      writeMilitaresDeltaTs(maxTs);
    } else if (results.length > 0) {
      writeMilitaresDeltaTs(new Date().toISOString());
    }
    return results;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.LIST, "militares");
    return [];
  }
}

export interface MilitaresRealtimeCallbacks {
  onUpsert: (docs: Array<Record<string, any>>) => void;
  onNewMilitar: (docData: Record<string, any>) => void;
}

/**
 * Listener econômico em tempo real (apenas os 20 registros mais recentes por `atualizado_em desc`).
 * Mantém todos os usuários logados sincronizados instantaneamente via Firestore Snapshots e
 * dispara a notificação (Toast/pop-up) sempre que um novo militar for registrado no sistema.
 */
export function inscreverAtualizacoesMilitaresFirestore(
  callbacks: MilitaresRealtimeCallbacks
): () => void {
  const colRef = collection(db, "militares");
  const q = query(colRef, orderBy("atualizado_em", "desc"), limit(20));
  const watcherArmedAtMs = Date.now();
  const seenBaselineIds = new Set<string>();
  const notifiedIds = new Set<string>();
  let baselineProcessed = false;

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      if (!baselineProcessed) {
        const initialDocs: Array<Record<string, any>> = [];
        let maxTs = "";
        snapshot.forEach((docSnap) => {
          if (docSnap.exists()) {
            seenBaselineIds.add(docSnap.id);
            const data = { id: docSnap.id, ...docSnap.data() } as Record<string, any>;
            initialDocs.push(data);
            if (typeof data.atualizado_em === "string" && data.atualizado_em > maxTs) {
              maxTs = data.atualizado_em;
            }
          }
        });
        baselineProcessed = true;
        if (initialDocs.length > 0) {
          callbacks.onUpsert(initialDocs);
          if (maxTs && readMilitaresDeltaTs()) {
            writeMilitaresDeltaTs(maxTs);
          }
        }
        return;
      }

      const upserts: Array<Record<string, any>> = [];
      let maxTs = "";

      for (const change of snapshot.docChanges()) {
        if (change.type === "removed") {
          // Não remover da lista local quando um registro sai da janela top-20
          continue;
        }
        const docSnap = change.doc;
        if (!docSnap.exists()) continue;
        const data = { id: docSnap.id, ...docSnap.data() } as Record<string, any>;
        upserts.push(data);

        if (typeof data.atualizado_em === "string" && data.atualizado_em > maxTs) {
          maxTs = data.atualizado_em;
        }

        if (
          change.type === "added" &&
          !seenBaselineIds.has(docSnap.id) &&
          !notifiedIds.has(docSnap.id)
        ) {
          seenBaselineIds.add(docSnap.id);
          const criadoEmMs = typeof data.criado_em === "string" ? Date.parse(data.criado_em) : NaN;
          const isRecentCreation = !isNaN(criadoEmMs) && criadoEmMs >= watcherArmedAtMs - 120_000;

          if (isRecentCreation) {
            notifiedIds.add(docSnap.id);
            callbacks.onNewMilitar(data);
          }
        }
      }

      if (upserts.length > 0) {
        callbacks.onUpsert(upserts);
        if (maxTs && readMilitaresDeltaTs()) {
          writeMilitaresDeltaTs(maxTs);
        }
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, "militares/realtime", false);
    }
  );

  return unsubscribe;
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
    bootDadosConsumed = true;
    bootDadosPromise = null;

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

/**
 * Busca pontual (cache IndexedDB primeiro quando !forceServer) dos dados institucionais
 * em 'corporacao/dados' (reaproveitando o snapshot inicial e com fallback em 'corporacao/metadados').
 * NUNCA dispara gravações automáticas durante a leitura.
 */
export async function buscarDadosCorporacaoFirestore(
  forceServer = false
): Promise<Record<string, any> | null> {
  try {
    if (!forceServer && !bootDadosConsumed && bootDadosPromise) {
      bootDadosConsumed = true;
      const bootData = await bootDadosPromise;
      if (bootData) {
        return bootData;
      }
    }

    const refDados = doc(db, "corporacao", "dados");
    if (!forceServer && typeof window !== "undefined") {
      try {
        const cachedDados = await getDocFromCache(refDados);
        if (cachedDados.exists()) {
          const data = cachedDados.data() as Record<string, any>;
          if (data && (data.cargos || data.lotacoes || data.categorias || data.config)) {
            return data;
          }
        }
      } catch {
        // Sem cache local; segue para rede
      }
    }

    const snapDados = forceServer ? await getDocFromServer(refDados) : await getDoc(refDados);
    if (snapDados.exists()) {
      const data = snapDados.data() as Record<string, any>;
      if (data && (data.cargos || data.lotacoes || data.categorias || data.config)) {
        return data;
      }
    }

    const refMeta = doc(db, "corporacao", "metadados");
    if (!forceServer && typeof window !== "undefined") {
      try {
        const cachedMeta = await getDocFromCache(refMeta);
        if (cachedMeta.exists()) {
          return cachedMeta.data() as Record<string, any>;
        }
      } catch {
        // Sem cache local
      }
    }
    const snapMeta = forceServer ? await getDocFromServer(refMeta) : await getDoc(refMeta);
    if (snapMeta.exists()) {
      return snapMeta.data() as Record<string, any>;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.GET, "corporacao/dados");
    return null;
  }
}

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
    recentAuditoriaFallbackCache = null;
    return mapDocToAuditoria(docRef.id, { ...payload, data_hora: nowIso });
  } catch (err: any) {
    handleFirestoreError(err, OperationType.CREATE, "auditoria");
    return null;
  }
}

// Cache de último documento da auditoria para paginação por cursor (startAfter)
let lastAuditoriaCursor: QueryDocumentSnapshot<DocumentData> | null = null;
let lastAuditoriaLimit = 0;

// Cache curto (60s) para fallback de auditoria por entidade, invalidado em cada nova gravação
let recentAuditoriaFallbackCache: {
  ts: number;
  items: Array<ReturnType<typeof mapDocToAuditoria>>;
} | null = null;

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
        // fallback para busca por matrícula ou recentes
      }
    }

    if (matricula) {
      try {
        const snapMat = await getDocs(query(colRef, where("matricula", "==", matricula), limit(safeLimit)));
        if (!snapMat.empty) {
          const items: Array<ReturnType<typeof mapDocToAuditoria>> = [];
          snapMat.forEach((docSnap) => {
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

    const now = Date.now();
    const recentes =
      recentAuditoriaFallbackCache && now - recentAuditoriaFallbackCache.ts < 60_000
        ? recentAuditoriaFallbackCache.items
        : await buscarAuditoriaFirestore(safeLimit);

    if (!recentAuditoriaFallbackCache || now - recentAuditoriaFallbackCache.ts >= 60_000) {
      recentAuditoriaFallbackCache = { ts: now, items: recentes };
    }

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

/**
 * Exclui um ou mais documentos da coleção 'auditoria' no Cloud Firestore.
 */
export async function excluirAuditoriaFirestore(auditIds: string[]): Promise<boolean> {
  const cleanIds = Array.from(new Set(auditIds.map((id) => String(id || "").trim()).filter(Boolean)));
  if (cleanIds.length === 0) return false;

  const targetPath = cleanIds.length === 1 ? `auditoria/${cleanIds[0]}` : "auditoria";
  try {
    if (cleanIds.length === 1) {
      await deleteDoc(doc(db, "auditoria", cleanIds[0]));
    } else {
      const CHUNK = 450;
      for (let i = 0; i < cleanIds.length; i += CHUNK) {
        const batch = writeBatch(db);
        cleanIds.slice(i, i + CHUNK).forEach((auditId) => {
          batch.delete(doc(db, "auditoria", auditId));
        });
        await batch.commit();
      }
    }
    recentAuditoriaFallbackCache = null;
    lastAuditoriaCursor = null;
    lastAuditoriaLimit = 0;
    return true;
  } catch (err: any) {
    handleFirestoreError(err, OperationType.DELETE, targetPath);
    return false;
  }
}
