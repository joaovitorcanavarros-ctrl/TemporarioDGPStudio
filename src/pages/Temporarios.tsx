import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FilterX, Search, UserPlus, X } from "lucide-react";
import FieldSelect from "@/components/FieldSelect";
import FiltersBar from "@/components/FiltersBar";
import MilitaresTable from "@/components/MilitaresTable";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFilters } from "@/lib/filters";
import { podeEditar, useCatalogos, useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { filterParams } from "@/pages/Dashboard";

export default function Temporarios() {
  const { categoria } = useParams();
  const { filters, setFilter, reset } = useFilters();
  const me = useMe();
  const cat = useCatalogos();
  const queryClient = useQueryClient();

  // Local search and filter states
  const [qInput, setQInput] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [venc, setVenc] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const catNome = cat.data?.categorias.find((c) => c.codigo === categoria)?.nome ?? categoria;
  const situacao = filters.status || "TODOS";

  // Debounced search input handler
  const handleSearchChange = (value: string) => {
    setQInput(value);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setQApplied(value.trim());
    }, 280);
  };

  // Centralized action that completely resets all filter states in a single place
  const handleLimparTudo = useCallback(() => {
    // 1. Cancel any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // 2. Reset text search model and applied query
    setQInput("");
    setQApplied("");

    // 3. Reset expiration filter dropdown
    setVenc("");

    // 4. Reset situation / status tabs to default
    setFilter("status", "");

    // 5. Reset all global filters (ano, cargo, lotação, edital, datas)
    reset();

    // 6. Force pagination reset to page 1 in MilitaresTable
    setResetKey((prev) => prev + 1);

    // 7. Trigger immediate re-fetch of militares without filters
    queryClient.invalidateQueries({ queryKey: ["militares"] });
  }, [reset, setFilter, queryClient]);

  // Clean all filters when switching between quadro categories
  // (Temporário Geral, Auxiliares, Condutores, Técnicos, Enfermeiros, Médicos)
  const prevCategoriaRef = useRef(categoria);
  useEffect(() => {
    if (prevCategoriaRef.current !== categoria) {
      prevCategoriaRef.current = categoria;
      handleLimparTudo();
    }
  }, [categoria, handleLimparTudo]);

  // Query parameters passed to MilitaresTable
  const params = {
    ...filterParams(filters),
    categoria,
    q: qApplied || undefined,
    venc: venc || undefined,
  };

  // Check if any filter or search is active
  const hasActiveFilters = Boolean(
    qInput ||
    qApplied ||
    venc ||
    filters.status ||
    filters.ano ||
    (!categoria && filters.cargo_id) ||
    filters.lotacao_id ||
    filters.edital_id ||
    filters.data_inicio ||
    filters.data_fim
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
            {categoria ? "Quadro de efetivo" : "Cadastro geral"}
          </p>
          <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl" data-testid="page-title">
            {categoria ? catNome : "Temporários Geral"}
          </h2>
        </div>
        {podeEditar(me.data) && (
          <Link to="/temporarios/novo" className={cn(buttonVariants(), "bg-blue-600 hover:bg-blue-700")} data-testid="new-militar-button">
            <UserPlus className="size-4" /> Cadastrar temporário
          </Link>
        )}
      </div>

      {/* Integrated FiltersBar with centralized onReset */}
      <FiltersBar hideStatus hideCargo={!!categoria} onReset={handleLimparTudo} />

      {/* Search, expiration and situation tabs row */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={qInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Pesquisar por nome ou matrícula"
            className="bg-[#121B28] pl-9 pr-8"
            data-testid="search-input"
          />
          {qInput && (
            <button
              type="button"
              onClick={() => {
                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                setQInput("");
                setQApplied("");
                queryClient.invalidateQueries({ queryKey: ["militares"] });
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              title="Limpar busca"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <FieldSelect
          testId="filter-vencimento"
          className="lg:w-56"
          value={venc}
          onChange={setVenc}
          allLabel="Todos os vencimentos"
          options={[
            { value: "a_vencer", label: `A vencer (${cat.data?.config.alerta_dias ?? 30} dias)` },
            { value: "vencidos", label: "Vencidos (pendentes)" },
          ]}
        />

        <Tabs
          value={situacao}
          onValueChange={(v) => setFilter("status", v === "TODOS" ? "" : String(v))}
        >
          <TabsList>
            <TabsTrigger value="ATIVO" data-testid="view-ativos">Somente ativos</TabsTrigger>
            <TabsTrigger value="DESLIGADO" data-testid="view-desligados">Somente desligados</TabsTrigger>
            <TabsTrigger value="TODOS" data-testid="view-todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLimparTudo}
            data-testid="clear-all-quick-filters"
            className="text-xs text-blue-300 hover:text-white hover:bg-blue-600/20 gap-1.5 shrink-0"
            title="Limpar todos os filtros e termos de pesquisa"
          >
            <FilterX className="size-3.5" />
            Limpar tudo
          </Button>
        )}
      </div>

      {/* Military List Table with synchronous resetKey */}
      <MilitaresTable
        params={params}
        resetKey={resetKey}
        variant={situacao === "DESLIGADO" ? "desligados" : "geral"}
      />
    </div>
  );
}
