import { QueryClient } from "@tanstack/react-query";

// Exported so lib/session can wipe it at session boundaries — cached data outlives logout.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Impede novas leituras no Firestore ao alternar abas do navegador
      refetchOnReconnect: false,
      staleTime: 15 * 60 * 1000, // 15 minutos: preserva dados em cache ao navegar entre abas do menu
      gcTime: 30 * 60 * 1000, // Mantém registros em memória por 30 minutos
      retry: 1,
    },
  },
});

