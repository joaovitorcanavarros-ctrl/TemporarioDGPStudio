import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, Briefcase, Scale, Building2, Clock, HeartPulse, RotateCw, Shield, Stethoscope, Truck, UserCheck, UserMinus } from "lucide-react";
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
  ENFERMEIRO: "#A855F7",     // Roxo / Violeta
  MEDICO: "#F43F5E",         // Vermelho Coral / Rubi
  OUTROS: "#94A3B8",         // Cinza Azulado
};
const PALETTE = ["#3B82F6", "#F59E0B", "#10B981", "#A855F7", "#F43F5E", "#06B6D4", "#EAB308", "#94A3B8"];
const catColor = (c: string, i: number) => CAT_COLOR[c] ?? PALETTE[i % PALETTE.length];

const tooltipStyle = {
  contentStyle: { background: "#182335", border: "1px solid #24344D", borderRadius: 8, fontSize: 12, color: "#F1F5F9" },
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

function Kpi({ id, label, value, sub, icon: Icon, tone, onClick }: {
  id: string; label: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; tone: "green" | "red" | "blue" | "amber" | "sky"; onClick?: () => void;
}) {
  const tones = {
    green: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",
    red: "text-red-400 bg-red-500/10 ring-red-500/20",
    blue: "text-blue-400 bg-blue-500/10 ring-blue-500/20",
    amber: "text-amber-400 bg-amber-500/10 ring-amber-500/20",
    sky: "text-sky-300 bg-sky-500/10 ring-sky-500/20",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`kpi-${id}`}
      className="group animate-rise rounded-xl border border-[#1E2C42] bg-[#121B28] p-4 text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-[#2E4262] hover:shadow-lg hover:shadow-black/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <span className={cn("grid size-8 place-items-center rounded-lg ring-1", tones[tone])}><Icon className="size-4" /></span>
      </div>
      <p className="num mt-2 text-3xl font-bold text-white" data-testid={`kpi-${id}-value`}>{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-slate-400">{sub}</p>}
    </button>
  );
}

function ChartCard({ id, title, desc, children, action, className }: { id: string; title: string; desc?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn("animate-rise rounded-xl border border-[#1E2C42] bg-[#121B28] p-4 sm:p-5", className)} data-testid={`chart-${id}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-heading text-[15px] font-bold text-white">{title}</h3>
          {desc && <p className="mt-0.5 text-xs text-slate-400">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
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
  onSelectBar: (row: ChartRow, motivoKey: string) => void;
}) {
  const [hoveredMotivo, setHoveredMotivo] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<{ groupKey: string; motivoKey: string } | null>(null);

  const orderedMotivos = motivoKeys
    .map((k, idx) => {
      const nome = motivoNome(k);
      const { order, color } = getMotivoOrderAndColor(nome, idx);
      return { chave: k, nome, order, color };
    })
    .sort((a, b) => a.order - b.order);

  // Determine maximum single bar value across all groups; preserve 0, 9, 18, 27, 36 scale when max <= 36
  const maxVal = Math.max(
    1,
    ...rows.flatMap((r) => orderedMotivos.map((m) => Number(r[m.chave] || 0)))
  );
  const step = maxVal <= 36 ? 9 : Math.ceil(maxVal / 4);
  const maxScale = step * 4;
  const yTicks = [maxScale, step * 3, step * 2, step, 0];
  const plotHeight = 196;

  return (
    <div className="flex flex-col select-none" data-testid="desligamentos-grouped-chart">
      {/* Main Chart Plot Area */}
      <div className="relative flex pt-5 pb-1">
        {/* Y-Axis Labels */}
        <div
          className="flex flex-col justify-between pr-3 text-right num text-[11px] font-medium text-[#64748B]"
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

          {/* Groups (Years or Cargos) */}
          <div className="relative z-10 flex h-full items-end justify-around px-3 sm:px-6 gap-4">
            {rows.map((row) => {
              const groupLabel = String(desligView === "ano" ? row.ano : row.nome);
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
                  <div className="flex h-full items-end justify-center gap-2 sm:gap-3.5 px-2">
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
                              "mb-1.5 flex items-center justify-center rounded-md border px-2 py-0.5 num text-[11px] font-bold leading-tight text-white shadow-sm transition-transform duration-150",
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
                              "w-6 sm:w-8 md:w-9 rounded-t-md transition-all duration-200",
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
      <div className="flex pl-9 pt-2.5">
        <div className="flex flex-1 items-center justify-around px-3 sm:px-6 gap-4">
          {rows.map((row) => {
            const groupLabel = String(desligView === "ano" ? row.ano : row.nome);
            return (
              <div key={groupLabel} className="flex-1 text-center">
                <span className="font-sans text-xs font-semibold tracking-wide text-slate-200">
                  {groupLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Redesigned Legend Footer */}
      <div
        className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5 border-t border-[#1E2C42]/80 pt-3.5 px-2"
        data-testid="desligamentos-legend"
      >
        {orderedMotivos.map((m) => {
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
                active ? "bg-[#182335] text-white" : "text-slate-300 hover:bg-[#182335]/60 hover:text-white"
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

  return (
    <div className="flex flex-col select-none" data-testid="efetivo-cargo-grouped-chart">
      {/* Main Chart Plot Area */}
      <div className="relative flex pt-5 pb-1">
        {/* Y-Axis Labels */}
        <div
          className="flex flex-col justify-between pr-3 text-right num text-[11px] font-medium text-[#64748B]"
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
          <div className="relative z-10 flex h-full items-end justify-around px-2 sm:px-4 gap-2 sm:gap-4">
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
                  <div className="flex h-full items-end justify-center gap-1.5 sm:gap-2.5 px-1">
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
                              "mb-1.5 flex items-center justify-center rounded-md border px-1.5 py-0.5 num text-[10px] sm:text-[11px] font-bold leading-tight text-white shadow-sm transition-transform duration-150",
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
                              "w-5 sm:w-7 md:w-8 rounded-t-md transition-all duration-200",
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
      <div className="flex pl-9 pt-2.5">
        <div className="flex flex-1 items-center justify-around px-2 sm:px-4 gap-2 sm:gap-4">
          {rows.map((row) => {
            const anoLabel = String(row.ano);
            return (
              <div key={anoLabel} className="flex-1 text-center">
                <span className="font-sans text-xs font-semibold tracking-wide text-slate-200">
                  {anoLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Redesigned Legend Footer */}
      <div
        className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5 border-t border-[#1E2C42]/80 pt-3.5 px-2"
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
                active ? "bg-[#182335] text-white" : "text-slate-300 hover:bg-[#182335]/60 hover:text-white"
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
                  isHighlighted && "bg-[#182335]/70",
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

  return (
    <div className="flex flex-col select-none" data-testid="distribuicao-styled-chart">
      <div className="relative h-[330px] w-full">
        {/* Center Donut Total Label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-3xl font-extrabold text-white">
            {fmtNum(totalGeral)}
          </span>
          <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Ativos
          </span>
        </div>

        <ResponsiveContainer width="100%" height={330}>
          <PieChart>
            <Pie
              data={enriched}
              dataKey="total"
              nameKey="nome"
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={112}
              paddingAngle={3}
              stroke="#121B28"
              strokeWidth={2}
              className="cursor-pointer focus:outline-none"
              labelLine={false}
              label={renderCustomLabel}
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
        className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border-t border-[#1E2C42]/80 pt-4 px-2"
        data-testid="distribuicao-legend"
      >
        {enriched.map((x) => {
          const active = hoveredKey === x.chave;
          return (
            <button
              key={x.chave}
              type="button"
              onMouseEnter={() => setHoveredKey(x.chave)}
              onMouseLeave={() => setHoveredKey(null)}
              onClick={() => onSelectSlice(x)}
              className={cn(
                "inline-flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer",
                active ? "bg-[#182335] text-white" : "text-slate-300 hover:bg-[#182335]/60 hover:text-white"
              )}
            >
              <span
                className="size-3.5 shrink-0 rounded-[4px] shadow-xs"
                style={{
                  backgroundColor: x.color,
                  boxShadow: `0 0 0 1px ${x.color}55`,
                }}
              />
              <span className="font-sans text-[13.5px] font-semibold tracking-tight text-slate-200">
                {x.nome}
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
            </button>
          );
        })}
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
  const periodoTxt = d?.periodo_inicio || d?.periodo_fim ? `${fmtDate(d?.periodo_inicio)} a ${fmtDate(d?.periodo_fim)}` : "todo o período";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Visão geral</p>
          <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl">Painel do efetivo temporário</h2>
          <p className="mt-1 text-sm text-slate-400" data-testid="dashboard-criteria">
            Efetivo em <span className="num text-slate-200">{fmtDate(ref)}</span> · Movimentações: {periodoTxt} · Alerta de vencimento: {d?.alerta_dias ?? "—"} dias (fuso America/Cuiabá)
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
            className="border-[#1E2C42] bg-[#121B28] text-xs text-slate-300 hover:bg-[#182335] hover:text-white"
            data-testid="dashboard-refresh-button"
          >
            <RotateCw className={cn("mr-1.5 size-3.5", q.isFetching && "animate-spin text-blue-400")} />
            {q.isFetching ? "Sincronizando..." : "Sincronizar Firestore"}
          </Button>
        </div>
      </div>
      <FiltersBar />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi id="ativos" label="Temporários ativos" value={v(d?.kpis.ativos)} icon={UserCheck} tone="green" sub={`Efetivo em ${fmtDate(ref)}`}
          onClick={() => setDrill({ title: "Temporários ativos", params: { ...base, status: "ATIVO", ativo_em: ref } })} />
        <Kpi id="desligamentos" label="Distratos / desligamentos" value={v(d?.kpis.desligamentos_periodo)} icon={UserMinus} tone="red" sub={periodoTxt}
          onClick={() => setDrill({ title: "Desligamentos no período", params: { ...deslParams, status: "DESLIGADO" }, variant: "desligados" })} />
        <Kpi id="top-ubm" label="UBM DE MAIOR EFETIVO" value={d ? fmtNum(d.kpis.top_ubm_total) : "—"} icon={Building2} tone="blue" sub={d?.kpis.top_ubm_nome ?? "—"}
          onClick={() => d?.kpis.top_ubm_id && setDrill({ title: d.kpis.top_ubm_nome ?? "UBM", params: { ...base, status: "ATIVO", lotacao_id: d.kpis.top_ubm_id, ativo_em: ref } })} />
        <Kpi id="contratos-a-vencer" label="Contratos a vencer" value={v(d?.kpis.a_vencer)} icon={Clock} tone="amber" sub={`Próximos ${d?.alerta_dias ?? "—"} dias`}
          onClick={() => setDrill({ title: "Contratos a vencer", params: { ...base, status: "ATIVO", venc: "a_vencer" } })} />
        <Kpi id="sub-judice" label="Militares sub judice" value={v(d?.kpis.sub_judice)} icon={Scale} tone="amber" sub={`Ativos em ${fmtDate(ref)}`}
          onClick={() => setDrill({ title: "Militares sub judice", params: { ...base, status: "ATIVO", sub_judice: "true", ativo_em: ref } })} />
        {(cats.length ? cats.filter((c) => c.chave !== "OUTROS" || c.total > 0) : []).map((c) => (
          <Kpi key={c.chave} id={c.chave.toLowerCase().replace(/_/g, "-")} label={c.nome} value={fmtNum(c.total)} icon={CAT_ICON[c.chave] ?? Briefcase} tone="sky" sub="Ativos no cargo"
            onClick={() => setDrill({ title: `${c.nome} — ativos`, params: { ...base, status: "ATIVO", categoria: c.chave, ativo_em: ref } })} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard id="efetivo-cargo-ano" title="Efetivo por cargo/função" desc="Estoque ao fim de cada ano (ano corrente: data de referência). Clique para listar.">
          {d && d.efetivo_cargo_ano.length ? (
            <EfetivoCargoGroupedChart
              rows={d.efetivo_cargo_ano}
              cats={cats}
              onSelectBar={(row, c) =>
                setDrill({
                  title: `${c.nome} — efetivo em ${fmtDate(String(row.data))}`,
                  params: { ...base, categoria: c.chave, ativo_em: String(row.data) },
                })
              }
            />
          ) : <Empty />}
        </ChartCard>

        <ChartCard id="desligamentos" title="Desligamentos por cargo, ano e motivo" desc={`Data efetiva do desligamento · ${periodoTxt}`}
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
                const extra = desligView === "ano"
                  ? { deslig_ini: `${row.ano}-01-01`, deslig_fim: `${row.ano}-12-31` }
                  : { categoria: String(row.categoria), deslig_ini: d.periodo_inicio, deslig_fim: d.periodo_fim };
                setDrill({
                  title: `Desligamentos — ${motivoNome(k)} — ${row.ano ?? row.nome}`,
                  params: { ...base, status: "DESLIGADO", motivo_id: k, ...extra },
                  variant: "desligados",
                });
              }}
            />
          ) : <Empty text="Nenhum desligamento registrado no período" />}
        </ChartCard>

        <ChartCard id="efetivo-ubm" title="Efetivo de temporários por UBM" desc={`Ativos em ${fmtDate(ref)} · ${d?.por_ubm.length ?? 0} lotações`}
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

        <ChartCard id="evolucao" title="Evolução do efetivo" desc="Inclusões e desligamentos por data do evento; efetivo ao fim de cada mês/ano."
          className="flex flex-col"
          action={
            <Tabs value={evoView} onValueChange={(x) => setEvoView(String(x))}>
              <TabsList><TabsTrigger value="mensal" data-testid="evolucao-tab-mensal">Mensal</TabsTrigger><TabsTrigger value="anual" data-testid="evolucao-tab-anual">Anual</TabsTrigger></TabsList>
            </Tabs>
          }>
          {d && d.evolucao_mensal.length ? (
            <div className="flex-1 min-h-[420px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%" minHeight={420}>
                <ComposedChart
                  data={evoView === "mensal" ? d.evolucao_mensal : d.evolucao_anual}
                  margin={{ top: 16, right: 12, left: 0, bottom: 8 }}
                >
                  <CartesianGrid stroke="#1E2C42" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey={evoView === "mensal" ? "rotulo" : "ano"} {...axis} dy={6} />
                  <YAxis yAxisId="l" {...axis} allowDecimals={false} width={36} />
                  <YAxis yAxisId="r" orientation="right" {...axis} allowDecimals={false} width={40} />
                  <Tooltip {...tooltipStyle} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="square"
                    iconSize={10}
                    wrapperStyle={{ fontSize: 12, paddingTop: 14, borderTop: "1px solid rgba(30, 44, 66, 0.8)" }}
                  />
                  <Bar yAxisId="l" dataKey="inclusoes" name="Inclusões" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={38} className="cursor-pointer"
                    onClick={(e: { payload?: ChartRow }) => {
                      const r = e.payload;
                      if (!r) return;
                      const [ini, fim] = evoView === "mensal" ? [`${r.mes}-01`, `${r.mes}-31`] : [`${r.ano}-01-01`, `${r.ano}-12-31`];
                      setDrill({ title: `Inclusões — ${r.rotulo ?? r.ano}`, params: { ...base, inclusao_ini: ini, inclusao_fim: fim } });
                    }} />
                  <Bar yAxisId="l" dataKey="desligamentos" name="Desligamentos" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={38} className="cursor-pointer"
                    onClick={(e: { payload?: ChartRow }) => {
                      const r = e.payload;
                      if (!r) return;
                      const [ini, fim] = evoView === "mensal" ? [`${r.mes}-01`, `${r.mes}-31`] : [`${r.ano}-01-01`, `${r.ano}-12-31`];
                      setDrill({ title: `Desligamentos — ${r.rotulo ?? r.ano}`, params: { ...base, deslig_ini: ini, deslig_fim: fim }, variant: "desligados" });
                    }} />
                  <Line yAxisId="r" type="monotone" dataKey="efetivo" name="Efetivo" stroke="#60A5FA" strokeWidth={2.5} dot={{ r: 3.5, fill: "#60A5FA", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty />}
        </ChartCard>

        <ChartCard id="distribuicao" title="Distribuição por Cargos e Editais" desc={`Efetivo em ${fmtDate(ref)} — use os filtros de período para consultar datas anteriores`}
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

        <ChartCard id="faixas-vencimento" title="Contratos a vencer por intervalo de dias" desc={`Somente cadastros ativos, relativo a ${fmtDate(d?.data_hoje)}. A data final não desliga automaticamente.`}>
          {d ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={d.faixas_vencimento} margin={{ top: 8 }}>
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
          ) : <Empty />}
          {d && (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
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
                  className={cn("rounded-lg border px-2 py-1.5 text-left transition-colors hover:bg-[#182335]", i === 0 ? "border-red-500/30" : i === 1 ? "border-amber-500/30" : "border-[#1E2C42]")}>
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
