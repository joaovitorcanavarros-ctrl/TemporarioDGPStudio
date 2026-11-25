import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { Calendar, ClipboardList, LayoutGrid, LogOut, Menu, UserPlus, Users } from "lucide-react";

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
      <div className="flex min-h-screen items-center justify-center bg-[#03060C]">
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

  const mobileNavTabs = [
    { to: "/", label: "Painel", icon: LayoutGrid, end: true },
    { to: "/temporarios", label: "Efetivo", icon: Users, end: false },
    { to: "/desligamentos", label: "Saídas", icon: Calendar, end: false },
    { to: "/relatorios", label: "Relatórios", icon: ClipboardList, end: false },
  ];

  return (
    <FiltersProvider>
      <div className="relative min-h-screen overflow-x-clip bg-[#03060C]">
        {/* Profundidade atmosférica sóbria sob os painéis translúcidos */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_62%_46%_at_16%_8%,rgba(37,99,235,0.06),transparent_68%),radial-gradient(ellipse_55%_44%_at_88%_14%,rgba(14,165,233,0.035),transparent_64%),radial-gradient(ellipse_52%_44%_at_80%_90%,rgba(185,28,28,0.04),transparent_66%)]"
        />

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
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-[min(296px,86vw)] border-white/10 bg-transparent p-0 shadow-none"
          >
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <GlassySidebar
              mobileMode
              isExpanded
              user={user}
              categorias={cats}
              onLogout={() => void endSession()}
              onNavigate={() => setMobileOpen(false)}
              onClose={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div
          className={cn(
            "relative z-10 transition-[padding] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            collapsed ? "lg:pl-[104px]" : "lg:pl-[312px]"
          )}
        >
          <header className="sticky top-0 z-20 mx-auto max-w-[1800px] bg-gradient-to-b from-[#03060C] via-[#03060C]/88 to-transparent px-3 pt-2 pb-1 sm:px-6 sm:pt-3 lg:px-6">
            <div
              style={{
                background:
                  "linear-gradient(180deg, rgba(16, 26, 46, 0.68) 0%, rgba(9, 15, 28, 0.78) 100%)",
                boxShadow:
                  "0 22px 48px -16px rgba(0, 0, 0, 0.90), inset 0 1px 0 0 rgba(255, 255, 255, 0.12)",
              }}
              className="flex min-h-[54px] items-center gap-2 rounded-2xl border border-white/[0.11] px-2.5 py-2 backdrop-blur-2xl backdrop-saturate-150 sm:min-h-[64px] sm:gap-3.5 sm:px-5 sm:py-2.5"
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label="Abrir menu"
                className="size-10 shrink-0 rounded-xl text-slate-300 hover:bg-white/[0.08] hover:text-white lg:hidden"
                onClick={() => setMobileOpen(true)}
                data-testid="mobile-menu-button"
              >
                <Menu className="size-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h1
                  className="truncate font-heading text-[14px] font-extrabold tracking-tight text-white sm:text-[17px]"
                  data-testid="system-title"
                >
                  <span className="sm:hidden">BM Temporários · CBMMT</span>
                  <span className="hidden sm:inline">Gestão de Bombeiros Militares Temporários</span>
                </h1>
                <p className="mt-0.5 truncate text-[11px] text-slate-400 sm:text-[11.5px]" data-testid="last-update">
                  <span className="sm:hidden">
                    Hoje <span className="num text-slate-300">{fmtDate(meta.data?.data_hoje)}</span>
                  </span>
                  <span className="hidden sm:inline">
                    <span className="font-medium text-slate-300">Corpo de Bombeiros Militar de Mato Grosso</span>
                    <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                    <span>Hoje {fmtDate(meta.data?.data_hoje)}</span>
                    <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                    <span>
                      Última atualização:{" "}
                      <span className="num text-slate-300">{fmtDateTime(meta.data?.ultima_atualizacao)}</span>
                    </span>
                  </span>
                </p>
              </div>
              {podeEditar(user) && (
                <>
                  <Link
                    to="/temporarios/novo"
                    aria-label="Novo cadastro"
                    title="Novo cadastro"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/50 bg-blue-600/20 text-blue-200 transition-colors active:scale-95 hover:bg-blue-600/30 sm:hidden"
                    data-testid="header-new-button-mobile"
                  >
                    <UserPlus className="size-4" />
                  </Link>
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
                </>
              )}
              <div className="hidden h-7 w-px shrink-0 bg-white/[0.10] md:block" aria-hidden="true" />
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
                aria-label="Sair"
                className="size-10 shrink-0 rounded-xl text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white sm:size-9"
                onClick={() => void endSession()}
                data-testid="logout-button"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </header>
          <main className="mx-auto max-w-[1800px] px-3 py-4 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-5 lg:px-6 lg:pb-6">
            <Outlet context={{ nav }} />
          </main>
        </div>

        {/* Barra de Navegação Inferior Mobile (Thumb Zone) */}
        <nav
          aria-label="Navegação principal mobile"
          data-testid="mobile-bottom-nav"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.10] bg-[#060B16]/84 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_-14px_36px_rgba(0,0,0,0.85)] pb-safe lg:hidden"
        >
          <div className="mx-auto grid h-14 max-w-lg grid-cols-5 items-center px-1">
            {mobileNavTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    cn(
                      "flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium transition-colors active:scale-95",
                      isActive ? "text-blue-400" : "text-slate-400 hover:text-slate-200"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          "flex h-7 w-10 items-center justify-center rounded-lg transition-colors",
                          isActive && "bg-blue-500/15 text-blue-400"
                        )}
                      >
                        <Icon className="size-[19px]" />
                      </span>
                      <span className="truncate leading-none">{tab.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Mais opções do menu"
              className="flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium text-slate-400 transition-colors hover:text-slate-200 active:scale-95 cursor-pointer"
            >
              <span className="flex h-7 w-10 items-center justify-center rounded-lg">
                <Menu className="size-[19px]" />
              </span>
              <span className="truncate leading-none">Menu</span>
            </button>
          </div>
        </nav>

        <Toaster richColors theme="dark" />
        <RealtimeMilitarPopup items={realtimePopups} onDismiss={handleDismissPopup} />
      </div>
    </FiltersProvider>
  );
}
