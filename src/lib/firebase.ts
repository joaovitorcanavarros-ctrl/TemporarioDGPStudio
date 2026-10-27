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
  collection,
  query,
  limit,
  where,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function loginWithGoogle(): Promise<{ user: User; email: string; name: string }> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  return {
    user,
    email: user.email || "",
    name: user.displayName || user.email?.split("@")[0] || "Usuário Google",
  };
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
 * Gravação granular de um único militar no Firestore (~400 bytes = 1 unidade de escrita).
 * Chamada EXCLUSIVAMENTE quando o administrador clica em Salvar / Atualizar / Confirmar.
 */
export async function salvarMilitarFirestore(militar: Record<string, any>): Promise<boolean> {
  if (!militar?.id) return false;
  try {
    const ref = doc(db, "militares", String(militar.id));
    const cleanPayload = JSON.parse(JSON.stringify(militar));
    await setDoc(ref, cleanPayload, { merge: true });
    return true;
  } catch (err: any) {
    console.warn("[Firestore] Aviso ao gravar militar individual:", err?.code || err?.message);
    return false;
  }
}

/**
 * Busca pontual (getDoc) de um único militar quando sua ficha/cadastro é aberta.
 * Nunca dispara escrita automática após a leitura.
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
    console.warn("[Firestore] Aviso ao buscar militar pontualmente:", err?.code || err?.message);
    return null;
  }
}

/**
 * Busca pontual com limite estrito (getDocs + limit) de militares alterados/adicionados na nuvem.
 * Evita ler toda a base de uma vez só e não mantém listener onSnapshot ativo.
 */
export async function buscarMilitaresLimitadosFirestore(
  limiteResultados: number = 30,
  matriculaExata?: string
): Promise<Array<Record<string, any>>> {
  const safeLimit = Math.min(50, Math.max(1, limiteResultados));
  try {
    const colRef = collection(db, "militares");
    const q = matriculaExata
      ? query(colRef, where("matricula", "==", matriculaExata), limit(5))
      : query(colRef, limit(safeLimit));
    const snap = await getDocs(q);
    const results: Array<Record<string, any>> = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        results.push(docSnap.data() as Record<string, any>);
      }
    });
    return results;
  } catch (err: any) {
    console.warn("[Firestore] Aviso ao listar militares com limite:", err?.code || err?.message);
    return [];
  }
}

/**
 * Gravação leve apenas de metadados/catálogos/usuários alterados (~1-2 KB).
 * Chamada EXCLUSIVAMENTE após ação explícita de salvar configurações, catálogos ou usuários.
 */
export async function salvarMetadadosFirestore(partialMeta: Record<string, any>): Promise<boolean> {
  try {
    const ref = doc(db, "corporacao", "metadados");
    const cleanPayload = JSON.parse(JSON.stringify({
      ...partialMeta,
      ultima_atualizacao: new Date().toISOString(),
    }));
    await setDoc(ref, cleanPayload, { merge: true });
    return true;
  } catch (err: any) {
    console.warn("[Firestore] Aviso ao gravar metadados:", err?.code || err?.message);
    return false;
  }
}

/**
 * Busca pontual (getDoc) dos metadados corporativos leves (catálogos, usuários, configurações).
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
    console.warn("[Firestore] Aviso ao buscar metadados:", err?.code || err?.message);
    return null;
  }
}
