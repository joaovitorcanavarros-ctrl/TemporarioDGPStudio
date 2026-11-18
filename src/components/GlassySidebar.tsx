import { useState, type CSSProperties } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  FileSpreadsheet,
  FolderKanban,
  LayoutGrid,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSystemEntry } from "@/components/SystemEntrySplash";
import { cn } from "@/lib/utils";

export interface GlassyCategory {
  codigo: string;
  nome: string;
}

export interface GlassySidebarProps {
  isExpanded?: boolean;
  onToggleExpand?: (expanded: boolean) => void;
  user?: {
    nome?: string;
    email?: string;
    perfil?: string;
  } | null;
  categorias?: GlassyCategory[];
  onLogout?: () => void;
  onNavigate?: () => void;
  mobileMode?: boolean;
}

interface MenuItem {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  brand?: string;
  end?: boolean;
  badge?: string | number;
  badgeTone?: "neutral" | "red";
  dotColor?: string;
}

const DEFAULT_CATEGORIES: GlassyCategory[] = [
  { codigo: "AUXILIAR", nome: "Auxiliares" },
  { codigo: "CONDUTOR", nome: "Condutores" },
  { codigo: "TEC_ENFERMAGEM", nome: "Técnicos de Enfermagem" },
  { codigo: "ENFERMEIRO", nome: "Enfermeiros" },
  { codigo: "MEDICO", nome: "Médicos" },
];

const TREE_DOT_COLORS: Record<string, string> = {
  AUXILIAR: "#22C55E",
  CONDUTOR: "#F97316",
  TEC_ENFERMAGEM: "#E2E8F0",
  ENFERMEIRO: "#06B6D4",
  MEDICO: "#F43F5E",
  OUTROS: "#94A3B8",
};

const NEUTRAL_SPOTLIGHT_BRAND = "#94A3B8";

export default function GlassySidebar({
  isExpanded: controlledExpanded,
  onToggleExpand,
  user,
  categorias = DEFAULT_CATEGORIES,
  onLogout,
  onNavigate,
  mobileMode = false,
}: GlassySidebarProps) {
  const [internalExpanded, setInternalExpanded] = useState(true);
  const isExpanded = mobileMode
    ? true
    : controlledExpanded !== undefined
      ? controlledExpanded
      : internalExpanded;

  const [projectsOpen, setProjectsOpen] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [activeNavId, setActiveNavId] = useState<string | null>(null);
  const [toggleHover, setToggleHover] = useState(false);

  const { isBrandLogoHidden } = useSystemEntry();
  const location = useLocation();

  const handleToggle = () => {
    const next = !isExpanded;
    setInternalExpanded(next);
    onToggleExpand?.(next);
  };

  const mainItems: MenuItem[] = [
    {
      id: "visao-geral",
      to: "/",
      label: "Visão Geral",
      icon: LayoutGrid,
      brand: NEUTRAL_SPOTLIGHT_BRAND,
      end: true,
    },
    {
      id: "temporarios-geral",
      to: "/temporarios",
      label: "Temporários Geral",
      icon: Activity,
      brand: NEUTRAL_SPOTLIGHT_BRAND,
      end: true,
    },
    {
      id: "desligamentos",
      to: "/desligamentos",
      label: "Desligamentos",
      icon: Calendar,
      brand: NEUTRAL_SPOTLIGHT_BRAND,
    },
  ];

  const workspaceTopItems: MenuItem[] = [
    {
      id: "importacao",
      to: "/importacao",
      label: "Importação de Dados",
      icon: FileSpreadsheet,
      brand: NEUTRAL_SPOTLIGHT_BRAND,
    },
  ];

  const workspaceBottomItems: MenuItem[] = [
    {
      id: "relatorios",
      to: "/relatorios",
      label: "Relatórios",
      icon: ClipboardList,
      brand: NEUTRAL_SPOTLIGHT_BRAND,
    },
    {
      id: "configuracoes",
      to: "/configuracoes",
      label: "Configurações",
      icon: Settings,
      brand: NEUTRAL_SPOTLIGHT_BRAND,
    },
  ];

  const isQuadroActive = location.pathname.startsWith("/quadro/");

  const visibleNavSequence: { id: string; brand: string }[] = [
    ...mainItems.map((i) => ({ id: i.id, brand: i.brand ?? NEUTRAL_SPOTLIGHT_BRAND })),
    ...workspaceTopItems.map((i) => ({ id: i.id, brand: i.brand ?? NEUTRAL_SPOTLIGHT_BRAND })),
    { id: "__projects_tree__", brand: NEUTRAL_SPOTLIGHT_BRAND },
    ...(isExpanded && projectsOpen
      ? categorias.map((c) => ({
          id: `quadro-${c.codigo}`,
          brand: NEUTRAL_SPOTLIGHT_BRAND,
        }))
      : []),
    ...workspaceBottomItems.map((i) => ({ id: i.id, brand: i.brand ?? NEUTRAL_SPOTLIGHT_BRAND })),
  ];

  const activeNavIndex = activeNavId
    ? visibleNavSequence.findIndex((entry) => entry.id === activeNavId)
    : -1;
  const activeNavBrand = activeNavIndex >= 0 ? visibleNavSequence[activeNavIndex].brand : "transparent";

  const getSpotlightProps = (id: string, ownBrand: string = NEUTRAL_SPOTLIGHT_BRAND) => {
    const idx = visibleNavSequence.findIndex((entry) => entry.id === id);
    const isSelf = idx >= 0 && idx === activeNavIndex;
    const adjacentSide =
      activeNavIndex < 0 || idx < 0 || Math.abs(idx - activeNavIndex) !== 1
        ? undefined
        : idx < activeNavIndex
          ? "bottom"
          : "top";

    return {
      "data-self-active": isSelf ? "true" : undefined,
      "data-adjacent-side": adjacentSide,
      style: {
        "--nav-brand": ownBrand,
        "--adjacent-brand": adjacentSide ? activeNavBrand : "transparent",
      } as CSSProperties,
    };
  };

  const displayName = user?.nome || "Usuário CBMMT";
  const displayEmail = user?.email || "";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  // Mesma tonalidade dark mode do restante do site (#0D1522 -> #121B28 e borda #1E2C42)
  const glassStyle: CSSProperties = {
    background:
      "linear-gradient(180deg, rgba(18, 27, 40, 0.92) 0%, rgba(13, 21, 34, 0.96) 100%)",
    border: "1px solid #1E2C42",
    boxShadow:
      "0 20px 40px -15px rgba(0, 0, 0, 0.65), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
  };

  const renderMenuLink = (item: MenuItem) => {
    const Icon = item.icon;
    const isHovered = hoveredItem === item.id;
    const spotlightProps = getSpotlightProps(item.id, item.brand ?? NEUTRAL_SPOTLIGHT_BRAND);

    return (
      <div
        key={item.id}
        className="relative flex justify-center"
        onMouseEnter={() => {
          setHoveredItem(item.id);
          setActiveNavId(item.id);
        }}
        onMouseLeave={() => {
          setHoveredItem(null);
          setActiveNavId((curr) => (curr === item.id ? null : curr));
        }}
      >
        <NavLink
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          onFocus={() => setActiveNavId(item.id)}
          onBlur={() => setActiveNavId((curr) => (curr === item.id ? null : curr))}
          data-testid={`nav-${item.id}`}
          {...spotlightProps}
          className={({ isActive }) =>
            cn(
              "nav-spotlight-item group relative flex items-center rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              isExpanded
                ? "w-full gap-3 px-3.5 py-2.5"
                : "size-11 justify-center p-0",
              isActive
                ? "bg-blue-600/15 text-white ring-1 ring-blue-500/30 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.45)]"
                : "text-slate-400 hover:bg-[#182335]/85 hover:text-slate-100"
            )
          }
        >
          {({ isActive }) => (
            <>
              <span className="nav-spotlight-fill-edge" aria-hidden="true" />
              <span className="nav-spotlight-self-ring" aria-hidden="true" />
              <span className="nav-spotlight-border-edge" aria-hidden="true" />

              <div className="relative z-10 flex shrink-0 items-center justify-center">
                <div className="nav-icon-swap-slot">
                  <span className="nav-icon-swap-primary">
                    <Icon
                      className={cn(
                        "size-[19px]",
                        isActive ? "text-blue-400" : "text-slate-400"
                      )}
                    />
                  </span>
                  <span className="nav-icon-swap-arrow" aria-hidden="true">
                    <ArrowRight size={17} strokeWidth={1.9} />
                  </span>
                </div>

                {!isExpanded && item.badge && item.badgeTone === "red" && (
                  <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.8)] ring-2 ring-[#0D1522]">
                    {item.badge}
                  </span>
                )}
                {!isExpanded && item.dotColor && (
                  <span
                    className="absolute -right-1 -top-1 size-2 rounded-full ring-2 ring-[#0D1522]"
                    style={{
                      backgroundColor: item.dotColor,
                      boxShadow: `0 0 8px ${item.dotColor}`,
                    }}
                  />
                )}
              </div>

              {/* Rótulo com transição suave e atraso leve na expansão */}
              <div
                className={cn(
                  "relative z-10 items-center justify-between overflow-hidden whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  isExpanded
                    ? "flex flex-1 w-auto opacity-100 delay-75"
                    : "hidden pointer-events-none w-0 opacity-0"
                )}
              >
                <span
                  className={cn(
                    "truncate font-sans text-[13.5px] font-medium tracking-tight transition-colors duration-200",
                    isActive ? "text-white" : "text-slate-300 group-hover:text-white"
                  )}
                >
                  {item.label}
                </span>

                {item.badge !== undefined && (
                  <span
                    className={cn(
                      "ml-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 num text-[11px] font-semibold leading-none",
                      item.badgeTone === "red"
                        ? "bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.55)]"
                        : "bg-[#182335] text-slate-200 ring-1 ring-[#24344D]"
                    )}
                  >
                    {item.badge}
                  </span>
                )}

                {item.dotColor && (
                  <span
                    className="ml-2 size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: item.dotColor,
                      boxShadow: `0 0 8px ${item.dotColor}`,
                    }}
                  />
                )}
              </div>
            </>
          )}
        </NavLink>

        {/* Tooltip Flutuante no mesmo tom Dark Mode (Estado Colapsado) */}
        {!isExpanded && isHovered && (
          <div
            role="tooltip"
            className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 z-50 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-[#24344D] bg-[#121B28]/95 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-[0_12px_28px_-6px_rgba(0,0,0,0.65)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
          >
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 num text-[10px] font-bold",
                  item.badgeTone === "red"
                    ? "bg-red-500 text-white"
                    : "bg-[#182335] text-slate-200 ring-1 ring-[#24344D]"
                )}
              >
                {item.badge}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      data-testid="sidebar"
      style={glassStyle}
      className={cn(
        "flex flex-col backdrop-blur-2xl select-none transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        mobileMode
          ? "h-full w-full rounded-none"
          : cn(
              "fixed bottom-3 left-3 top-3 z-30 hidden lg:flex",
              isExpanded ? "w-[288px] rounded-3xl" : "w-[76px] rounded-[38px]"
            )
      )}
    >
      {/* 1. CABEÇALHO E BOTÃO ALTERNADOR CIRCULAR BRANCO */}
      <div
        className={cn(
          "relative flex items-center pt-4 pb-3 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isExpanded ? "justify-between px-4" : "justify-center px-0"
        )}
      >
        <Link
          to="/"
          onClick={onNavigate}
          data-testid="brand-link"
          className={cn(
            "group flex min-w-0 items-center focus:outline-none",
            isExpanded ? "gap-3.5" : "justify-center"
          )}
        >
          {/* Logo Circular Vermelho institucional */}
          <div className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500 via-red-600 to-red-700 shadow-[0_6px_18px_rgba(239,68,68,0.48)] ring-1 ring-white/25 transition-transform duration-300 group-hover:scale-105">
            <img
              src="/cbmmt-logo.png"
              alt="Emblema do Corpo de Bombeiros Militar de Mato Grosso"
              className={cn(
                "size-9 object-contain drop-shadow",
                !mobileMode && isBrandLogoHidden && "opacity-0"
              )}
              data-testid="brand-logo"
            />
          </div>

          {/* Título em duas linhas com fade-in/out suave */}
          <div
            className={cn(
              "overflow-hidden whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              isExpanded
                ? "flex flex-col w-auto opacity-100 delay-75"
                : "hidden pointer-events-none w-0 opacity-0"
            )}
          >
            <span className="font-heading text-[20px] font-extrabold leading-none tracking-tight text-white">
              CBMMT
            </span>
            <span className="mt-1 font-sans text-[12px] font-medium leading-tight text-slate-400">
              DGP · Temporários
            </span>
          </div>
        </Link>

        {/* Botão Circular Branco Alternador (Expand / Collapse) */}
        {!mobileMode && (
          <div
            className={cn(
              "relative z-40",
              !isExpanded && " -right-5 absolute top-5"
            )}
            onMouseEnter={() => setToggleHover(true)}
            onMouseLeave={() => setToggleHover(false)}
          >
            <button
              type="button"
              onClick={handleToggle}
              data-testid="sidebar-toggle"
              aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
              className="flex size-7 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_6px_16px_rgba(0,0,0,0.45)] ring-1 ring-black/5 transition-all duration-300 hover:scale-110 hover:bg-neutral-100 active:scale-95 cursor-pointer"
            >
              <ChevronLeft
                className={cn(
                  "size-4 stroke-[2.4] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  !isExpanded && "rotate-180"
                )}
              />
            </button>

            {/* Tooltip Expand / Collapse */}
            {toggleHover && (
              <div
                role="tooltip"
                className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg border border-[#24344D] bg-[#121B28]/95 px-2.5 py-1 text-[11px] font-medium text-slate-100 shadow-lg backdrop-blur-xl animate-in fade-in duration-150"
              >
                {isExpanded ? "Collapse" : "Expand"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. MENU CENTRAL (MAIN & WORKSPACE COM TREE-VIEW) */}
      <nav
        onMouseLeave={() => setActiveNavId(null)}
        className={cn(
          "flex-1 space-y-4 overflow-y-auto overflow-x-hidden py-2 scrollbar-none",
          isExpanded ? "px-3" : "px-0"
        )}
      >
        {/* GRUPO MAIN */}
        <div className="space-y-1">
          <div
            className={cn(
              "overflow-hidden whitespace-nowrap px-3 transition-all duration-300",
              isExpanded ? "h-5 opacity-100 delay-75" : "h-0 opacity-0"
            )}
          >
            <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              MAIN
            </span>
          </div>

          {mainItems.map(renderMenuLink)}
        </div>

        {/* Divisor quando colapsado */}
        {!isExpanded && <div className="mx-auto w-8 h-px bg-[#1E2C42]" />}

        {/* GRUPO WORKSPACE */}
        <div className="space-y-1">
          <div
            className={cn(
              "overflow-hidden whitespace-nowrap px-3 transition-all duration-300",
              isExpanded ? "h-5 opacity-100 delay-75" : "h-0 opacity-0"
            )}
          >
            <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              WORKSPACE
            </span>
          </div>

          {/* Item superior do Workspace (Importação de Dados) */}
          {workspaceTopItems.map(renderMenuLink)}

          {/* Menu Retrátil tipo Árvore (Tree-View): Quadros de Efetivo */}
          <div className="space-y-1">
            <div
              className="relative flex justify-center"
              onMouseEnter={() => {
                setHoveredItem("__projects_tree__");
                setActiveNavId("__projects_tree__");
              }}
              onMouseLeave={() => {
                setHoveredItem(null);
                setActiveNavId((curr) => (curr === "__projects_tree__" ? null : curr));
              }}
            >
              <button
                type="button"
                onFocus={() => setActiveNavId("__projects_tree__")}
                onBlur={() => setActiveNavId((curr) => (curr === "__projects_tree__" ? null : curr))}
                onClick={() => {
                  if (!isExpanded) {
                    setInternalExpanded(true);
                    onToggleExpand?.(true);
                    setProjectsOpen(true);
                  } else {
                    setProjectsOpen((p) => !p);
                  }
                }}
                {...getSpotlightProps("__projects_tree__", NEUTRAL_SPOTLIGHT_BRAND)}
                className={cn(
                  "nav-spotlight-item group relative flex items-center rounded-2xl transition-all duration-300 cursor-pointer",
                  isExpanded
                    ? "w-full gap-3 px-3.5 py-2.5"
                    : "size-11 justify-center p-0",
                  isQuadroActive
                    ? "bg-blue-600/15 text-white ring-1 ring-blue-500/30"
                    : "text-slate-400 hover:bg-[#182335]/85 hover:text-slate-100"
                )}
              >
                <span className="nav-spotlight-fill-edge" aria-hidden="true" />
                <span className="nav-spotlight-self-ring" aria-hidden="true" />
                <span className="nav-spotlight-border-edge" aria-hidden="true" />

                <div className="nav-icon-swap-slot relative z-10">
                  <span className="nav-icon-swap-primary">
                    <FolderKanban
                      className={cn(
                        "size-[19px] shrink-0",
                        isQuadroActive ? "text-blue-400" : "text-slate-400"
                      )}
                    />
                  </span>
                  <span className="nav-icon-swap-arrow" aria-hidden="true">
                    <ArrowRight size={17} strokeWidth={1.9} />
                  </span>
                </div>

                <div
                  className={cn(
                    "relative z-10 items-center justify-between overflow-hidden whitespace-nowrap transition-all duration-300",
                    isExpanded
                      ? "flex flex-1 w-auto opacity-100 delay-75"
                      : "hidden pointer-events-none w-0 opacity-0"
                  )}
                >
                  <span
                    className={cn(
                      "truncate font-sans text-[13.5px] font-medium tracking-tight transition-colors duration-200",
                      isQuadroActive ? "text-white" : "text-slate-300 group-hover:text-white"
                    )}
                  >
                    Quadros de Efetivo
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 text-slate-500 transition-transform duration-300",
                      !projectsOpen && "-rotate-90"
                    )}
                  />
                </div>
              </button>

              {/* Tooltip no modo colapsado */}
              {!isExpanded && hoveredItem === "__projects_tree__" && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-xl border border-[#24344D] bg-[#121B28]/95 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-xl backdrop-blur-xl"
                >
                  Quadros de Efetivo
                </div>
              )}
            </div>

            {/* Sub-itens da Árvore conectados por linhas verticais finas */}
            <div
              className={cn(
                "overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                isExpanded && projectsOpen
                  ? "max-h-72 opacity-100 delay-75"
                  : "max-h-0 opacity-0"
              )}
            >
              <div className="relative ml-6 border-l border-[#24344D] pl-3.5 py-1 space-y-0.5">
                {categorias.map((cat) => {
                  const dotColor = TREE_DOT_COLORS[cat.codigo] ?? "#E2E8F0";
                  const leafId = `quadro-${cat.codigo}`;
                  const leafSpotlightProps = getSpotlightProps(leafId, NEUTRAL_SPOTLIGHT_BRAND);

                  return (
                    <NavLink
                      key={cat.codigo}
                      to={`/quadro/${cat.codigo}`}
                      onClick={onNavigate}
                      onMouseEnter={() => setActiveNavId(leafId)}
                      onMouseLeave={() => setActiveNavId((curr) => (curr === leafId ? null : curr))}
                      onFocus={() => setActiveNavId(leafId)}
                      onBlur={() => setActiveNavId((curr) => (curr === leafId ? null : curr))}
                      data-testid={`nav-quadro-${cat.codigo.toLowerCase()}`}
                      {...leafSpotlightProps}
                      className={({ isActive }) =>
                        cn(
                          "nav-spotlight-item group/leaf relative flex items-center justify-between rounded-xl px-2.5 py-1.5 font-sans text-[12.5px] transition-all duration-200",
                          isActive
                            ? "bg-blue-600/15 font-semibold text-white ring-1 ring-blue-500/25 shadow-xs"
                            : "font-normal text-slate-400 hover:bg-[#182335]/85 hover:text-slate-100"
                        )
                      }
                    >
                      <span className="nav-spotlight-fill-edge" aria-hidden="true" />
                      <span className="nav-spotlight-self-ring" aria-hidden="true" />
                      <span className="nav-spotlight-border-edge" aria-hidden="true" />

                      {/* Conector horizontal fino ligando à linha vertical da árvore */}
                      <span className="pointer-events-none absolute -left-3.5 top-1/2 h-px w-2.5 -translate-y-1/2 bg-[#24344D]" />
                      <span className="relative z-10 truncate">{cat.nome}</span>
                      <span className="nav-icon-swap-slot relative z-10 ml-2 !h-4 !w-4">
                        <span className="nav-icon-swap-primary">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor: dotColor,
                              boxShadow: `0 0 6px ${dotColor}99`,
                            }}
                          />
                        </span>
                        <span className="nav-icon-swap-arrow" aria-hidden="true">
                          <ArrowRight size={13} strokeWidth={2.1} />
                        </span>
                      </span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Itens inferiores do Workspace (Relatórios, Configurações) */}
          {workspaceBottomItems.map(renderMenuLink)}
        </div>
      </nav>

      {/* 3. RODAPÉ (CARD DE PERFIL DO USUÁRIO) */}
      <div className={cn("mt-auto border-t border-[#1E2C42] pt-2.5 pb-3.5", isExpanded ? "px-3" : "px-0")}>
        <div
          className="relative flex justify-center"
          onMouseEnter={() => setHoveredItem("__user_profile__")}
          onMouseLeave={() => setHoveredItem(null)}
        >
          <div
            className={cn(
              "flex items-center rounded-2xl border border-[#1E2C42] bg-[#182335]/70 transition-all duration-300",
              isExpanded ? "w-full justify-between gap-2.5 p-2.5" : "size-11 justify-center p-0"
            )}
          >
            {/* Avatar redondo com ponto verde brilhante (status online) */}
            <div className="relative shrink-0">
              <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 font-sans text-xs font-bold text-white ring-1 ring-white/20 shadow-inner">
                {initials || <Users className="size-4" />}
              </div>
              <span
                className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-400 ring-2 ring-[#121B28] shadow-[0_0_8px_#34D399]"
                title="Online"
              />
            </div>

            {/* Nome e E-mail */}
            <div
              className={cn(
                "min-w-0 overflow-hidden transition-all duration-300",
                isExpanded
                  ? "flex-1 w-auto opacity-100 delay-75"
                  : "hidden pointer-events-none w-0 opacity-0"
              )}
            >
              <p className="truncate font-sans text-[13px] font-bold leading-tight text-slate-100">
                {displayName}
              </p>
              {displayEmail && (
                <p className="truncate font-sans text-[11px] leading-tight text-slate-400">
                  {displayEmail}
                </p>
              )}
            </div>

            {/* Botão de Logout à direita */}
            {isExpanded && onLogout && (
              <button
                type="button"
                onClick={onLogout}
                title="Sair da conta"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#24344D] hover:text-white cursor-pointer"
              >
                <LogOut className="size-4" />
              </button>
            )}
          </div>

          {!isExpanded && hoveredItem === "__user_profile__" && (
            <div
              role="tooltip"
              className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-xl border border-[#24344D] bg-[#121B28]/95 px-3 py-1.5 text-xs shadow-xl backdrop-blur-xl"
            >
              <p className="font-semibold text-slate-100">{displayName}</p>
              {displayEmail && <p className="text-[10px] text-slate-400">{displayEmail}</p>}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
