import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, BadgeCheck, Eraser, Save, SaveAll } from "lucide-react";
import FieldSelect from "@/components/FieldSelect";
import { useInvalidateMilitares } from "@/components/MilitarDialogs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPost, apiPut } from "@/lib/api";
import { errMsg, fmtDate, qs } from "@/lib/format";
import { podeEditar, useCatalogos, useMe, useMeta } from "@/lib/hooks";
import { getInfoContrato, type MatriculaCheck, type Militar, type MilitarIn } from "@/lib/types";
import { RenovacaoFocusModal, type RenovacaoConfirmPayload } from "@/components/RenovacaoPrompt";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    matricula: z.string().trim().min(3, "Informe a matrícula/vínculo").max(30).regex(/^[0-9A-Za-z./\- ]+$/, "Use apenas números, letras, ponto, barra ou hífen"),
    nome_completo: z.string().trim().min(3, "Informe o nome completo").max(160),
    cargo_id: z.string().min(1, "Selecione o cargo/função"),
    lotacao_id: z.string().min(1, "Selecione a lotação/UBM"),
    comando_regional_id: z.string().min(1, "Selecione o Comando Regional"),
    edital_id: z.string().min(1, "Selecione o edital/processo seletivo"),
    data_inclusao: z.string().min(1, "Informe a data de inclusão"),
    data_vencimento_contrato: z.string().min(1, "Informe a data de vencimento"),
    status: z.enum(["ATIVO", "DESLIGADO"]),
    doe_incorporacao: z.string().max(300).optional(),
    sub_judice: z.enum(["SIM", "NAO"]),
    observacoes: z.string().max(2000).optional(),
    data_desligamento: z.string().optional(),
    motivo_desligamento_id: z.string().optional(),
    documento_desligamento: z.string().max(120).optional(),
    renovacao_contrato: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.data_inclusao && v.data_vencimento_contrato && v.data_vencimento_contrato < v.data_inclusao)
      ctx.addIssue({ code: "custom", path: ["data_vencimento_contrato"], message: "Vencimento anterior à data de inclusão" });
    if (v.status === "DESLIGADO") {
      if (!v.data_desligamento) ctx.addIssue({ code: "custom", path: ["data_desligamento"], message: "Informe a data do desligamento" });
      if (!v.motivo_desligamento_id) ctx.addIssue({ code: "custom", path: ["motivo_desligamento_id"], message: "Selecione o motivo" });
      if (v.data_desligamento && v.data_inclusao && v.data_desligamento < v.data_inclusao)
        ctx.addIssue({ code: "custom", path: ["data_desligamento"], message: "Anterior à data de inclusão" });
    }
  });
type F = z.infer<typeof schema>;

const EMPTY: F = {
  matricula: "", nome_completo: "", cargo_id: "", lotacao_id: "", comando_regional_id: "", edital_id: "", data_inclusao: "", data_vencimento_contrato: "",
  status: "ATIVO", doe_incorporacao: "", sub_judice: "NAO", observacoes: "", data_desligamento: "", motivo_desligamento_id: "", documento_desligamento: "",
  renovacao_contrato: false,
};

function Field({ label, error, children, req, className }: { label: string; error?: string; children: ReactNode; req?: boolean; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-slate-300">{label}{req && <span className="text-red-400"> *</span>}</Label>
      {children}
      {error && <p className="text-xs text-red-400" data-testid="field-error">{error}</p>}
    </div>
  );
}

export default function MilitarForm() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();
  const me = useMe();
  const cat = useCatalogos();
  const meta = useMeta();
  const invalidate = useInvalidateMilitares();
  const [dup, setDup] = useState<{ id: string; msg: string } | null>(null);
  const [renovModalOpen, setRenovModalOpen] = useState(false);
  const [pendingSubmitOutro, setPendingSubmitOutro] = useState<boolean | null>(null);
  const [renovDecision, setRenovDecision] = useState<{
    decidedForDate: string;
    payload: RenovacaoConfirmPayload;
  } | null>(null);

  const canEdit = podeEditar(me.data);
  const atual = useQuery({ queryKey: ["militar", id], queryFn: () => apiGet<Militar>(`/militares/${id}`), enabled: editing && canEdit });
  const form = useForm<F>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const status = useWatch({ control: form.control, name: "status" });
  const hoje = meta.data?.data_hoje ?? "";

  useEffect(() => {
    const m = atual.data;
    if (m) {
      const lotObj = cat.data?.lotacoes?.find((l) => l.id === m.lotacao_id);
      const rawCrId = m.comando_regional_id || lotObj?.comando_regional_id || "";
      const crList = cat.data?.comandos_regionais;
      const validCrId =
        rawCrId && rawCrId !== "cr_adm" && (!crList || crList.some((cr) => cr.id === rawCrId))
          ? rawCrId
          : "";
      form.reset({
        matricula: m.matricula, nome_completo: m.nome_completo, cargo_id: m.cargo_id, lotacao_id: m.lotacao_id,
        comando_regional_id: validCrId,
        edital_id: m.edital_id,
        data_inclusao: m.data_inclusao, data_vencimento_contrato: m.data_vencimento_contrato, status: m.status,
        doe_incorporacao: m.doe_incorporacao ?? "", sub_judice: m.sub_judice ? "SIM" : "NAO", observacoes: m.observacoes ?? "", data_desligamento: m.data_desligamento ?? "",
        motivo_desligamento_id: m.motivo_desligamento_id ?? "", documento_desligamento: m.documento_desligamento ?? "",
        renovacao_contrato: Boolean(m.renovacao_contrato),
      });
      setRenovDecision(null);
      setRenovModalOpen(false);
      setPendingSubmitOutro(null);
    }
  }, [atual.data, cat.data?.lotacoes, cat.data?.comandos_regionais, form]);

  const watchedInclusao = form.watch("data_inclusao") ?? "";
  const watchedVencimento = form.watch("data_vencimento_contrato") ?? "";
  const originalVencimento = atual.data?.data_vencimento_contrato ?? "";
  const originalInfo = getInfoContrato(atual.data);
  const vencRegister = form.register("data_vencimento_contrato");

  const checkMatricula = async () => {
    const mat = form.getValues("matricula").trim();
    if (mat.length < 3) return;
    try {
      const r = await apiGet<MatriculaCheck>(`/militares/verificar-matricula${qs({ matricula: mat, excluir_id: id })}`);
      setDup(r.existe && r.militar_id ? { id: r.militar_id, msg: `A matrícula ${mat.toUpperCase()} já está cadastrada para ${r.nome_completo}.` } : null);
    } catch {
      setDup(null);
    }
  };

  const mut = useMutation({
    mutationFn: ({ body }: { body: MilitarIn; outro: boolean }) =>
      editing ? apiPut<Militar>(`/militares/${id}`, body) : apiPost<Militar>("/militares", body),
    onSuccess: (m, { outro }) => {
      invalidate();
      const inf = getInfoContrato(m);
      toast.success(
        editing
          ? `Cadastro de ${m.nome_completo} atualizado (${inf.rotuloCompleto})`
          : `Cadastro salvo com sucesso: ${m.nome_completo}`
      );
      if (outro) { form.reset(EMPTY); setDup(null); window.scrollTo({ top: 0 }); }
      else nav(`/temporarios/${m.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        const d = (e.body as { detail?: { message?: string; militar_id?: string } })?.detail;
        if (d?.militar_id) setDup({ id: d.militar_id, msg: d.message ?? "Matrícula já cadastrada" });
      }
      toast.error(errMsg(e));
    },
  });

  const executeMutation = (v: F, outro: boolean, decisionOverride?: { decidedForDate: string; payload: RenovacaoConfirmPayload } | null) => {
    if (!canEdit) {
      toast.error("Seu perfil não tem permissão para cadastrar ou editar registros.");
      return;
    }
    if (v.status === "DESLIGADO" && hoje && v.data_desligamento && v.data_desligamento > hoje) {
      form.setError("data_desligamento", { message: "A data não pode ser futura" });
      return;
    }

    let isRenovado = false;
    let anoContrato = 1;
    let anoContratoManual = false;
    let qtdRenovacoes = 0;
    let dataUltimaRenovacao: string | null = null;
    let renovacoesDatas: string[] = [];

    if (editing && atual.data) {
      const existingDatas = Array.isArray(atual.data.renovacoes_datas) ? [...atual.data.renovacoes_datas] : [];
      const activeDecision = decisionOverride ?? renovDecision;
      const dateChanged = Boolean(originalVencimento && v.data_vencimento_contrato !== originalVencimento);
      anoContratoManual = Boolean(atual.data.ano_contrato_manual);

      if (dateChanged && activeDecision && activeDecision.decidedForDate === v.data_vencimento_contrato) {
        isRenovado = activeDecision.payload.isRenovacao;
        anoContrato = activeDecision.payload.anoContrato;
        qtdRenovacoes = activeDecision.payload.qtdRenovacoes;
        if (activeDecision.payload.dataRenovacao) {
          anoContratoManual = false;
          dataUltimaRenovacao = activeDecision.payload.dataRenovacao;
          if (!existingDatas.includes(activeDecision.payload.dataRenovacao)) {
            existingDatas.push(activeDecision.payload.dataRenovacao);
          }
          existingDatas.sort();
          renovacoesDatas = existingDatas;
        } else {
          dataUltimaRenovacao = atual.data.data_ultima_renovacao ?? null;
          renovacoesDatas = existingDatas;
        }
      } else {
        isRenovado = originalInfo.renovado;
        anoContrato = originalInfo.anoContrato;
        qtdRenovacoes = originalInfo.qtdRenovacoes;
        dataUltimaRenovacao = atual.data.data_ultima_renovacao ?? null;
        renovacoesDatas = existingDatas;
      }
    }

    const body: MilitarIn = {
      matricula: v.matricula,
      nome_completo: v.nome_completo,
      cargo_id: v.cargo_id,
      lotacao_id: v.lotacao_id,
      comando_regional_id: v.comando_regional_id,
      edital_id: v.edital_id,
      data_inclusao: v.data_inclusao,
      data_vencimento_contrato: v.data_vencimento_contrato,
      status: v.status,
      doe_incorporacao: v.doe_incorporacao || null,
      observacoes: v.observacoes || null,
      sub_judice: v.sub_judice === "SIM",
      data_desligamento: v.status === "DESLIGADO" ? v.data_desligamento || null : null,
      motivo_desligamento_id: v.status === "DESLIGADO" ? v.motivo_desligamento_id || null : null,
      documento_desligamento: v.status === "DESLIGADO" ? v.documento_desligamento || null : null,
      renovacao_contrato: isRenovado,
      ano_contrato: anoContrato,
      ano_contrato_manual: anoContratoManual,
      qtd_renovacoes: qtdRenovacoes,
      data_ultima_renovacao: dataUltimaRenovacao,
      renovacoes_datas: renovacoesDatas,
    };
    mut.mutate({ body, outro });
  };

  const submit = (outro: boolean) =>
    form.handleSubmit((v) => {
      if (
        editing &&
        originalVencimento &&
        v.data_vencimento_contrato !== originalVencimento &&
        renovDecision?.decidedForDate !== v.data_vencimento_contrato
      ) {
        setPendingSubmitOutro(outro);
        setRenovModalOpen(true);
        return;
      }
      executeMutation(v, outro);
    });

  if (me.isLoading) {
    return <p className="glass-panel rounded-xl border p-8 text-slate-400">Verificando permissões...</p>;
  }
  if (!canEdit) {
    return <p className="glass-panel rounded-xl border p-8 text-slate-400" data-testid="no-permission">Seu perfil (Consulta) não permite cadastrar ou editar registros.</p>;
  }
  const e = form.formState.errors;
  const c = cat.data;
  const statusOpts = editing && atual.data?.status === "DESLIGADO"
    ? [{ value: "DESLIGADO", label: "Desligado" }]
    : [{ value: "ATIVO", label: "Ativo" }, { value: "DESLIGADO", label: "Desligado" }];

  return (
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-5">
      <div>
        <Link to={editing ? `/temporarios/${id}` : "/temporarios"} className="inline-flex h-9 items-center gap-1 text-sm text-slate-400 hover:text-white" data-testid="form-back-link">
          <ArrowLeft className="size-4" /> Voltar
        </Link>
        <h2 className="mt-1 font-heading text-xl font-extrabold text-white sm:mt-2 sm:text-2xl md:text-3xl" data-testid="page-title">
          {editing ? "Editar cadastro" : "Cadastro de militar temporário"}
        </h2>
        <p className="text-xs sm:text-sm text-slate-400">Campos marcados com * são obrigatórios. Todas as alterações ficam registradas no histórico.</p>
      </div>

      {dup && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 sm:p-4 text-sm text-amber-200" data-testid="duplicate-alert">
          <AlertCircle className="size-5 shrink-0" />
          <p className="flex-1">{dup.msg} Não é permitido duplicar matrículas.</p>
          <Link to={`/temporarios/${dup.id}`} className={buttonVariants({ size: "sm", variant: "outline" })} data-testid="open-existing-button">Abrir cadastro existente</Link>
        </div>
      )}

      <form onSubmit={submit(false)} className="space-y-4 sm:space-y-5" data-testid="militar-form">
        <section className="glass-panel rounded-xl border p-4 sm:p-5">
          <h3 className="mb-3.5 sm:mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Identificação</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Matrícula / vínculo" req error={e.matricula?.message}>
              <Input className="num h-10 sm:h-9" data-testid="input-matricula" placeholder="000000/01" {...form.register("matricula", { onBlur: checkMatricula })} />
            </Field>
            <Field label="Nome completo" req error={e.nome_completo?.message} className="sm:col-span-2">
              <Input className="h-10 sm:h-9" data-testid="input-nome" {...form.register("nome_completo")} />
            </Field>
          </div>
        </section>

        <section className="glass-panel rounded-xl border p-4 sm:p-5">
          <h3 className="mb-3.5 sm:mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Dados funcionais e contratuais</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cargo / função" req error={e.cargo_id?.message}>
              <Controller control={form.control} name="cargo_id" render={({ field }) => (
                <FieldSelect testId="select-cargo" value={field.value} onChange={field.onChange} placeholder="Selecione o cargo"
                  options={(c?.cargos ?? []).filter((x) => x.ativo || x.id === field.value).map((x) => ({ value: x.id, label: x.nome }))} />
              )} />
            </Field>
            <Field label="Lotação / UBM" req error={e.lotacao_id?.message}>
              <Controller control={form.control} name="lotacao_id" render={({ field }) => (
                <FieldSelect
                  testId="select-lotacao"
                  value={field.value}
                  onChange={(val) => {
                    field.onChange(val);
                    const lot = c?.lotacoes?.find((l) => l.id === val);
                    if (lot?.comando_regional_id) {
                      form.setValue("comando_regional_id", lot.comando_regional_id, { shouldValidate: true, shouldDirty: true });
                    }
                  }}
                  placeholder="Selecione a lotação"
                  options={(c?.lotacoes ?? []).filter((x) => x.ativo || x.id === field.value).map((x) => ({ value: x.id, label: x.nome }))}
                />
              )} />
            </Field>
            <Field label="Comando Regional" req error={e.comando_regional_id?.message}>
              <Controller control={form.control} name="comando_regional_id" render={({ field }) => (
                <FieldSelect
                  testId="select-comando-regional"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Selecione o Comando Regional da lotação"
                  options={(c?.comandos_regionais ?? []).filter((x) => x.ativo || x.id === field.value).map((x) => ({ value: x.id, label: x.nome }))}
                />
              )} />
            </Field>
            <Field label="Edital / processo seletivo" req error={e.edital_id?.message}>
              <Controller control={form.control} name="edital_id" render={({ field }) => (
                <FieldSelect testId="select-edital" value={field.value} onChange={field.onChange} placeholder="Selecione o edital"
                  options={(c?.editais ?? []).filter((x) => x.ativo || x.id === field.value).map((x) => ({ value: x.id, label: x.nome }))} />
              )} />
            </Field>
            <Field label="DOE — incorporação">
              <Input data-testid="input-doe" placeholder="Ex.: DOE Nº 29.266, pág. 12" {...form.register("doe_incorporacao")} />
            </Field>
            <Field label="Militar sub judice?" req>
              <Controller control={form.control} name="sub_judice" render={({ field }) => (
                <FieldSelect testId="select-sub-judice" value={field.value} onChange={(v) => field.onChange(v as F["sub_judice"])}
                  options={[{ value: "NAO", label: "Não" }, { value: "SIM", label: "Sim — vínculo por decisão judicial" }]} />
              )} />
            </Field>
            <Field label="Data de inclusão no efetivo" req error={e.data_inclusao?.message}>
              <Input type="date" className="[color-scheme:dark]" data-testid="input-data-inclusao" {...form.register("data_inclusao")} />
            </Field>
            <Field label="Data de vencimento do contrato" req error={e.data_vencimento_contrato?.message}>
              <Input
                type="date"
                className="[color-scheme:dark]"
                data-testid="input-data-vencimento"
                {...vencRegister}
                onBlur={(ev) => {
                  void vencRegister.onBlur(ev);
                  if (!editing || !originalVencimento) return;
                  const val = ev.target.value;
                  if (
                    val &&
                    /^\d{4}-\d{2}-\d{2}$/.test(val) &&
                    val !== originalVencimento &&
                    (!watchedInclusao || val >= watchedInclusao) &&
                    renovDecision?.decidedForDate !== val
                  ) {
                    setPendingSubmitOutro(null);
                    setRenovModalOpen(true);
                  }
                }}
              />
              {editing && renovDecision && renovDecision.decidedForDate === watchedVencimento && watchedVencimento !== originalVencimento && (
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300" data-testid="renovacao-confirmed-summary">
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
                      setPendingSubmitOutro(null);
                      setRenovModalOpen(true);
                    }}
                    className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 cursor-pointer"
                  >
                    Alterar
                  </button>
                </div>
              )}
            </Field>
          </div>
        </section>

        <section className="glass-panel rounded-xl border p-4 sm:p-5">
          <h3 className="mb-3.5 sm:mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Situação funcional</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Situação" req>
              <Controller control={form.control} name="status" render={({ field }) => (
                <FieldSelect testId="select-status" value={field.value} onChange={(v) => field.onChange(v as F["status"])} options={statusOpts} />
              )} />
            </Field>
            {status === "DESLIGADO" && (
              <>
                <Field label="Data do desligamento" req error={e.data_desligamento?.message}>
                  <Input type="date" max={hoje} className="h-10 sm:h-9 [color-scheme:dark]" data-testid="input-data-desligamento" {...form.register("data_desligamento")} />
                </Field>
                <Field label="Status de desligamento" req error={e.motivo_desligamento_id?.message}>
                  <Controller control={form.control} name="motivo_desligamento_id" render={({ field }) => (
                    <FieldSelect testId="select-motivo" value={field.value ?? ""} onChange={field.onChange} placeholder="Selecione o status de desligamento"
                      options={(c?.motivos ?? []).filter((x) => x.ativo).map((x) => ({ value: x.id, label: x.nome }))} />
                  )} />
                </Field>
                <Field label="Documento / processo">
                  <Input className="h-10 sm:h-9" data-testid="input-documento" {...form.register("documento_desligamento")} />
                </Field>
              </>
            )}
            <Field label={status === "DESLIGADO" ? "Motivo do desligamento" : "Observações"} className="sm:col-span-2">
              <Textarea
                rows={3}
                data-testid="input-observacoes"
                placeholder={status === "DESLIGADO" ? "Informe os detalhes e justificativa do motivo do desligamento..." : "Observações..."}
                {...form.register("observacoes")}
              />
            </Field>
          </div>
        </section>

        <div className="glass-panel grid grid-cols-2 gap-2 rounded-xl border p-3 sm:sticky sm:bottom-2 sm:flex sm:flex-wrap sm:px-4 sm:py-3">
          <Button type="submit" disabled={mut.isPending} className="col-span-2 h-11 sm:col-span-1 sm:h-9 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-transform" data-testid="save-button">
            <Save className="size-4" /> Salvar Cadastro
          </Button>
          {!editing && (
            <Button type="button" variant="secondary" disabled={mut.isPending} onClick={() => void submit(true)()} className="col-span-2 h-10 sm:col-span-1 sm:h-9" data-testid="save-and-new-button">
              <SaveAll className="size-4" /> Salvar e Cadastrar Outro
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => nav(-1)} className="h-10 sm:h-9" data-testid="cancel-button">Cancelar</Button>
          <Button type="button" variant="ghost" onClick={() => { form.reset(editing ? undefined : EMPTY); setDup(null); }} className="h-10 sm:h-9" data-testid="clear-button">
            <Eraser className="size-4" /> Limpar
          </Button>
        </div>
      </form>

      {editing && renovModalOpen && (
        <RenovacaoFocusModal
          open={renovModalOpen}
          onOpenChange={(open) => {
            setRenovModalOpen(open);
            if (!open) setPendingSubmitOutro(null);
          }}
          dataInclusao={watchedInclusao}
          dataVencimentoAnterior={originalVencimento}
          dataVencimentoNova={watchedVencimento}
          previousRenovado={originalInfo.renovado}
          previousQtdRenovacoes={originalInfo.qtdRenovacoes}
          initialSelection={
            renovDecision && renovDecision.decidedForDate === watchedVencimento
              ? Boolean(renovDecision.payload.dataRenovacao)
              : true
          }
          onConfirm={(payload) => {
            const decision = { decidedForDate: watchedVencimento, payload };
            setRenovDecision(decision);
            form.setValue("renovacao_contrato", payload.isRenovacao, { shouldDirty: true });
            if (pendingSubmitOutro !== null) {
              const outro = pendingSubmitOutro;
              setPendingSubmitOutro(null);
              void form.handleSubmit((v) => executeMutation(v, outro, decision))();
            }
          }}
        />
      )}
    </div>
  );
}
