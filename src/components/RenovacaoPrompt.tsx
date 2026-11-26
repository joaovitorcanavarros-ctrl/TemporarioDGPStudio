import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowRight, BadgeCheck, Calendar, CheckCircle2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { addDaysToIsoDate, getAnoContratoOptions, getInfoContrato } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface RenovacaoConfirmPayload {
  isRenovacao: boolean;
  /** Nova contagem acumulada de renovações após confirmar */
  qtdRenovacoes: number;
  /** Novo ano de contrato após confirmar */
  anoContrato: number;
  /** Indica se o ano do contrato foi ajustado/revertido manualmente */
  anoContratoManual?: boolean;
  /** Data exata da renovação (vencimento anterior + 1 dia) */
  dataRenovacao: string | null;
}

interface RenovacaoFocusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataInclusao?: string | null;
  dataVencimentoAnterior?: string | null;
  dataVencimentoNova?: string | null;
  previousRenovado: boolean;
  previousQtdRenovacoes: number;
  initialSelection?: boolean;
  initialAnoAjuste?: number;
  onConfirm: (payload: RenovacaoConfirmPayload) => void;
}

export function computeRenovacaoPreview({
  dataInclusao,
  dataVencimentoAnterior,
  dataVencimentoNova,
  previousRenovado,
  previousQtdRenovacoes,
}: {
  dataInclusao?: string | null;
  dataVencimentoAnterior?: string | null;
  dataVencimentoNova?: string | null;
  previousRenovado: boolean;
  previousQtdRenovacoes: number;
}) {
  // Regra oficial: a renovação ocorre 1 dia após o vencimento anterior do contrato.
  const dataRenovacao = dataVencimentoAnterior
    ? addDaysToIsoDate(dataVencimentoAnterior, 1)
    : dataInclusao
      ? addDaysToIsoDate(dataInclusao, 365)
      : "";

  const infoCalculado = getInfoContrato({
    data_inclusao: dataInclusao,
    data_vencimento_contrato: dataVencimentoNova,
    renovacao_contrato: true,
  });

  // Se o usuário confirmar que é uma nova renovação, garante ao menos +1 sobre o histórico anterior.
  const qtdRenovacoes = Math.max(
    1,
    infoCalculado.qtdRenovacoes,
    previousRenovado ? previousQtdRenovacoes + 1 : 1
  );
  const anoContrato = Math.max(infoCalculado.anoContrato, qtdRenovacoes + 1);

  return {
    dataRenovacao,
    qtdRenovacoes,
    anoContrato,
    rotuloCompleto: `${anoContrato}º Ano de Contrato`,
  };
}

export function RenovacaoFocusModal({
  open,
  onOpenChange,
  dataInclusao,
  dataVencimentoAnterior,
  dataVencimentoNova,
  previousRenovado,
  previousQtdRenovacoes,
  initialSelection,
  initialAnoAjuste,
  onConfirm,
}: RenovacaoFocusModalProps) {
  const isDateReduced = Boolean(
    dataVencimentoAnterior &&
    dataVencimentoNova &&
    dataVencimentoNova < dataVencimentoAnterior
  );
  const anoAnterior = previousRenovado ? Math.max(2, previousQtdRenovacoes + 1) : 1;

  // Quando a data é reduzida (ex.: 2028 -> 2027), sugere o ano compatível com a nova vigência.
  const infoNovaVigencia = getInfoContrato({
    data_inclusao: dataInclusao,
    data_vencimento_contrato: dataVencimentoNova,
    renovacao_contrato: null,
  });
  const defaultAnoAjuste =
    typeof initialAnoAjuste === "number" && initialAnoAjuste >= 1
      ? Math.round(initialAnoAjuste)
      : isDateReduced
        ? Math.min(anoAnterior, infoNovaVigencia.anoContrato)
        : anoAnterior;

  const resolvedInitialSelection =
    initialSelection !== undefined ? initialSelection : !isDateReduced;

  const [escolhaSim, setEscolhaSim] = useState<boolean>(resolvedInitialSelection);
  const [anoAjuste, setAnoAjuste] = useState<number>(defaultAnoAjuste);

  useEffect(() => {
    if (open) {
      setEscolhaSim(resolvedInitialSelection);
      setAnoAjuste(defaultAnoAjuste);
    }
  }, [open, resolvedInitialSelection, defaultAnoAjuste]);

  const preview = computeRenovacaoPreview({
    dataInclusao,
    dataVencimentoAnterior,
    dataVencimentoNova,
    previousRenovado,
    previousQtdRenovacoes,
  });

  const anoOptions = getAnoContratoOptions(Math.max(anoAnterior, anoAjuste, preview.anoContrato));

  const handleConfirm = () => {
    if (escolhaSim) {
      onConfirm({
        isRenovacao: true,
        qtdRenovacoes: preview.qtdRenovacoes,
        anoContrato: preview.anoContrato,
        anoContratoManual: false,
        dataRenovacao: preview.dataRenovacao || null,
      });
    } else {
      const anoEscolhido = Math.max(1, Math.round(anoAjuste));
      const isManualCorrection = anoEscolhido !== anoAnterior || isDateReduced;
      onConfirm({
        isRenovacao: anoEscolhido > 1,
        qtdRenovacoes: Math.max(0, anoEscolhido - 1),
        anoContrato: anoEscolhido,
        anoContratoManual: isManualCorrection,
        dataRenovacao: null,
      });
    }
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-[90] bg-[#02040A]/84 backdrop-blur-md animate-staging-backdrop"
          data-testid="renovacao-focus-backdrop"
        />
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
          <DialogPrimitive.Popup
            data-testid="renovacao-focus-modal"
            className="glass-dialog pointer-events-auto relative w-full max-w-xl rounded-xl border border-cyan-400/35 p-6 text-slate-100 shadow-[0_28px_84px_-12px_rgba(6,182,212,0.28)] outline-none animate-staging-focus"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                  <BadgeCheck className="size-5" />
                </div>
                <div className="space-y-0.5">
                  <DialogPrimitive.Title className="font-heading text-lg font-bold leading-snug text-white">
                    Renovação de Contrato
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="text-xs text-slate-400">
                    Alteração na data de vencimento detectada
                  </DialogPrimitive.Description>
                </div>
              </div>
              <DialogPrimitive.Close
                render={
                  <button
                    type="button"
                    aria-label="Fechar"
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white cursor-pointer"
                  />
                }
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>

            {/* Distribuição em grade 2x2 para evitar sobreposição ou quebra de datas */}
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-[#1E2C42] py-4 sm:grid-cols-4">
              <div className="min-w-0">
                <dt className="text-[11px] font-medium text-slate-400">Inclusão</dt>
                <dd className="num mt-1 text-sm font-semibold text-slate-200 whitespace-nowrap">
                  {dataInclusao ? fmtDate(dataInclusao) : "—"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-medium text-slate-400">Vencimento anterior</dt>
                <dd className="num mt-1 text-sm font-medium text-slate-400 line-through whitespace-nowrap">
                  {dataVencimentoAnterior ? fmtDate(dataVencimentoAnterior) : "—"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-medium text-slate-400">Novo vencimento</dt>
                <dd className="num mt-1 flex items-center gap-1 text-sm font-semibold text-white whitespace-nowrap">
                  <ArrowRight className="size-3.5 text-cyan-400 shrink-0" />
                  <span>{dataVencimentoNova ? fmtDate(dataVencimentoNova) : "—"}</span>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-medium text-cyan-300 whitespace-nowrap">Data da renovação</dt>
                <dd
                  className="num mt-1 flex items-center gap-1.5 text-sm font-bold text-cyan-300 whitespace-nowrap"
                  data-testid="renovacao-data-calculada"
                >
                  <Calendar className="size-3.5 text-cyan-400 shrink-0" />
                  <span>{preview.dataRenovacao ? fmtDate(preview.dataRenovacao) : "—"}</span>
                </dd>
              </div>
            </dl>

            <div className="mt-5 space-y-3">
              <p className="text-sm font-medium text-slate-100">
                Esta mudança de vencimento trata-se de uma <strong>Renovação de Contrato</strong>?
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setEscolhaSim(true)}
                  data-testid="btn-renovacao-sim"
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-xs font-semibold transition-all duration-150 cursor-pointer",
                    escolhaSim
                      ? "border-cyan-400 bg-cyan-500/15 text-white ring-1 ring-cyan-400/50"
                      : "border-white/[0.10] bg-[#060B15]/68 text-slate-300 hover:border-white/[0.22] hover:text-white"
                  )}
                >
                  <CheckCircle2 className={cn("size-4 shrink-0", escolhaSim ? "text-cyan-400" : "text-slate-500")} />
                  <span>Sim, é Renovação</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEscolhaSim(false)}
                  data-testid="btn-renovacao-nao"
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-xs font-semibold transition-all duration-150 cursor-pointer",
                    !escolhaSim
                      ? "border-slate-400 bg-slate-700/60 text-white ring-1 ring-slate-400/40"
                      : "border-white/[0.10] bg-[#060B15]/68 text-slate-300 hover:border-white/[0.22] hover:text-white"
                  )}
                >
                  <XCircle className={cn("size-4 shrink-0", !escolhaSim ? "text-slate-200" : "text-slate-500")} />
                  <span>Não, ajuste ou correção</span>
                </button>
              </div>
            </div>

            {/* Resultado estruturado com espaçamento limpo */}
            <div className="mt-5 border-t border-white/[0.08] pt-4">
              {escolhaSim ? (
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4" data-testid="renovacao-preview-sim">
                  <div>
                    <dt className="text-[11px] font-medium text-slate-400">Situação do contrato</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-white">{preview.rotuloCompleto}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-slate-400">Contagem</dt>
                    <dd className="num mt-0.5 text-sm font-semibold text-cyan-300">{preview.qtdRenovacoes}ª renovação</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-slate-400">Início da renovação</dt>
                    <dd className="num mt-0.5 text-sm font-semibold text-white">
                      {preview.dataRenovacao ? fmtDate(preview.dataRenovacao) : "—"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="space-y-3" data-testid="renovacao-preview-nao">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="renovacao-ano-ajuste"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Ano do contrato após este ajuste
                    </label>
                    <select
                      id="renovacao-ano-ajuste"
                      value={String(anoAjuste)}
                      onChange={(e) => setAnoAjuste(Number(e.target.value))}
                      data-testid="renovacao-ano-ajuste-select"
                      className="h-9 w-full rounded-lg border border-white/[0.12] bg-[#060B15]/85 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 [color-scheme:dark]"
                    >
                      {anoOptions.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-[#0A1221] text-slate-100">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-400">
                    {anoAjuste !== anoAnterior
                      ? `O ano do contrato será corrigido de ${anoAnterior}º Ano para ${anoAjuste}º Ano de Contrato${anoAjuste === 1 ? " (sem renovações)" : ` (${anoAjuste - 1}ª renovação)`}.`
                      : previousRenovado
                        ? `Apenas a data será ajustada. O vínculo mantém o registro anterior (${anoAnterior}º Ano de Contrato).`
                        : "Apenas a data será ajustada, mantendo o contrato inicial (1º Ano de Contrato)."}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="btn-renovacao-cancelar"
              >
                Voltar
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                className="bg-cyan-600 text-white hover:bg-cyan-500 font-semibold"
                data-testid="btn-renovacao-confirmar"
              >
                Confirmar
              </Button>
            </div>
          </DialogPrimitive.Popup>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

