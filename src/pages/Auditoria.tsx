import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, CheckCircle2, Clock, Download, FileSpreadsheet, Filter,
  History, RefreshCw, Search, ShieldAlert, User, UserMinus, RotateCcw, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { exportFile } from "@/lib/mockBackend";
import type { AuditoriaPage, HistoricoAlteracao } from "@/lib/types";
import { cn } from "@/lib/utils";

const OP_BADGES: Record<string, { label: string; class: string; icon: any }> = {
  ALTERACAO_VENCIMENTO: { label: "Alteração de Vencimento", class: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: Calendar },
  EDICAO_RAPIDA: { label: "Edição Rápida", class: "bg-blue-500/15 text-blue-300 border-blue-500/30", icon: History },
  EDICAO_CADASTRO: { label: "Edição de Cadastro", class: "bg-sky-500/15 text-sky-300 border-sky-500/30", icon: History },
  NOVO_CADASTRO: { label: "Novo Cadastro", class: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  INCLUSAO: { label: "Inclusão", class: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  DESLIGAMENTO: { label: "Desligamento", class: "bg-red-500/15 text-red-300 border-red-500/30", icon: UserMinus },
  REATIVACAO: { label: "Reativação", class: "bg-teal-500/15 text-teal-300 border-teal-500/30", icon: RotateCcw },
  IMPORTACAO_CSV: { label: "Importação CSV", class: "bg-purple-500/15 text-purple-300 border-purple-500/30", icon: FileSpreadsheet },
  ALTERACAO_CONFIGURACAO: { label: "Configuração", class: "bg-slate-500/15 text-slate-300 border-slate-500/30", icon: History },
  CRIACAO_USUARIO: { label: "Criação de Usuário", class: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: User },
  EDICAO_USUARIO: { label: "Edição de Usuário", class: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30", icon: User },
  INSERCAO_CATEGORIAS: { label: "Inserção de Categoria", class: "bg-blue-500/15 text-blue-300 border-blue-500/30", icon: CheckCircle2 },
  EDICAO_CATEGORIAS: { label: "Edição de Categoria", class: "bg-sky-500/15 text-sky-300 border-sky-500/30", icon: History },
  EXCLUSAO_CATEGORIAS: { label: "Exclusão de Categoria", class: "bg-rose-500/15 text-rose-300 border-rose-500/30", icon: AlertCircle },
};

function getBadge(operacao: string) {
  if (OP_BADGES[operacao]) return OP_BADGES[operacao];
  if (operacao.startsWith("EXCLUSAO_")) {
    return { label: operacao.replace(/_/g, " "), class: "bg-rose-500/15 text-rose-300 border-rose-500/30", icon: AlertCircle };
  }
  if (operacao.startsWith("INSERCAO_")) {
    return { label: operacao.replace(/_/g, " "), class: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 };
  }
  if (operacao.startsWith("EDICAO_")) {
    return { label: operacao.replace(/_/g, " "), class: "bg-blue-500/15 text-blue-300 border-blue-500/30", icon: History };
  }
  return { label: operacao.replace(/_/g, " "), class: "bg-slate-500/15 text-slate-300 border-slate-500/30", icon: History };
}

const fmtVal = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(s);
  return s;
};

export default function Auditoria() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtroEntidade, setFiltroEntidade] = useState("TODOS");
  const [filtroOperacao, setFiltroOperacao] = useState("TODAS");

  const audit = useQuery({
    queryKey: ["auditoria"],
    queryFn: () => apiGet<AuditoriaPage>("/auditoria?limit=500"),
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  const itens = audit.data?.items ?? [];

  // Filter items
  const visiveis = itens.filter((a) => {
    if (filtroEntidade !== "TODOS" && a.entidade.toLowerCase() !== filtroEntidade.toLowerCase()) {
      return false;
    }
    if (filtroOperacao !== "TODAS") {
      if (filtroOperacao === "VENCIMENTO" && a.operacao !== "ALTERACAO_VENCIMENTO") return false;
      if (filtroOperacao === "EDICAO" && !a.operacao.includes("EDICAO")) return false;
      if (filtroOperacao === "CADASTRO" && !["NOVO_CADASTRO", "INCLUSAO", "IMPORTACAO_CSV"].includes(a.operacao)) return false;
      if (filtroOperacao === "DESLIG_REAT" && !["DESLIGAMENTO", "REATIVACAO"].includes(a.operacao)) return false;
    }
    if (busca.trim()) {
      const q = busca.toLowerCase();
      const matchMatricula = a.matricula?.toLowerCase().includes(q);
      const matchUsuario = a.usuario_nome?.toLowerCase().includes(q);
      const matchEntidade = a.entidade?.toLowerCase().includes(q);
      const matchOperacao = a.operacao?.toLowerCase().includes(q);
      const matchAntes = a.antes && JSON.stringify(a.antes).toLowerCase().includes(q);
      const matchDepois = a.depois && JSON.stringify(a.depois).toLowerCase().includes(q);
      return Boolean(matchMatricula || matchUsuario || matchEntidade || matchOperacao || matchAntes || matchDepois);
    }
    return true;
  });

  const totalVencimento = itens.filter((a) => a.operacao === "ALTERACAO_VENCIMENTO").length;
  const totalEdicoes = itens.filter((a) => a.operacao.includes("EDICAO") || a.operacao === "NOVO_CADASTRO").length;
  const totalDesligReat = itens.filter((a) => a.operacao === "DESLIGAMENTO" || a.operacao === "REATIVACAO").length;

  const handleExportCSV = () => {
    const headers = ["Data/Hora", "Usuário", "Entidade", "Operação", "Matrícula", "Antes", "Depois"];
    const rows = visiveis.map((a) => [
      fmtDateTime(a.timestamp),
      `"${a.usuario_nome || ""}"`,
      `"${a.entidade || ""}"`,
      `"${a.operacao || ""}"`,
      `"${a.matricula || ""}"`,
      `"${JSON.stringify(a.antes || {}).replace(/"/g, '""')}"`,
      `"${JSON.stringify(a.depois || {}).replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    exportFile(`auditoria_cbmmt_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
  };

  return (
    <div className="space-y-5" data-testid="auditoria-page">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Governança e Transparência</p>
          <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl" data-testid="auditoria-title">
            Histórico de Auditoria
          </h2>
          <p className="text-sm text-slate-400">
            Registro cronológico em tempo real de todas as alterações cadastrais, mudanças de vencimento e movimentações no sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void audit.refetch()}
            disabled={audit.isFetching}
            className="border-[#1E2C42] bg-[#121B28] text-slate-200 hover:bg-[#1A2638]"
            data-testid="auditoria-refresh-button"
          >
            <RefreshCw className={cn("size-4 mr-1.5", audit.isFetching && "animate-spin text-blue-400")} />
            {audit.isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="border-[#1E2C42] bg-[#121B28] text-slate-200 hover:bg-[#1A2638]"
            data-testid="auditoria-export-button"
          >
            <Download className="size-4 mr-1.5 text-blue-400" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Total de Eventos</span>
            <History className="size-4 text-blue-400" />
          </div>
          <p className="mt-2 num font-heading text-2xl font-bold text-white">{itens.length}</p>
        </div>
        <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Alterações de Vencimento</span>
            <Calendar className="size-4 text-amber-400" />
          </div>
          <p className="mt-2 num font-heading text-2xl font-bold text-amber-300">{totalVencimento}</p>
        </div>
        <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Edições & Cadastros</span>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
          <p className="mt-2 num font-heading text-2xl font-bold text-emerald-300">{totalEdicoes}</p>
        </div>
        <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Desligamentos / Reat.</span>
            <UserMinus className="size-4 text-red-400" />
          </div>
          <p className="mt-2 num font-heading text-2xl font-bold text-red-300">{totalDesligReat}</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            placeholder="Buscar por militar, matrícula, usuário ou alteração..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 bg-[#0F1724] border-[#1E2C42]"
            data-testid="auditoria-search-input"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="size-3.5" />
            <span>Entidade:</span>
          </div>
          <select
            value={filtroEntidade}
            onChange={(e) => setFiltroEntidade(e.target.value)}
            className="h-9 rounded-md border border-[#1E2C42] bg-[#0F1724] px-3 text-xs text-slate-200 outline-none focus:border-blue-500"
            data-testid="auditoria-filter-entidade"
          >
            <option value="TODOS">Todas as entidades</option>
            <option value="militar">Militares</option>
            <option value="categorias">Categorias</option>
            <option value="cargos">Cargos</option>
            <option value="lotacoes">Lotações / UBM</option>
            <option value="editais">Editais</option>
            <option value="motivos">Motivos de Desligamento</option>
            <option value="usuario">Usuários</option>
            <option value="Configurações">Configurações</option>
          </select>

          <select
            value={filtroOperacao}
            onChange={(e) => setFiltroOperacao(e.target.value)}
            className="h-9 rounded-md border border-[#1E2C42] bg-[#0F1724] px-3 text-xs text-slate-200 outline-none focus:border-blue-500"
            data-testid="auditoria-filter-operacao"
          >
            <option value="TODAS">Todas as operações</option>
            <option value="VENCIMENTO">Alteração de Vencimento</option>
            <option value="EDICAO">Edições (gerais)</option>
            <option value="CADASTRO">Cadastros / Importações</option>
            <option value="DESLIG_REAT">Desligamentos / Reativações</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <section className="rounded-xl border border-[#1E2C42] bg-[#121B28] overflow-hidden" data-testid="auditoria-table-section">
        <div className="max-h-[640px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#1E2C42] hover:bg-transparent">
                <TableHead className="sticky top-0 bg-[#0F1724] text-[11px] uppercase text-slate-400">Data e Hora</TableHead>
                <TableHead className="sticky top-0 bg-[#0F1724] text-[11px] uppercase text-slate-400">Usuário Responsável</TableHead>
                <TableHead className="sticky top-0 bg-[#0F1724] text-[11px] uppercase text-slate-400">Operação</TableHead>
                <TableHead className="sticky top-0 bg-[#0F1724] text-[11px] uppercase text-slate-400">Entidade / Matrícula</TableHead>
                <TableHead className="sticky top-0 bg-[#0F1724] text-[11px] uppercase text-slate-400">Alterações Registradas (Antes → Depois)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-slate-400">
                    <History className="mx-auto size-8 text-slate-600 mb-2" />
                    Nenhum registro de auditoria encontrado com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                visiveis.map((a) => {
                  const badge = getBadge(a.operacao);
                  const Icon = badge.icon;
                  const changedKeys = a.depois ? Object.keys(a.depois) : a.antes ? Object.keys(a.antes) : [];

                  return (
                    <TableRow key={a.id} className="border-[#162234] align-top hover:bg-[#152134]/50">
                      {/* Timestamp */}
                      <TableCell className="num whitespace-nowrap py-3 text-xs">
                        <span className="font-semibold text-slate-200">{fmtDateTime(a.timestamp)}</span>
                      </TableCell>

                      {/* User */}
                      <TableCell className="py-3 text-xs">
                        <div className="flex items-center gap-1.5">
                          <User className="size-3.5 text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-200">{a.usuario_nome || "Sistema"}</span>
                        </div>
                      </TableCell>

                      {/* Operation */}
                      <TableCell className="py-3 text-xs">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold", badge.class)}>
                          <Icon className="size-3" />
                          {badge.label}
                        </span>
                      </TableCell>

                      {/* Entity / Matrícula */}
                      <TableCell className="py-3 text-xs">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-300 capitalize">{a.entidade}</span>
                          {a.matricula && (
                            <div>
                              {a.entidade_id ? (
                                <Link
                                  to={`/temporarios/${a.entidade_id}`}
                                  className="num text-blue-400 hover:text-blue-300 hover:underline"
                                  title="Ver cadastro do militar"
                                >
                                  Matrícula: {a.matricula}
                                </Link>
                              ) : (
                                <span className="num text-slate-400">Matrícula: {a.matricula}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Details / Diff */}
                      <TableCell className="py-3 text-xs">
                        <div className="space-y-1.5 max-w-xl">
                          {changedKeys.map((k) => {
                            const valAntes = a.antes ? a.antes[k] : undefined;
                            const valDepois = a.depois ? a.depois[k] : undefined;

                            if (valAntes !== undefined && valDepois !== undefined) {
                              return (
                                <div key={k} className="flex flex-wrap items-center gap-1.5 text-xs bg-[#0F1724] border border-[#1E2C42] rounded px-2 py-1">
                                  <span className="font-semibold text-slate-400">{k}:</span>
                                  <span className="num text-red-400 line-through decoration-red-500/60">{fmtVal(valAntes)}</span>
                                  <span className="text-slate-500">→</span>
                                  <span className="num font-bold text-emerald-400">{fmtVal(valDepois)}</span>
                                </div>
                              );
                            }

                            if (valDepois !== undefined) {
                              return (
                                <div key={k} className="flex flex-wrap items-center gap-1.5 text-xs bg-[#0F1724] border border-[#1E2C42] rounded px-2 py-1">
                                  <span className="font-semibold text-slate-400">{k}:</span>
                                  <span className="text-slate-200">{fmtVal(valDepois)}</span>
                                </div>
                              );
                            }

                            return (
                              <div key={k} className="flex flex-wrap items-center gap-1.5 text-xs bg-[#0F1724] border border-[#1E2C42] rounded px-2 py-1">
                                <span className="font-semibold text-slate-400">{k} (removido):</span>
                                <span className="text-red-400 line-through">{fmtVal(valAntes)}</span>
                              </div>
                            );
                          })}
                          {changedKeys.length === 0 && <span className="text-slate-500">—</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
