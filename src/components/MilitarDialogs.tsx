import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, BadgeCheck, RotateCcw } from "lucide-react";
import FieldSelect from "@/components/FieldSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPatch, apiPost } from "@/lib/api";
import { errMsg, fmtDate } from "@/lib/format";
import { isAdmin, MILITAR_KEYS, podeEditar, useCatalogos, useMe, useMeta } from "@/lib/hooks";
import { getInfoContrato, type DesligamentoIn, type Militar, type MilitarRapidoIn, type ReativacaoIn } from "@/lib/types";
import { RenovacaoFocusModal, type RenovacaoConfirmPayload } from "@/components/RenovacaoPrompt";
import { cn } from "@/lib/utils";

export function useInvalidateMilitares() {
  const qc = useQueryClient();
  return () => MILITAR_KEYS.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
}

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-red-400">{msg}</p> : null;
}

function Resumo({ m }: { m: Militar }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-[#1E2C42] bg-[#0F1724] p-3 text-sm" data-testid="dialog-militar-resumo">
      <div className="col-span-2"><dt className="text-[10px] uppercase tracking-wider text-slate-500">Nome</dt><dd className="font-semibold text-white">{m.nome_completo}</dd></div>
      <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Matrícula</dt><dd className="num text-slate-200">{m.matricula}</dd></div>
      <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Cargo</dt><dd className="text-slate-200">{m.cargo_nome}</dd></div>
      <div className="col-span-2"><dt className="text-[10px] uppercase tracking-wider text-slate-500">Lotação</dt><dd className="text-slate-200">{m.lotacao_nome}</dd></div>
    </dl>
  );
}

const desligSchema = z.object({
  data_desligamento: z.string().min(1, "Informe a data efetiva"),
  motivo_id: z.string().min(1, "Selecione o motivo"),
  documento: z.string().max(120).optional(),
  observacoes: z.string().max(2000).optional(),
});
type DesligForm = z.infer<typeof desligSchema>;

export function DesligamentoDialog({ militar, onClose }: { militar: Militar | null; onClose: () => void }) {
  const me = useMe();
  const cat = useCatalogos();
  const meta = useMeta();
  const invalidate = useInvalidateMilitares();
  const hoje = meta.data?.data_hoje ?? "";
  const form = useForm<DesligForm>({ resolver: zodResolver(desligSchema), defaultValues: { data_desligamento: "", motivo_id: "", documento: "", observacoes: "" } });
  useEffect(() => {
    if (militar) form.reset({ data_desligamento: hoje, motivo_id: "", documento: "", observacoes: "" });
  }, [militar, hoje, form]);
  const mut = useMutation({
    mutationFn: (b: DesligamentoIn) => {
      if (!podeEditar(me.data)) throw new Error("Seu perfil não tem permissão para registrar desligamentos.");
      return apiPost<Militar>(`/militares/${militar?.id}/desligar`, b);
    },
    onSuccess: (m) => {
      toast.success(`Desligamento registrado: ${m.nome_completo}`);
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const submit = form.handleSubmit((v) => {
    if (militar && v.data_desligamento < militar.data_inclusao) {
      form.setError("data_desligamento", { message: "Anterior à data de inclusão" });
      return;
    }
    if (hoje && v.data_desligamento > hoje) {
      form.setError("data_desligamento", { message: "A data não pode ser futura" });
      return;
    }
    mut.mutate({
      data_desligamento: v.data_desligamento || hoje,
      motivo_id: v.motivo_id || "",
      documento: v.documento || null,
      observacoes: v.observacoes || null,
    });
  });
  const e = form.formState.errors;
  return (
    <Dialog open={!!militar} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-[#1E2C42] bg-[#121B28] sm:max-w-lg" data-testid="desligamento-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white"><AlertTriangle className="size-5 text-red-400" /> Registrar Desligamento</DialogTitle>
          <DialogDescription>O cadastro não será excluído: a situação passa a Desligado e o histórico é preservado.</DialogDescription>
        </DialogHeader>
        {militar && <Resumo m={militar} />}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dt-deslig">Data efetiva do desligamento *</Label>
              <Input id="dt-deslig" type="date" max={hoje} className="[color-scheme:dark]" data-testid="desligamento-data-input" {...form.register("data_desligamento")} />
              <Err msg={e.data_desligamento?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Status de desligamento *</Label>
              <Controller control={form.control} name="motivo_id" render={({ field }) => (
                <FieldSelect testId="desligamento-motivo-select" value={field.value} onChange={field.onChange} placeholder="Selecione o status de desligamento"
                  options={(cat.data?.motivos ?? []).filter((m) => m.ativo).map((m) => ({ value: m.id, label: m.nome }))} />
              )} />
              <Err msg={e.motivo_id?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-deslig">Nº do documento / processo administrativo</Label>
            <Input id="doc-deslig" placeholder="Ex.: SEI 00000/2026" data-testid="desligamento-documento-input" {...form.register("documento")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs-deslig">Motivo do desligamento</Label>
            <Textarea id="obs-deslig" rows={3} placeholder="Descreva o motivo detalhado ou justificativa do desligamento..." data-testid="desligamento-observacoes-input" {...form.register("observacoes")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="desligamento-cancel-button">Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={mut.isPending} data-testid="desligamento-confirm-button" className="bg-red-600 text-white hover:bg-red-700">
              {mut.isPending ? "Registrando..." : "Confirmar desligamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const reatSchema = z.object({
  justificativa: z.string().trim().min(10, "Descreva a justificativa (mínimo 10 caracteres)"),
  data_vencimento_contrato: z.string().optional(),
  documento: z.string().max(120).optional(),
});
type ReatForm = z.infer<typeof reatSchema>;

export function ReativarDialog({ militar, onClose }: { militar: Militar | null; onClose: () => void }) {
  const me = useMe();
  const invalidate = useInvalidateMilitares();
  const form = useForm<ReatForm>({ resolver: zodResolver(reatSchema), defaultValues: { justificativa: "", data_vencimento_contrato: "", documento: "" } });
  useEffect(() => {
    if (militar) form.reset({ justificativa: "", data_vencimento_contrato: militar.data_vencimento_contrato, documento: "" });
  }, [militar, form]);
  const mut = useMutation({
    mutationFn: (b: ReativacaoIn) => {
      if (!isAdmin(me.data)) throw new Error("Apenas administradores podem reativar cadastros.");
      return apiPost<Militar>(`/militares/${militar?.id}/reativar`, b);
    },
    onSuccess: (m) => { toast.success(`Cadastro reativado: ${m.nome_completo}`); invalidate(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const submit = form.handleSubmit((v) =>
    mut.mutate({ justificativa: v.justificativa, data_vencimento_contrato: v.data_vencimento_contrato || null, documento: v.documento || null }),
  );
  return (
    <Dialog open={!!militar} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-[#1E2C42] bg-[#121B28] sm:max-w-lg" data-testid="reativar-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white"><RotateCcw className="size-5 text-emerald-400" /> Reativar Cadastro</DialogTitle>
          <DialogDescription>
            Desligado em {fmtDate(militar?.data_desligamento)} ({militar?.motivo_desligamento_nome ?? "—"}). A reativação fica registrada no histórico.
          </DialogDescription>
        </DialogHeader>
        {militar && <Resumo m={militar} />}
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="just">Justificativa *</Label>
            <Textarea id="just" rows={3} data-testid="reativar-justificativa-input" {...form.register("justificativa")} />
            <Err msg={form.formState.errors.justificativa?.message} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nv">Vencimento do contrato</Label>
              <Input id="nv" type="date" className="[color-scheme:dark]" data-testid="reativar-vencimento-input" {...form.register("data_vencimento_contrato")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="docr">Documento / processo</Label>
              <Input id="docr" data-testid="reativar-documento-input" {...form.register("documento")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="reativar-cancel-button">Cancelar</Button>
            <Button type="submit" disabled={mut.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700" data-testid="reativar-confirm-button">
              {mut.isPending ? "Reativando..." : "Confirmar reativação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const rapidoSchema = z.object({
  lotacao_id: z.string().min(1, "Selecione a lotação"),
  comando_regional_id: z.string().min(1, "Selecione o Comando Regional"),
  edital_id: z.string().min(1, "Selecione o edital"),
  data_vencimento_contrato: z.string().min(1, "Informe o vencimento"),
  observacoes: z.string().max(2000).optional(),
  renovacao_contrato: z.boolean().optional(),
});
type RapidoForm = z.infer<typeof rapidoSchema>;

export function QuickEditDialog({ militar, onClose }: { militar: Militar | null; onClose: () => void }) {
  const me = useMe();
  const cat = useCatalogos();
  const invalidate = useInvalidateMilitares();
  const form = useForm<RapidoForm>({
    resolver: zodResolver(rapidoSchema),
    defaultValues: {
      lotacao_id: "",
      comando_regional_id: "",
      edital_id: "",
      data_vencimento_contrato: "",
      observacoes: "",
      renovacao_contrato: false,
    },
  });
  const [renovModalOpen, setRenovModalOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [renovDecision, setRenovDecision] = useState<{
    decidedForDate: string;
    payload: RenovacaoConfirmPayload;
  } | null>(null);

  useEffect(() => {
    if (militar) {
      const lotObj = cat.data?.lotacoes?.find((l) => l.id === militar.lotacao_id);
      const rawCrId = militar.comando_regional_id || lotObj?.comando_regional_id || "";
      const crList = cat.data?.comandos_regionais;
      const validCrId =
        rawCrId && rawCrId !== "cr_adm" && (!crList || crList.some((cr) => cr.id === rawCrId))
          ? rawCrId
          : "";
      form.reset({
        lotacao_id: militar.lotacao_id,
        comando_regional_id: validCrId,
        edital_id: militar.edital_id,
        data_vencimento_contrato: militar.data_vencimento_contrato,
        observacoes: militar.observacoes ?? "",
        renovacao_contrato: Boolean(militar.renovacao_contrato),
      });
      setRenovDecision(null);
      setRenovModalOpen(false);
      setPendingSubmit(false);
    }
  }, [militar, cat.data?.lotacoes, cat.data?.comandos_regionais, form]);

  const watchedVenc = form.watch("data_vencimento_contrato") ?? "";
  const originalVenc = militar?.data_vencimento_contrato ?? "";
  const originalInfo = getInfoContrato(militar);
  const vencRegister = form.register("data_vencimento_contrato");

  const mut = useMutation({
    mutationFn: (b: MilitarRapidoIn) => {
      if (!podeEditar(me.data)) throw new Error("Seu perfil não tem permissão para editar registros.");
      return apiPatch<Militar>(`/militares/${militar?.id}/rapido`, b);
    },
    onSuccess: (updated) => {
      const info = getInfoContrato(updated);
      toast.success(
        info.renovado
          ? `Militar atualizado: ${info.rotuloCompleto} (${info.qtdRenovacoes}ª renovação gravada no Firestore)`
          : "Alterações salvas e gravadas no Firestore"
      );
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const executeMutation = (
    v: RapidoForm,
    decisionOverride?: { decidedForDate: string; payload: RenovacaoConfirmPayload } | null
  ) => {
    if (militar && v.data_vencimento_contrato < militar.data_inclusao) {
      form.setError("data_vencimento_contrato", { message: "Anterior à data de inclusão" });
      return;
    }

    const existingDatas = Array.isArray(militar?.renovacoes_datas) ? [...militar.renovacoes_datas] : [];
    const activeDecision = decisionOverride ?? renovDecision;
    const dateChanged = Boolean(originalVenc && v.data_vencimento_contrato !== originalVenc);

    let isRenovado = originalInfo.renovado;
    let anoContrato = originalInfo.anoContrato;
    let qtdRenovacoes = originalInfo.qtdRenovacoes;
    let anoContratoManual = Boolean(militar?.ano_contrato_manual);
    let dataUltimaRenovacao: string | null = militar?.data_ultima_renovacao ?? null;
    let renovacoesDatas: string[] = existingDatas;

    if (dateChanged && activeDecision && activeDecision.decidedForDate === v.data_vencimento_contrato) {
      isRenovado = activeDecision.payload.isRenovacao;
      anoContrato = activeDecision.payload.anoContrato;
      qtdRenovacoes = activeDecision.payload.qtdRenovacoes;
      if (activeDecision.payload.dataRenovacao) {
        anoContratoManual = false;
        dataUltimaRenovacao = activeDecision.payload.dataRenovacao;
        if (!renovacoesDatas.includes(activeDecision.payload.dataRenovacao)) {
          renovacoesDatas.push(activeDecision.payload.dataRenovacao);
        }
        renovacoesDatas.sort();
      }
    }

    mut.mutate({
      ...v,
      observacoes: v.observacoes ?? null,
      renovacao_contrato: isRenovado,
      ano_contrato: anoContrato,
      ano_contrato_manual: anoContratoManual,
      qtd_renovacoes: qtdRenovacoes,
      data_ultima_renovacao: dataUltimaRenovacao,
      renovacoes_datas: renovacoesDatas,
    });
  };

  const submit = form.handleSubmit((v) => {
    if (militar && v.data_vencimento_contrato < militar.data_inclusao) {
      form.setError("data_vencimento_contrato", { message: "Anterior à data de inclusão" });
      return;
    }
    if (
      originalVenc &&
      v.data_vencimento_contrato !== originalVenc &&
      renovDecision?.decidedForDate !== v.data_vencimento_contrato
    ) {
      setPendingSubmit(true);
      setRenovModalOpen(true);
      return;
    }
    executeMutation(v);
  });
  const e = form.formState.errors;

  return (
    <>
      <Dialog open={!!militar} onOpenChange={(o) => !o && !renovModalOpen && onClose()}>
        <DialogContent className="border-[#1E2C42] bg-[#121B28] sm:max-w-xl max-h-[90vh] overflow-y-auto" data-testid="quick-edit-dialog">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">Edição rápida</DialogTitle>
            <DialogDescription className="text-slate-300">
              {militar?.nome_completo} · <span className="num font-semibold text-blue-300">{militar?.matricula}</span>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Lotação / UBM <span className="text-red-400">*</span></Label>
                <Controller control={form.control} name="lotacao_id" render={({ field }) => (
                  <FieldSelect
                    testId="quick-edit-lotacao-select"
                    value={field.value ?? ""}
                    onChange={(val) => {
                      field.onChange(val);
                      const lot = cat.data?.lotacoes?.find((l) => l.id === val);
                      if (lot?.comando_regional_id) {
                        form.setValue("comando_regional_id", lot.comando_regional_id, { shouldValidate: true, shouldDirty: true });
                      }
                    }}
                    options={(cat.data?.lotacoes ?? []).filter((l) => l.ativo || l.id === field.value).map((l) => ({ value: l.id, label: l.nome }))}
                  />
                )} />
                <Err msg={e.lotacao_id?.message} />
              </div>
              <div className="space-y-1.5">
                <Label>Comando Regional <span className="text-red-400">*</span></Label>
                <Controller control={form.control} name="comando_regional_id" render={({ field }) => (
                  <FieldSelect
                    testId="quick-edit-comando-regional-select"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    placeholder="Selecione o Comando Regional"
                    options={(cat.data?.comandos_regionais ?? []).filter((cr) => cr.ativo || cr.id === field.value).map((cr) => ({ value: cr.id, label: cr.nome }))}
                  />
                )} />
                <Err msg={e.comando_regional_id?.message} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Edital</Label>
                <Controller control={form.control} name="edital_id" render={({ field }) => (
                  <FieldSelect testId="quick-edit-edital-select" value={field.value ?? ""} onChange={field.onChange}
                    options={(cat.data?.editais ?? []).filter((l) => l.ativo || l.id === field.value).map((l) => ({ value: l.id, label: l.nome }))} />
                )} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qv">Vencimento do contrato</Label>
              <Input
                id="qv"
                type="date"
                className="[color-scheme:dark]"
                data-testid="quick-edit-vencimento-input"
                {...vencRegister}
                onBlur={(ev) => {
                  void vencRegister.onBlur(ev);
                  if (!originalVenc) return;
                  const val = ev.target.value;
                  if (
                    val &&
                    /^\d{4}-\d{2}-\d{2}$/.test(val) &&
                    val !== originalVenc &&
                    (!militar?.data_inclusao || val >= militar.data_inclusao) &&
                    renovDecision?.decidedForDate !== val
                  ) {
                    setPendingSubmit(false);
                    setRenovModalOpen(true);
                  }
                }}
              />
              <Err msg={e.data_vencimento_contrato?.message} />
              {renovDecision && renovDecision.decidedForDate === watchedVenc && watchedVenc !== originalVenc && (
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300" data-testid="quick-renovacao-confirmed-summary">
                  <span className="inline-flex items-center gap-1.5">
                    <BadgeCheck className={cn("size-3.5", renovDecision.payload.dataRenovacao ? "text-cyan-400" : "text-slate-400")} />
                    {renovDecision.payload.dataRenovacao ? (
                      <span>
                        Renovação confirmada ({renovDecision.payload.qtdRenovacoes}ª · {renovDecision.payload.anoContrato}º Ano · início em{" "}
                        <strong className="num text-cyan-300">{fmtDate(renovDecision.payload.dataRenovacao)}</strong>)
                      </span>
                    ) : (
                      <span>Ajuste de data confirmado (sem nova renovação)</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingSubmit(false);
                      setRenovModalOpen(true);
                    }}
                    className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 cursor-pointer"
                  >
                    Alterar
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qo">Observações</Label>
              <Textarea id="qo" rows={2} data-testid="quick-edit-observacoes-input" {...form.register("observacoes")} />
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={onClose} data-testid="quick-edit-cancel-button">Cancelar</Button>
              <Button type="submit" disabled={mut.isPending} className="bg-blue-600 hover:bg-blue-700" data-testid="quick-edit-save-button">
                {mut.isPending ? "Gravando no Firestore..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {militar && renovModalOpen && (
        <RenovacaoFocusModal
          open={renovModalOpen}
          onOpenChange={(open) => {
            setRenovModalOpen(open);
            if (!open) setPendingSubmit(false);
          }}
          dataInclusao={militar.data_inclusao}
          dataVencimentoAnterior={originalVenc}
          dataVencimentoNova={watchedVenc}
          previousRenovado={originalInfo.renovado}
          previousQtdRenovacoes={originalInfo.qtdRenovacoes}
          initialSelection={
            renovDecision && renovDecision.decidedForDate === watchedVenc
              ? Boolean(renovDecision.payload.dataRenovacao)
              : true
          }
          onConfirm={(payload) => {
            const decision = { decidedForDate: watchedVenc, payload };
            setRenovDecision(decision);
            form.setValue("renovacao_contrato", payload.isRenovacao, { shouldDirty: true });
            if (pendingSubmit) {
              setPendingSubmit(false);
              void form.handleSubmit((v) => executeMutation(v, decision))();
            }
          }}
        />
      )}
    </>
  );
}
