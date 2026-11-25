import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Clock, Pencil, RotateCcw, Trash2, UserMinus } from "lucide-react";
import { DesligamentoDialog, QuickEditDialog, ReativarDialog } from "@/components/MilitarDialogs";
import { AlertaBadge, StatusBadge } from "@/components/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { errMsg, fmtDate, fmtDateTime } from "@/lib/format";
import { isAdmin, podeEditar, useMe } from "@/lib/hooks";
import { getInfoContrato, type Militar, type MilitarHistorico } from "@/lib/types";
import { cn } from "@/lib/utils";

const TIPO_STYLE: Record<string, string> = {
  INCLUSAO: "bg-emerald-500/15 text-emerald-300",
  DESLIGAMENTO: "bg-red-500/15 text-red-300",
  REATIVACAO: "bg-blue-500/15 text-blue-300",
};

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-100">{children}</dd>
    </div>
  );
}

const fmtVal = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? fmtDate(String(v)) : String(v));

export default function MilitarDetalhe() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const [desl, setDesl] = useState<Militar | null>(null);
  const [reat, setReat] = useState<Militar | null>(null);
  const [quickEdit, setQuickEdit] = useState<Militar | null>(null);
  const [excluirModalOpen, setExcluirModalOpen] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [selectingAlteracoes, setSelectingAlteracoes] = useState(false);
  const [selectedAlteracaoIds, setSelectedAlteracaoIds] = useState<string[]>([]);
  const [alteracoesToDelete, setAlteracoesToDelete] = useState<string[]>([]);
  const [excluindoAlteracoes, setExcluindoAlteracoes] = useState(false);

  const q = useQuery({
    queryKey: ["militar", id],
    queryFn: () => apiGet<Militar>(`/militares/${id}`),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const h = useQuery({
    queryKey: ["militar", id, "historico"],
    queryFn: () => apiGet<MilitarHistorico>(`/militares/${id}/historico`),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const m = q.isError ? undefined : q.data;

  const handleExcluir = async () => {
    if (!m || !isAdmin(me.data)) return;
    setExcluindo(true);
    try {
      await apiDelete(`/militares/${m.id}`);
      toast.success("Cadastro do militar excluído com sucesso.");
      void qc.invalidateQueries({ queryKey: ["militares"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["auditoria"] });
      nav("/temporarios", { replace: true });
    } catch (err: any) {
      console.error("Erro ao excluir militar:", err);
      toast.error(errMsg(err, "Erro ao excluir cadastro do militar"));
    } finally {
      setExcluindo(false);
      setExcluirModalOpen(false);
    }
  };

  const toggleAlteracaoSelection = (auditId: string) => {
    setSelectedAlteracaoIds((prev) =>
      prev.includes(auditId) ? prev.filter((item) => item !== auditId) : [...prev, auditId]
    );
  };

  const handleExcluirAlteracoes = async () => {
    if (alteracoesToDelete.length === 0 || !isAdmin(me.data)) return;
    setExcluindoAlteracoes(true);
    try {
      if (alteracoesToDelete.length === 1) {
        await apiDelete(`/auditoria/${alteracoesToDelete[0]}`);
      } else {
        await apiPost("/auditoria/excluir", { ids: alteracoesToDelete });
      }
      toast.success(
        alteracoesToDelete.length === 1
          ? "Registro de alteração excluído."
          : `${alteracoesToDelete.length} registros de alteração excluídos.`
      );
      setSelectedAlteracaoIds((prev) => prev.filter((item) => !alteracoesToDelete.includes(item)));
      setSelectingAlteracoes(false);
      setAlteracoesToDelete([]);
      void qc.invalidateQueries({ queryKey: ["militar", id, "historico"] });
      void qc.invalidateQueries({ queryKey: ["auditoria"] });
    } catch (err: any) {
      toast.error(errMsg(err, "Erro ao excluir registro(s) de alteração"));
    } finally {
      setExcluindoAlteracoes(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <Link to="/temporarios" className="inline-flex h-9 items-center gap-1 text-sm text-slate-400 hover:text-white" data-testid="detail-back-link"><ArrowLeft className="size-4" /> Temporários</Link>
      {q.isError && <p className="text-slate-400" data-testid="detail-error">Registro não encontrado ou indisponível.</p>}
      {m && (
        <section className="glass-panel rounded-xl border p-4 sm:p-5" data-testid="militar-detail">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div>
              <p className="num text-sm text-blue-300" data-testid="detail-matricula">{m.matricula}</p>
              <h2 className="font-heading text-xl sm:text-2xl font-extrabold text-white" data-testid="detail-nome">{m.nome_completo}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={m.status} />
                <AlertaBadge m={m} />
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              {podeEditar(me.data) && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setQuickEdit(m)}
                    data-testid="detail-quick-edit-button"
                    className="h-10 sm:h-9 justify-center border-blue-500/30 bg-blue-500/10 text-xs sm:text-sm text-blue-300 hover:bg-blue-500/20 hover:text-white"
                  >
                    <Pencil className="size-4" /> Edição Rápida
                  </Button>
                  <Link to={`/temporarios/${m.id}/editar`} className={cn(buttonVariants({ variant: "outline" }), "h-10 sm:h-9 justify-center text-xs sm:text-sm")} data-testid="detail-edit-button">
                    <span className="sm:hidden">Editar Completo</span>
                    <span className="hidden sm:inline">Editar Cadastro Completo</span>
                  </Link>
                </>
              )}
              {podeEditar(me.data) && m.status === "ATIVO" && (
                <Button className="h-10 sm:h-9 justify-center bg-red-600 text-xs sm:text-sm text-white hover:bg-red-700" onClick={() => setDesl(m)} data-testid="detail-desligar-button"><UserMinus className="size-4" /> Desligar</Button>
              )}
              {isAdmin(me.data) && m.status === "DESLIGADO" && (
                <Button className="h-10 sm:h-9 justify-center bg-emerald-600 text-xs sm:text-sm text-white hover:bg-emerald-700" onClick={() => setReat(m)} data-testid="detail-reativar-button"><RotateCcw className="size-4" /> Reativar</Button>
              )}
              {isAdmin(me.data) && (
                <Button
                  variant="outline"
                  className="h-10 sm:h-9 justify-center border-red-500/30 text-xs sm:text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  onClick={() => setExcluirModalOpen(true)}
                  data-testid="detail-delete-button"
                >
                  <Trash2 className="size-4" /> Excluir
                </Button>
              )}
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <Info label="Cargo / função">{m.cargo_nome}</Info>
            <Info label="Categoria">{m.categoria_nome}</Info>
            <Info label="Lotação / UBM">{m.lotacao_nome}</Info>
            <Info label="Comando Regional">{m.comando_regional_nome || "—"}</Info>
            <Info label="Inclusão"><span className="num">{fmtDate(m.data_inclusao)}</span></Info>
            <Info label="Vencimento do contrato">
              <span className="num">{fmtDate(m.data_vencimento_contrato)}</span>
            </Info>
            <Info label="DOE — incorporação">{m.doe_incorporacao ?? "—"}</Info>
            <Info label="Sub judice"><span data-testid="detail-sub-judice" className={m.sub_judice ? "font-semibold text-amber-300" : ""}>{m.sub_judice ? "Sim" : "Não"}</span></Info>
            {(() => {
              const info = getInfoContrato(m);
              return (
                <Info label="Ano do contrato">
                  <span className={cn("inline-flex items-center gap-1.5 font-semibold", info.renovado ? "text-cyan-300" : "text-slate-300")}>
                    {info.renovado && <BadgeCheck className="size-3.5 text-cyan-400" />}
                    <span>{info.rotuloCompleto}</span>
                  </span>
                </Info>
              );
            })()}
            <Info label="Edital">{m.edital_nome}</Info>
            {m.status === "DESLIGADO" && (
              <>
                <Info label="Data do desligamento"><span className="num text-red-300">{fmtDate(m.data_desligamento)}</span></Info>
                <Info label="Status de desligamento">{m.motivo_desligamento_nome ?? "—"}</Info>
                <Info label="Documento / processo">{m.documento_desligamento ?? "—"}</Info>
              </>
            )}
            <div className="sm:col-span-2 lg:col-span-4"><Info label={m.status === "DESLIGADO" ? "Motivo do desligamento" : "Observações"}><span className="whitespace-pre-line">{m.observacoes || "—"}</span></Info></div>
          </dl>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5 text-slate-400" />
              <span>Última atualização do cadastro no sistema: <strong className="font-medium text-slate-300">{fmtDateTime(m.atualizado_em)}</strong>{m.atualizado_por_nome ? ` por ${m.atualizado_por_nome}` : ""}</span>
            </span>
            {m.criado_em && (
              <span>Cadastrado em: <span className="text-slate-400">{fmtDateTime(m.criado_em)}</span></span>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="glass-panel rounded-xl border p-4 sm:p-5" data-testid="historico-situacao">
          <h3 className="mb-4 font-heading font-bold text-white">Histórico de situação</h3>
          <ol className="space-y-3 border-l border-white/[0.12] pl-4">
            {(h.data?.situacao ?? []).map((s) => (
              <li key={s.id} className="relative" data-testid={`situacao-${s.tipo.toLowerCase()}`}>
                <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-blue-500 ring-4 ring-[#0A1221]" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", TIPO_STYLE[s.tipo])}>{s.tipo}</span>
                  <span className="num text-sm text-white">{fmtDate(s.data_efetiva)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {[s.motivo_nome, s.documento, s.justificativa, s.observacoes].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-[11px] text-slate-500">{s.usuario_nome} · {fmtDateTime(s.timestamp)}</p>
              </li>
            ))}
            {h.data?.situacao.length === 0 && <li className="text-sm text-slate-500">Sem eventos.</li>}
          </ol>
        </section>
        <section className="glass-panel min-w-0 rounded-xl border p-4 sm:p-5" data-testid="historico-alteracoes">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading font-bold text-white">Registro de alterações</h3>
            {isAdmin(me.data) && (h.data?.alteracoes?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                {selectingAlteracoes ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={selectedAlteracaoIds.length === 0}
                      onClick={() => setAlteracoesToDelete(selectedAlteracaoIds)}
                      className="h-7 border-red-500/40 bg-red-500/10 px-2.5 text-xs text-red-300 hover:bg-red-500/20 hover:text-white disabled:opacity-40"
                      data-testid="alteracoes-delete-selected-button"
                    >
                      <Trash2 className="size-3.5" /> Excluir ({selectedAlteracaoIds.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectingAlteracoes(false);
                        setSelectedAlteracaoIds([]);
                      }}
                      className="h-7 px-2 text-xs text-slate-400 hover:text-white"
                      data-testid="alteracoes-cancel-select-button"
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedAlteracaoIds([]);
                      setSelectingAlteracoes(true);
                    }}
                    className="h-7 px-2.5 text-xs text-slate-400 hover:bg-white/[0.06] hover:text-white"
                    data-testid="alteracoes-select-mode-button"
                  >
                    Selecionar
                  </Button>
                )}
              </div>
            )}
          </header>
          <div className="space-y-3">
            {(h.data?.alteracoes ?? []).map((a) => {
              const isSelected = selectedAlteracaoIds.includes(a.id);
              return (
                <div
                  key={a.id}
                  onClick={selectingAlteracoes ? () => toggleAlteracaoSelection(a.id) : undefined}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    selectingAlteracoes ? "cursor-pointer" : "",
                    isSelected
                      ? "border-red-500/50 bg-red-950/25"
                      : "border-white/[0.08] bg-[#060B15]/68"
                  )}
                  data-testid="alteracao-item"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      {selectingAlteracoes && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleAlteracaoSelection(a.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Selecionar registro de alteração"
                          className="size-3.5 rounded border-white/[0.16] bg-[#09101E] accent-red-500 cursor-pointer"
                        />
                      )}
                      <span className="font-semibold uppercase tracking-wide text-blue-300">{a.operacao.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{a.usuario_nome} · {fmtDateTime(a.timestamp)}</span>
                      {isAdmin(me.data) && !selectingAlteracoes && (
                        <button
                          type="button"
                          onClick={() => setAlteracoesToDelete([a.id])}
                          title="Excluir registro de alteração"
                          aria-label="Excluir registro de alteração"
                          className="rounded p-1 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                          data-testid={`delete-alteracao-${a.id}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[260px] text-xs">
                      <tbody>
                        {Object.entries(a.depois ?? {}).filter(([, v]) => a.antes !== null || (v !== null && v !== "")).map(([k, v]) => (
                          <tr key={k} className="border-t border-white/[0.06]">
                            <td className="py-1 pr-2 text-slate-400">{k}</td>
                            {a.antes !== null && <td className="py-1 pr-2 text-red-300/80 line-through decoration-red-500/40">{fmtVal(a.antes?.[k])}</td>}
                            <td className="py-1 text-emerald-300">{fmtVal(v)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {h.data?.alteracoes.length === 0 && <p className="text-sm text-slate-500">Sem alterações registradas.</p>}
          </div>
        </section>
      </div>
      <DesligamentoDialog militar={desl} onClose={() => setDesl(null)} />
      <ReativarDialog militar={reat} onClose={() => setReat(null)} />
      <QuickEditDialog militar={quickEdit} onClose={() => setQuickEdit(null)} />

      <Dialog open={excluirModalOpen} onOpenChange={setExcluirModalOpen}>
        <DialogContent className="glass-dialog border text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-red-400">Excluir Cadastro</DialogTitle>
            <DialogDescription className="text-slate-300">
              Tem certeza que deseja excluir definitivamente o cadastro de <strong>{m?.nome_completo}</strong> (Matrícula: {m?.matricula})? Esta ação removerá o militar permanentemente do banco de dados oficial do Firestore e do sistema.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setExcluirModalOpen(false)}
              disabled={excluindo}
              className="border-white/[0.12] bg-white/[0.05] text-slate-300 hover:bg-white/[0.10] hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleExcluir}
              disabled={excluindo}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {excluindo ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={alteracoesToDelete.length > 0} onOpenChange={(open) => { if (!open && !excluindoAlteracoes) setAlteracoesToDelete([]); }}>
        <DialogContent className="glass-dialog border text-white sm:max-w-md" data-testid="delete-alteracoes-dialog">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-red-400">Excluir Registro de Alterações</DialogTitle>
            <DialogDescription className="text-slate-300">
              {alteracoesToDelete.length === 1
                ? "Tem certeza que deseja excluir este registro do histórico de alterações? Ele será removido permanentemente do Firestore."
                : `Tem certeza que deseja excluir os ${alteracoesToDelete.length} registros selecionados do histórico de alterações? Eles serão removidos permanentemente do Firestore.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setAlteracoesToDelete([])}
              disabled={excluindoAlteracoes}
              className="border-white/[0.12] bg-white/[0.05] text-slate-300 hover:bg-white/[0.10] hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleExcluirAlteracoes}
              disabled={excluindoAlteracoes}
              className="bg-red-600 text-white hover:bg-red-700"
              data-testid="confirm-delete-alteracoes-button"
            >
              {excluindoAlteracoes ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
