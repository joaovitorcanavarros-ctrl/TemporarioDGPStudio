import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, Briefcase, Scale, Building2, Clock, HeartPulse, RotateCw, Shield, Stethoscope, Table2, BarChart3, Truck, UserCheck, UserMinus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import DrillSheet, { type Drill } from "@/components/DrillSheet";
import FiltersBar from "@/components/FiltersBar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPost } from "@/lib/api";
import { fmtDate, fmtNum, qs } from "@/lib/format";
import { useFilters, type GlobalFilters } from "@/lib/filters";
import type { ChartRow, CountItem, Dashboard as D } from "@/lib/types";
import { cn } from "@/lib/utils";

export const CAT_COLOR: Record<string, string> = {
  AUXILIAR: "#3B82F6",       // Azul Royal
  CONDUTOR: "#F59E0B",       // Laranja / Âmbar
  TEC_ENFERMAGEM: "#10B981", // Verde Esmeralda
  ENFERMEIRO: "#06B6D4",     // Ciano
  MEDICO: "#F43F5E",         // Vermelho Coral / Rubi
  OUTROS: "#94A3B8",         // Cinza Azulado
};
const PALETTE = ["#3B82F6", "#F59E0B", "#10B981", "#06B6D4", "#F43F5E", "#14B8A6", "#EAB308", "#94A3B8"];
const catColor = (c: string, i: number) => CAT_COLOR[c] ?? PALETTE[i % PALETTE.length];

const tooltipStyle = {
  contentStyle: { background: "rgba(10, 17, 31, 0.92)", border: "1px solid rgba(255, 255, 255, 0.12)", borderRadius: 10, fontSize: 12, color: "#F1F5F9", backdropFilter: "blur(14px)" },
  labelStyle: { color: "#F1F5F9", fontWeight: 600 },
  itemStyle: { color: "#CBD5E1" },
  cursor: { fill: "rgba(59,130,246,0.08)" },
};
const axis = { stroke: "#64748B", fontSize: 11, tickLine: false, axisLine: false } as const;

export function baseParams(f: GlobalFilters) {
  return { cargo_id: f.cargo_id, lotacao_id: f.lotacao_id, edital_id: f.edital_id, status: f.status };
}
export function filterParams(f: GlobalFilters) {
  return { ...baseParams(f), ano: f.ano, data_inicio: f.data_inicio, data_fim: f.data_fim };
}

type KpiTone = "green" | "red" | "blue" | "amber" | "sky" | "cyan" | "purple" | "rose";

const KPI_TONE_STYLE: Record<KpiTone, { hex: string; iconIdle: string; iconActive: string }> = {
  green: {
    hex: "#10B981",
    iconIdle: "text-emerald-400/80 bg-emerald-500/10 ring-emerald-500/20",
    iconActive: "text-emerald-300 bg-emerald-500/20 ring-emerald-400/50 shadow-[0_0_16px_rgba(16,185,129,0.35)]",
  },
  red: {
    hex: "#EF4444",
    iconIdle: "text-red-400/80 bg-red-500/10 ring-red-500/20",
    iconActive: "text-red-300 bg-red-500/20 ring-red-400/50 shadow-[0_0_16px_rgba(239,68,68,0.35)]",
  },
  blue: {
    hex: "#3B82F6",
    iconIdle: "text-blue-400/80 bg-blue-500/10 ring-blue-500/20",
    iconActive: "text-blue-300 bg-blue-500/20 ring-blue-400/50 shadow-[0_0_16px_rgba(59,130,246,0.4)]",
  },
  amber: {
    hex: "#F59E0B",
    iconIdle: "text-amber-400/80 bg-amber-500/10 ring-amber-500/20",
    iconActive: "text-amber-300 bg-amber-500/20 ring-amber-400/50 shadow-[0_0_16px_rgba(245,158,11,0.35)]",
  },
  sky: {
    hex: "#38BDF8",
    iconIdle: "text-sky-300/80 bg-sky-500/10 ring-sky-500/20",
    iconActive: "text-sky-200 bg-sky-500/20 ring-sky-400/50 shadow-[0_0_16px_rgba(56,189,248,0.35)]",
  },
  cyan: {
    hex: "#06B6D4",
    iconIdle: "text-cyan-400/80 bg-cyan-500/10 ring-cyan-500/20",
    iconActive: "text-cyan-300 bg-cyan-500/20 ring-cyan-400/50 shadow-[0_0_16px_rgba(6,182,212,0.35)]",
  },
  purple: {
    hex: "#A855F7",
    iconIdle: "text-purple-400/80 bg-purple-500/10 ring-purple-500/20",
    iconActive: "text-purple-300 bg-purple-500/20 ring-purple-400/50 shadow-[0_0_16px_rgba(168,85,247,0.35)]",
  },
  rose: {
    hex: "#F43F5E",
    iconIdle: "text-rose-400/80 bg-rose-500/10 ring-rose-500/20",
    iconActive: "text-rose-300 bg-rose-500/20 ring-rose-400/50 shadow-[0_0_16px_rgba(244,63,94,0.35)]",
  },
};

function Kpi({
  id,
  label,
  value,
  sub,
  icon: Icon,
  tone,
  onClick,
  isHighlighted = false,
  isDimmed = false,
  onHoverChange,
  className,
}: {
  id: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  tone: KpiTone;
  onClick?: () => void;
  isHighlighted?: boolean;
  isDimmed?: boolean;
  onHoverChange?: (hovering: boolean) => void;
  className?: string;
}) {
  const palette = KPI_TONE_STYLE[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      data-testid={`kpi-${id}`}
      style={{
        background: "linear-gradient(175deg, rgba(16, 26, 46, 0.68) 0%, rgba(9, 15, 28, 0.78) 100%)",
        borderColor: isHighlighted ? `${palette.hex}99` : "rgba(255, 255, 255, 0.10)",
        boxShadow: isHighlighted
          ? `0 0 0 1px ${palette.hex}44, 0 18px 38px -10px ${palette.hex}55, 0 16px 32px -12px rgba(0, 0, 0, 0.88), inset 0 1px 0 rgba(255, 255, 255, 0.16)`
          : "inset 0 1px 0 rgba(255, 255, 255, 0.09), 0 14px 32px -14px rgba(0, 0, 0, 0.85)",
      }}
      className={cn(
        "group relative animate-rise overflow-hidden rounded-xl border backdrop-blur-xl backdrop-saturate-150 px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3 text-left cursor-pointer focus-visible:outline-none",
        "transition-[transform,opacity,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isHighlighted && "-translate-y-0.5",
        isDimmed && "opacity-75",
        className
      )}
    >
      {/* Brilho radial superior descendente discreto */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-300",
          isHighlighted ? "opacity-90" : "opacity-10"
        )}
        style={{
          background: `radial-gradient(78% 64% at 50% 0%, ${palette.hex}24 0%, ${palette.hex}0A 46%, transparent 100%)`,
        }}
      />

      {/* Barra LED superior centralizada */}
      <span
        aria-hidden="true"
        className={cn(
          "relative z-10 mx-auto mb-2 sm:mb-3 block h-[4px] w-12 sm:w-14 rounded-full transition-[transform,opacity,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isHighlighted ? "scale-x-115 opacity-100" : "opacity-35"
        )}
        style={{
          backgroundColor: palette.hex,
          boxShadow: isHighlighted
            ? `0 0 10px ${palette.hex}, 0 0 22px ${palette.hex}AA`
            : "none",
        }}
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider leading-tight transition-colors duration-200",
              isHighlighted ? "text-slate-200" : "text-slate-400"
            )}
          >
            {label}
          </p>
          <span
            className={cn(
              "grid size-7 sm:size-8 shrink-0 place-items-center rounded-lg ring-1 transition-[transform,box-shadow,background-color,color] duration-200",
              isHighlighted ? cn(palette.iconActive, "scale-105") : palette.iconIdle
            )}
          >
            <Icon className="size-3.5 sm:size-4" />
          </span>
        </div>
        <p
          className={cn(
            "num mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-bold transition-colors duration-200",
            isHighlighted ? "text-white" : "text-slate-100"
          )}
          data-testid={`kpi-${id}-value`}
        >
          {value}
        </p>
        {sub && (
          <p
            className={cn(
              "mt-1 truncate text-[11px] sm:text-xs transition-colors duration-200",
              isHighlighted ? "text-slate-300" : "text-slate-400"
            )}
          >
            {sub}
          </p>
        )}
      </div>
    </button>
  );
}

function ChartCard({
  id,
  title,
  desc,
  children,
  action,
  className,
  glowRgb = "59, 130, 246",
}: {
  id: string;
  title: string;
  desc?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  glowRgb?: string;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const targetPos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const applyPos = (x: number, y: number) => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--mx", `${x.toFixed(1)}px`);
    el.style.setProperty("--my", `${y.toFixed(1)}px`);
  };

  const startSmoothLoop = () => {
    if (rafRef.current !== null) return;
    const step = () => {
      const dx = targetPos.current.x - currentPos.current.x;
      const dy = targetPos.current.y - currentPos.current.y;
      if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) {
        currentPos.current.x = targetPos.current.x;
        currentPos.current.y = targetPos.current.y;
        applyPos(currentPos.current.x, currentPos.current.y);
        rafRef.current = null;
        return;
      }
      currentPos.current.x += dx * 0.08;
      currentPos.current.y += dy * 0.08;
      applyPos(currentPos.current.x, currentPos.current.y);
      rafRef.current = window.requestAnimationFrame(step);
    };
    rafRef.current = window.requestAnimationFrame(step);
  };

  const moveTo = (clientX: number, clientY: number, snap = false) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    targetPos.current = { x, y };
    if (snap || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      currentPos.current = { x, y };
      applyPos(x, y);
      return;
    }
    startSmoothLoop();
  };

  const handleMouseEnter = (e: ReactMouseEvent<HTMLElement>) => {
    moveTo(e.clientX, e.clientY, true);
    setActive(true);
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLElement>) => {
    if (!active) setActive(true);
    moveTo(e.clientX, e.clientY);
  };

  const handleTouch = (e: ReactTouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (touch) {
      moveTo(touch.clientX, touch.clientY, !active);
      setActive(true);
    }
  };

  return (
    <section
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setActive(false)}
      onTouchStart={handleTouch}
      onTouchMove={handleTouch}
      onTouchEnd={() => setActive(false)}
      className={cn("animate-rise relative overflow-hidden rounded-xl p-4 sm:p-5 shadow-[0_22px_48px_-18px_rgba(0,0,0,0.90)]", className)}
      data-testid={`chart-${id}`}
    >
      {/* Borda base discreta */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl bg-white/[0.10]" />

      {/* Brilho suave e discreto da borda seguindo o cursor */}
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-700", active ? "opacity-100" : "opacity-0")}
        style={{
          background: `radial-gradient(260px circle at var(--mx, -999px) var(--my, -999px), rgba(${glowRgb}, 0.42), transparent 70%)`,
        }}
      />

      {/* Superfície vítrea translúcida do cartão + luz interna sutil */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-px overflow-hidden rounded-[11px] bg-gradient-to-b from-[#0E182B]/78 to-[#080F1D]/84 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09)]"
      >
        <div
          className={cn("absolute inset-0 transition-opacity duration-700", active ? "opacity-100" : "opacity-0")}
          style={{
            background: `radial-gradient(400px circle at var(--mx, -999px) var(--my, -999px), rgba(${glowRgb}, 0.06), transparent 65%)`,
          }}
        />
      </div>

      {/* Conteúdo do gráfico */}
      <div className="relative z-10 flex h-full flex-1 flex-col">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-heading text-[15px] font-bold text-white">{title}</h3>
            {desc && <p className="mt-0.5 text-xs text-slate-400">{desc}</p>}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

function Empty({ text = "Sem registros para os filtros selecionados" }: { text?: string }) {
  return <div className="grid h-[260px] place-items-center text-sm text-slate-500">{text}</div>;
}

function getMotivoOrderAndColor(nome: string, index: number): { order: number; color: string } {
  const n = (nome || "").toLowerCase();
  if (n.includes("encerramento")) return { order: 0, color: "#EF4444" }; // Vermelha
  if (n.includes("rescis") || n.includes("judicial") || n.includes("distrato")) return { order: 1, color: "#F59E0B" }; // Laranja
  if (n.includes("pedido") || n.includes("desist")) return { order: 2, color: "#3B82F6" }; // Azul
  if (n.includes("conduta") || n.includes("disciplinar") || n.includes("exclus") || n.includes("administrativo")) return { order: 3, color: "#10B981" }; // Verde
  if (n.includes("abandono") || n.includes("deser") || n.includes("outra")) return { order: 4, color: "#A78BFA" }; // Roxa
  return { order: 10 + index, color: PALETTE[index % PALETTE.length] };
}

function DesligamentosGroupedChart({
  rows,
  motivoKeys,
  motivoNome,
  desligView,
  onSelectBar,
}: {
  rows: ChartRow[];
  motivoKeys: string[];
  motivoNome: (k: string) => string;
  desligView: string;
  onSelectBar: (row: ChartRow, motivoKey?: string) => void;
}) {
  const [hoveredMotivo, setHoveredMotivo] = useState<string | null>(null);
  const [hoveredCargo, setHoveredCargo] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<{ groupKey: string; motivoKey: string } | null>(null);

  const isCargoConsolidated = desligView === "cargo";

  const orderedMotivos = motivoKeys
    .map((k, idx) => {
      const nome = motivoNome(k);
      const { order, color } = getMotivoOrderAndColor(nome, idx);
      return { chave: k, nome, order, color };
    })
    .sort((a, b) => a.order - b.order);

  const cargoItems = rows.map((r, idx) => {
    const chave = String(r.categoria || r.nome || idx);
    return {
      chave,
      nome: String(r.nome || chave),
      valor: Number(r.total || 0),
      color: catColor(chave, idx),
      row: r,
    };
  });

  // Determine maximum single bar value across all groups; preserve 0, 9, 18, 27, 36 scale on "ano" when max <= 36
  const maxVal = isCargoConsolidated
    ? Math.max(1, ...cargoItems.map((c) => c.valor))
    : Math.max(1, ...rows.flatMap((r) => orderedMotivos.map((m) => Number(r[m.chave] || 0))));

  const step = isCargoConsolidated
    ? (() => {
        const rawStep = Math.ceil(maxVal / 4);
        return rawStep <= 10 ? Math.max(1, rawStep) : Math.ceil(rawStep / 10) * 10;
      })()
    : maxVal <= 36
      ? 9
      : Math.ceil(maxVal / 4);
  const maxScale = step * 4;
  const yTicks = [maxScale, step * 3, step * 2, step, 0];
  const plotHeight = 196;

  const totalVisibleBars = isCargoConsolidated
    ? cargoItems.length
    : rows.reduce((sum, r) => sum + orderedMotivos.filter((m) => Number(r[m.chave] || 0) > 0).length, 0);
  const needsScroll = isCargoConsolidated ? cargoItems.length > 4 : totalVisibleBars > 5 || rows.length > 2;

  return (
    <div className="flex flex-col select-none" data-testid="desligamentos-grouped-chart">
      <div className={cn(needsScroll && "overflow-x-auto scrollbar-none -mx-1 px-1")}>
        <div className={cn(needsScroll && "min-w-[440px] sm:min-w-0")}>
          {/* Main Chart Plot Area */}
          <div className="relative flex pt-5 pb-1">
            {/* Y-Axis Labels */}
            <div
              className="flex flex-col justify-between pr-2 sm:pr-3 text-right num text-[11px] font-medium text-[#64748B]"
              style={{ height: plotHeight }}
            >
              {yTicks.map((t) => (
                <span key={t} className="leading-none -translate-y-1">
                  {fmtNum(t)}
                </span>
              ))}
            </div>

            {/* Grid & Grouped Columns */}
            <div className="relative flex-1" style={{ height: plotHeight }}>
              {/* Discrete Horizontal Grid Lines */}
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {yTicks.map((t, idx) => (
                  <div
                    key={t}
                    className={cn(
                      "w-full border-t",
                      idx === yTicks.length - 1 ? "border-[#263854]" : "border-[#1E2C42]/80 border-dashed"
                    )}
                  />
                ))}
              </div>

              {/* Groups (Consolidated Cargos or Years by Motivo) */}
              <div className="relative z-10 flex h-full items-end justify-around px-1.5 sm:px-6 gap-2 sm:gap-4">
                {isCargoConsolidated
                  ? cargoItems.map((item) => {
                      const ratio = Math.min(1, item.valor / maxScale);
                      const barHeight = Math.max(8, Math.round(ratio * plotHeight));
                      const isDimmed = hoveredCargo !== null && hoveredCargo !== item.chave;
                      const isHighlighted = hoveredCargo === item.chave;

                      return (
                        <div
                          key={item.chave}
                          className="flex h-full flex-1 flex-col items-center justify-end min-w-0"
                        >
                          <div className="flex h-full items-end justify-center px-1 sm:px-2">
                            <button
                              type="button"
                              onClick={() => onSelectBar(item.row)}
                              onMouseEnter={() => setHoveredCargo(item.chave)}
                              onMouseLeave={() => setHoveredCargo(null)}
                              data-testid={`bar-cargo-${item.chave}`}
                              title={`${item.nome}: ${fmtNum(item.valor)} desligamentos`}
                              className={cn(
                                "group/bar relative flex flex-col items-center justify-end focus:outline-none transition-all duration-200 cursor-pointer",
                                isDimmed ? "opacity-35" : "opacity-100"
                              )}
                            >
                              <div
                                className={cn(
                                  "mb-1.5 flex items-center justify-center rounded-md border px-1.5 sm:px-2 py-0.5 num text-[10px] sm:text-[11px] font-bold leading-tight text-white shadow-sm transition-transform duration-150",
                                  isHighlighted && "scale-110 shadow-md"
                                )}
                                style={{
                                  backgroundColor: "#162234",
                                  borderColor: `${item.color}88`,
                                  boxShadow: isHighlighted ? `0 0 12px ${item.color}40` : undefined,
                                }}
                              >
                                {fmtNum(item.valor)}
                              </div>

                              <div
                                className={cn(
                                  "w-7 sm:w-11 md:w-12 rounded-t-md transition-all duration-200",
                                  isHighlighted && "brightness-110 ring-1 ring-white/40"
                                )}
                                style={{
                                  height: `${barHeight}px`,
                                  background: `linear-gradient(180deg, ${item.color} 0%, ${item.color}CC 100%)`,
                                  boxShadow: `0 4px 14px -2px ${item.color}33`,
                                }}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  : rows.map((row) => {
                      const groupLabel = String(row.ano);
                      const activeBars = orderedMotivos
                        .map((m) => ({
                          ...m,
                          valor: Number(row[m.chave] || 0),
                        }))
                        .filter((b) => b.valor > 0);

                      return (
                        <div
                          key={groupLabel}
                          className="flex h-full flex-1 flex-col items-center justify-end"
                        >
                          {/* Side-by-side columns container */}
                          <div className="flex h-full items-end justify-center gap-1.5 sm:gap-3.5 px-1 sm:px-2">
                            {activeBars.map((bar) => {
                              const ratio = Math.min(1, bar.valor / maxScale);
                              const barHeight = Math.max(8, Math.round(ratio * plotHeight));
                              const isDimmed =
                                (hoveredMotivo !== null && hoveredMotivo !== bar.chave) ||
                                (hoveredBar !== null &&
                                  (hoveredBar.groupKey !== groupLabel || hoveredBar.motivoKey !== bar.chave));
                              const isHighlighted =
                                hoveredMotivo === bar.chave ||
                                (hoveredBar?.groupKey === groupLabel && hoveredBar?.motivoKey === bar.chave);

                              return (
                                <button
                                  key={bar.chave}
                                  type="button"
                                  onClick={() => onSelectBar(row, bar.chave)}
                                  onMouseEnter={() =>
                                    setHoveredBar({ groupKey: groupLabel, motivoKey: bar.chave })
                                  }
                                  onMouseLeave={() => setHoveredBar(null)}
                                  data-testid={`bar-${groupLabel}-${bar.chave}`}
                                  title={`${groupLabel} · ${bar.nome}: ${fmtNum(bar.valor)}`}
                                  className={cn(
                                    "group/bar relative flex flex-col items-center justify-end focus:outline-none transition-all duration-200 cursor-pointer",
                                    isDimmed ? "opacity-35" : "opacity-100"
                                  )}
                                >
                                  {/* Floating Value Tag / Balloon right above the column */}
                                  <div
                                    className={cn(
                                      "mb-1.5 flex items-center justify-center rounded-md border px-1.5 sm:px-2 py-0.5 num text-[10px] sm:text-[11px] font-bold leading-tight text-white shadow-sm transition-transform duration-150",
                                      isHighlighted && "scale-110 shadow-md"
                                    )}
                                    style={{
                                      backgroundColor: "#162234",
                                      borderColor: `${bar.color}88`,
                                      boxShadow: isHighlighted ? `0 0 12px ${bar.color}40` : undefined,
                                    }}
                                  >
                                    {fmtNum(bar.valor)}
                                  </div>

                                  {/* Column Bar */}
                                  <div
                                    className={cn(
                                      "w-5 sm:w-8 md:w-9 rounded-t-md transition-all duration-200",
                                      isHighlighted && "brightness-110 ring-1 ring-white/40"
                                    )}
                                    style={{
                                      height: `${barHeight}px`,
                                      background: `linear-gradient(180deg, ${bar.color} 0%, ${bar.color}CC 100%)`,
                                      boxShadow: `0 4px 14px -2px ${bar.color}33`,
                                    }}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
              </div>
            </div>
          </div>

          {/* X-Axis Group Labels */}
          <div className="flex pl-7 sm:pl-9 pt-2.5">
            <div className="flex flex-1 items-center justify-around px-1.5 sm:px-6 gap-2 sm:gap-4">
              {isCargoConsolidated
                ? cargoItems.map((item) => (
                    <div key={item.chave} className="flex-1 text-center min-w-0">
                      <span className="block truncate font-sans text-[11px] sm:text-xs font-semibold tracking-wide text-slate-200">
                        {item.nome}
                      </span>
                    </div>
                  ))
                : rows.map((row) => {
                    const groupLabel = String(row.ano);
                    return (
                      <div key={groupLabel} className="flex-1 text-center">
                        <span className="font-sans text-[11px] sm:text-xs font-semibold tracking-wide text-slate-200">
                          {groupLabel}
                        </span>
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>
      </div>

      {/* Redesigned Legend Footer */}
      <div
        className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 sm:gap-x-5 sm:gap-y-2.5 border-t border-[#1E2C42]/80 pt-3.5 px-1 sm:px-2"
        data-testid="desligamentos-legend"
      >
        {isCargoConsolidated
          ? cargoItems.map((item) => {
              const active = hoveredCargo === item.chave;
              return (
                <button
                  key={item.chave}
                  type="button"
                  onMouseEnter={() => setHoveredCargo(item.chave)}
                  onMouseLeave={() => setHoveredCargo(null)}
                  onClick={() => onSelectBar(item.row)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors cursor-pointer",
                    active ? "bg-white/[0.10] text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <span
                    className="size-3 shrink-0 rounded-[3px] shadow-xs"
                    style={{
                      backgroundColor: item.color,
                      boxShadow: `0 0 0 1px ${item.color}55`,
                    }}
                  />
                  <span className="font-sans text-xs font-medium tracking-tight text-slate-200">
                    {item.nome}
                  </span>
                </button>
              );
            })
          : orderedMotivos.map((m) => {
              const active = hoveredMotivo === m.chave;
              return (
                <button
                  key={m.chave}
                  type="button"
                  onMouseEnter={() => setHoveredMotivo(m.chave)}
                  onMouseLeave={() => setHoveredMotivo(null)}
                  onClick={() =>
                    setHoveredMotivo((prev) => (prev === m.chave ? null : m.chave))
                  }
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors",
                    active ? "bg-white/[0.10] text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <span
                    className="size-3 shrink-0 rounded-[3px] shadow-xs"
                    style={{
                      backgroundColor: m.color,
                      boxShadow: `0 0 0 1px ${m.color}55`,
                    }}
                  />
                  <span className="font-sans text-xs font-medium tracking-tight text-slate-200">
                    {m.nome}
                  </span>
                </button>
              );
            })}
      </div>
    </div>
  );
}

function EfetivoCargoGroupedChart({
  rows,
  cats,
  onSelectBar,
}: {
  rows: ChartRow[];
  cats: CountItem[];
  onSelectBar: (row: ChartRow, cat: CountItem) => void;
}) {
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<{ ano: string; catKey: string } | null>(null);

  const catMeta = cats.map((c, i) => ({
    ...c,
    color: catColor(c.chave, i),
  }));

  const maxVal = Math.max(
    1,
    ...rows.flatMap((r) => catMeta.map((c) => Number(r[c.chave] || 0)))
  );
  const rawStep = Math.ceil(maxVal / 4);
  const step = rawStep <= 10 ? Math.max(1, rawStep) : Math.ceil(rawStep / 10) * 10;
  const maxScale = step * 4;
  const yTicks = [maxScale, step * 3, step * 2, step, 0];
  const plotHeight = 196;

  const totalBars = rows.reduce(
    (sum, r) => sum + catMeta.filter((c) => Number(r[c.chave] || 0) > 0).length,
    0
  );
  const needsScroll = totalBars > 5 || rows.length > 2;

  return (
    <div className="flex flex-col select-none" data-testid="efetivo-cargo-grouped-chart">
      <div className={cn(needsScroll && "overflow-x-auto scrollbar-none -mx-1 px-1")}>
        <div className={cn(needsScroll && "min-w-[460px] sm:min-w-0")}>
          {/* Main Chart Plot Area */}
          <div className="relative flex pt-5 pb-1">
            {/* Y-Axis Labels */}
            <div
              className="flex flex-col justify-between pr-2 sm:pr-3 text-right num text-[11px] font-medium text-[#64748B]"
              style={{ height: plotHeight }}
            >
              {yTicks.map((t) => (
                <span key={t} className="leading-none -translate-y-1">
                  {fmtNum(t)}
                </span>
              ))}
            </div>

            {/* Grid & Grouped Columns */}
            <div className="relative flex-1" style={{ height: plotHeight }}>
              {/* Discrete Horizontal Grid Lines */}
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {yTicks.map((t, idx) => (
                  <div
                    key={t}
                    className={cn(
                      "w-full border-t",
                      idx === yTicks.length - 1 ? "border-[#263854]" : "border-[#1E2C42]/80 border-dashed"
                    )}
                  />
                ))}
              </div>

              {/* Groups by Year */}
              <div className="relative z-10 flex h-full items-end justify-around px-1.5 sm:px-4 gap-2 sm:gap-4">
                {rows.map((row) => {
                  const anoLabel = String(row.ano);
                  const activeBars = catMeta
                    .map((c) => ({
                      ...c,
                      valor: Number(row[c.chave] || 0),
                    }))
                    .filter((b) => b.valor > 0);

                  return (
                    <div
                      key={anoLabel}
                      className="flex h-full flex-1 flex-col items-center justify-end min-w-0"
                    >
                      <div className="flex h-full items-end justify-center gap-1 sm:gap-2.5 px-0.5 sm:px-1">
                        {activeBars.map((bar) => {
                          const ratio = Math.min(1, bar.valor / maxScale);
                          const barHeight = Math.max(8, Math.round(ratio * plotHeight));
                          const isDimmed =
                            (hoveredCat !== null && hoveredCat !== bar.chave) ||
                            (hoveredBar !== null &&
                              (hoveredBar.ano !== anoLabel || hoveredBar.catKey !== bar.chave));
                          const isHighlighted =
                            hoveredCat === bar.chave ||
                            (hoveredBar?.ano === anoLabel && hoveredBar?.catKey === bar.chave);

                          return (
                            <button
                              key={bar.chave}
                              type="button"
                              onClick={() => onSelectBar(row, bar)}
                              onMouseEnter={() =>
                                setHoveredBar({ ano: anoLabel, catKey: bar.chave })
                              }
                              onMouseLeave={() => setHoveredBar(null)}
                              data-testid={`efetivo-bar-${anoLabel}-${bar.chave}`}
                              title={`${anoLabel} · ${bar.nome}: ${fmtNum(bar.valor)}`}
                              className={cn(
                                "group/bar relative flex flex-col items-center justify-end focus:outline-none transition-all duration-200 cursor-pointer",
                                isDimmed ? "opacity-35" : "opacity-100"
                              )}
                            >
                              {/* Floating Value Tag / Balloon right above the column */}
                              <div
                                className={cn(
                                  "mb-1.5 flex items-center justify-center rounded-md border px-1 sm:px-1.5 py-0.5 num text-[10px] sm:text-[11px] font-bold leading-tight text-white shadow-sm transition-transform duration-150",
                                  isHighlighted && "scale-110 shadow-md"
                                )}
                                style={{
                                  backgroundColor: "#162234",
                                  borderColor: `${bar.color}88`,
                                  boxShadow: isHighlighted ? `0 0 12px ${bar.color}40` : undefined,
                                }}
                              >
                                {fmtNum(bar.valor)}
                              </div>

                              {/* Column Bar */}
                              <div
                                className={cn(
                                  "w-4 sm:w-7 md:w-8 rounded-t-md transition-all duration-200",
                                  isHighlighted && "brightness-110 ring-1 ring-white/40"
                                )}
                                style={{
                                  height: `${barHeight}px`,
                                  background: `linear-gradient(180deg, ${bar.color} 0%, ${bar.color}CC 100%)`,
                                  boxShadow: `0 4px 14px -2px ${bar.color}33`,
                                }}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* X-Axis Year Labels */}
          <div className="flex pl-7 sm:pl-9 pt-2.5">
            <div className="flex flex-1 items-center justify-around px-1.5 sm:px-4 gap-2 sm:gap-4">
              {rows.map((row) => {
                const anoLabel = String(row.ano);
                return (
                  <div key={anoLabel} className="flex-1 text-center">
                    <span className="font-sans text-[11px] sm:text-xs font-semibold tracking-wide text-slate-200">
                      {anoLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Redesigned Legend Footer */}
      <div
        className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 sm:gap-x-5 sm:gap-y-2.5 border-t border-[#1E2C42]/80 pt-3.5 px-1 sm:px-2"
        data-testid="efetivo-cargo-legend"
      >
        {catMeta.map((c) => {
          const active = hoveredCat === c.chave;
          return (
            <button
              key={c.chave}
              type="button"
              onMouseEnter={() => setHoveredCat(c.chave)}
              onMouseLeave={() => setHoveredCat(null)}
              onClick={() =>
                setHoveredCat((prev) => (prev === c.chave ? null : c.chave))
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors",
                active ? "bg-white/[0.10] text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              <span
                className="size-3 shrink-0 rounded-[3px] shadow-xs"
                style={{
                  backgroundColor: c.color,
                  boxShadow: `0 0 0 1px ${c.color}55`,
                }}
              />
              <span className="font-sans text-xs font-medium tracking-tight text-slate-200">
                {c.nome}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EfetivoUbmStyledChart({
  items,
  ubmAll,
  onSelectUbm,
}: {
  items: CountItem[];
  ubmAll: boolean;
  onSelectUbm: (item: CountItem) => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const barColor = "#3B82F6";

  const maxVal = Math.max(1, ...items.map((x) => Number(x.total || 0)));
  const rawStep = Math.ceil(maxVal / 4);
  const step = rawStep <= 5 ? Math.max(1, rawStep) : Math.ceil(rawStep / 5) * 5;
  const maxScale = step * 4;
  const xTicks = [0, step, step * 2, step * 3, maxScale];

  return (
    <div className="flex flex-col select-none" data-testid="efetivo-ubm-styled-chart">
      {/* Mobile: stacked 2-line bars so UBM names never truncate and bars get full width */}
      <div className={cn("sm:hidden space-y-2", ubmAll && "max-h-[460px] overflow-y-auto pr-1")}>
        {items.map((item) => {
          const ratio = Math.min(1, item.total / maxScale);
          const widthPct = Math.max(4, Math.round(ratio * 100));
          return (
            <button
              key={item.chave}
              type="button"
              onClick={() => onSelectUbm(item)}
              data-testid={`ubm-bar-mobile-${item.chave}`}
              className="flex min-h-[48px] w-full flex-col justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#060B15]/68 px-3 py-2 text-left transition-colors active:bg-white/[0.08] cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-200 leading-snug">{item.nome}</span>
                <span
                  className="shrink-0 rounded-md border px-2 py-0.5 num text-[11px] font-bold text-white"
                  style={{ backgroundColor: "#162234", borderColor: `${barColor}88` }}
                >
                  {fmtNum(item.total)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#1E2C42]/70">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${widthPct}%`,
                    background: `linear-gradient(90deg, ${barColor}CC 0%, ${barColor} 100%)`,
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop / Tablet: horizontal bar chart with aligned X-axis ticks */}
      <div className="hidden sm:block">
        <div className={cn("relative", ubmAll && "max-h-[520px] overflow-y-auto pr-1")}>
          <div className="relative space-y-2 py-1">
            {items.map((item) => {
              const ratio = Math.min(1, item.total / maxScale);
              const widthPct = Math.max(3, Math.round(ratio * 100));
              const isDimmed = hoveredKey !== null && hoveredKey !== item.chave;
              const isHighlighted = hoveredKey === item.chave;

              return (
                <button
                  key={item.chave}
                  type="button"
                  onClick={() => onSelectUbm(item)}
                  onMouseEnter={() => setHoveredKey(item.chave)}
                  onMouseLeave={() => setHoveredKey(null)}
                  data-testid={`ubm-bar-${item.chave}`}
                  title={`${item.nome}: ${fmtNum(item.total)} ativos`}
                  className={cn(
                    "group/ubm flex w-full items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-all duration-150 focus:outline-none cursor-pointer",
                    isHighlighted && "bg-white/[0.06]",
                    isDimmed ? "opacity-40" : "opacity-100"
                  )}
                >
                  {/* UBM Name */}
                  <span className="w-[155px] sm:w-[195px] shrink-0 truncate text-right font-sans text-[11px] font-medium text-slate-300 group-hover/ubm:text-white">
                    {item.nome}
                  </span>

                  {/* Horizontal Bar + Floating Value Tag */}
                  <div className="relative flex flex-1 items-center pr-12">
                    {/* Subtle background track */}
                    <div className="pointer-events-none absolute inset-y-0 left-0 right-12 flex justify-between">
                      {xTicks.map((t, idx) => (
                        <div
                          key={t}
                          className={cn(
                            "h-full border-l",
                            idx === 0 ? "border-[#263854]" : "border-[#1E2C42]/60 border-dashed"
                          )}
                        />
                      ))}
                    </div>

                    {/* Bar */}
                    <div
                      className={cn(
                        "relative z-10 h-5 rounded-r-md transition-all duration-200",
                        isHighlighted && "brightness-110 ring-1 ring-white/40"
                      )}
                      style={{
                        width: `${widthPct}%`,
                        background: `linear-gradient(90deg, ${barColor}CC 0%, ${barColor} 100%)`,
                        boxShadow: `0 2px 10px -2px ${barColor}44`,
                      }}
                    />

                    {/* Value Tag / Balloon right next to bar */}
                    <div
                      className={cn(
                        "relative z-10 ml-2 flex items-center justify-center rounded-md border px-2 py-0.5 num text-[11px] font-bold leading-tight text-white shadow-sm transition-transform duration-150",
                        isHighlighted && "scale-105 shadow-md"
                      )}
                      style={{
                        backgroundColor: "#162234",
                        borderColor: `${barColor}88`,
                        boxShadow: isHighlighted ? `0 0 12px ${barColor}40` : undefined,
                      }}
                    >
                      {fmtNum(item.total)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* X-Axis Scale Labels */}
        <div className="mt-2 flex items-center pl-[167px] sm:pl-[207px] pr-14">
          <div className="flex flex-1 justify-between num text-[11px] font-medium text-[#64748B]">
            {xTicks.map((t) => (
              <span key={t}>{fmtNum(t)}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Redesigned Legend Footer */}
      <div
        className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-[#1E2C42]/80 pt-3.5 px-2"
        data-testid="efetivo-ubm-legend"
      >
        <div className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-slate-200">
          <span
            className="size-3 shrink-0 rounded-[3px] shadow-xs"
            style={{
              backgroundColor: barColor,
              boxShadow: `0 0 0 1px ${barColor}55`,
            }}
          />
          <span className="font-sans text-xs font-medium tracking-tight text-slate-200">
            Efetivo ativo por Lotação / UBM
          </span>
        </div>
      </div>
    </div>
  );
}

function DistribuicaoStyledChart({
  items,
  distView,
  onSelectSlice,
}: {
  items: CountItem[];
  distView: string;
  onSelectSlice: (item: CountItem) => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const enriched = items.map((x, i) => ({
    ...x,
    color: distView === "cargo" ? catColor(x.chave, i) : PALETTE[(i + 2) % PALETTE.length],
  }));
  const totalGeral = enriched.reduce((acc, cur) => acc + (cur.total || 0), 0);

  const renderCustomLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, index, name, value, percent } = props;
    const item = enriched[index];
    if (!item || !value) return null;

    const RADIAN = Math.PI / 180;
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 5) * cos;
    const sy = cy + (outerRadius + 5) * sin;
    const mx = cx + (outerRadius + 20) * cos;
    const my = cy + (outerRadius + 20) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 12;
    const ey = my;
    const textAnchor = cos >= 0 ? "start" : "end";
    const pct = Math.round((percent ?? 0) * 100);
    const shortName = String(name ?? "").length > 24 ? `${String(name).slice(0, 23)}…` : String(name ?? "");
    const badgeText = `${fmtNum(value)} (${pct}%)`;
    const isDimmed = hoveredKey !== null && hoveredKey !== item.chave;
    const isHighlighted = hoveredKey === item.chave;

    return (
      <g
        style={{ opacity: isDimmed ? 0.35 : 1, transition: "opacity 180ms ease" }}
        className="pointer-events-none"
      >
        <path
          d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
          stroke={item.color}
          strokeWidth={isHighlighted ? 2.25 : 1.5}
          fill="none"
        />
        <circle cx={ex} cy={ey} r={3} fill={item.color} />
        <text
          x={ex + (cos >= 0 ? 7 : -7)}
          y={ey - 5}
          textAnchor={textAnchor}
          fill="#E2E8F0"
          className="font-sans text-[12px] font-semibold"
        >
          {shortName}
        </text>
        <text
          x={ex + (cos >= 0 ? 7 : -7)}
          y={ey + 11}
          textAnchor={textAnchor}
          fill="#FFFFFF"
          className="num text-[12.5px] font-bold"
        >
          {badgeText}
        </text>
      </g>
    );
  };

  const chartHeight = isMobile ? 220 : 330;

  return (
    <div className="flex flex-col select-none" data-testid="distribuicao-styled-chart">
      <div className={cn("relative w-full", isMobile ? "h-[220px]" : "h-[330px]")}>
        {/* Center Donut Total Label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("num font-extrabold text-white", isMobile ? "text-2xl" : "text-3xl")}>
            {fmtNum(totalGeral)}
          </span>
          <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Ativos
          </span>
        </div>

        <ResponsiveContainer width="100%" height={chartHeight}>
          <PieChart>
            <Pie
              data={enriched}
              dataKey="total"
              nameKey="nome"
              cx="50%"
              cy="50%"
              innerRadius={isMobile ? 56 : 72}
              outerRadius={isMobile ? 88 : 112}
              paddingAngle={3}
              stroke="#0A1221"
              strokeWidth={2}
              className="cursor-pointer focus:outline-none"
              labelLine={false}
              label={isMobile ? false : renderCustomLabel}
              onMouseEnter={(_: unknown, idx: number) => {
                if (enriched[idx]) setHoveredKey(enriched[idx].chave);
              }}
              onMouseLeave={() => setHoveredKey(null)}
              onClick={(e: { payload?: CountItem }) => {
                const p = e.payload;
                if (p) onSelectSlice(p);
              }}
            >
              {enriched.map((x) => {
                const isDimmed = hoveredKey !== null && hoveredKey !== x.chave;
                return (
                  <Cell
                    key={x.chave}
                    fill={x.color}
                    style={{
                      opacity: isDimmed ? 0.35 : 1,
                      filter: hoveredKey === x.chave ? `drop-shadow(0 0 8px ${x.color}66)` : undefined,
                      transition: "opacity 180ms ease, filter 180ms ease",
                    }}
                  />
                );
              })}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(x: number) => [fmtNum(x), "Ativos"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Redesigned Legend Footer with Value Tags */}
      <div
        className="mt-3 grid grid-cols-1 gap-1.5 border-t border-white/[0.08] pt-3.5 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-5 sm:gap-y-3 sm:pt-4 sm:px-2"
        data-testid="distribuicao-legend"
      >
        {enriched.map((x) => {
          const active = hoveredKey === x.chave;
          const pct = totalGeral > 0 ? Math.round((x.total / totalGeral) * 100) : 0;
          return (
            <button
              key={x.chave}
              type="button"
              onMouseEnter={() => setHoveredKey(x.chave)}
              onMouseLeave={() => setHoveredKey(null)}
              onClick={() => onSelectSlice(x)}
              className={cn(
                "flex w-full items-center justify-between gap-2.5 rounded-lg border border-white/[0.08] bg-[#060B15]/68 px-3 py-2 text-left transition-colors cursor-pointer sm:inline-flex sm:w-auto sm:justify-start sm:border-transparent sm:bg-transparent sm:px-2.5 sm:py-1.5",
                active ? "bg-white/[0.10] text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="size-3.5 shrink-0 rounded-[4px] shadow-xs"
                  style={{
                    backgroundColor: x.color,
                    boxShadow: `0 0 0 1px ${x.color}55`,
                  }}
                />
                <span className="truncate font-sans text-xs sm:text-[13.5px] font-semibold tracking-tight text-slate-200">
                  {x.nome}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="num text-[11px] font-medium text-slate-400 sm:hidden">
                  {pct}%
                </span>
                <span
                  className="rounded-md border px-2 py-0.5 num text-xs font-bold text-white"
                  style={{
                    backgroundColor: "#162234",
                    borderColor: `${x.color}77`,
                  }}
                >
                  {fmtNum(x.total)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EvolucaoStyledChart({
  rows,
  evoView,
  onSelectInclusoes,
  onSelectDesligamentos,
}: {
  rows: ChartRow[];
  evoView: string;
  onSelectInclusoes: (row: ChartRow) => void;
  onSelectDesligamentos: (row: ChartRow) => void;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [displayMode, setDisplayMode] = useState<"chart" | "table">("chart");

  const n = rows.length;
  const isAnual = evoView === "anual";

  const totalInc = rows.reduce((acc, r) => acc + Number(r.inclusoes || 0), 0);
  const totalDesl = rows.reduce((acc, r) => acc + Number(r.desligamentos || 0), 0);
  const saldoTotal = totalInc - totalDesl;
  const efetivoAtual = rows.length ? Number(rows[rows.length - 1].efetivo || 0) : 0;

  // Escala independente para a linha de efetivo (faixa superior)
  const efVals = rows.map((r) => Number(r.efetivo || 0));
  const efMinRaw = Math.min(...efVals, 0);
  const efMaxRaw = Math.max(...efVals, 1);
  const efDomainMin = efMinRaw > 0 && efMaxRaw - efMinRaw < efMaxRaw * 0.65
    ? Math.max(0, Math.floor(efMinRaw * 0.8))
    : 0;
  const efDomainMax = Math.max(efDomainMin + 4, Math.ceil(efMaxRaw * 1.12));
  const efSpan = Math.max(1, efDomainMax - efDomainMin);

  // Escala independente para as barras de movimentação (faixa inferior)
  const maxMov = Math.max(
    1,
    ...rows.flatMap((r) => [Number(r.inclusoes || 0), Number(r.desligamentos || 0)])
  );
  const movRawStep = Math.ceil(maxMov / 3);
  const movStep = movRawStep <= 10 ? Math.max(1, movRawStep) : Math.ceil(movRawStep / 5) * 5;
  const movMaxScale = movStep * 3;
  const movTicks = [movMaxScale, movStep * 2, movStep, 0];
  const barPlotHeight = 122;

  const getLabel = (r: ChartRow) => String(isAnual ? r.ano : r.rotulo);

  // Pontos para SVG (viewBox 1000 x 100) alinhados exatamente no centro de cada coluna
  const linePoints = rows.map((r, i) => {
    const x = ((i + 0.5) / Math.max(1, n)) * 1000;
    const val = Number(r.efetivo || 0);
    const ratio = (val - efDomainMin) / efSpan;
    // Deixa folga superior (24) para o rótulo e inferior (12)
    const y = 88 - ratio * 64;
    return { x, y, val, leftPct: ((i + 0.5) / Math.max(1, n)) * 100 };
  });

  const polylineStr = linePoints.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const areaStr =
    linePoints.length > 0
      ? `${linePoints[0].x.toFixed(2)},100 ${polylineStr} ${linePoints[linePoints.length - 1].x.toFixed(2)},100`
      : "";

  const activeIdx = hoveredIdx !== null && rows[hoveredIdx] ? hoveredIdx : null;
  const activeRow = activeIdx !== null ? rows[activeIdx] : null;

  const needsHorizontalScroll = !isAnual && rows.length > 6;

  return (
    <div className="flex flex-1 flex-col justify-between select-none" data-testid="evolucao-styled-chart">
      {/* Resumo rápido + alternância Gráfico / Tabela */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="grid w-full grid-cols-3 gap-1.5 sm:flex-1 sm:gap-2 sm:min-w-[260px]">
          <div className="rounded-lg border border-emerald-500/25 bg-[#060B15]/68 px-2 py-1.5 sm:px-2.5 sm:py-2">
            <p className="truncate text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-400">Inclusões</p>
            <p className="num mt-0.5 text-sm sm:text-base font-bold text-emerald-400">+{fmtNum(totalInc)}</p>
          </div>
          <div className="rounded-lg border border-red-500/25 bg-[#060B15]/68 px-2 py-1.5 sm:px-2.5 sm:py-2">
            <p className="truncate text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-400">Desligam.</p>
            <p className="num mt-0.5 text-sm sm:text-base font-bold text-red-400">-{fmtNum(totalDesl)}</p>
          </div>
          <div className="rounded-lg border border-blue-500/25 bg-[#060B15]/68 px-2 py-1.5 sm:px-2.5 sm:py-2">
            <p className="truncate text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-400">Efetivo</p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
              <span className="num text-sm sm:text-base font-bold text-blue-300">{fmtNum(efetivoAtual)}</span>
              <span
                className={cn(
                  "num text-[10px] sm:text-[11px] font-semibold",
                  saldoTotal >= 0 ? "text-emerald-400" : "text-red-400"
                )}
              >
                ({saldoTotal >= 0 ? `+${fmtNum(saldoTotal)}` : fmtNum(saldoTotal)})
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDisplayMode((m) => (m === "chart" ? "table" : "chart"))}
          data-testid="evolucao-toggle-mode"
          className="inline-flex h-10 sm:h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-white/[0.11] bg-[#060B15]/75 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
        >
          {displayMode === "chart" ? (
            <>
              <Table2 className="size-3.5 text-blue-400" /> Ver tabela
            </>
          ) : (
            <>
              <BarChart3 className="size-3.5 text-blue-400" /> Ver gráfico
            </>
          )}
        </button>
      </div>

      {displayMode === "table" ? (
        <div className="max-h-[340px] overflow-auto rounded-lg border border-white/[0.08] bg-[#060B15]/70" data-testid="evolucao-table">
          <table className="w-full min-w-[440px] text-xs">
            <thead className="sticky top-0 z-10 bg-[#0A1324] text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Período</th>
                <th className="px-3 py-2 text-right font-semibold text-emerald-400">Inclusões</th>
                <th className="px-3 py-2 text-right font-semibold text-red-400">Desligamentos</th>
                <th className="px-3 py-2 text-right font-semibold">Saldo</th>
                <th className="px-3 py-2 text-right font-semibold text-blue-300">Efetivo ativo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {rows.map((r) => {
                const inc = Number(r.inclusoes || 0);
                const desl = Number(r.desligamentos || 0);
                const saldo = inc - desl;
                const ef = Number(r.efetivo || 0);
                return (
                  <tr key={getLabel(r)} className="transition-colors hover:bg-white/[0.04]">
                    <td className="px-3 py-2 font-medium text-slate-200">{getLabel(r)}</td>
                    <td className="px-3 py-2 text-right">
                      {inc > 0 ? (
                        <button
                          type="button"
                          onClick={() => onSelectInclusoes(r)}
                          className="num inline-flex items-center rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                        >
                          +{fmtNum(inc)}
                        </button>
                      ) : (
                        <span className="num text-slate-500">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {desl > 0 ? (
                        <button
                          type="button"
                          onClick={() => onSelectDesligamentos(r)}
                          className="num inline-flex items-center rounded bg-red-500/15 px-1.5 py-0.5 font-semibold text-red-300 hover:bg-red-500/25 cursor-pointer"
                        >
                          -{fmtNum(desl)}
                        </button>
                      ) : (
                        <span className="num text-slate-500">0</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "num px-3 py-2 text-right font-semibold",
                        saldo > 0 ? "text-emerald-300" : saldo < 0 ? "text-red-300" : "text-slate-500"
                      )}
                    >
                      {saldo > 0 ? `+${fmtNum(saldo)}` : fmtNum(saldo)}
                    </td>
                    <td className="num px-3 py-2 text-right font-bold text-blue-300">{fmtNum(ef)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-2">
          {needsHorizontalScroll && (
            <p className="text-[11px] text-slate-400 sm:hidden">
              Deslize lateralmente para ver todos os meses · toque em um período para destacar
            </p>
          )}
          <div className={cn(needsHorizontalScroll && "overflow-x-auto scrollbar-none -mx-1 px-1")}>
            <div className={cn("flex flex-col gap-3", needsHorizontalScroll && "min-w-[560px] sm:min-w-0")}>
              {/* FAIXA 1: Efetivo ativo acumulado (escala própria, sem sobrepor barras) */}
              <div className="rounded-lg border border-white/[0.08] bg-[#060B15]/68 px-3 pt-2.5 pb-2">
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-blue-300">
                    <span className="size-2 rounded-full bg-blue-400" />
                    Efetivo ativo no período
                  </span>
                  <span
                    className={cn(
                      "num text-[11px] transition-colors duration-150",
                      activeRow ? "font-semibold text-blue-200" : "text-slate-400"
                    )}
                  >
                    {activeRow
                      ? `${getLabel(activeRow)}: ${fmtNum(Number(activeRow.efetivo || 0))} ativos`
                      : `Atual: ${fmtNum(efetivoAtual)} ativos`}
                  </span>
                </div>

                <div className="flex">
                  {/* Espaçador alinhado ao eixo Y da faixa inferior */}
                  <div className="w-8 shrink-0 pr-1.5 flex flex-col justify-between text-right num text-[10px] text-[#64748B]" style={{ height: 96 }}>
                    <span>{fmtNum(efDomainMax)}</span>
                    <span>{fmtNum(efDomainMin)}</span>
                  </div>

                  <div className="relative flex-1" style={{ height: 96 }}>
                    {/* Faixas verticais interativas por mês para destaque amplo ao passar o cursor ou tocar */}
                    <div className="absolute inset-0 z-[1] flex">
                      {rows.map((r, i) => {
                        const isColHovered = activeIdx === i;
                        return (
                          <div
                            key={getLabel(r)}
                            onMouseEnter={() => setHoveredIdx(i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                            onClick={() => setHoveredIdx((prev) => (prev === i ? null : i))}
                            className={cn(
                              "relative flex-1 h-full rounded-md transition-all duration-150 cursor-pointer",
                              isColHovered &&
                                "bg-blue-500/15 ring-1 ring-inset ring-blue-400/45 shadow-[inset_0_0_22px_rgba(96,165,250,0.22)]"
                            )}
                          >
                            {isColHovered && (
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-y-1 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-gradient-to-b from-blue-300/75 via-blue-400/45 to-blue-400/10"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Linhas guia discretas */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                      <div className="border-t border-dashed border-[#1E2C42]/70" />
                      <div className="border-t border-dashed border-[#1E2C42]/50" />
                      <div className="border-t border-[#263854]/80" />
                    </div>

                    <svg
                      viewBox="0 0 1000 100"
                      preserveAspectRatio="none"
                      className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
                    >
                      <defs>
                        <linearGradient id="evolucaoEfetivoGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.32} />
                          <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      {linePoints.length > 1 && (
                        <>
                          <polygon points={areaStr} fill="url(#evolucaoEfetivoGrad)" />
                          <polyline
                            points={polylineStr}
                            fill="none"
                            stroke="#60A5FA"
                            strokeWidth={2.5}
                            vectorEffect="non-scaling-stroke"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        </>
                      )}
                    </svg>

                    {/* Pontos e rótulos numéricos alinhados com as colunas abaixo */}
                    {linePoints.map((p, i) => {
                      const prevVal = i > 0 ? linePoints[i - 1].val : null;
                      const nextVal = i < linePoints.length - 1 ? linePoints[i + 1].val : null;
                      const isEdge = i === 0 || i === linePoints.length - 1;
                      const changed = prevVal === null || p.val !== prevVal || (nextVal !== null && p.val !== nextVal);
                      const isHovered = activeIdx === i;
                      const isDimmed = activeIdx !== null && activeIdx !== i;
                      const showLabel = isAnual || rows.length <= 6 || isEdge || changed || isHovered;

                      return (
                        <div
                          key={getLabel(rows[i])}
                          onMouseEnter={() => setHoveredIdx(i)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          onClick={() => setHoveredIdx((prev) => (prev === i ? null : i))}
                          style={{ left: `${p.leftPct}%`, top: `${p.y}%` }}
                          className={cn(
                            "absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer transition-opacity duration-150",
                            isHovered && "z-30",
                            isDimmed && "opacity-40"
                          )}
                        >
                          {showLabel && (
                            <span
                              className={cn(
                                "pointer-events-none absolute rounded border px-1.5 py-0.5 num leading-none transition-all duration-150",
                                isHovered
                                  ? "-top-7 z-30 scale-[1.15] border-blue-300 bg-blue-600 px-2 py-1 text-[11px] font-extrabold text-white shadow-[0_4px_14px_rgba(59,130,246,0.65)]"
                                  : "-top-6 z-10 border-[#294366] bg-[#131F32] text-[10px] font-bold text-blue-200 shadow-sm"
                              )}
                            >
                              {fmtNum(p.val)}
                            </span>
                          )}
                          <span
                            className={cn(
                              "rounded-full border-2 border-[#08101E] transition-all duration-150",
                              isHovered
                                ? "size-4 bg-white ring-4 ring-blue-400/50 shadow-[0_0_16px_rgba(96,165,250,0.95)]"
                                : "size-2 bg-blue-400"
                            )}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* FAIXA 2: Movimentações (Inclusões vs Desligamentos em escala própria) */}
              <div className="rounded-lg border border-white/[0.08] bg-[#060B15]/68 px-3 pt-2.5 pb-2">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="font-medium text-slate-300">Movimentações no período (toque nas barras para listar)</span>
                  <div className="flex items-center gap-3 text-[11px] text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-[2px] bg-emerald-500" /> Inclusões
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-[2px] bg-red-500" /> Desligamentos
                    </span>
                  </div>
                </div>

                <div className="flex pt-4">
                  {/* Eixo Y das movimentações */}
                  <div
                    className="w-8 shrink-0 pr-1.5 flex flex-col justify-between text-right num text-[10px] font-medium text-[#64748B]"
                    style={{ height: barPlotHeight }}
                  >
                    {movTicks.map((t) => (
                      <span key={t} className="leading-none -translate-y-1">
                        {fmtNum(t)}
                      </span>
                    ))}
                  </div>

                  {/* Área das barras */}
                  <div className="relative flex-1" style={{ height: barPlotHeight }}>
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                      {movTicks.map((t, idx) => (
                        <div
                          key={t}
                          className={cn(
                            "w-full border-t",
                            idx === movTicks.length - 1 ? "border-[#263854]" : "border-[#1E2C42]/70 border-dashed"
                          )}
                        />
                      ))}
                    </div>

                    <div className="relative z-10 flex h-full items-end">
                      {rows.map((r, i) => {
                        const inc = Number(r.inclusoes || 0);
                        const desl = Number(r.desligamentos || 0);
                        const incH = inc > 0 ? Math.max(8, Math.round((inc / movMaxScale) * barPlotHeight)) : 0;
                        const deslH = desl > 0 ? Math.max(8, Math.round((desl / movMaxScale) * barPlotHeight)) : 0;
                        const isColHovered = activeIdx === i;
                        const isColDimmed = activeIdx !== null && activeIdx !== i;

                        return (
                          <div
                            key={getLabel(r)}
                            onMouseEnter={() => setHoveredIdx(i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                            className={cn(
                              "flex h-full flex-1 items-end justify-center gap-1 px-0.5 rounded-t-md transition-all duration-150",
                              isColHovered &&
                                "bg-blue-500/15 ring-1 ring-inset ring-blue-400/45 shadow-[inset_0_0_20px_rgba(59,130,246,0.18)]",
                              isColDimmed ? "opacity-35" : "opacity-100"
                            )}
                          >
                            {/* Barra Inclusões */}
                            {inc > 0 ? (
                              <button
                                type="button"
                                onClick={() => onSelectInclusoes(r)}
                                title={`${getLabel(r)} · Inclusões: ${fmtNum(inc)}`}
                                data-testid={`evo-inc-${i}`}
                                className="group/inc relative flex flex-col items-center justify-end cursor-pointer focus:outline-none"
                              >
                                <span
                                  className={cn(
                                    "mb-1 num leading-none transition-all duration-150",
                                    isColHovered
                                      ? "text-[11px] font-extrabold text-emerald-200 scale-110"
                                      : "text-[10px] font-bold text-emerald-300 group-hover/inc:text-white"
                                  )}
                                >
                                  {fmtNum(inc)}
                                </span>
                                <div
                                  className={cn(
                                    "rounded-t transition-all duration-150",
                                    isAnual ? "w-7 sm:w-9" : "w-3 sm:w-3.5",
                                    "bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover/inc:brightness-110",
                                    isColHovered && "brightness-[1.15] shadow-[0_0_12px_rgba(16,185,129,0.5)] scale-x-110"
                                  )}
                                  style={{ height: `${incH}px` }}
                                />
                              </button>
                            ) : (
                              <div
                                className={cn(
                                  "rounded-t transition-colors",
                                  isColHovered ? "bg-slate-500/40" : "bg-[#1E2C42]/50",
                                  isAnual ? "w-7 sm:w-9" : "w-3 sm:w-3.5"
                                )}
                                style={{ height: 3 }}
                              />
                            )}

                            {/* Barra Desligamentos */}
                            {desl > 0 ? (
                              <button
                                type="button"
                                onClick={() => onSelectDesligamentos(r)}
                                title={`${getLabel(r)} · Desligamentos: ${fmtNum(desl)}`}
                                data-testid={`evo-desl-${i}`}
                                className="group/desl relative flex flex-col items-center justify-end cursor-pointer focus:outline-none"
                              >
                                <span
                                  className={cn(
                                    "mb-1 num leading-none transition-all duration-150",
                                    isColHovered
                                      ? "text-[11px] font-extrabold text-red-200 scale-110"
                                      : "text-[10px] font-bold text-red-300 group-hover/desl:text-white"
                                  )}
                                >
                                  {fmtNum(desl)}
                                </span>
                                <div
                                  className={cn(
                                    "rounded-t transition-all duration-150",
                                    isAnual ? "w-7 sm:w-9" : "w-3 sm:w-3.5",
                                    "bg-gradient-to-t from-red-600 to-red-400 group-hover/desl:brightness-110",
                                    isColHovered && "brightness-[1.15] shadow-[0_0_12px_rgba(239,68,68,0.5)] scale-x-110"
                                  )}
                                  style={{ height: `${deslH}px` }}
                                />
                              </button>
                            ) : (
                              <div
                                className={cn(
                                  "rounded-t transition-colors",
                                  isColHovered ? "bg-slate-500/40" : "bg-[#1E2C42]/50",
                                  isAnual ? "w-7 sm:w-9" : "w-3 sm:w-3.5"
                                )}
                                style={{ height: 3 }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Rótulos do eixo X */}
                <div className="flex pl-8 pt-1.5">
                  {rows.map((r, i) => {
                    const isLblActive = activeIdx === i;
                    const isLblDimmed = activeIdx !== null && activeIdx !== i;
                    return (
                      <div
                        key={getLabel(r)}
                        onMouseEnter={() => setHoveredIdx(i)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        onClick={() => setHoveredIdx((prev) => (prev === i ? null : i))}
                        className="flex-1 text-center min-w-0 px-0.5 cursor-pointer"
                      >
                        <span
                          className={cn(
                            "inline-block max-w-full truncate rounded px-1 py-0.5 font-sans text-[10px] sm:text-[11px] font-medium transition-all duration-150",
                            isLblActive
                              ? "bg-blue-500/25 font-bold text-white ring-1 ring-blue-400/50 shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                              : isLblDimmed
                                ? "text-slate-500/70"
                                : "text-slate-400"
                          )}
                        >
                          {getLabel(r)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rodapé de leitura dinâmica */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#1E2C42]/80 pt-2.5 text-xs text-slate-300">
        {activeRow ? (() => {
          const inc = Number(activeRow.inclusoes || 0);
          const desl = Number(activeRow.desligamentos || 0);
          const saldo = inc - desl;
          return (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-white">{getLabel(activeRow)}</span>
              <span className="num text-emerald-400">+{fmtNum(inc)} inclusões</span>
              <span className="num text-red-400">-{fmtNum(desl)} desligamentos</span>
              <span className={cn("num font-medium", saldo > 0 ? "text-emerald-300" : saldo < 0 ? "text-red-300" : "text-slate-400")}>
                Saldo: {saldo > 0 ? `+${fmtNum(saldo)}` : fmtNum(saldo)}
              </span>
              <span className="num font-semibold text-blue-300">Efetivo: {fmtNum(Number(activeRow.efetivo || 0))}</span>
            </div>
          );
        })() : (
          <span className="text-[11px] text-slate-400">
            Toque ou passe o cursor sobre um período para comparar entradas, saídas e efetivo acumulado.
          </span>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { filters } = useFilters();
  const [drill, setDrill] = useState<Drill | null>(null);
  const [desligView, setDesligView] = useState("ano");
  const [evoView, setEvoView] = useState("mensal");
  const [distView, setDistView] = useState("cargo");
  const [ubmAll, setUbmAll] = useState(false);
  const [hoveredKpi, setHoveredKpi] = useState<string | null>(null);
  const fp = filterParams(filters);
  const q = useQuery({
    queryKey: ["dashboard", fp],
    queryFn: () => apiGet<D>(`/dashboard${qs(fp)}`),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const d = q.isError ? undefined : q.data;
  const base = baseParams(filters);
  const ref = d?.data_referencia;
  const periodoTxt =
    d?.periodo_inicio && d?.periodo_fim
      ? `${fmtDate(d.periodo_inicio)} a ${fmtDate(d.periodo_fim)}`
      : d?.periodo_inicio
        ? `a partir de ${fmtDate(d.periodo_inicio)}`
        : d?.periodo_fim
          ? `até ${fmtDate(d.periodo_fim)}`
          : "todo o período";
  const deslParams = { ...base, deslig_ini: d?.periodo_inicio, deslig_fim: d?.periodo_fim, status: "DESLIGADO" };
  const cats = d?.categorias ?? [];
  const motivoNome = (k: string) => d?.motivos.find((m) => m.chave === k)?.nome ?? "Não informado";
  const motivoKeys = Array.from(
    new Set([
      ...(d?.deslig_por_ano ?? []).flatMap((r) => Object.keys(r).filter((k) => !["ano", "total"].includes(k))),
      ...(d?.deslig_por_cargo ?? []).flatMap((r) => Object.keys(r).filter((k) => !["categoria", "nome", "total"].includes(k))),
    ])
  );
  const v = (n: number | undefined) => (d ? fmtNum(n ?? 0) : "—");
  const ubm = (d?.por_ubm ?? []).slice(0, ubmAll ? undefined : 12);

  const CAT_ICON: Record<string, LucideIcon> = { AUXILIAR: Shield, CONDUTOR: Truck, TEC_ENFERMAGEM: Activity, ENFERMEIRO: HeartPulse, MEDICO: Stethoscope };
  const CAT_TONE: Record<string, KpiTone> = {
    AUXILIAR: "blue",
    CONDUTOR: "amber",
    TEC_ENFERMAGEM: "green",
    ENFERMEIRO: "cyan",
    MEDICO: "rose",
  };

  const visibleCats = cats.length ? cats.filter((c) => c.chave !== "OUTROS" || c.total > 0) : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
        <div>
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Visão geral</p>
          <h2 className="font-heading text-xl font-extrabold text-white sm:text-2xl md:text-3xl">Painel do efetivo temporário</h2>
          <p className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-400" data-testid="dashboard-criteria">
            Efetivo em <span className="num text-slate-200">{fmtDate(ref)}</span> · Movimentações: {periodoTxt} · Alerta: {d?.alerta_dias ?? "—"} dias
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await apiPost("/militares/sincronizar");
              } catch (_) {}
              await q.refetch();
            }}
            disabled={q.isFetching}
            className="h-10 sm:h-8 w-full sm:w-auto justify-center border-white/[0.11] bg-[#0B1424]/72 backdrop-blur-xl text-xs text-slate-300 hover:bg-white/[0.08] hover:text-white"
            data-testid="dashboard-refresh-button"
          >
            <RotateCw className={cn("mr-1.5 size-3.5", q.isFetching && "animate-spin text-blue-400")} />
            {q.isFetching ? "Sincronizando..." : "Sincronizar Firestore"}
          </Button>
        </div>
      </div>
      <FiltersBar />

      <div className="space-y-2.5 sm:space-y-3">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi id="ativos" label="Temporários ativos" value={v(d?.kpis.ativos)} icon={UserCheck} tone="green" sub={`Efetivo em ${fmtDate(ref)}`}
            className="col-span-2 md:col-span-1"
            isHighlighted={hoveredKpi === "ativos"} isDimmed={hoveredKpi !== null && hoveredKpi !== "ativos"}
            onHoverChange={(h) => setHoveredKpi(h ? "ativos" : null)}
            onClick={() => setDrill({ title: "Temporários ativos", params: { ...base, status: "ATIVO", ativo_em: ref } })} />
          <Kpi id="desligamentos" label="Distratos / desligamentos" value={v(d?.kpis.desligamentos_periodo)} icon={UserMinus} tone="red" sub={periodoTxt}
            isHighlighted={hoveredKpi === "desligamentos"} isDimmed={hoveredKpi !== null && hoveredKpi !== "desligamentos"}
            onHoverChange={(h) => setHoveredKpi(h ? "desligamentos" : null)}
            onClick={() => setDrill({ title: "Desligamentos no período", params: { ...deslParams, status: "DESLIGADO" }, variant: "desligados" })} />
          <Kpi id="top-ubm" label="UBM DE MAIOR EFETIVO" value={d ? fmtNum(d.kpis.top_ubm_total) : "—"} icon={Building2} tone="blue" sub={d?.kpis.top_ubm_nome ?? "—"}
            isHighlighted={hoveredKpi === "top-ubm"} isDimmed={hoveredKpi !== null && hoveredKpi !== "top-ubm"}
            onHoverChange={(h) => setHoveredKpi(h ? "top-ubm" : null)}
            onClick={() => d?.kpis.top_ubm_id && setDrill({ title: d.kpis.top_ubm_nome ?? "UBM", params: { ...base, status: "ATIVO", lotacao_id: d.kpis.top_ubm_id, ativo_em: ref } })} />
          <Kpi id="contratos-a-vencer" label="Contratos a vencer" value={v(d?.kpis.a_vencer)} icon={Clock} tone="amber" sub={`Próximos ${d?.alerta_dias ?? "—"} dias`}
            isHighlighted={hoveredKpi === "contratos-a-vencer"} isDimmed={hoveredKpi !== null && hoveredKpi !== "contratos-a-vencer"}
            onHoverChange={(h) => setHoveredKpi(h ? "contratos-a-vencer" : null)}
            onClick={() => setDrill({ title: "Contratos a vencer", params: { ...base, status: "ATIVO", venc: "a_vencer" } })} />
          <Kpi id="sub-judice" label="Militares sub judice" value={v(d?.kpis.sub_judice)} icon={Scale} tone="amber" sub={`Ativos em ${fmtDate(ref)}`}
            isHighlighted={hoveredKpi === "sub-judice"} isDimmed={hoveredKpi !== null && hoveredKpi !== "sub-judice"}
            onHoverChange={(h) => setHoveredKpi(h ? "sub-judice" : null)}
            onClick={() => setDrill({ title: "Militares sub judice", params: { ...base, status: "ATIVO", sub_judice: "true", ativo_em: ref } })} />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
          {visibleCats.map((c, idx) => {
            const catId = c.chave.toLowerCase().replace(/_/g, "-");
            const isOddLast = visibleCats.length % 2 === 1 && idx === visibleCats.length - 1;
            return (
              <Kpi key={c.chave} id={catId} label={c.nome} value={fmtNum(c.total)} icon={CAT_ICON[c.chave] ?? Briefcase} tone={CAT_TONE[c.chave] ?? "sky"} sub="Ativos no cargo"
                className={isOddLast ? "col-span-2 md:col-span-1" : undefined}
                isHighlighted={hoveredKpi === catId} isDimmed={hoveredKpi !== null && hoveredKpi !== catId}
                onHoverChange={(h) => setHoveredKpi(h ? catId : null)}
                onClick={() => setDrill({ title: `${c.nome} — ativos`, params: { ...base, status: "ATIVO", categoria: c.chave, ativo_em: ref } })} />
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard id="efetivo-cargo-ano" glowRgb="59, 130, 246" title="Inclusões por cargo/função e ano" desc={`Militares incluídos em cada ano (inclui posteriores desligamentos) · ${periodoTxt}. Clique para listar.`}>
          {d && d.efetivo_cargo_ano.length ? (
            <EfetivoCargoGroupedChart
              rows={d.efetivo_cargo_ano}
              cats={cats}
              onSelectBar={(row, c) => {
                const yearIni = `${row.ano}-01-01`;
                const yearFim = `${row.ano}-12-31`;
                const inclusaoIni = d.periodo_inicio && d.periodo_inicio > yearIni ? d.periodo_inicio : yearIni;
                const inclusaoFim = d.periodo_fim && d.periodo_fim < yearFim ? d.periodo_fim : yearFim;
                setDrill({
                  title: `${c.nome} — inclusões em ${row.ano}`,
                  params: { ...base, categoria: c.chave, inclusao_ini: inclusaoIni, inclusao_fim: inclusaoFim },
                  allowStatusFilter: true,
                });
              }}
            />
          ) : <Empty />}
        </ChartCard>

        <ChartCard
          id="desligamentos"
          glowRgb="239, 68, 68"
          title="Desligamentos por cargo, ano e motivo"
          desc={
            desligView === "cargo"
              ? `Total de desligamentos por cargo (todos os motivos unidos) · ${periodoTxt}`
              : `Data efetiva do desligamento · ${periodoTxt}`
          }
          action={
            <Tabs value={desligView} onValueChange={(x) => setDesligView(String(x))}>
              <TabsList><TabsTrigger value="ano" data-testid="desligamentos-tab-ano">Por ano</TabsTrigger><TabsTrigger value="cargo" data-testid="desligamentos-tab-cargo">Por cargo</TabsTrigger></TabsList>
            </Tabs>
          }>
          {d && (desligView === "ano" ? d.deslig_por_ano.length : d.deslig_por_cargo.length) ? (
            <DesligamentosGroupedChart
              rows={desligView === "ano" ? d.deslig_por_ano : d.deslig_por_cargo}
              motivoKeys={motivoKeys}
              motivoNome={motivoNome}
              desligView={desligView}
              onSelectBar={(row, k) => {
                if (desligView === "cargo" || !k) {
                  setDrill({
                    title: `Desligamentos — ${row.nome} (todos os motivos)`,
                    params: {
                      ...base,
                      status: "DESLIGADO",
                      categoria: String(row.categoria),
                      deslig_ini: d.periodo_inicio,
                      deslig_fim: d.periodo_fim,
                    },
                    variant: "desligados",
                  });
                  return;
                }
                const extra = String(row.ano) === "Sem data"
                  ? { sem_data_desligamento: "true" }
                  : (() => {
                      const yearIni = `${row.ano}-01-01`;
                      const yearFim = `${row.ano}-12-31`;
                      const desligIni = d.periodo_inicio && d.periodo_inicio > yearIni ? d.periodo_inicio : yearIni;
                      const desligFim = d.periodo_fim && d.periodo_fim < yearFim ? d.periodo_fim : yearFim;
                      return { deslig_ini: desligIni, deslig_fim: desligFim };
                    })();
                setDrill({
                  title: `Desligamentos — ${motivoNome(k)} — ${row.ano ?? row.nome}`,
                  params: { ...base, status: "DESLIGADO", motivo_id: k, ...extra },
                  variant: "desligados",
                });
              }}
            />
          ) : <Empty text="Nenhum desligamento registrado no período" />}
        </ChartCard>

        <ChartCard id="efetivo-ubm" glowRgb="34, 211, 238" title="Efetivo de temporários por UBM" desc={`Ativos em ${fmtDate(ref)} · ${d?.por_ubm.length ?? 0} lotações`}
          action={d && d.por_ubm.length > 12 ? (
            <button className="text-xs font-semibold text-blue-400 hover:text-blue-300" onClick={() => setUbmAll(!ubmAll)} data-testid="ubm-toggle-all">
              {ubmAll ? "Mostrar 12 maiores" : "Mostrar todas"}
            </button>
          ) : undefined}>
          {ubm.length ? (
            <EfetivoUbmStyledChart
              items={ubm}
              ubmAll={ubmAll}
              onSelectUbm={(p) =>
                setDrill({
                  title: `${p.nome} — ativos`,
                  params: { ...base, lotacao_id: p.chave, ativo_em: ref },
                })
              }
            />
          ) : <Empty />}
        </ChartCard>

        <ChartCard id="evolucao" glowRgb="96, 165, 250" title="Evolução do efetivo" desc="Efetivo ativo acumulado separado das movimentações (entradas e saídas)."
          className="flex flex-col"
          action={
            <Tabs value={evoView} onValueChange={(x) => setEvoView(String(x))}>
              <TabsList><TabsTrigger value="mensal" data-testid="evolucao-tab-mensal">Mensal</TabsTrigger><TabsTrigger value="anual" data-testid="evolucao-tab-anual">Anual</TabsTrigger></TabsList>
            </Tabs>
          }>
          {d && (evoView === "mensal" ? d.evolucao_mensal : d.evolucao_anual).length ? (
            <EvolucaoStyledChart
              rows={evoView === "mensal" ? d.evolucao_mensal : d.evolucao_anual}
              evoView={evoView}
              onSelectInclusoes={(r) => {
                const mes = String(r.mes || "");
                const [y, mm] = mes.split("-").map(Number);
                const lastDay = y && mm ? new Date(Date.UTC(y, mm, 0)).getUTCDate() : 31;
                const rawFim = evoView === "mensal" ? `${mes}-${String(lastDay).padStart(2, "0")}` : `${r.ano}-12-31`;
                const ini = evoView === "mensal" ? `${mes}-01` : `${r.ano}-01-01`;
                const fim = ref && rawFim > ref ? ref : rawFim;
                setDrill({
                  title: `Inclusões — ${r.rotulo ?? r.ano}`,
                  params: { ...base, inclusao_ini: ini, inclusao_fim: fim },
                  allowStatusFilter: true,
                });
              }}
              onSelectDesligamentos={(r) => {
                const mes = String(r.mes || "");
                const [y, mm] = mes.split("-").map(Number);
                const lastDay = y && mm ? new Date(Date.UTC(y, mm, 0)).getUTCDate() : 31;
                const rawFim = evoView === "mensal" ? `${mes}-${String(lastDay).padStart(2, "0")}` : `${r.ano}-12-31`;
                const ini = evoView === "mensal" ? `${mes}-01` : `${r.ano}-01-01`;
                const fim = ref && rawFim > ref ? ref : rawFim;
                setDrill({
                  title: `Desligamentos — ${r.rotulo ?? r.ano}`,
                  params: { ...base, status: "DESLIGADO", deslig_ini: ini, deslig_fim: fim },
                  variant: "desligados",
                });
              }}
            />
          ) : <Empty />}
        </ChartCard>

        <ChartCard id="distribuicao" glowRgb="16, 185, 129" title="Distribuição por Cargos e Editais" desc={`Efetivo em ${fmtDate(ref)} — use os filtros de período para consultar datas anteriores`}
          action={
            <Tabs value={distView} onValueChange={(x) => setDistView(String(x))}>
              <TabsList><TabsTrigger value="cargo" data-testid="distribuicao-tab-cargo">Por cargo</TabsTrigger><TabsTrigger value="edital" data-testid="distribuicao-tab-edital">Por edital</TabsTrigger></TabsList>
            </Tabs>
          }>
          {d && (distView === "cargo" ? d.dist_categoria : d.dist_edital).length ? (
            <DistribuicaoStyledChart
              items={distView === "cargo" ? d.dist_categoria : d.dist_edital}
              distView={distView}
              onSelectSlice={(p) =>
                setDrill({
                  title: `${p.nome} — ativos`,
                  params: {
                    ...base,
                    ...(distView === "cargo" ? { categoria: p.chave } : { edital_id: p.chave }),
                    ativo_em: ref,
                  },
                })
              }
            />
          ) : <Empty />}
        </ChartCard>

        <ChartCard id="faixas-vencimento" glowRgb="245, 158, 11" title="Contratos a vencer por intervalo de dias" desc={`Somente cadastros ativos, relativo a ${fmtDate(d?.data_hoje)}. A data final não desliga automaticamente.`}>
          {d ? (
            <div className="h-[210px] w-full sm:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.faixas_vencimento} margin={{ top: 8, left: -14, right: 6 }}>
                  <defs>
                    <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F59E0B" stopOpacity={0.4} /><stop offset="100%" stopColor="#F59E0B" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1E2C42" vertical={false} />
                  <XAxis dataKey="faixa" {...axis} />
                  <YAxis {...axis} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} formatter={(x: number) => [fmtNum(x), "Contratos"]} />
                  <Area type="monotone" dataKey="total" stroke="#F59E0B" fill="url(#gv)" strokeWidth={2}
                    activeDot={{ r: 6, className: "cursor-pointer", onClick: (_: unknown, ev: unknown) => {
                      const idx = (ev as { index?: number }).index;
                      const f = idx !== undefined ? d.faixas_vencimento[idx] : undefined;
                      if (f) setDrill({
                        title: `Contratos — ${f.faixa}`,
                        params: {
                          ...base,
                          status: "ATIVO",
                          faixa_venc: f.faixa,
                          venc: f.faixa === "Vencidos" ? "vencidos" : undefined,
                          venc_min_dias: f.min !== null ? f.min : undefined,
                          venc_max_dias: f.max !== null ? f.max : undefined,
                        }
                      });
                    } }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty />}
          {d && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
              {d.faixas_vencimento.map((f, i) => (
                <button key={f.faixa} data-testid={`faixa-${i}`}
                  onClick={() => setDrill({
                    title: `Contratos — ${f.faixa}`,
                    params: {
                      ...base,
                      status: "ATIVO",
                      faixa_venc: f.faixa,
                      venc: f.faixa === "Vencidos" ? "vencidos" : undefined,
                      venc_min_dias: f.min !== null ? f.min : undefined,
                      venc_max_dias: f.max !== null ? f.max : undefined,
                    }
                  })}
                  className={cn("rounded-lg border bg-[#060B15]/55 px-2.5 py-2 text-left transition-colors hover:bg-white/[0.07]", i === 0 ? "border-red-500/35" : i === 1 ? "border-amber-500/35" : "border-white/[0.09]")}>
                  <p className="text-[10px] text-slate-400">{f.faixa}</p>
                  <p className={cn("num text-lg font-bold", i === 0 ? "text-red-300" : i === 1 ? "text-amber-300" : "text-white")}>{fmtNum(f.total)}</p>
                </button>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
      <DrillSheet drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
