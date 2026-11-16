import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import MilitaresTable, { type Params } from "@/components/MilitaresTable";

export interface Drill {
  title: string;
  params: Params;
  variant?: "geral" | "desligados";
}

export default function DrillSheet({
  drill,
  onClose,
}: {
  drill: Drill | null;
  onClose: () => void;
}) {
  const [qInput, setQInput] = useState("");
  const [qApplied, setQApplied] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDrillRef = useRef<Drill | null>(drill);
  const reduceMotion = useReducedMotion();
  const titleId = useId();

  if (drill) {
    lastDrillRef.current = drill;
  }
  const shownDrill = drill ?? lastDrillRef.current;

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setQInput("");
    setQApplied("");
  }, [drill]);

  // Lock background scroll & handle Escape key cleanly
  useEffect(() => {
    if (!drill) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Only close if no nested dialog (e.g. QuickEdit / Desligamento) is open above
      const openDialogs = document.querySelectorAll('[role="dialog"]').length;
      if (openDialogs <= 1) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drill, onClose]);

  const handleSearchChange = (value: string) => {
    setQInput(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setQApplied(value.trim());
    }, 300);
  };

  const handleClearSearch = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setQInput("");
    setQApplied("");
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {drill && shownDrill && (
        <div className="fixed inset-0 z-40 flex items-end justify-center p-2.5 sm:p-5 lg:p-6">
          {/* Smooth blurred & dimmed backdrop (opacity-driven over backdrop-blur-md for 60fps fluidity) */}
          <motion.div
            key="drill-backdrop"
            aria-hidden="true"
            onClick={onClose}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.62, ease: [0.35, 0, 0.25, 1] }
            }
            className="fixed inset-0 bg-[#050912]/65 backdrop-blur-md"
          />

          {/* Bottom-up floating pop-up card */}
          <motion.div
            key="drill-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-testid="drill-sheet"
            initial={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 0, y: 96, scale: 0.965 }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              reduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    y: 72,
                    scale: 0.975,
                    transition: { duration: 0.42, ease: [0.4, 0, 0.2, 1] },
                  }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    duration: 0.72,
                    ease: [0.28, 0.05, 0.18, 1],
                  }
            }
            className="relative z-10 flex max-h-[85vh] w-full max-w-[min(1140px,96vw)] flex-col overflow-hidden rounded-2xl border border-[#24344D] bg-[#0B111A] shadow-[0_-20px_70px_-10px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.04)] sm:rounded-3xl will-change-transform"
          >
            {/* Subtle top grabber bar matching bottom-sheet pop-up aesthetic */}
            <div className="flex justify-center bg-[#0E1624]/95 pt-2.5">
              <span className="h-1 w-10 rounded-full bg-slate-700/80" aria-hidden="true" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[#1E2C42] bg-[#0E1624]/95 px-5 pb-4 pt-2.5 sm:px-6">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="font-heading text-base font-bold text-white sm:text-lg"
                  data-testid="drill-sheet-title"
                >
                  {shownDrill.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">
                  Registros correspondentes ao item selecionado no painel.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#162234]/80 text-slate-300 transition-colors hover:border-white/20 hover:bg-[#1E2C42] hover:text-white cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Scrollable table content */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={qInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (debounceRef.current) clearTimeout(debounceRef.current);
                      setQApplied(qInput.trim());
                    }
                  }}
                  placeholder="Pesquisar por nome ou matrícula..."
                  className="border-[#1E2C42] bg-[#121B28] pl-9 pr-8 text-slate-100 placeholder:text-slate-500"
                  data-testid="drill-search-input"
                />
                {qInput && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    title="Limpar pesquisa"
                    data-testid="drill-search-clear"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <MilitaresTable
                params={{ ...shownDrill.params, q: qApplied || undefined }}
                variant={shownDrill.variant}
                compact
                testId="drill-table"
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
