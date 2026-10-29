import { QueryClient } from "@tanstack/react-query";

// Exported so lib/session can wipe it at session boundaries — cached data outlives logout.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 10 * 60 * 1000, // 10 minutos (entre 5 e 15 min): proteção de cotas de leitura do Firestore
      gcTime: 15 * 60 * 1000,
      retry: 1,
    },
  },
});
