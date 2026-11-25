import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BadgeCheck, Download, FileDown, FileText, Loader2, Search, Shield, X } from "lucide-react";
import { toast } from "sonner";
import FieldSelect from "@/components/FieldSelect";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { downloadText, exportFile, fmtDate, qs, sanitizeSpreadsheetValue, toCsv } from "@/lib/format";
import { gerarPdfRelatorio } from "@/lib/pdfRelatorio";
import type { MilitarPage, Relatorio } from "@/lib/types";
import { cn } from "@/lib/utils";

const TIPOS = [
  { id: "efetivo-cargo", label: "Efetivo ativo por cargo" },
  { id: "efetivo-ubm", label: "Efetivo ativo por UBM" },
  { id: "por-edital", label: "Temporários por edital" },
  { id: "renovacoes", label: "Renovação de contratos" },
  { id: "inclusoes", label: "Inclusões por período" },
  { id: "a-vencer", label: "Contratos a vencer" },
  { id: "vencidos", label: "Contratos vencidos pendentes" },
  { id: "desligamentos", label: "Desligamentos por período e motivo" },
  { id: "historico", label: "Histórico individual por matrícula" },
];

const fmtCell = (v: string | number | null) => {
  if (v === null || v === undefined || String(v).trim() === "" || String(v).trim() === "-") return "—";
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(s);
    const fixedUtc = s.match(/^(\d{4})-(\d{2})-(\d{2})T(00:00|08:00|10:00|12:00):\d{2}(?:\.\d+)?Z$/);
    if (fixedUtc) return `${fixedUtc[3]}/${fixedUtc[2]}/${fixedUtc[1]} às ${fixedUtc[4]}`;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} às ${s.slice(11, 16)}`;
    }
  }
  return String(v);
};

export default function Relatorios() {
  const [tipo, setTipo] = useState("efetivo-cargo");
  const [matricula, setMatricula] = useState("");
  const [mesAno, setMesAno] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const cleanMatricula = matricula.trim();
  const params: Record<string, string | undefined> = {};
  if (tipo === "historico") {
    params.matricula = cleanMatricula;
  } else if (tipo === "renovacoes") {
    if (mesAno) {
      params.mes_ano = mesAno;
      params.ano = mesAno.slice(0, 4);
    }
  } else {
    if (dataInicio) params.data_inicio = dataInicio;
    if (dataFim) params.data_fim = dataFim;
  }
  const enabled = tipo !== "historico" || cleanMatricula.length >= 2;
  const q = useQuery({
    queryKey: ["relatorio", tipo, params],
    queryFn: () => apiGet<Relatorio>(`/relatorios/${tipo}${qs(params)}`),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const r = q.isError ? undefined : q.data;

  // Autocomplete / suggestions when typing
  const sugestoes = useQuery({
    queryKey: ["militares-sugestoes", cleanMatricula],
    queryFn: () => apiGet<MilitarPage>(`/militares?q=${encodeURIComponent(cleanMatricula)}&page_size=6`),
    enabled: tipo === "historico" && cleanMatricula.length >= 2,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const handleExportPdf = async () => {
    if (!r) return;
    try {
      setGerandoPdf(true);
      toast.info("Gerando PDF oficial do CBMMT...", { duration: 2500 });
      await gerarPdfRelatorio(r, r.filtros);
      toast.success("PDF do relatório exportado com sucesso!");
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      toast.error("Não foi possível gerar o PDF do relatório.");
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Consultas oficiais</p>
        <h2 className="font-heading text-xl font-extrabold text-white sm:text-2xl md:text-3xl" data-testid="page-title">Relatórios</h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Mobile / Tablet report picker so report content sits immediately above the fold */}
        <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-3 lg:hidden">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Tipo de relatório
          </label>
          <FieldSelect
            testId="report-type-mobile"
            value={tipo}
            onChange={(v) => v && setTipo(v)}
            options={TIPOS.map((t) => ({ value: t.id, label: t.label }))}
          />
        </div>

        <nav className="hidden space-y-1 rounded-xl border border-[#1E2C42] bg-[#121B28] p-2 lg:block" data-testid="report-types">
          {TIPOS.map((t) => (
            <button key={t.id} onClick={() => setTipo(t.id)} data-testid={`report-type-${t.id}`}
              className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                tipo === t.id ? "bg-blue-600/15 text-white" : "text-slate-400 hover:bg-[#182335] hover:text-slate-100")}>
              <FileText className="size-4 shrink-0" /> {t.label}
            </button>
          ))}
        </nav>
        <section className="min-w-0 rounded-xl border border-[#1E2C42] bg-[#121B28]" data-testid="report-view">
          <div className="flex flex-col gap-3 border-b border-[#1E2C42] p-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-heading text-base sm:text-lg font-bold text-white" data-testid="report-title">{r?.titulo ?? TIPOS.find((t) => t.id === tipo)?.label}</h3>
              <p className="text-xs text-slate-400">{r?.descricao}</p>
              {r && <p className="mt-1 text-[11px] text-slate-500">Filtros: {r.filtros} · Gerado em {r.gerado_em} · {r.linhas.length} linha(s)</p>}
            </div>
            <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              <button
                onClick={handleExportPdf}
                disabled={!r || r.linhas.length === 0 || gerandoPdf}
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "h-10 sm:h-8 justify-center bg-gradient-to-r from-blue-700 to-indigo-700 font-semibold text-white shadow-md hover:from-blue-600 hover:to-indigo-600",
                  (!r || r.linhas.length === 0 || gerandoPdf) && "pointer-events-none opacity-50"
                )}
                data-testid="report-export-pdf"
                title="Exportar documento oficial em PDF com cabeçalho institucional, marca d'água do Brasão CBMMT e numeração"
              >
                {gerandoPdf ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span className="sm:hidden">PDF...</span>
                    <span className="hidden sm:inline">Gerando PDF...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="size-4" />
                    <span className="sm:hidden">PDF</span>
                    <span className="hidden sm:inline">Exportar PDF</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  if (!r) return;
                  try {
                    const cols = r.colunas;
                    const csvRows = [
                      cols.map((c) => c.label),
                      ...r.linhas.map((row) => cols.map((c) => fmtCell(row[c.key]))),
                    ];
                    downloadText(`relatorio_${tipo}_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(csvRows));
                  } catch {
                    toast.error("Não foi possível gerar o arquivo CSV.");
                  }
                }}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-10 sm:h-8 justify-center", (!r || r.linhas.length === 0) && "pointer-events-none opacity-50")}
                data-testid="report-export-csv"
              >
                <Download className="size-4" /> CSV
              </button>
              <button
                onClick={async () => {
                  if (!r) return;
                  try {
                    const XLSX = await import("xlsx");
                    const cols = r.colunas;
                    const headers = cols.map((c) => c.label);
                    const rows = r.linhas.map((row) => cols.map((c) => sanitizeSpreadsheetValue(fmtCell(row[c.key]))));
                    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                    ws["!cols"] = headers.map((h, i) => {
                      let maxLen = h.length;
                      for (let idx = 0; idx < Math.min(rows.length, 100); idx++) {
                        const val = rows[idx][i] ? String(rows[idx][i]) : "";
                        if (val.length > maxLen) maxLen = Math.min(val.length, 60);
                      }
                      return { wch: Math.max(maxLen + 2, 12) };
                    });
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
                    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
                    const blob = new Blob([wbout], {
                      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    });
                    exportFile(`relatorio_${tipo}_${new Date().toISOString().slice(0, 10)}.xlsx`, blob);
                  } catch (err) {
                    console.error("Erro ao exportar Excel:", err);
                    toast.error("Não foi possível gerar a planilha Excel.");
                  }
                }}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-10 sm:h-8 justify-center", (!r || r.linhas.length === 0) && "pointer-events-none opacity-50")}
                data-testid="report-export-xlsx"
              >
                <Download className="size-4" /> Excel
              </button>
            </div>
          </div>

          {tipo === "renovacoes" && (
            <div className="border-b border-[#1E2C42] bg-[#0E1622]/70 p-4" data-testid="report-renovacoes-filter">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-300">
                    <BadgeCheck className="size-4 text-cyan-400" />
                    Filtrar Renovações de Contrato por Mês/Ano
                  </div>
                  <p className="text-xs text-slate-400">
                    Selecione o <strong>Mês/ano</strong> para visualizar apenas as renovações de contrato ocorridas no período.
                  </p>
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <div className="flex w-full items-center gap-2 rounded-lg border border-[#24344D] bg-[#121B28] px-3 py-1.5 shadow-sm sm:w-auto">
                    <label htmlFor="filter-mes-ano" className="text-xs font-semibold text-slate-300 shrink-0">
                      Mês/ano:
                    </label>
                    <Input
                      id="filter-mes-ano"
                      type="month"
                      data-testid="report-renovacao-mes-ano-input"
                      value={mesAno}
                      onChange={(e) => setMesAno(e.target.value)}
                      className="h-9 sm:h-8 flex-1 sm:w-44 border-[#24344D] bg-[#0F1724] font-sans text-xs text-white [color-scheme:dark] cursor-pointer"
                    />
                    {mesAno && (
                      <button
                        type="button"
                        onClick={() => setMesAno("")}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                        title="Limpar seleção de Mês/ano"
                        data-testid="report-renovacao-clear-mes-ano"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {(tipo === "inclusoes" || tipo === "desligamentos" || tipo === "a-vencer" || tipo === "vencidos") && (
            <div className="border-b border-[#1E2C42] bg-[#0E1622]/70 p-4" data-testid={`report-${tipo}-filter`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Filtrar por período
                  </div>
                  <p className="text-xs text-slate-400">
                    Defina uma data inicial e/ou final para filtrar os registros do relatório.
                  </p>
                </div>
                <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
                  <div className="flex items-center gap-1.5 rounded-lg border border-[#24344D] bg-[#121B28] px-2.5 py-1">
                    <span className="text-xs text-slate-400 shrink-0">De:</span>
                    <Input
                      type="date"
                      data-testid="report-data-inicio-input"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className="h-9 sm:h-8 flex-1 sm:w-36 border-[#24344D] bg-[#0F1724] text-xs text-white [color-scheme:dark]"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg border border-[#24344D] bg-[#121B28] px-2.5 py-1">
                    <span className="text-xs text-slate-400 shrink-0">Até:</span>
                    <Input
                      type="date"
                      data-testid="report-data-fim-input"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      className="h-9 sm:h-8 flex-1 sm:w-36 border-[#24344D] bg-[#0F1724] text-xs text-white [color-scheme:dark]"
                    />
                  </div>
                  {(dataInicio || dataFim) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDataInicio("");
                        setDataFim("");
                      }}
                      className="inline-flex h-9 sm:h-8 items-center justify-center gap-1 rounded border border-[#24344D] px-2.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors sm:border-transparent sm:p-1"
                      title="Limpar período"
                      data-testid="report-clear-dates"
                    >
                      <X className="size-3.5" />
                      <span className="sm:hidden">Limpar datas</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {tipo === "historico" && (
            <div className="space-y-4 border-b border-[#1E2C42] bg-[#0E1622]/60 p-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Buscar Militar por Matrícula ou Nome
                </label>
                <div className="relative max-w-md">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="report-matricula-input"
                      data-testid="report-matricula-input"
                      placeholder="Digite a matrícula (ex.: 352112 ou 352112/02)"
                      value={matricula}
                      onFocus={() => setShowDropdown(true)}
                      onChange={(e) => {
                        setMatricula(e.target.value);
                        setShowDropdown(true);
                      }}
                      className="num pl-9 pr-8"
                    />
                    {matricula && (
                      <button
                        type="button"
                        onClick={() => {
                          setMatricula("");
                          setShowDropdown(false);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        title="Limpar campo"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown list of suggestions */}
                  {showDropdown && sugestoes.data && sugestoes.data.items.length > 0 && cleanMatricula.length >= 2 && (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[#24344D] bg-[#121B28] p-1 shadow-2xl">
                      <div className="px-2 py-1 text-[11px] font-semibold uppercase text-slate-400">
                        Militares correspondentes ({sugestoes.data.total}):
                      </div>
                      {sugestoes.data.items.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setMatricula(m.matricula);
                            setShowDropdown(false);
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-slate-200 transition-colors hover:bg-blue-600/20 hover:text-white"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-blue-300">{m.matricula}</span>
                            <span className="ml-2 font-medium text-slate-200">{m.nome_completo}</span>
                            <div className="text-[11px] text-slate-400">{m.cargo_nome} · {m.lotacao_nome}</div>
                          </div>
                          <span className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                            m.status === "ATIVO" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                          )}>
                            {m.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Militar Identification Card when loaded */}
              {r?.militar && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-3.5" data-testid="militar-card-resumo">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-blue-400/30 bg-blue-500/10 text-blue-300 shadow">
                        <Shield className="size-6 text-blue-400" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-blue-300">{r.militar.matricula}</span>
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium text-slate-300">{r.militar.cargo_nome}</span>
                          <span className={cn(
                            "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                            r.militar.status === "ATIVO" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"
                          )}>
                            {r.militar.status}
                          </span>
                        </div>
                        <h4 className="font-heading text-base font-extrabold text-white">{r.militar.nome_completo}</h4>
                        <p className="text-xs text-slate-400">
                          UBM: <strong className="text-slate-300">{r.militar.lotacao_nome}</strong>
                          {r.militar.comando_regional_nome && (
                            <> · Comando Regional: <strong className="text-slate-300">{r.militar.comando_regional_nome}</strong></>
                          )} · Edital: <span className="text-slate-300">{r.militar.edital_nome}</span> · Inclusão: <span className="text-slate-300">{fmtDate(r.militar.data_inclusao)}</span> · Vencimento: <strong className="text-slate-200">{fmtDate(r.militar.data_vencimento_contrato)}</strong>
                          {r.militar.data_desligamento && (
                            <> · Desligamento: <strong className="text-red-300">{fmtDate(r.militar.data_desligamento)} ({r.militar.motivo_desligamento_nome || "—"})</strong></>
                          )}
                        </p>
                        {r.militar.observacoes && r.militar.observacoes.trim() !== "" && r.militar.observacoes.trim() !== "-" && r.militar.observacoes.trim() !== "—" && (
                          <p className="mt-1.5 rounded border border-blue-500/20 bg-[#0E1622]/80 px-2.5 py-1 text-xs text-slate-300">
                            <strong className="text-blue-300">OBSERVAÇÕES:</strong> {r.militar.observacoes}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={handleExportPdf}
                      disabled={gerandoPdf}
                      className={cn(
                        buttonVariants({ variant: "default", size: "sm" }),
                        "h-10 sm:h-8 w-full sm:w-auto justify-center bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold text-white shadow-md hover:from-blue-500 hover:to-indigo-500"
                      )}
                      title="Baixar histórico funcional individual oficial em formato PDF"
                    >
                      {gerandoPdf ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
                      Baixar Histórico em PDF
                    </button>
                  </div>
                </div>
              )}

              {cleanMatricula.length >= 2 && q.isFetching && !r?.militar && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-950/20 p-2.5 text-xs text-blue-200">
                  <Loader2 className="size-4 shrink-0 animate-spin text-blue-400" />
                  <span>Consultando registros funcionais do militar...</span>
                </div>
              )}

              {cleanMatricula.length >= 2 && !q.isFetching && !r?.militar && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <AlertCircle className="size-4 shrink-0 text-amber-400" />
                  <span>Nenhum militar localizado para a matrícula &quot;{matricula}&quot;. Verifique se os dígitos estão corretos ou busque pelo nome completo.</span>
                </div>
              )}
            </div>
          )}

          <div className="max-h-[620px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[#1E2C42] hover:bg-transparent">
                  {(r?.colunas ?? []).map((c) => <TableHead key={c.key} className="sticky top-0 bg-[#0F1724] text-[11px] uppercase tracking-wider text-slate-400">{c.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(r?.linhas ?? []).map((li, i) => (
                  <TableRow key={i} className={cn("border-[#162234]", li[r?.colunas[0]?.key ?? ""] === "TOTAL" && "bg-blue-600/10 font-bold")} data-testid="report-row">
                    {(r?.colunas ?? []).map((c) => (
                      <TableCell key={c.key} className={cn("py-2 text-slate-200", typeof li[c.key] === "number" && "num")}>
                        {c.key === "rotulo_ano" ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-cyan-300">
                            <BadgeCheck className="size-3.5 text-cyan-400 shrink-0" />
                            <span>{String(li[c.key])}</span>
                          </span>
                        ) : c.key === "status" && li[c.key] === "ATIVO" ? (
                          <span className="font-semibold text-emerald-400">ATIVO</span>
                        ) : c.key === "status" && li[c.key] === "DESLIGADO" ? (
                          <span className="font-semibold text-red-400">DESLIGADO</span>
                        ) : (
                          fmtCell(li[c.key])
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {r && r.linhas.length === 0 && <TableRow><TableCell className="py-10 text-center text-slate-500" colSpan={r.colunas.length || 1}>Nenhum registro para os filtros selecionados.</TableCell></TableRow>}
                {!r && <TableRow><TableCell className="py-10 text-center text-slate-500" colSpan={5}>{q.isLoading ? "Gerando relatório..." : tipo === "historico" ? "Informe a matrícula." : "Relatório indisponível."}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}

