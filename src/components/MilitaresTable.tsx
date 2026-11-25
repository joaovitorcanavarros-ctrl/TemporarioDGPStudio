import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BadgeCheck, ChevronLeft, ChevronRight, Download, FileDown, History, Loader2, Pencil, RotateCcw, SquarePen } from "lucide-react";
import { toast } from "sonner";
import FieldSelect from "@/components/FieldSelect";
import { DesligamentoDialog, QuickEditDialog, ReativarDialog } from "@/components/MilitarDialogs";
import { AlertaBadge, StatusBadge } from "@/components/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { exportFile, fmtDate, fmtDateTime, fmtNum, qs, sanitizeSpreadsheetValue, toCsv } from "@/lib/format";
import { isAdmin, podeEditar, useMe } from "@/lib/hooks";
import { getInfoContrato, type Militar, type MilitarPage } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Params = Record<string, string | number | null | undefined>;

interface Col { key: string; label: string; className?: string; render: (m: Militar) => ReactNode }

function formatCRBMShort(nome?: string | null): string {
  if (!nome) return "—";
  const match = nome.match(/^\s*(\d+[º°]\s*CRBM)/i);
  if (match) return match[1].replace("°", "º").toUpperCase();
  const beforeDash = nome.split(/[—–-]/)[0]?.trim();
  return beforeDash || nome;
}

const COLS_BASE: Col[] = [
  { key: "matricula", label: "Matrícula", render: (m) => <span className="num text-[13px] text-slate-300">{m.matricula}</span> },
  { key: "nome_completo", label: "Nome completo", render: (m) => {
    const info = getInfoContrato(m);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Link to={`/temporarios/${m.id}`} className="font-medium text-slate-100 hover:text-blue-300" data-testid={`row-name-link-${m.matricula}`}>{m.nome_completo}</Link>
        {info.renovado && (
          <span
            className="inline-flex items-center text-cyan-400"
            title={`Contrato Renovado (${info.rotuloCompleto} · ${info.qtdRenovacoes}ª renovação)`}
            data-testid={`renovado-icon-${m.matricula}`}
          >
            <BadgeCheck className="size-3.5" />
          </span>
        )}
        {m.sub_judice && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300" data-testid="sub-judice-badge">Sub judice</span>}
      </div>
    );
  } },
  { key: "cargo_nome", label: "Cargo/Função", render: (m) => <span className="text-slate-300">{m.cargo_nome}</span> },
  { key: "lotacao_nome", label: "Lotação/UBM", render: (m) => <span className="text-slate-300">{m.lotacao_nome}</span> },
  {
    key: "comando_regional_nome",
    label: "Comando Regional",
    render: (m) => {
      const shortCr = formatCRBMShort(m.comando_regional_nome);
      return (
        <span
          className={cn(
            "inline-block text-xs font-medium whitespace-nowrap",
            m.comando_regional_nome ? "text-slate-300" : "text-slate-600"
          )}
          title={m.comando_regional_nome ?? "Comando Regional não informado"}
        >
          {shortCr}
        </span>
      );
    },
  },
  { key: "edital_nome", label: "Edital", className: "hidden 2xl:table-cell", render: (m) => <span className="text-xs text-slate-400">{m.edital_nome}</span> },
  { key: "data_inclusao", label: "Inclusão", render: (m) => <span className="num text-[13px]">{fmtDate(m.data_inclusao)}</span> },
  { key: "data_vencimento_contrato", label: "Vencimento", render: (m) => (
    <div className="flex flex-col items-start gap-1">
      <span className="num text-[13px]">{fmtDate(m.data_vencimento_contrato)}</span>
      <AlertaBadge m={m} />
    </div>
  ) },
];
const COL_STATUS: Col = { key: "status", label: "Situação", render: (m) => <StatusBadge status={m.status} /> };
const COLS_DESLIG: Col[] = [
  { key: "data_desligamento", label: "Desligamento", render: (m) => <span className="num text-[13px] text-red-300">{fmtDate(m.data_desligamento)}</span> },
  { key: "motivo_desligamento_nome", label: "Status de desligamento", render: (m) => <span className="text-slate-300">{m.motivo_desligamento_nome ?? "—"}</span> },
];

interface Props { params: Params; variant?: "geral" | "desligados"; compact?: boolean; testId?: string; resetKey?: number }

export default function MilitaresTable({ params, variant = "geral", compact, testId = "militares-table", resetKey }: Props) {
  const me = useMe();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState(variant === "desligados" ? "data_desligamento" : "nome_completo");
  const [direction, setDirection] = useState<"asc" | "desc">(variant === "desligados" ? "desc" : "asc");
  const [desligar, setDesligar] = useState<Militar | null>(null);
  const [reativar, setReativar] = useState<Militar | null>(null);
  const [rapido, setRapido] = useState<Militar | null>(null);
  const [exportando, setExportando] = useState<"csv" | "xlsx" | "pdf" | null>(null);
  const paramsKey = JSON.stringify(params);
  const [lastKey, setLastKey] = useState(paramsKey);
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastKey !== paramsKey || lastResetKey !== resetKey) {
    setLastKey(paramsKey);
    setLastResetKey(resetKey);
    setPage(1);
  }

  const q = useQuery({
    queryKey: ["militares", params, page, pageSize, sort, direction],
    queryFn: () => apiGet<MilitarPage>(`/militares${qs({ ...params, page, page_size: pageSize, sort, direction })}`),
    placeholderData: keepPreviousData,
    staleTime: 15 * 60 * 1000,
  });
  const cols = variant === "desligados" ? [...COLS_BASE.slice(0, 5), ...COLS_DESLIG, COL_STATUS] : [...COLS_BASE, COL_STATUS];
  const items = q.isError ? [] : q.data?.items ?? [];
  const total = q.isError ? 0 : q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const editar = podeEditar(me.data);
  const admin = isAdmin(me.data);
  const hasReativarCol = admin && items.some((x) => x.status === "DESLIGADO");

  const toggleSort = (k: string) => {
    if (sort === k) setDirection(direction === "asc" ? "desc" : "asc");
    else { setSort(k); setDirection("asc"); }
  };

  const handleExport = async (formato: "csv" | "xlsx" | "pdf") => {
    if (exportando) return;
    setExportando(formato);
    try {
      // Busca todos os registros filtrados conforme os filtros ativos na tela (respeita categoria, cargo, lotação, edital, datas, situação e ordenação)
      const res = await apiGet<MilitarPage>(`/militares${qs({ ...params, sort, direction, all: "true" })}`);
      const exportItems = res?.items ?? [];

      if (!exportItems.length) {
        toast.warning("Nenhum registro encontrado para exportação com os filtros atuais.");
        return;
      }

      if (formato === "pdf") {
        const { gerarPdfRelatorio } = await import("@/lib/pdfRelatorio");
        const titulo = variant === "desligados" ? "Desligamentos por período e motivo" : "Efetivo de Militares Temporários";
        const descricao = variant === "desligados"
          ? "Relação de desligamentos filtrados por período e critérios selecionados."
          : "Relação de militares temporários conforme filtros selecionados.";
        const colunas = variant === "desligados"
          ? [
              { key: "matricula", label: "Matrícula" },
              { key: "nome_completo", label: "Nome completo" },
              { key: "cargo_nome", label: "Cargo" },
              { key: "lotacao_nome", label: "Lotação/UBM" },
              { key: "data_desligamento", label: "Data do desligamento" },
              { key: "motivo_desligamento_nome", label: "Status de desligamento" },
            ]
          : [
              { key: "matricula", label: "Matrícula" },
              { key: "nome_completo", label: "Nome completo" },
              { key: "cargo_nome", label: "Cargo" },
              { key: "lotacao_nome", label: "Lotação/UBM" },
              { key: "data_inclusao", label: "Inclusão" },
              { key: "data_vencimento_contrato", label: "Vencimento" },
              { key: "status", label: "Situação" },
            ];

        await gerarPdfRelatorio({
          tipo: variant === "desligados" ? "desligamentos" : "efetivo-geral",
          titulo,
          descricao,
          colunas,
          linhas: exportItems as unknown as Record<string, string | number>[],
          gerado_em: fmtDateTime(new Date().toISOString()),
          filtros: "Filtros aplicados da listagem",
        });
        toast.success(`Exportação concluída: ${fmtNum(exportItems.length)} registros em PDF.`);
        return;
      }

      const headers = [
        "Matrícula",
        "Nome completo",
        "Cargo/Função",
        "Categoria",
        "Lotação/UBM",
        "Comando Regional",
        "Edital/Processo seletivo",
        "Data de inclusão",
        "Vencimento do contrato",
        "Ano do contrato",
        "Contrato renovado",
        "Dias p/ vencer",
        "Situação",
        "Data do desligamento",
        "Status de desligamento",
        "Documento/processo",
        "Sub judice",
        "DOE - Incorporação",
        "Motivo do desligamento",
      ];

      const rows = exportItems.map((m) => {
        const inf = getInfoContrato(m);
        return [
          m.matricula,
          m.nome_completo,
          m.cargo_nome || "",
          m.categoria_nome || "",
          m.lotacao_nome || "",
          m.comando_regional_nome || "",
          m.edital_nome || "",
          m.data_inclusao ? fmtDate(m.data_inclusao) : "",
          m.data_vencimento_contrato ? fmtDate(m.data_vencimento_contrato) : "",
          inf.rotuloCompleto,
          inf.renovado ? "Sim (2º ano)" : "Não (1º ano)",
          m.dias_para_vencer ?? "",
          m.status,
          m.data_desligamento ? fmtDate(m.data_desligamento) : "",
          m.motivo_desligamento_nome || "",
          m.documento_desligamento || "",
          m.sub_judice ? "Sim" : "Não",
          m.doe_incorporacao || "",
          m.observacoes || "",
        ];
      });

      const dataHoje = new Date().toISOString().slice(0, 10);
      const prefixo = variant === "desligados" ? "desligados" : "temporarios";

      if (formato === "xlsx") {
        const XLSX = await import("xlsx");
        const safeRows = rows.map((r) => r.map((c) => sanitizeSpreadsheetValue(c)));
        const wsData = [headers, ...safeRows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Largura automática das colunas
        const colWidths = headers.map((h, i) => {
          let maxLen = h.length;
          for (let r = 0; r < Math.min(safeRows.length, 100); r++) {
            const val = safeRows[r][i] ? String(safeRows[r][i]) : "";
            if (val.length > maxLen) maxLen = Math.min(val.length, 60);
          }
          return { wch: Math.max(maxLen + 2, 12) };
        });
        ws["!cols"] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Militares");
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbout], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        exportFile(`${prefixo}_${dataHoje}.xlsx`, blob);
      } else {
        const csvContent = toCsv([headers, ...rows]);
        exportFile(`${prefixo}_${dataHoje}.csv`, "\ufeff" + csvContent, "text/csv;charset=utf-8;");
      }

      toast.success(`Exportação concluída: ${fmtNum(exportItems.length)} registros exportados.`);
    } catch (err: any) {
      console.error("Erro ao exportar:", err);
      toast.error("Ocorreu um erro ao gerar o arquivo de exportação.");
    } finally {
      setExportando(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[#1E2C42] bg-[#121B28]" data-testid={testId}>
      <div className="flex flex-col gap-2.5 border-b border-[#1E2C42] px-3.5 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
        <p className="text-sm text-slate-400" data-testid="table-total">
          <span className="num font-semibold text-white">{fmtNum(total)}</span> registro(s) encontrados
        </p>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:w-auto">
          <button
            onClick={() => handleExport("pdf")}
            disabled={exportando !== null}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 sm:h-8 justify-center border-blue-500/30 text-blue-400 transition-all hover:bg-blue-500/10 disabled:opacity-60"
            )}
            data-testid="export-pdf-button"
            title="Exportar todos os registros filtrados em PDF oficial CBMMT"
          >
            {exportando === "pdf" ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                <span>PDF...</span>
              </>
            ) : (
              <>
                <FileDown className="size-4 mr-1.5" />
                <span>PDF</span>
              </>
            )}
          </button>
          <button
            onClick={() => handleExport("csv")}
            disabled={exportando !== null}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 sm:h-8 justify-center transition-all disabled:opacity-60")}
            data-testid="export-csv-button"
            title="Exportar todos os registros filtrados em CSV"
          >
            {exportando === "csv" ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                <span>CSV...</span>
              </>
            ) : (
              <>
                <Download className="size-4 mr-1.5" />
                <span>CSV</span>
              </>
            )}
          </button>
          <button
            onClick={() => handleExport("xlsx")}
            disabled={exportando !== null}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 sm:h-8 justify-center transition-all disabled:opacity-60")}
            data-testid="export-xlsx-button"
            title="Exportar todos os registros filtrados em Excel (XLSX)"
          >
            {exportando === "xlsx" ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                <span>Excel...</span>
              </>
            ) : (
              <>
                <Download className="size-4 mr-1.5" />
                <span>Excel</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Visualização em Cartões no Mobile (< md) */}
      <div className="divide-y divide-[#162234] md:hidden" data-testid={`${testId}-mobile-list`}>
        {items.map((m) => {
          const info = getInfoContrato(m);
          const shortCr = formatCRBMShort(m.comando_regional_nome);
          return (
            <div
              key={m.id}
              className={cn(
                "space-y-2.5 p-3.5 transition-colors",
                m.alerta === "A_VENCER" && "bg-amber-500/[0.06] shadow-[inset_3px_0_0_#F59E0B]",
                m.alerta === "VENCIDO" && "bg-red-500/[0.05] shadow-[inset_3px_0_0_#EF4444]"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      to={`/temporarios/${m.id}`}
                      className="font-heading text-[14.5px] font-bold leading-snug text-slate-100 hover:text-blue-300"
                    >
                      {m.nome_completo}
                    </Link>
                    {info.renovado && (
                      <span
                        className="inline-flex items-center text-cyan-400"
                        title={`Contrato Renovado (${info.rotuloCompleto} · ${info.qtdRenovacoes}ª renovação)`}
                      >
                        <BadgeCheck className="size-3.5" />
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    <span className="num text-slate-300">{m.matricula}</span>
                    {m.sub_judice && (
                      <>
                        <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                        <span className="font-semibold text-amber-300">Sub judice</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="shrink-0">
                  <StatusBadge status={m.status} />
                </div>
              </div>

              <div className="text-xs leading-relaxed text-slate-300">
                <span>{m.cargo_nome}</span>
                <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                <span>{m.lotacao_nome}</span>
                {m.comando_regional_nome && (
                  <>
                    <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                    <span className="text-slate-400">{shortCr}</span>
                  </>
                )}
              </div>

              {variant === "desligados" ? (
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#0F1724] px-3 py-2 text-xs">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">Desligamento</span>
                    <span className="num font-semibold text-red-300">{fmtDate(m.data_desligamento)}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">Status</span>
                    <span className="block truncate text-slate-200">{m.motivo_desligamento_nome ?? "—"}</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#0F1724] px-3 py-2 text-xs">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">Inclusão</span>
                    <span className="num font-medium text-slate-200">{fmtDate(m.data_inclusao)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500">Vencimento</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="num font-medium text-slate-200">{fmtDate(m.data_vencimento_contrato)}</span>
                      <AlertaBadge m={m} />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <Link
                  to={`/temporarios/${m.id}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-9 flex-1 border-[#24344D] bg-[#0F1724] text-xs text-slate-200 hover:bg-[#182335]"
                  )}
                >
                  <History className="size-3.5" /> Detalhes
                </Link>
                {editar && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRapido(m)}
                      className="h-9 flex-1 border-blue-500/30 bg-blue-500/10 text-xs text-blue-200 hover:bg-blue-500/20"
                    >
                      <SquarePen className="size-3.5" /> Rápida
                    </Button>
                    <Link
                      to={`/temporarios/${m.id}/editar`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-9 px-3 border-[#24344D] bg-[#0F1724] text-xs text-slate-200 hover:bg-[#182335]"
                      )}
                      aria-label="Editar cadastro completo"
                    >
                      <Pencil className="size-3.5" />
                    </Link>
                  </>
                )}
                {admin && m.status === "DESLIGADO" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 border-emerald-500/30 bg-emerald-500/10 px-3 text-xs text-emerald-300 hover:bg-emerald-500/20"
                    onClick={() => setReativar(m)}
                  >
                    <RotateCcw className="size-3.5" /> Reativar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {!q.isLoading && items.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            {q.isError ? "Não foi possível carregar os registros." : "Nenhum registro encontrado com os filtros atuais."}
          </div>
        )}
        {q.isLoading && (
          <div className="px-4 py-10 text-center text-sm text-slate-500">Carregando...</div>
        )}
      </div>

      {/* Tabela completa em Desktop/Tablet (md+) */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-[#1E2C42] hover:bg-transparent">
              {cols.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn(
                    "bg-[#0F1724] px-2.5 text-[10.5px] uppercase tracking-wider text-slate-400",
                    compact && "px-2",
                    c.className
                  )}
                >
                  <button className="inline-flex items-center hover:text-white" onClick={() => toggleSort(c.key)} data-testid={`sort-${c.key}`}>
                    {c.label}
                  </button>
                </TableHead>
              ))}
              <TableHead className={cn("bg-[#0F1724] px-2.5 text-right text-[10.5px] uppercase tracking-wider text-slate-400", compact && "px-2", hasReativarCol ? "w-[180px]" : "w-[96px]")}>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((m) => (
              <TableRow
                key={m.id}
                data-testid={`militar-row-${m.matricula}`}
                className={cn(
                  "border-[#162234] transition-colors hover:bg-[#182335]",
                  m.alerta === "A_VENCER" && "bg-amber-500/[0.06] shadow-[inset_3px_0_0_#F59E0B]",
                  m.alerta === "VENCIDO" && "bg-red-500/[0.05] shadow-[inset_3px_0_0_#EF4444]",
                )}
              >
                {cols.map((c) => {
                  const wrapCol =
                    c.key === "nome_completo" ||
                    c.key === "cargo_nome" ||
                    c.key === "lotacao_nome" ||
                    c.key === "edital_nome" ||
                    c.key === "motivo_desligamento_nome";
                  return (
                    <TableCell
                      key={c.key}
                      className={cn(
                        compact ? "px-2 py-2 text-[12.5px] leading-snug" : "px-2.5 py-2.5 text-[13px] leading-snug",
                        wrapCol && "whitespace-normal break-words",
                        c.className
                      )}
                    >
                      {c.render(m)}
                    </TableCell>
                  );
                })}
                <TableCell className={cn(compact ? "px-2 py-2" : "px-2.5 py-2.5", hasReativarCol ? "w-[180px]" : "w-[96px]")}>
                  <div className="flex items-center justify-end gap-2 flex-nowrap">
                    <div className="flex items-center gap-1 shrink-0">
                      <Link
                        to={`/temporarios/${m.id}`}
                        title="Histórico de alterações"
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "icon-sm" }),
                          "size-7 inline-flex items-center justify-center p-0 text-slate-400 hover:text-white hover:bg-slate-800/70 shrink-0"
                        )}
                        data-testid={`action-historico-${m.matricula}`}
                      >
                        <History className="size-4" />
                      </Link>
                      {editar && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Edição rápida"
                            onClick={() => setRapido(m)}
                            className="size-7 inline-flex items-center justify-center p-0 text-slate-400 hover:text-white hover:bg-slate-800/70 shrink-0"
                            data-testid={`action-quick-edit-${m.matricula}`}
                          >
                            <SquarePen className="size-4" />
                          </Button>
                          <Link
                            to={`/temporarios/${m.id}/editar`}
                            title="Editar cadastro completo"
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "icon-sm" }),
                              "size-7 inline-flex items-center justify-center p-0 text-slate-400 hover:text-white hover:bg-slate-800/70 shrink-0"
                            )}
                            data-testid={`action-edit-${m.matricula}`}
                          >
                            <Pencil className="size-4" />
                          </Link>
                        </>
                      )}
                    </div>
                    {hasReativarCol && (
                      <div className="w-[100px] flex items-center justify-end shrink-0">
                        {admin && m.status === "DESLIGADO" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-emerald-300 hover:bg-emerald-500/10 justify-center"
                            onClick={() => setReativar(m)}
                            data-testid={`action-reativar-${m.matricula}`}
                          >
                            <RotateCcw className="size-4" /> <span>Reativar</span>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!q.isLoading && items.length === 0 && (
              <TableRow><TableCell colSpan={cols.length + 1} className="py-12 text-center text-slate-500" data-testid="table-empty">
                {q.isError ? "Não foi possível carregar os registros." : "Nenhum registro encontrado com os filtros atuais."}
              </TableCell></TableRow>
            )}
            {q.isLoading && (
              <TableRow><TableCell colSpan={cols.length + 1} className="py-12 text-center text-slate-500">Carregando...</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1E2C42] px-3.5 py-3 text-xs sm:px-4 sm:text-sm text-slate-400">
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">Itens por página</span>
          <span className="sm:hidden">Por pág.</span>
          <FieldSelect testId="page-size-select" className="w-18 sm:w-20" value={String(pageSize)} onChange={(v) => { setPageSize(Number(v)); setPage(1); }}
            options={["20", "30", "50"].map((v) => ({ value: v, label: v }))} />
        </div>
        <div className="flex items-center gap-2">
          <span data-testid="pagination-info">Pág. <span className="num text-white">{page}</span>/<span className="num">{pages}</span></span>
          <Button variant="outline" size="icon-sm" className="size-9 sm:size-7" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="pagination-prev"><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="icon-sm" className="size-9 sm:size-7" disabled={page >= pages} onClick={() => setPage(page + 1)} data-testid="pagination-next"><ChevronRight className="size-4" /></Button>
        </div>
      </div>
      <DesligamentoDialog militar={desligar} onClose={() => setDesligar(null)} />
      <ReativarDialog militar={reativar} onClose={() => setReativar(null)} />
      <QuickEditDialog militar={rapido} onClose={() => setRapido(null)} />
    </div>
  );
}
