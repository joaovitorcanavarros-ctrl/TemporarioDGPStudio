import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import MilitaresTable, { type Params } from "@/components/MilitaresTable";

export interface Drill { title: string; params: Params; variant?: "geral" | "desligados" }

export default function DrillSheet({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  const [qInput, setQInput] = useState("");
  const [qApplied, setQApplied] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setQInput("");
    setQApplied("");
  }, [drill]);

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

  return (
    <Sheet open={!!drill} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-[#1E2C42] bg-[#0B111A] p-0 sm:max-w-[min(1100px,95vw)]" data-testid="drill-sheet">
        <SheetHeader className="border-b border-[#1E2C42] p-5">
          <SheetTitle className="text-white" data-testid="drill-sheet-title">{drill?.title}</SheetTitle>
          <SheetDescription>Registros correspondentes ao item selecionado no gráfico.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 p-4">
          {drill && (
            <>
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
                params={{ ...drill.params, q: qApplied || undefined }}
                variant={drill.variant}
                compact
                testId="drill-table"
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
