import { queryClient } from "./queryClient";
import { apiPost } from "./api";
import { logoutFirebase } from "./firebase";

import { sincronizarMilitaresComFirestore, carregarMetadadosInstitucionaisFirestore } from "./mockBackend";

// Call after every successful login/signup.
export async function beginSession(): Promise<void> {
  queryClient.clear();
  try {
    await sincronizarMilitaresComFirestore(true);
    await carregarMetadadosInstitucionaisFirestore(true);
  } catch (e) {
    console.warn("Session begin sync error", e);
  }
}

// Call from every sign-out control; the hard redirect resets all in-memory state.
export async function endSession(redirectTo: string = "/login"): Promise<void> {
  try {
    await apiPost("/auth/logout");
  } catch (e) {
    console.warn("api logout error", e);
  }
  try {
    await logoutFirebase();
  } catch (e) {
    console.warn("firebase logout error", e);
  } finally {
    queryClient.clear();
    window.location.href = redirectTo;
  }
}

