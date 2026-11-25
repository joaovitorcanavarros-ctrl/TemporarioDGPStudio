import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import FiltersBar from "@/components/FiltersBar";
import MilitaresTable from "@/components/MilitaresTable";
import { apiGet } from "@/lib/api";
import { useFilters } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { SituacaoPage } from "@/lib/types";
import { baseParams } from "@/pages/Dashboard";

function getCuiabaTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getCurrentWeekRange(todayIso: string): { inicio: string; fim: string } {
  const [y, m, d] = todayIso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = base.getUTCDay(); // 0 = domingo, 1 = segunda ... 6 = sábado
  const diffToMonday = dow === 0 ? 6 : dow - 1;

  const start = new Date(base);
  start.setUTCDate(base.getUTCDate() - diffToMonday);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  return {
    inicio: start.toISOString().slice(0, 10),
    fim: end.toISOString().slice(0, 10),
  };
}

export default function Desligamentos() {
  const { filters } = useFilters();
  const ini = filters.data_inicio || (filters.ano ? `${filters.ano}-01-01` : undefined);
  const fim = filters.data_fim || (filters.ano ? `${filters.ano}-12-31` : undefined);

  const [todayIso, setTodayIso] = useState<string>(() => getCuiabaTodayIso());

  useEffect(() => {
    const syncToday = () => {
      const next = getCuiabaTodayIso();
      setTodayIso((prev) => (prev === next ? prev : next));
    };
    const timer = window.setInterval(syncToday, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncToday();
    };
    window.addEventListener("focus", syncToday);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", syncToday);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const semana = useMemo(() => getCurrentWeekRange(todayIso), [todayIso]);

  const ev = useQuery({
    queryKey: ["situacao"],
    queryFn: () => apiGet<SituacaoPage>("/militares/situacao?limit=150"),
  });

  const eventos = useMemo(() => {
    const lista = ev.isError ? [] : ev.data?.items ?? [];
    return lista
      .filter((e) => {
        if (e.tipo !== "DESLIGAMENTO") return false;
        const dataEvento = (e.data_efetiva || e.timestamp || "").slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(dataEvento) && dataEvento >= semana.inicio && dataEvento <= semana.fim;
      })
      .sort((a, b) => {
        const cmpData = (b.data_efetiva || "").localeCompare(a.data_efetiva || "");
        if (cmpData !== 0) return cmpData;
        return (b.timestamp || "").localeCompare(a.timestamp || "");
      });
  }, [ev.data, ev.isError, semana.fim, semana.inicio]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-red-400">Movimentações</p>
        <h2 className="font-heading text-xl font-extrabold text-white sm:text-2xl md:text-3xl" data-testid="page-title">Desligamentos e Histórico</h2>
        <p className="mt-1 text-xs sm:text-sm text-slate-400">Registros desligados permanecem na base para consulta, relatórios e auditoria. O período filtra pela data efetiva do desligamento.</p>
      </div>
      <FiltersBar hideStatus />
      <MilitaresTable variant="desligados" params={{ ...baseParams(filters), status: "DESLIGADO", deslig_ini: ini, deslig_fim: fim }} testId="desligados-table" />
      <section className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4 sm:p-5" data-testid="eventos-recentes">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-2">
          <h3 className="font-heading font-bold text-white">Últimos desligamentos da semana</h3>
          <span className="text-xs text-slate-400" data-testid="semana-atual-label">
            Semana de {fmtDate(semana.inicio)} a {fmtDate(semana.fim)} · {eventos.length} {eventos.length === 1 ? "desligamento" : "desligamentos"}
          </span>
        </div>
        <div className="divide-y divide-[#162234]">
          {eventos.map((e) => (
            <div key={e.id} className="flex flex-col gap-1.5 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-300">
                  DESLIGAMENTO
                </span>
                <Link to={`/temporarios/${e.militar_id}`} className="font-medium text-slate-100 hover:text-blue-300">{e.nome_completo}</Link>
                <span className="num text-xs text-slate-400">{e.matricula}</span>
              </div>
              <span className="text-xs text-slate-400">
                Data efetiva {fmtDate(e.data_efetiva)}
                {(e.motivo_nome ?? e.observacoes) ? ` · ${e.motivo_nome ?? e.observacoes}` : ""}
              </span>
              <span className="text-[11px] text-slate-500 sm:ml-auto">{e.usuario_nome} · {fmtDateTime(e.timestamp)}</span>
            </div>
          ))}
          {eventos.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              Nenhum desligamento registrado na semana ({fmtDate(semana.inicio)} a {fmtDate(semana.fim)}).
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
