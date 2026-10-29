import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar, CheckCircle2, Download, FileSpreadsheet, Filter,
  History, RefreshCw, Search, User, UserMinus, RotateCcw, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { exportFile, fmtDate, fmtDateTime } from "@/lib/format";
import type { AuditoriaPage } from "@/lib/types";
import { cn } from "@/lib/utils";

const OP_BADGES: Record<string, { label: string; class: string; icon: any }> = {
  ALTERACAO_VENCIMENTO: { label: "Alteração de Vencimento", class: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: Calendar },
  RENOVACAO_VENCIMENTO: { label: "Renovação de Vencimento", class: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: Calendar },
  EDICAO_RAPIDA: { label: "Edição Rápida", class: "bg-blue-500/15 text-blue-300 border-blue-500/30", icon: History },
  EDICAO_CADASTRO: { label: "Edição de Cadastro", class: "bg-sky-500/15 text-sky-300 border-sky-500/30", icon: History },
  EXCLUSAO_CADASTRO: { label: "Exclusão de Militar", class: "bg-rose-500/15 text-rose-300 border-rose-500/30", icon: AlertCircle },
  NOVO_CADASTRO: { label: "Novo Cadastro", class: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  INCLUSAO: { label: "Inclusão", class: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  DESLIGAMENTO: { label: "Desligamento", class: "bg-red-500/15 text-red-300 border-red-500/30", icon: UserMinus },
  REATIVACAO: { label: "Reativação", class: "bg-teal-500/15 text-teal-300 border-teal-500/30", icon: RotateCcw },
  IMPORTACAO_CSV: { label: "Importação CSV", class: "bg-purple-500/15 text-purple-300 border-purple-500/30", icon: FileSpreadsheet },
  ALTERACAO_CONFIGURACAO: { label: "Configuração", class: "bg-slate-500/15 text-slate-300 border-slate-500/30", icon: History },
  CRIACAO_USUARIO: { label: "Criação de Usuário", class: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: User },
  EDICAO_USUARIO: { label: "Edição de Usuário", class: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30", icon: User },
  EXCLUSAO_USUARIO: { label: "Exclusão de Usuário", class: "bg-rose-500/15 text-rose-300 border-rose-500/30", icon: AlertCircle },
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

function normEntidade(ent: string): string {
  const s = (ent || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  if (s.startsWith("militar")) return "militar";
  if (s.startsWith("usuario") || s.startsWith("user")) return "usuario";
  if (s.startsWith("categor")) return "categorias";
  if (s.startsWith("cargo")) return "cargos";
  if (s.startsWith("lotac")) return "lotacoes";
  if (s.startsWith("edita")) return "editais";
  if (s.startsWith("motiv")) return "motivos";
  if (s.startsWith("config")) return "configuracoes";
  return s;
}

const fmtVal = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fmtDate(s);
  return s;
};

export default function Auditoria() {
  const [busca, setBusca] = useState("");
  const [filtroEntidade, setFiltroEntidade] = useState("TODOS");
  const [filtroOperacao, setFiltroOperacao] = useState("TODAS");
  const [limite, setLimite] = useState<number>(30);

  const audit = useQuery({
    queryKey: ["auditoria", limite],
    queryFn: () => apiGet<AuditoriaPage>(`/auditoria?limit=${limite}`),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const itens = audit.data?.items ?? [];

  // Filter items
  const visiveis = itens.filter((a) => {
    if (filtroEntidade !== "TODOS" && normEntidade(a.entidade) !== normEntidade(filtroEntidade)) {
      return false;
    }
    if (filtroOperacao !== "TODAS") {
      if (filtroOperacao === "VENCIMENTO" && !["ALTERACAO_VENCIMENTO", "RENOVACAO_VENCIMENTO"].includes(a.operacao)) return false;
      if (filtroOperacao === "EDICAO" && !a.operacao.includes("EDICAO")) return false;
      if (filtroOperacao === "CADASTRO" && !["NOVO_CADASTRO", "INCLUSAO", "IMPORTACAO_CSV", "CRIACAO_USUARIO"].includes(a.operacao)) return false;
      if (filtroOperacao === "DESLIG_REAT" && !["DESLIGAMENTO", "REATIVACAO"].includes(a.operacao)) return false;
      if (filtroOperacao === "EXCLUSAO" && !a.operacao.startsWith("EXCLUSAO_")) return false;
    }
    if (busca.trim()) {
      const q = busca.toLowerCase();
      const antesObj = a.detalhes?.antes ?? a.antes;
      const depoisObj = a.detalhes?.depois ?? a.depois;
      const matchMatricula = a.matricula?.toLowerCase().includes(q) || a.entidade_id?.toLowerCase().includes(q);
      const matchUsuario = a.usuario_nome?.toLowerCase().includes(q) || a.usuario_email?.toLowerCase().includes(q);
      const matchEntidade = a.entidade?.toLowerCase().includes(q);
      const matchOperacao = a.operacao?.toLowerCase().includes(q);
      const matchAntes = antesObj && JSON.stringify(antesObj).toLowerCase().includes(q);
      const matchDepois = depoisObj && JSON.stringify(depoisObj).toLowerCase().includes(q);
      return Boolean(matchMatricula || matchUsuario || matchEntidade || matchOperacao || matchAntes || matchDepois);
    }
    return true;
  });

  const totalVencimento = itens.filter((a) => ["ALTERACAO_VENCIMENTO", "RENOVACAO_VENCIMENTO"].includes(a.operacao)).length;
  const totalEdicoes = itens.filter(
    (a) =>
      a.operacao.includes("EDICAO") ||
      a.operacao === "NOVO_CADASTRO" ||
      a.operacao === "CRIACAO_USUARIO" ||
      a.operacao.startsWith("INSERCAO_") ||
      a.operacao.startsWith("EXCLUSAO_")
  ).length;
  const totalDesligReat = itens.filter((a) => a.operacao === "DESLIGAMENTO" || a.operacao === "REATIVACAO").length;

  const handleExportCSV = () => {
    const headers = ["Data/Hora", "Usuário", "E-mail", "Entidade", "ID/Matrícula", "Operação", "Antes", "Depois"];
    const rows = visiveis.map((a) => {
      const antesObj = a.detalhes?.antes ?? a.antes;
      const depoisObj = a.detalhes?.depois ?? a.depois;
      return [
        fmtDateTime(a.data_hora || a.timestamp),
        `"${a.usuario_nome || ""}"`,
        `"${a.usuario_email || ""}"`,
        `"${a.entidade || ""}"`,
        `"${a.matricula || a.entidade_id || ""}"`,
        `"${a.operacao || ""}"`,
        `"${JSON.stringify(antesObj || {}).replace(/"/g, '""')}"`,
        `"${JSON.stringify(depoisObj || {}).replace(/"/g, '""')}"`,
      ];
    });
    const csvContent = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    exportFile(`auditoria_cbmmt_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
  };

  return (
    <div className="space-y-5" data-testid="auditoria-page">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Governança e Transparência (Cloud Firestore)</p>
          <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl" data-testid="auditoria-title">
            Histórico de Auditoria
          </h2>
          <p className="text-sm text-slate-400">
            Registro centralizado na nuvem (coleção <span className="font-mono text-slate-300">auditoria</span>) de todas as ações executadas no sistema, compartilhado em tempo real entre todos os administradores.
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
            {audit.isFetching ? "Sincronizando..." : "Atualizar da Nuvem"}
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
            <span className="text-xs text-slate-400">Eventos Carregados (Limite {limite})</span>
            <History className="size-4 text-blue-400" />
          </div>
          <p className="mt-2 num font-heading text-2xl font-bold text-white" data-testid="auditoria-kpi-total">{itens.length}</p>
        </div>
        <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Alterações de Vencimento</span>
            <Calendar className="size-4 text-amber-400" />
          </div>
          <p className="mt-2 num font-heading text-2xl font-bold text-amber-300" data-testid="auditoria-kpi-vencimento">{totalVencimento}</p>
        </div>
        <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Edições, Cadastros & Exclusões</span>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
          <p className="mt-2 num font-heading text-2xl font-bold text-emerald-300" data-testid="auditoria-kpi-edicoes">{totalEdicoes}</p>
        </div>
        <div className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Desligamentos / Reat.</span>
            <UserMinus className="size-4 text-red-400" />
          </div>
          <p className="mt-2 num font-heading text-2xl font-bold text-red-300" data-testid="auditoria-kpi-deslig">{totalDesligReat}</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1E2C42] bg-[#121B28] p-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            placeholder="Buscar por militar, matrícula, usuário, e-mail ou alteração..."
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
            <option value="usuario">Usuários</option>
            <option value="categorias">Categorias</option>
            <option value="cargos">Cargos</option>
            <option value="lotacoes">Lotações / UBM</option>
            <option value="editais">Editais</option>
            <option value="motivos">Motivos de Desligamento</option>
            <option value="configuracoes">Configurações</option>
          </select>

          <select
            value={filtroOperacao}
            onChange={(e) => setFiltroOperacao(e.target.value)}
            className="h-9 rounded-md border border-[#1E2C42] bg-[#0F1724] px-3 text-xs text-slate-200 outline-none focus:border-blue-500"
            data-testid="auditoria-filter-operacao"
          >
            <option value="TODAS">Todas as operações</option>
            <option value="VENCIMENTO">Alteração / Renovação de Vencimento</option>
            <option value="EDICAO">Edições (gerais)</option>
            <option value="CADASTRO">Cadastros / Criações / Importações</option>
            <option value="DESLIG_REAT">Desligamentos / Reativações</option>
            <option value="EXCLUSAO">Exclusões</option>
          </select>

          <select
            value={String(limite)}
            onChange={(e) => setLimite(Number(e.target.value))}
            className="h-9 rounded-md border border-[#1E2C42] bg-[#0F1724] px-3 text-xs text-slate-200 outline-none focus:border-blue-500"
            data-testid="auditoria-filter-limit"
            title="Limite de leitura por consulta no Firestore (proteção de cotas)"
          >
            <option value="30">Últimos 30 eventos</option>
            <option value="50">Últimos 50 eventos</option>
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
                <TableHead className="sticky top-0 bg-[#0F1724] text-[11px] uppercase text-slate-400">Entidade / ID</TableHead>
                <TableHead className="sticky top-0 bg-[#0F1724] text-[11px] uppercase text-slate-400">Detalhes (Antes → Depois)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-slate-400">
                    <History className="mx-auto size-8 text-slate-600 mb-2" />
                    {audit.isLoading
                      ? "Carregando histórico de auditoria do Cloud Firestore..."
                      : "Nenhum registro de auditoria encontrado na coleção 'auditoria' para os filtros atuais."}
                  </TableCell>
                </TableRow>
              ) : (
                visiveis.map((a) => {
                  const badge = getBadge(a.operacao);
                  const Icon = badge.icon;
                  const antesObj = a.detalhes?.antes ?? a.antes;
                  const depoisObj = a.detalhes?.depois ?? a.depois;
                  const changedKeys = Array.from(
                    new Set([
                      ...(depoisObj ? Object.keys(depoisObj) : []),
                      ...(antesObj ? Object.keys(antesObj) : []),
                    ])
                  );

                  return (
                    <TableRow key={a.id} className="border-[#162234] align-top hover:bg-[#152134]/50">
                      {/* Timestamp */}
                      <TableCell className="num whitespace-nowrap py-3 text-xs">
                        <span className="font-semibold text-slate-200">{fmtDateTime(a.data_hora || a.timestamp)}</span>
                      </TableCell>

                      {/* User */}
                      <TableCell className="py-3 text-xs">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <User className="size-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-200">{a.usuario_nome || "Sistema"}</span>
                          </div>
                          {a.usuario_email && (
                            <span className="text-[11px] text-slate-400 pl-5">{a.usuario_email}</span>
                          )}
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
                          {a.matricula ? (
                            <div>
                              {a.entidade_id && normEntidade(a.entidade) === "militar" ? (
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
                          ) : a.entidade_id ? (
                            <div className="num text-[11px] text-slate-400">ID: {a.entidade_id}</div>
                          ) : null}
                        </div>
                      </TableCell>

                      {/* Details / Diff */}
                      <TableCell className="py-3 text-xs">
                        <div className="space-y-1.5 max-w-xl">
                          {changedKeys.map((k) => {
                            const valAntes = antesObj ? antesObj[k] : undefined;
                            const valDepois = depoisObj ? depoisObj[k] : undefined;

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
                          {changedKeys.length === 0 && (
                            <span className="text-slate-500">{a.detalhes?.descricao || "—"}</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginação / Carregamento sob demanda */}
        {itens.length >= limite && limite < 150 && (
          <div className="flex items-center justify-between border-t border-[#1E2C42] bg-[#0F1724]/60 px-4 py-3 text-xs text-slate-400">
            <span>Exibindo os últimos {itens.length} registros da nuvem (proteção de cotas ativa).</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLimite((prev) => Math.min(150, prev + 30))}
              disabled={audit.isFetching}
              className="border-[#1E2C42] bg-[#121B28] text-xs text-blue-300 hover:bg-[#1A2638] hover:text-white"
              data-testid="auditoria-load-more"
            >
              Carregar mais registros (+30)
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
