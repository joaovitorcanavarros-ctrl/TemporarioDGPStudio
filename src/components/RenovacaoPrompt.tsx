import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowRight, BadgeCheck, Calendar, CheckCircle2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { addDaysToIsoDate, getInfoContrato } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface RenovacaoConfirmPayload {
  isRenovacao: boolean;
  /** Nova contagem acumulada de renovações após confirmar */
  qtdRenovacoes: number;
  /** Novo ano de contrato após confirmar */
  anoContrato: number;
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
  initialSelection = true,
  onConfirm,
}: RenovacaoFocusModalProps) {
  const [escolhaSim, setEscolhaSim] = useState<boolean>(initialSelection);

  useEffect(() => {
    if (open) {
      setEscolhaSim(initialSelection);
    }
  }, [open, initialSelection]);

  const preview = computeRenovacaoPreview({
    dataInclusao,
    dataVencimentoAnterior,
    dataVencimentoNova,
    previousRenovado,
    previousQtdRenovacoes,
  });

  const handleConfirm = () => {
    if (escolhaSim) {
      onConfirm({
        isRenovacao: true,
        qtdRenovacoes: preview.qtdRenovacoes,
        anoContrato: preview.anoContrato,
        dataRenovacao: preview.dataRenovacao || null,
      });
    } else {
      const anoMantido = previousRenovado ? Math.max(2, previousQtdRenovacoes + 1) : 1;
      onConfirm({
        isRenovacao: previousRenovado,
        qtdRenovacoes: previousRenovado ? previousQtdRenovacoes : 0,
        anoContrato: anoMantido,
        dataRenovacao: null,
      });
    }
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-[90] bg-[#04070D]/80 backdrop-blur-md animate-staging-backdrop"
          data-testid="renovacao-focus-backdrop"
        />
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
          <DialogPrimitive.Popup
            data-testid="renovacao-focus-modal"
            className="pointer-events-auto relative w-full max-w-xl rounded-xl border border-cyan-500/35 bg-[#0E1623] p-6 text-slate-100 shadow-[0_24px_80px_-12px_rgba(6,182,212,0.28)] outline-none animate-staging-focus"
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
                      : "border-[#24344D] bg-[#121B28] text-slate-300 hover:border-slate-500 hover:text-white"
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
                      : "border-[#24344D] bg-[#121B28] text-slate-300 hover:border-slate-500 hover:text-white"
                  )}
                >
                  <XCircle className={cn("size-4 shrink-0", !escolhaSim ? "text-slate-200" : "text-slate-500")} />
                  <span>Não, apenas ajuste de data</span>
                </button>
              </div>
            </div>

            {/* Resultado estruturado com espaçamento limpo */}
            <div className="mt-5 border-t border-[#1E2C42] pt-4">
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
                <p className="text-xs leading-relaxed text-slate-400" data-testid="renovacao-preview-nao">
                  {previousRenovado
                    ? `Apenas a data será ajustada. O vínculo mantém o registro anterior (${previousQtdRenovacoes}ª renovação).`
                    : "Apenas a data será ajustada, mantendo o contrato inicial (1º Ano de Contrato)."}
                </p>
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
