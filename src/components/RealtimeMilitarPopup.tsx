import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, UserPlus, X } from "lucide-react";

import type { Militar } from "@/lib/types";

export interface RealtimeMilitarPopupItem {
  key: string;
  militar: Militar;
  receivedAt: number;
}

interface RealtimeMilitarPopupProps {
  items: RealtimeMilitarPopupItem[];
  onDismiss: (key: string) => void;
}

function PopupCard({
  item,
  onDismiss,
}: {
  item: RealtimeMilitarPopupItem;
  onDismiss: (key: string) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(item.key);
    }, 8500);
    return () => window.clearTimeout(timer);
  }, [item.key, onDismiss]);

  const { militar } = item;
  const autor = militar.criado_por_nome && militar.criado_por_nome !== "Sistema"
    ? militar.criado_por_nome
    : "Cadastrante da seção";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={`realtime-popup-${militar.id}`}
      className="pointer-events-auto relative overflow-hidden rounded-xl border border-emerald-400/40 bg-[#0A1324]/82 p-3.5 shadow-[0_22px_54px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl backdrop-saturate-150 animate-in slide-in-from-top-3 fade-in duration-300"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-blue-500" />
      <div className="flex items-start gap-3">
        <div className="relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-emerald-300">
          <UserPlus className="size-4" />
          <span className="absolute -right-1 -top-1 flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Novo militar cadastrado
            </span>
            <button
              type="button"
              onClick={() => onDismiss(item.key)}
              aria-label="Fechar notificação"
              className="rounded p-0.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <p className="mt-0.5 truncate text-sm font-bold text-white" title={militar.nome_completo}>
            {militar.nome_completo}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-300">
            Matrícula: <span className="num font-semibold text-slate-100">{militar.matricula}</span>
            {militar.cargo_nome && militar.cargo_nome !== "—" ? ` · ${militar.cargo_nome}` : ""}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {militar.lotacao_nome && militar.lotacao_nome !== "—" ? `${militar.lotacao_nome} · ` : ""}
            Por <span className="font-medium text-slate-200">{autor}</span>
          </p>
          <div className="mt-2 flex items-center justify-end gap-2">
            <Link
              to={`/temporarios/${militar.id}`}
              onClick={() => onDismiss(item.key)}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20"
            >
              Ver ficha <ArrowUpRight className="size-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RealtimeMilitarPopup({ items, onDismiss }: RealtimeMilitarPopupProps) {
  if (!items.length) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-24 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2.5"
      data-testid="realtime-militar-popup-container"
    >
      {items.map((item) => (
        <PopupCard key={item.key} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
