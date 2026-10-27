import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Download, FileDown, FileText, Loader2, Search, Shield, X } from "lucide-react";
import { toast } from "sonner";
import FiltersBar from "@/components/FiltersBar";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { fmtDate, qs } from "@/lib/format";
import { useFilters } from "@/lib/filters";
import { gerarPdfRelatorio } from "@/lib/pdfRelatorio";
import type { MilitarPage, Relatorio } from "@/lib/types";
import { cn } from "@/lib/utils";
import { filterParams } from "@/pages/Dashboard";

const TIPOS = [
  { id: "efetivo-cargo", label: "Efetivo ativo por cargo" },
  { id: "efetivo-ubm", label: "Efetivo ativo por UBM" },
  { id: "por-edital", label: "Temporários por edital" },
  { id: "inclusoes", label: "Inclusões por período" },
  { id: "a-vencer", label: "Contratos a vencer" },
  { id: "vencidos", label: "Contratos vencidos pendentes" },
  { id: "desligamentos", label: "Desligamentos por período e motivo" },
  { id: "historico", label: "Histórico individual por matrícula" },
];

const fmtCell = (v: string | number | null) => (v === null || v === undefined ? "—" : typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v) : String(v));

export default function Relatorios() {
  const { filters } = useFilters();
  const [tipo, setTipo] = useState("efetivo-cargo");
  const [matricula, setMatricula] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const cleanMatricula = matricula.trim();
  const params = tipo === "historico" ? { matricula: cleanMatricula } : filterParams(filters);
  const enabled = tipo !== "historico" || cleanMatricula.length >= 2;
  const q = useQuery({
    queryKey: ["relatorio", tipo, params],
    queryFn: () => apiGet<Relatorio>(`/relatorios/${tipo}${qs(params)}`),
    enabled,
    retry: false,
  });
  const r = q.isError ? undefined : q.data;

  // Autocomplete / suggestions when typing
  const sugestoes = useQuery({
    queryKey: ["militares-sugestoes", cleanMatricula],
    queryFn: () => apiGet<MilitarPage>(`/militares?q=${encodeURIComponent(cleanMatricula)}&page_size=6`),
    enabled: tipo === "historico" && cleanMatricula.length >= 2,
    staleTime: 1000 * 30,
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
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Consultas oficiais</p>
        <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl" data-testid="page-title">Relatórios</h2>
        <p className="text-sm text-slate-400">Os relatórios aplicam os mesmos filtros do painel. Exportação em PDF oficial CBMMT, CSV e Excel.</p>
      </div>
      <FiltersBar />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <nav className="space-y-1 rounded-xl border border-[#1E2C42] bg-[#121B28] p-2" data-testid="report-types">
          {TIPOS.map((t) => (
            <button key={t.id} onClick={() => setTipo(t.id)} data-testid={`report-type-${t.id}`}
              className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                tipo === t.id ? "bg-blue-600/15 text-white" : "text-slate-400 hover:bg-[#182335] hover:text-slate-100")}>
              <FileText className="size-4 shrink-0" /> {t.label}
            </button>
          ))}
        </nav>
        <section className="min-w-0 rounded-xl border border-[#1E2C42] bg-[#121B28]" data-testid="report-view">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E2C42] p-4">
            <div className="min-w-0">
              <h3 className="font-heading text-lg font-bold text-white" data-testid="report-title">{r?.titulo ?? TIPOS.find((t) => t.id === tipo)?.label}</h3>
              <p className="text-xs text-slate-400">{r?.descricao}</p>
              {r && <p className="mt-1 text-[11px] text-slate-500">Filtros: {r.filtros} · Gerado em {r.gerado_em} · {r.linhas.length} linha(s)</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportPdf}
                disabled={!r || r.linhas.length === 0 || gerandoPdf}
                className={cn(
                  buttonVariants({ variant: "default", size: "sm" }),
                  "bg-gradient-to-r from-blue-700 to-indigo-700 font-semibold text-white shadow-md hover:from-blue-600 hover:to-indigo-600",
                  (!r || r.linhas.length === 0 || gerandoPdf) && "pointer-events-none opacity-50"
                )}
                data-testid="report-export-pdf"
                title="Exportar documento oficial em PDF com cabeçalho institucional, marca d'água do Brasão CBMMT e numeração"
              >
                {gerandoPdf ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Gerando PDF...
                  </>
                ) : (
                  <>
                    <FileDown className="size-4" />
                    Exportar PDF
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  if (!r) return;
                  const cols = r.colunas;
                  const csvLines = [
                    cols.map((c) => `"${c.label}"`).join(";"),
                    ...r.linhas.map((row) => cols.map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`).join(";")),
                  ];
                  import("@/lib/mockBackend").then(({ exportFile }) => {
                    exportFile(`relatorio_${tipo}_${new Date().toISOString().slice(0, 10)}.csv`, "\ufeff" + csvLines.join("\n"));
                  });
                }}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), (!r || r.linhas.length === 0) && "pointer-events-none opacity-50")}
                data-testid="report-export-csv"
              >
                <Download className="size-4" /> CSV
              </button>
              <button
                onClick={() => {
                  if (!r) return;
                  const cols = r.colunas;
                  const csvLines = [
                    cols.map((c) => `"${c.label}"`).join(";"),
                    ...r.linhas.map((row) => cols.map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`).join(";")),
                  ];
                  import("@/lib/mockBackend").then(({ exportFile }) => {
                    exportFile(`relatorio_${tipo}_${new Date().toISOString().slice(0, 10)}.csv`, "\ufeff" + csvLines.join("\n"));
                  });
                }}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), (!r || r.linhas.length === 0) && "pointer-events-none opacity-50")}
                data-testid="report-export-xlsx"
              >
                <Download className="size-4" /> Excel
              </button>
            </div>
          </div>

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

                {/* Quick suggestions / instructions */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                  <span className="text-[11px] text-slate-400">Sugestões de teste rápido:</span>
                  {["352112/02", "351666/03", "352285/02"].map((mat) => (
                    <button
                      key={mat}
                      type="button"
                      onClick={() => {
                        setMatricula(mat);
                        setShowDropdown(false);
                      }}
                      className="rounded border border-[#1E2C42] bg-[#15202E] px-2 py-0.5 font-mono text-[11px] text-blue-300 transition-colors hover:border-blue-500 hover:text-white"
                    >
                      {mat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Militar Identification Card when loaded */}
              {r?.militar && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-3.5" data-testid="militar-card-resumo">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-blue-400/30 bg-blue-500/10 text-blue-300 shadow">
                        <Shield className="size-6 text-blue-400" />
                      </div>
                      <div>
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
                          UBM: <strong className="text-slate-300">{r.militar.lotacao_nome}</strong> · Edital: <span className="text-slate-300">{r.militar.edital_nome}</span> · Inclusão: <span className="text-slate-300">{fmtDate(r.militar.data_inclusao)}</span> · Vencimento: <strong className="text-slate-200">{fmtDate(r.militar.data_vencimento_contrato)}</strong>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleExportPdf}
                      disabled={gerandoPdf}
                      className={cn(
                        buttonVariants({ variant: "default", size: "sm" }),
                        "bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold text-white shadow-md hover:from-blue-500 hover:to-indigo-500"
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
                  <span>Nenhum militar localizado para a matrícula &quot;{matricula}&quot;. Verifique se os dígitos estão corretos ou escolha uma das sugestões acima.</span>
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
                    {(r?.colunas ?? []).map((c) => <TableCell key={c.key} className={cn("py-2 text-slate-200", typeof li[c.key] === "number" && "num")}>{fmtCell(li[c.key])}</TableCell>)}
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

