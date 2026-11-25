import { useState } from "react";
import { ChevronDown, FilterX, SlidersHorizontal } from "lucide-react";
import FieldSelect from "@/components/FieldSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFilters } from "@/lib/filters";
import { useCatalogos } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface Props {
  hideStatus?: boolean;
  hideCargo?: boolean;
  onReset?: () => void;
}

export default function FiltersBar({ hideStatus, hideCargo, onReset }: Props) {
  const { filters, setFilter, reset } = useFilters();
  const [mobileOpen, setMobileOpen] = useState(false);
  const cat = useCatalogos();
  const c = cat.data;

  const handleReset = () => {
    reset();
    onReset?.();
  };

  const activeCount = [
    !hideCargo && filters.cargo_id,
    filters.lotacao_id,
    filters.edital_id,
    !hideStatus && filters.status,
    filters.data_inicio,
    filters.data_fim,
    filters.ano,
  ].filter(Boolean).length;

  const crMap = new Map((c?.comandos_regionais ?? []).map((cr) => [cr.id, cr.nome]));
  const lotacaoOptions = (c?.lotacoes ?? []).map((x) => {
    const crNome = x.comando_regional_id ? crMap.get(x.comando_regional_id) : undefined;
    const crShort = crNome?.match(/^\s*(\d+[º°]\s*CRBM)/i)?.[1]?.replace("°", "º").toUpperCase();
    return {
      value: x.id,
      label: x.nome,
      hint: crShort,
      keywords: crNome,
    };
  });

  return (
    <div data-testid="filters-bar" className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-3">
      {/* Cabeçalho retrátil apenas no mobile */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-expanded={mobileOpen}
          data-testid="filters-mobile-toggle"
          className="flex min-h-[40px] flex-1 items-center gap-2 rounded-lg px-1.5 text-left text-sm font-semibold text-slate-100 cursor-pointer"
        >
          <SlidersHorizontal className="size-4 text-blue-400 shrink-0" />
          <span>Filtros</span>
          {activeCount > 0 && (
            <span className="num text-xs font-medium text-blue-300">
              · {activeCount} {activeCount === 1 ? "ativo" : "ativos"}
            </span>
          )}
          <ChevronDown
            className={cn(
              "ml-auto size-4 text-slate-400 transition-transform duration-200",
              mobileOpen && "rotate-180"
            )}
          />
        </button>
        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-9 px-2.5 text-xs text-slate-300 hover:text-white"
          >
            <FilterX className="size-3.5" /> Limpar
          </Button>
        )}
      </div>

      {/* Campos de filtro: retrátil no mobile, grade sempre visível no sm+ */}
      <div
        className={cn(
          "gap-2.5 sm:grid sm:grid-cols-3 sm:gap-2 lg:grid-cols-4 xl:grid-cols-7",
          mobileOpen ? "mt-3 grid grid-cols-1 border-t border-[#1E2C42] pt-3 sm:mt-0 sm:border-t-0 sm:pt-0" : "hidden sm:grid"
        )}
      >
        {!hideCargo && (
          <FieldSelect
            testId="filter-cargo"
            value={filters.cargo_id}
            onChange={(v) => setFilter("cargo_id", v)}
            allLabel="Todos os cargos"
            options={(c?.cargos ?? []).map((x) => ({ value: x.id, label: x.nome }))}
          />
        )}
        <FieldSelect
          testId="filter-lotacao"
          value={filters.lotacao_id}
          onChange={(v) => setFilter("lotacao_id", v)}
          allLabel="Todas as lotações"
          searchable
          searchPlaceholder="Pesquisar lotação, UBM ou CRBM..."
          emptyMessage="Nenhuma lotação encontrada."
          options={lotacaoOptions}
        />
        <FieldSelect
          testId="filter-edital"
          value={filters.edital_id}
          onChange={(v) => setFilter("edital_id", v)}
          allLabel="Todos os editais"
          options={(c?.editais ?? []).map((x) => ({ value: x.id, label: x.nome }))}
        />
        {!hideStatus && (
          <FieldSelect
            testId="filter-status"
            value={filters.status}
            onChange={(v) => setFilter("status", v)}
            allLabel="Todas as situações"
            options={[
              { value: "ATIVO", label: "Ativos" },
              { value: "DESLIGADO", label: "Desligados" },
            ]}
          />
        )}
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <div className="space-y-1 sm:space-y-0">
            <label htmlFor="filter-data-inicio-field" className="block text-[11px] font-medium text-slate-400 sm:hidden">
              Data inicial
            </label>
            <Input
              id="filter-data-inicio-field"
              type="date"
              aria-label="Data inicial"
              data-testid="filter-data-inicio"
              value={filters.data_inicio || ""}
              onChange={(e) => setFilter("data_inicio", e.target.value)}
              className="h-10 sm:h-9 bg-[#0F1724] dark:bg-[#0F1724] hover:bg-[#142033] dark:hover:bg-[#142033] border-[#24344D] text-slate-100 [color-scheme:dark]"
            />
          </div>
          <div className="space-y-1 sm:space-y-0">
            <label htmlFor="filter-data-fim-field" className="block text-[11px] font-medium text-slate-400 sm:hidden">
              Data final
            </label>
            <Input
              id="filter-data-fim-field"
              type="date"
              aria-label="Data final"
              data-testid="filter-data-fim"
              value={filters.data_fim || ""}
              onChange={(e) => setFilter("data_fim", e.target.value)}
              className="h-10 sm:h-9 bg-[#0F1724] dark:bg-[#0F1724] hover:bg-[#142033] dark:hover:bg-[#142033] border-[#24344D] text-slate-100 [color-scheme:dark]"
            />
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={handleReset}
          data-testid="filter-reset"
          className="h-10 sm:h-9 text-slate-400 hover:text-white"
        >
          <FilterX className="size-4" /> Limpar filtros
        </Button>
      </div>
    </div>
  );
}
