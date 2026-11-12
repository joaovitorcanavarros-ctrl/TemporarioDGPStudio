import { Sparkles, BadgeCheck, CheckCircle2, XCircle, Calendar } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { getInfoContrato } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RenovacaoPromptProps {
  dataInclusao?: string | null;
  dataVencimento?: string | null;
  isRenovacao: boolean;
  onToggleRenovacao: (isRenovado: boolean) => void;
  className?: string;
}

export function RenovacaoPrompt({
  dataInclusao,
  dataVencimento,
  isRenovacao,
  onToggleRenovacao,
  className,
}: RenovacaoPromptProps) {
  // Cálculo dinâmico para quando 'Sim' for selecionado
  const infoSim = getInfoContrato({
    data_inclusao: dataInclusao,
    data_vencimento_contrato: dataVencimento,
    renovacao_contrato: true,
  });

  return (
    <div
      className={cn(
        "rounded-xl border border-cyan-500/30 bg-[#0B121D] p-4 shadow-lg transition-all duration-300",
        isRenovacao ? "ring-1 ring-cyan-500/40" : "border-[#1E2C42]",
        className
      )}
      data-testid="renovacao-prompt-container"
    >
      <div className="flex items-start gap-3">
        <div className="relative mt-0.5 flex items-center justify-center size-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shrink-0">
          <Sparkles className="size-4.5 animate-pulse text-cyan-400" />
          <span className="absolute -top-1 -right-1 flex size-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-2.5 bg-cyan-500" />
          </span>
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-300">
              <BadgeCheck className="size-3.5 text-cyan-400" /> Validação de Renovação de Contrato
            </span>
            {dataVencimento && (
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Calendar className="size-3 text-slate-400" />
                Vigência: <strong className="text-slate-200">{fmtDate(dataVencimento)}</strong>
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-slate-100">
            Esta modificação de data de vigência refere-se a uma <strong>Renovação de Contrato</strong>?
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Selecione uma das opções abaixo. Ao confirmar como renovação, o sistema interpreta automaticamente o ano de exercício e o número acumulado de renovações.
          </p>

          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onToggleRenovacao(true)}
              data-testid="btn-renovacao-sim"
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all select-none cursor-pointer",
                isRenovacao
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-900/40 ring-2 ring-cyan-400/80 border border-cyan-400"
                  : "bg-[#121B28] text-slate-300 border border-[#24344D] hover:bg-[#182335] hover:text-white"
              )}
            >
              <CheckCircle2 className={cn("size-4", isRenovacao ? "text-white" : "text-cyan-400")} />
              <span>Sim, é Renovação de Contrato</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleRenovacao(false)}
              data-testid="btn-renovacao-nao"
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all select-none cursor-pointer",
                !isRenovacao
                  ? "bg-slate-700 text-white ring-2 ring-slate-400 border border-slate-500"
                  : "bg-[#121B28] text-slate-400 border border-[#24344D] hover:bg-[#182335] hover:text-slate-200"
              )}
            >
              <XCircle className="size-4 text-slate-400" />
              <span>Não, apenas ajuste de data</span>
            </button>
          </div>

          {isRenovacao ? (
            <div
              className="mt-3.5 rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3.5 text-xs transition-all animate-in fade-in zoom-in-95"
              data-testid="renovacao-preview-sim"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wider text-cyan-400/90 font-bold">
                  Ano a exercer:
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-extrabold text-xs shadow-sm">
                  <BadgeCheck className="size-3.5 text-cyan-400" />
                  {infoSim.rotuloCompleto}
                </span>
              </div>

              <p className="mt-2 text-[11px] text-cyan-300/90 leading-relaxed">
                ✓ <strong>Identificado automaticamente pelo sistema:</strong> Com data de inclusão em{" "}
                <strong>{fmtDate(dataInclusao)}</strong> e vigência até{" "}
                <strong>{fmtDate(dataVencimento)}</strong>, o militar estará exercendo o{" "}
                <strong>{infoSim.rotuloCompleto}</strong>.
              </p>
            </div>
          ) : (
            <div
              className="mt-3 rounded-lg border border-slate-700/50 bg-slate-900/40 p-2.5 text-xs text-slate-400 transition-all animate-in fade-in"
              data-testid="renovacao-preview-nao"
            >
              <span>
                • Registro mantido sem cômputo de renovação contratual (permanece no <strong>1º Ano / Exercício Inicial</strong>).
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
