import { Component, type ErrorInfo, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { SystemEntryProvider } from "@/components/SystemEntrySplash";
import Configuracoes from "@/pages/Configuracoes";
import Dashboard from "@/pages/Dashboard";
import Desligamentos from "@/pages/Desligamentos";
import Importacao from "@/pages/Importacao";
import Login from "@/pages/Login";
import MilitarDetalhe from "@/pages/MilitarDetalhe";
import MilitarForm from "@/pages/MilitarForm";
import Relatorios from "@/pages/Relatorios";
import Temporarios from "@/pages/Temporarios";

interface ErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro inesperado na interface:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0B111A] p-6 text-slate-100">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-[#1E2C42] bg-[#121B28] p-6 text-center shadow-2xl">
            <h2 className="font-heading text-xl font-bold text-white">Algo deu errado ao exibir esta tela</h2>
            <p className="text-sm text-slate-400">
              Recarregue a página ou retorne para a tela inicial para continuar utilizando o sistema.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false })}
                className="rounded-lg border border-[#24344D] bg-[#182335] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-[#1E2C42] cursor-pointer"
              >
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/";
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
              >
                Voltar ao início
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <AppErrorBoundary>
      <SystemEntryProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/temporarios" element={<Temporarios />} />
            <Route path="/quadro/:categoria" element={<Temporarios />} />
            <Route path="/temporarios/novo" element={<MilitarForm />} />
            <Route path="/temporarios/:id" element={<MilitarDetalhe />} />
            <Route path="/temporarios/:id/editar" element={<MilitarForm />} />
            <Route path="/desligamentos" element={<Desligamentos />} />
            <Route path="/importacao" element={<Importacao />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/auditoria" element={<Navigate to="/configuracoes?tab=auditoria" replace />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SystemEntryProvider>
    </AppErrorBoundary>
  );
}
