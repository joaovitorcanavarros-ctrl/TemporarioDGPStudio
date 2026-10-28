import { initializeApp, getApps, getApp } from "firebase/app";
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
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  limit,
  where,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// 1. Instância dedicada e isolada para o Firestore (sem provider de Auth acoplado).
// Isso impede que erros no serviço de token de autenticação (securetoken.googleapis.com)
// bloqueiem a conexão do Firestore ou forcem o cliente para modo offline.
const existingFirestoreApp = getApps().find((a) => a.name === "cbmmt-firestore");
const firestoreApp = existingFirestoreApp || initializeApp(firebaseConfig, "cbmmt-firestore");
export const db = getFirestore(firestoreApp, firebaseConfig.firestoreDatabaseId);

// 2. Instância padrão para serviços de autenticação do Firebase
const existingDefaultApp = getApps().find((a) => a.name === "[DEFAULT]");
const defaultApp = existingDefaultApp || initializeApp(firebaseConfig);
export const auth = getAuth(defaultApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Limpa tokens expirados ou residuais no navegador para evitar erros contínuos de token-service
if (typeof window !== "undefined") {
  try {
    auth.onIdTokenChanged(async (user) => {
      if (user) {
        try {
          await user.getIdToken();
        } catch (err: any) {
          if (err?.message?.includes("token-service") || err?.message?.includes("securetoken")) {
            console.warn("[Auth] Token expirado ou serviço de token indisponível no projeto; limpando sessão residual.");
            void firebaseSignOut(auth).catch(() => {});
          }
        }
      }
    });
  } catch (_) {}
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
  const res = await createUserWithEmailAndPassword(auth, email, pass);
  await updateProfile(res.user, { displayName: nome });
  return res.user;
}

export async function loginWithFirebaseEmail(email: string, pass: string): Promise<User> {
  const res = await signInWithEmailAndPassword(auth, email, pass);
  return res.user;
}

/**
 * Gravação granular direta no documento do militar dentro da coleção 'militares' (ex: militares/${militar.id}).
 * Executada EXCLUSIVAMENTE quando o administrador clica em Salvar / Atualizar / Confirmar.
 * NÃO altera a coleção corporacao nem o documento metadados.
 */
export async function salvarMilitarFirestore(militar: Record<string, any>): Promise<boolean> {
  if (!militar?.id) return false;
  try {
    const ref = doc(db, "militares", String(militar.id));
    const cleanPayload = JSON.parse(JSON.stringify(militar));
    cleanPayload.atualizado_em = cleanPayload.atualizado_em || new Date().toISOString();
    await setDoc(ref, cleanPayload, { merge: true });
    return true;
  } catch (err: any) {
    console.warn(`[Firestore] Aviso ao gravar militar em militares/${militar.id}:`, err?.code || err?.message);
    return false;
  }
}

/**
 * Exclusão direta e definitiva do documento do militar em 'militares/${militarId}' no Firestore.
 */
export async function excluirMilitarFirestore(militarId: string): Promise<boolean> {
  if (!militarId) return false;
  try {
    const ref = doc(db, "militares", String(militarId));
    await deleteDoc(ref);
    return true;
  } catch (err: any) {
    console.warn(`[Firestore] Aviso ao excluir militar em militares/${militarId}:`, err?.code || err?.message);
    return false;
  }
}

/**
 * Busca pontual de TODOS os documentos da coleção 'militares' no Firestore.
 * Utilizada pelo Painel de Visão Geral (Dashboard) e pela gestão de efetivo
 * para garantir que os totais, gráficos e vencimentos de contratos reflitam
 * os dados oficiais e reais da base, sincronizados entre todos os administradores.
 */
export async function buscarTodosMilitaresFirestore(): Promise<Array<Record<string, any>>> {
  try {
    const colRef = collection(db, "militares");
    const snap = await getDocs(colRef);
    const results: Array<Record<string, any>> = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        results.push(docSnap.data() as Record<string, any>);
      }
    });
    return results;
  } catch (err: any) {
    console.warn("[Firestore] Aviso ao buscar todos os militares da coleção 'militares':", err?.code || err?.message);
    return [];
  }
}

/**
 * Busca pontual (getDoc) diretamente no documento do militar em 'militares/${militarId}'.
 * Lê diretamente da coleção 'militares', sem carregar metadados e sem disparar escrita automática.
 */
export async function buscarMilitarFirestore(militarId: string): Promise<Record<string, any> | null> {
  if (!militarId) return null;
  try {
    const ref = doc(db, "militares", String(militarId));
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as Record<string, any>;
    }
    return null;
  } catch (err: any) {
    console.warn(`[Firestore] Aviso ao buscar militar pontualmente em militares/${militarId}:`, err?.code || err?.message);
    return null;
  }
}

/**
 * Busca pontual com limite estrito (getDocs + limit) DIRETAMENTE na coleção 'militares'.
 * Lê diretamente os documentos de 'militares' sem depender de carregar metadados a todo momento.
 */
export async function buscarMilitaresLimitadosFirestore(
  limiteResultados: number = 30,
  termoBusca?: string
): Promise<Array<Record<string, any>>> {
  const safeLimit = Math.min(50, Math.max(1, limiteResultados));
  try {
    const colRef = collection(db, "militares");
    const snap = await getDocs(query(colRef, limit(safeLimit)));
    const results: Array<Record<string, any>> = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        results.push(docSnap.data() as Record<string, any>);
      }
    });

    // Se houver busca pontual por matrícula específica não contemplada nos primeiros registros, busca diretamente
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
              results.push(docSnap.data() as Record<string, any>);
            }
          });
        } catch (_) {
          // ignora caso não haja índice específico para where composto
        }
      }
    }
    return results;
  } catch (err: any) {
    console.warn("[Firestore] Aviso ao listar diretamente da coleção 'militares':", err?.code || err?.message);
    return [];
  }
}

/**
 * Gravação estrita apenas de dados institucionais fixos ou contadores gerais em 'corporacao/metadados'.
 * Mantida estritamente para dados institucionais (config, catálogos, usuários),
 * NUNCA gravando arrays/históricos de alterações a cada clique de edição de militar.
 */
export async function salvarMetadadosFirestore(partialMeta: Record<string, any>): Promise<boolean> {
  try {
    const ref = doc(db, "corporacao", "metadados");
    // Garante remoção rigorosa de alteracoes, situacoes ou militares
    const { alteracoes, situacoes, militares, ...dadosInstitucionaisFixos } = partialMeta;
    const cleanPayload = JSON.parse(JSON.stringify({
      ...dadosInstitucionaisFixos,
      ultima_atualizacao: new Date().toISOString(),
    }));
    await setDoc(ref, cleanPayload, { merge: true });
    return true;
  } catch (err: any) {
    console.warn("[Firestore] Aviso ao gravar metadados institucionais:", err?.code || err?.message);
    return false;
  }
}

/**
 * Busca pontual (getDoc) dos metadados corporativos institucionais fixos (catálogos, usuários, configurações).
 * Usada exclusivamente na gestão institucional, nunca nas listagens rotineiras de militares.
 */
export async function buscarMetadadosFirestore(): Promise<Record<string, any> | null> {
  try {
    const ref = doc(db, "corporacao", "metadados");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as Record<string, any>;
    }
    return null;
  } catch (err: any) {
    console.warn("[Firestore] Aviso ao buscar metadados institucionais:", err?.code || err?.message);
    return null;
  }
}
