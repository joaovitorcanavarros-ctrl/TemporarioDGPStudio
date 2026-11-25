import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CheckIcon, ChevronDownIcon, Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "__all__";

export interface Option {
  value: string;
  label: string;
  hint?: string;
  keywords?: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  allLabel?: string;
  placeholder?: string;
  testId: string;
  className?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function SearchableFieldSelect({
  value,
  onChange,
  options,
  allLabel,
  placeholder = "Selecione",
  testId,
  className,
  disabled,
  searchPlaceholder = "Pesquisar...",
  emptyMessage = "Nenhum item encontrado.",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const displayLabel = selectedOption?.label ?? (allLabel && !value ? allLabel : placeholder);
  const isPlaceholder = !selectedOption && !allLabel;

  const visibleItems = useMemo(() => {
    const q = normalizeSearch(query);
    const items: Array<{ value: string; label: string; hint?: string; isAll?: boolean }> = [];
    if (allLabel && (!q || normalizeSearch(allLabel).includes(q))) {
      items.push({ value: ALL, label: allLabel, isAll: true });
    }
    for (const o of options) {
      if (!q) {
        items.push(o);
        continue;
      }
      const haystack = normalizeSearch(`${o.label} ${o.hint ?? ""} ${o.keywords ?? ""}`);
      if (haystack.includes(q)) {
        items.push(o);
      }
    }
    return items;
  }, [allLabel, options, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIdx(0);
      return;
    }
    const idx = visibleItems.findIndex((item) => (item.isAll ? !value : item.value === value));
    setActiveIdx(idx >= 0 ? idx : 0);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (activeIdx >= visibleItems.length) {
      setActiveIdx(Math.max(0, visibleItems.length - 1));
    }
  }, [activeIdx, visibleItems.length]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  const handleSelect = (itemValue: string) => {
    onChange(itemValue === ALL ? "" : itemValue);
    setOpen(false);
  };

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          type="button"
          disabled={disabled}
          data-testid={testId}
          aria-label={displayLabel}
          className={cn(
            "flex h-10 sm:h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-white/[0.10] bg-[#060B15]/75 py-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none hover:bg-[#0B1424]/85 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
            value && allLabel ? "pr-12" : "pr-2"
          )}
        >
          <span className={cn("truncate text-left", isPlaceholder ? "text-muted-foreground" : "text-slate-100")}>
            {displayLabel}
          </span>
          <ChevronDownIcon className={cn("pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")} />
        </Popover.Trigger>

        {value && allLabel && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            title="Limpar seleção"
            aria-label="Limpar seleção"
            data-testid={`${testId}-clear`}
            className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        )}

        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
            <Popover.Popup
              className="glass-dialog w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border text-slate-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
              data-testid={`${testId}-popover`}
            >
              <div className="flex items-center gap-2 border-b border-white/[0.08] bg-[#050912]/70 px-3 py-2">
                <Search className="size-4 shrink-0 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIdx(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveIdx((prev) => Math.min(prev + 1, Math.max(0, visibleItems.length - 1)));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveIdx((prev) => Math.max(prev - 1, 0));
                    } else if (e.key === "Enter" && visibleItems[activeIdx]) {
                      e.preventDefault();
                      handleSelect(visibleItems[activeIdx].value);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  data-testid={`${testId}-search-input`}
                  className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setActiveIdx(0);
                      inputRef.current?.focus();
                    }}
                    aria-label="Limpar pesquisa"
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <div ref={listRef} className="max-h-72 overflow-y-auto p-1.5" role="listbox">
                {visibleItems.map((item, idx) => {
                  const isSelected = item.isAll ? !value : item.value === value;
                  const isActive = idx === activeIdx;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-idx={idx}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => handleSelect(item.value)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2.5 sm:py-2 text-left text-sm transition-colors",
                        isSelected
                          ? "bg-blue-500/15 text-blue-200 font-medium"
                          : isActive
                            ? "bg-[#19263B] text-white"
                            : "text-slate-200 hover:bg-[#19263B] hover:text-white",
                        item.isAll && "border-b border-[#1A263A] mb-1 pb-2 rounded-b-none"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {item.hint && (
                          <span className="text-[11px] font-medium text-slate-400">{item.hint}</span>
                        )}
                        {isSelected && <CheckIcon className="size-3.5 text-blue-400" />}
                      </span>
                    </button>
                  );
                })}
                {visibleItems.length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-slate-500">{emptyMessage}</p>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-white/[0.08] bg-[#050912]/70 px-3 py-1.5 text-[11px] text-slate-500">
                <span>
                  {query.trim()
                    ? `${visibleItems.filter((i) => !i.isAll).length} resultado(s)`
                    : `${options.length} opções`}
                </span>
                <span>↑↓ navegar · Enter selecionar</span>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

export default function FieldSelect(props: Props) {
  if (props.searchable) {
    return <SearchableFieldSelect {...props} />;
  }

  const { value, onChange, options, allLabel, placeholder = "Selecione", testId, className, disabled } = props;
  const labels: Record<string, string> = { [ALL]: allLabel ?? placeholder };
  for (const o of options) labels[o.value] = o.label;
  const current = value || (allLabel ? ALL : "");
  return (
    <Select value={current} onValueChange={(v: string) => onChange(v === ALL ? "" : v)} disabled={disabled}>
      <SelectTrigger data-testid={testId} className={cn("h-10 sm:h-8 w-full min-w-0 bg-[#060B15]/75 dark:bg-[#060B15]/75 hover:bg-[#0B1424]/85 dark:hover:bg-[#0B1424]/85 border-white/[0.10] text-slate-100", className)}>
        <SelectValue placeholder={placeholder}>
          {(v) => <span className={cn("truncate", !v && "text-muted-foreground")}>{v ? labels[v as string] ?? placeholder : placeholder}</span>}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
