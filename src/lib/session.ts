import { queryClient } from "./queryClient";
import { apiPost } from "./api";
import { logoutFirebase } from "./firebase";

// Call after every successful login/signup.
export function beginSession(): void {
  queryClient.clear();
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

