import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { LogOut, Menu, UserPlus } from "lucide-react";

import GlassySidebar from "@/components/GlassySidebar";
import RealtimeMilitarPopup, { type RealtimeMilitarPopupItem } from "@/components/RealtimeMilitarPopup";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import { iniciarEscutaMilitaresTempoReal } from "@/lib/firestoreService";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { FiltersProvider } from "@/lib/filters";
import { PERFIL_LABEL, podeEditar, useCatalogos, useMe, useMeta } from "@/lib/hooks";
import { endSession } from "@/lib/session";
import type { Militar } from "@/lib/types";
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
  const [realtimePopups, setRealtimePopups] = useState<RealtimeMilitarPopupItem[]>([]);

  const handleDismissPopup = useCallback((key: string) => {
    setRealtimePopups((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const authenticatedUserId = me.data?.id ?? null;

  useEffect(() => {
    if (!authenticatedUserId) return;
    const unsubscribe = iniciarEscutaMilitaresTempoReal((novoMilitar: Militar) => {
      setRealtimePopups((prev) => {
        if (prev.some((item) => item.militar.id === novoMilitar.id)) return prev;
        const nextItem: RealtimeMilitarPopupItem = {
          key: `${novoMilitar.id}_${Date.now()}`,
          militar: novoMilitar,
          receivedAt: Date.now(),
        };
        return [nextItem, ...prev].slice(0, 3);
      });
    });
    return () => {
      unsubscribe();
    };
  }, [authenticatedUserId]);

  const handleMagneticMove = useCallback((event: ReactPointerEvent<HTMLAnchorElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - (bounds.left + bounds.width / 2)) * 0.14;
    const y = (event.clientY - (bounds.top + bounds.height / 2)) * 0.22;
    event.currentTarget.style.setProperty("--magnetic-x", `${x}px`);
    event.currentTarget.style.setProperty("--magnetic-y", `${y}px`);
  }, []);

  const handleMagneticReset = useCallback((event: ReactPointerEvent<HTMLAnchorElement>) => {
    event.currentTarget.style.setProperty("--magnetic-x", "0px");
    event.currentTarget.style.setProperty("--magnetic-y", "0px");
  }, []);

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
          <header className="sticky top-0 z-20 mx-auto max-w-[1600px] bg-gradient-to-b from-[#0B111A] via-[#0B111A]/90 to-transparent px-4 pt-3 pb-1 sm:px-6 lg:px-8">
            <div
              style={{
                background:
                  "linear-gradient(180deg, rgba(18, 27, 40, 0.90) 0%, rgba(13, 21, 34, 0.94) 100%)",
                boxShadow:
                  "0 16px 36px -16px rgba(0, 0, 0, 0.72), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
              }}
              className="flex min-h-[64px] items-center gap-3.5 rounded-2xl border border-[#1E2C42] px-4 py-2.5 backdrop-blur-xl sm:px-5"
            >
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-xl text-slate-300 hover:bg-[#182335] hover:text-white lg:hidden"
                onClick={() => setMobileOpen(true)}
                data-testid="mobile-menu-button"
              >
                <Menu className="size-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h1
                  className="truncate font-heading text-[15px] font-extrabold tracking-tight text-white sm:text-[17px]"
                  data-testid="system-title"
                >
                  Gestão de Bombeiros Militares Temporários
                </h1>
                <p className="mt-0.5 truncate text-[11.5px] text-slate-400" data-testid="last-update">
                  <span className="font-medium text-slate-300">Corpo de Bombeiros Militar de Mato Grosso</span>
                  <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                  <span>Hoje {fmtDate(meta.data?.data_hoje)}</span>
                  <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                  <span>
                    Última atualização:{" "}
                    <span className="num text-slate-300">{fmtDateTime(meta.data?.ultima_atualizacao)}</span>
                  </span>
                </p>
              </div>
              {podeEditar(user) && (
                <Link
                  to="/temporarios/novo"
                  onPointerMove={handleMagneticMove}
                  onPointerLeave={handleMagneticReset}
                  onPointerCancel={handleMagneticReset}
                  className="group relative hidden h-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-blue-500/50 bg-[#162234]/85 px-4 text-xs font-semibold text-blue-100 whitespace-nowrap [transform:translate(var(--magnetic-x,0px),var(--magnetic-y,0px))] transition-[transform,color,border-color,box-shadow] duration-[220ms] ease-[cubic-bezier(.16,1,.3,1)] hover:border-blue-400 hover:text-white hover:shadow-[0_10px_24px_-6px_rgba(37,99,235,0.65)] focus-visible:border-blue-400 focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:inline-flex"
                  data-testid="header-new-button"
                >
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <UserPlus className="size-4" />
                    <span>Novo cadastro</span>
                  </span>
                  <span
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-0 bg-gradient-to-t from-blue-600 to-blue-500 transition-[height] duration-[380ms] ease-[cubic-bezier(.16,1,.3,1)] group-hover:h-full group-focus-visible:h-full"
                    aria-hidden="true"
                  />
                </Link>
              )}
              <div className="hidden h-7 w-px shrink-0 bg-[#1E2C42] md:block" aria-hidden="true" />
              <div className="hidden shrink-0 text-right md:block" data-testid="user-identification">
                <p className="text-sm font-semibold leading-tight text-slate-100">{user?.nome ?? "—"}</p>
                <p className="mt-0.5 text-[11px] font-medium leading-tight text-blue-400">
                  {user ? PERFIL_LABEL[user.perfil] : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                title="Sair"
                className="shrink-0 rounded-xl text-slate-400 transition-colors hover:bg-[#182335] hover:text-white"
                onClick={() => void endSession()}
                data-testid="logout-button"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </header>
          <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
            <Outlet context={{ nav }} />
          </main>
        </div>
        <Toaster richColors theme="dark" />
        <RealtimeMilitarPopup items={realtimePopups} onDismiss={handleDismissPopup} />
      </div>
    </FiltersProvider>
  );
}

