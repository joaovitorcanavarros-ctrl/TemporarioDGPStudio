import { useState } from "react";
import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { LogOut, Menu, UserPlus } from "lucide-react";

import GlassySidebar from "@/components/GlassySidebar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { FiltersProvider } from "@/lib/filters";
import { PERFIL_LABEL, podeEditar, useCatalogos, useMe, useMeta } from "@/lib/hooks";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const FALLBACK_CATS = [
  { codigo: "AUXILIAR", nome: "Auxiliares" },
  { codigo: "CONDUTOR", nome: "Condutores" },
  { codigo: "TEC_ENFERMAGEM", nome: "Técnicos de Enfermagem" },
  { codigo: "ENFERMEIRO", nome: "Enfermeiros" },
  { codigo: "MEDICO", nome: "Médicos" },
];

export default function AppShell() {
  const me = useMe();
  const meta = useMeta();
  const cat = useCatalogos();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B111A]">
        <div className="flex flex-col items-center gap-3">
          <img src="/cbmmt-logo.png" alt="CBMMT" className="size-12 animate-pulse drop-shadow-[0_4px_10px_rgba(220,38,38,0.35)]" />
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Carregando sistema...</p>
        </div>
      </div>
    );
  }

  if (me.isError || (me.error instanceof ApiError && me.error.status === 401) || !me.data) {
    return <Navigate to="/login" replace />;
  }

  const user = me.data;
  const cats = (cat.data?.categorias.filter((c) => c.ativo) ?? FALLBACK_CATS) as {
    codigo: string;
    nome: string;
  }[];

  return (
    <FiltersProvider>
      <div className="min-h-screen bg-[#0B111A]">
        {/* Barra Lateral Flutuante Glassmorphism (Glassy SideBar V5) */}
        <GlassySidebar
          isExpanded={!collapsed}
          onToggleExpand={(exp) => setCollapsed(!exp)}
          user={user}
          categorias={cats}
          onLogout={() => void endSession()}
        />

        {/* Menu Mobile em Gaveta */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[292px] border-white/10 bg-transparent p-0 shadow-none">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <GlassySidebar
              mobileMode
              isExpanded
              user={user}
              categorias={cats}
              onLogout={() => void endSession()}
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div
          className={cn(
            "transition-[padding] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            collapsed ? "lg:pl-[104px]" : "lg:pl-[312px]"
          )}
        >
          <header className="sticky top-0 z-20 border-b border-[#162234] bg-[#101928]/85 backdrop-blur-md">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} data-testid="mobile-menu-button">
                <Menu className="size-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-heading text-sm font-bold text-white sm:text-base" data-testid="system-title">
                  Gerenciamento de Bombeiros Militares Temporários
                </h1>
                <p className="truncate text-[11px] text-slate-400" data-testid="last-update">
                  Corpo de Bombeiros Militar de Mato Grosso · Hoje {fmtDate(meta.data?.data_hoje)} · Última atualização:{" "}
                  <span className="num text-slate-300">{fmtDateTime(meta.data?.ultima_atualizacao)}</span>
                </p>
              </div>
              {podeEditar(user) && (
                <Link to="/temporarios/novo" className={cn(buttonVariants({ size: "sm" }), "hidden bg-blue-600 hover:bg-blue-700 sm:inline-flex")} data-testid="header-new-button">
                  <UserPlus className="size-4" /> Novo cadastro
                </Link>
              )}
              <div className="hidden text-right md:block" data-testid="user-identification">
                <p className="text-sm font-semibold text-slate-100">{user?.nome ?? "—"}</p>
                <p className="text-[11px] text-blue-300">{user ? PERFIL_LABEL[user.perfil] : ""}</p>
              </div>
              <Button variant="ghost" size="icon" title="Sair" onClick={() => void endSession()} data-testid="logout-button">
                <LogOut className="size-4" />
              </Button>
            </div>
          </header>
          <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
            <Outlet context={{ nav }} />
          </main>
        </div>
        <Toaster richColors theme="dark" />
      </div>
    </FiltersProvider>
  );
}

