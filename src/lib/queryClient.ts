import { QueryClient } from "@tanstack/react-query";

// Exported so lib/session can wipe it at session boundaries — cached data outlives logout.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 1000 * 15, // 15 segundos para manter sincronização ágil entre múltiplos administradores
    },
  },
});
