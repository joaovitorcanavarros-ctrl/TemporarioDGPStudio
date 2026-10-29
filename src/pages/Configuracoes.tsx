import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import FieldSelect from "@/components/FieldSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errMsg } from "@/lib/format";
import { PERFIL_LABEL, isAdmin, useCatalogos, useMe } from "@/lib/hooks";
import type { Config, UserOut } from "@/lib/types";
import Auditoria from "@/pages/Auditoria";

type Row = Record<string, unknown> & { id: string };
interface FieldDef { key: string; label: string; type: "text" | "number" | "select" | "bool" | "password"; options?: { value: string; label: string }[]; lockOnEdit?: boolean }

function CrudTab({ title, rows, fields, endpoint, invalidateKey, canEdit, canDelete, testId, display }: {
  title: string; rows: Row[]; fields: FieldDef[]; endpoint: string; invalidateKey: string; canEdit: boolean; canDelete?: boolean; testId: string;
  display: { key: string; label: string; render?: (r: Row) => string }[];
}) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Row | null>(null);
  const [deletar, setDeletar] = useState<Row | null>(null);
  const [vals, setVals] = useState<Record<string, unknown>>({});
  const [filtro, setFiltro] = useState("");
  const open = (r: Row | null, isNew = false) => {
    setEdit(isNew ? ({ id: "" } as Row) : r);
    const init: Record<string, unknown> = {};
    for (const f of fields) init[f.key] = r ? r[f.key] ?? "" : f.type === "bool" ? true : "";
    setVals(init);
  };
  const mut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const f of fields) {
        const v = vals[f.key];
        body[f.key] = f.type === "number" ? (v === "" || v === null ? null : Number(v)) : f.type === "password" ? (v ? v : null) : v;
      }
      return edit?.id ? apiPut(`${endpoint}/${edit.id}`, body) : apiPost(endpoint, body);
    },
    onSuccess: () => {
      toast.success("Registro salvo");
      void qc.invalidateQueries({ queryKey: [invalidateKey] });
      void qc.invalidateQueries({ queryKey: ["usuarios"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["catalogos"] });
      void qc.invalidateQueries({ queryKey: ["auditoria"] });
      void qc.invalidateQueries({ queryKey: ["meta"] });
      setEdit(null);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiDelete(`${endpoint}/${id}`),
    onSuccess: () => {
      toast.success("Registro excluído com sucesso");
      void qc.invalidateQueries({ queryKey: [invalidateKey] });
      void qc.invalidateQueries({ queryKey: ["usuarios"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["catalogos"] });
      void qc.invalidateQueries({ queryKey: ["auditoria"] });
      void qc.invalidateQueries({ queryKey: ["meta"] });
      setDeletar(null);
    },
    onError: (e) => toast.error(errMsg(e, "Erro ao excluir")),
  });

  const visible = rows.filter((r) => !filtro || JSON.stringify(r).toLowerCase().includes(filtro.toLowerCase()));
  return (
    <section className="rounded-xl border border-[#1E2C42] bg-[#121B28]" data-testid={`${testId}-tab`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2C42] p-4">
        <h3 className="font-heading font-bold text-white">{title} <span className="num text-sm text-slate-500">({rows.length})</span></h3>
        <div className="flex gap-2">
          <Input placeholder="Filtrar" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-8 w-48" data-testid={`${testId}-filter`} />
          {canEdit && <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => open(null, true)} data-testid={`${testId}-add-button`}><Plus className="size-4" /> Adicionar</Button>}
        </div>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <Table>
          <TableHeader><TableRow className="border-[#1E2C42] hover:bg-transparent">
            {display.map((d) => <TableHead key={d.key} className="sticky top-0 bg-[#0F1724] text-[11px] uppercase text-slate-400">{d.label}</TableHead>)}
            {canEdit && <TableHead className="sticky top-0 bg-[#0F1724] text-right text-[11px] uppercase text-slate-400">Ações</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.id} className="border-[#162234]">
                {display.map((d) => <TableCell key={d.key} className="py-2 text-slate-200">{d.render ? d.render(r) : String(r[d.key] ?? "—")}</TableCell>)}
                {canEdit && (
                  <TableCell className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={() => open(r)} data-testid={`${testId}-edit-${r.id}`} title="Editar">
                        <Pencil className="size-4" />
                      </Button>
                      {canDelete && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => setDeletar(r)}
                          data-testid={`${testId}-delete-${r.id}`}
                          title="Excluir"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="border-[#1E2C42] bg-[#121B28]" data-testid={`${testId}-dialog`}>
          <DialogHeader><DialogTitle className="text-white">{edit?.id ? "Editar" : "Adicionar"} — {title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                {f.type === "bool" ? (
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <Checkbox checked={Boolean(vals[f.key])} onCheckedChange={(c) => setVals({ ...vals, [f.key]: Boolean(c) })} data-testid={`${testId}-field-${f.key}`} /> {f.label}
                  </label>
                ) : (
                  <>
                    <Label>{f.label}</Label>
                    {f.type === "select" ? (
                      <FieldSelect testId={`${testId}-field-${f.key}`} value={String(vals[f.key] ?? "")} onChange={(v) => setVals({ ...vals, [f.key]: v })} options={f.options ?? []} />
                    ) : (
                      <Input type={f.type === "password" ? "password" : f.type} disabled={!!edit?.id && f.lockOnEdit} value={String(vals[f.key] ?? "")}
                        onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} data-testid={`${testId}-field-${f.key}`}
                        placeholder={f.type === "password" && edit?.id ? "Deixe em branco para manter" : undefined} />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <DialogFooter className="flex items-center justify-between">
            {edit?.id && canDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 mr-auto"
                onClick={() => {
                  const toDel = edit;
                  setEdit(null);
                  setDeletar(toDel);
                }}
              >
                <Trash2 className="size-4 mr-1" /> Excluir
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEdit(null)} data-testid={`${testId}-cancel`}>Cancelar</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" disabled={mut.isPending} onClick={() => mut.mutate()} data-testid={`${testId}-save`}>Salvar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Deletion */}
      <Dialog open={!!deletar} onOpenChange={(o) => !o && setDeletar(null)}>
        <DialogContent className="border-[#1E2C42] bg-[#121B28]" data-testid={`${testId}-delete-dialog`}>
          <DialogHeader>
            <DialogTitle className="text-white">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-slate-300">
            <p>
              Tem certeza que deseja excluir permanentemente o registro{" "}
              <strong className="text-white">{String(deletar?.nome ?? deletar?.codigo ?? "selecionado")}</strong>?
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Esta ação removerá o registro dos catálogos do sistema.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletar(null)}>Cancelar</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={delMut.isPending}
              onClick={() => deletar?.id && delMut.mutate(deletar.id)}
              data-testid={`${testId}-confirm-delete`}
            >
              {delMut.isPending ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

const ativoCol = { key: "ativo", label: "Ativo", render: (r: Row) => (r.ativo ? "Sim" : "Não") };

export default function Configuracoes() {
  const me = useMe();
  const cat = useCatalogos();
  const qc = useQueryClient();
  const admin = isAdmin(me.data);
  const c = cat.data;
  const [alerta, setAlerta] = useState<string>("");
  const usuarios = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => apiGet<UserOut[]>("/usuarios"),
    enabled: admin,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const saveCfg = useMutation({

    mutationFn: (b: Config) => apiPut<Config>("/config", b),
    onSuccess: () => { toast.success("Configuração salva"); void qc.invalidateQueries(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const catOpts = (c?.categorias ?? []).map((x) => ({ value: x.codigo, label: x.nome }));
  const catNome = (cod: unknown) => c?.categorias.find((x) => x.codigo === cod)?.nome ?? String(cod);

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") || "geral";
  const validTabs = ["geral", "categorias", "cargos", "lotacoes", "editais", "motivos", "usuarios", "auditoria"];
  const currentTab = validTabs.includes(rawTab) ? rawTab : "geral";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Administração</p>
        <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl" data-testid="page-title">Configurações e Usuários</h2>
        {!admin && <p className="text-sm text-amber-300" data-testid="config-readonly">Somente o perfil Administrador pode alterar configurações. Você está em modo de consulta.</p>}
      </div>
      <Tabs value={currentTab} onValueChange={(val) => setSearchParams({ tab: val })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="geral" data-testid="config-tab-geral">Geral</TabsTrigger>
          <TabsTrigger value="categorias" data-testid="config-tab-categorias">Categorias</TabsTrigger>
          <TabsTrigger value="cargos" data-testid="config-tab-cargos">Cargos</TabsTrigger>
          <TabsTrigger value="lotacoes" data-testid="config-tab-lotacoes">Lotações</TabsTrigger>
          <TabsTrigger value="editais" data-testid="config-tab-editais">Editais</TabsTrigger>
          <TabsTrigger value="motivos" data-testid="config-tab-motivos">Motivos</TabsTrigger>
          {admin && <TabsTrigger value="usuarios" data-testid="config-tab-usuarios">Usuários</TabsTrigger>}
          {admin && <TabsTrigger value="auditoria" data-testid="config-tab-auditoria">Auditoria</TabsTrigger>}
        </TabsList>
        <TabsContent value="geral" className="mt-4">
          <section className="max-w-lg space-y-3 rounded-xl border border-[#1E2C42] bg-[#121B28] p-5">
            <Label>Prazo de alerta de vencimento de contrato (dias)</Label>
            <div className="flex gap-2">
              <Input type="number" min={1} max={365} className="num w-32" disabled={!admin} value={alerta || String(c?.config.alerta_dias ?? "")}
                onChange={(e) => setAlerta(e.target.value)} data-testid="config-alerta-dias-input" />
              {admin && <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => saveCfg.mutate({ alerta_dias: Number(alerta || c?.config.alerta_dias) })} data-testid="config-save-button">Salvar</Button>}
            </div>
            <p className="text-xs text-slate-400">Contratos ativos que vencem dentro deste prazo são destacados em amarelo. Contratos vencidos nunca geram desligamento automático.</p>
          </section>
        </TabsContent>
        <TabsContent value="categorias" className="mt-4">
          <CrudTab title="Categorias (seções do menu)" testId="categorias" endpoint="/categorias" invalidateKey="catalogos" canEdit={admin} canDelete={admin}
            rows={(c?.categorias ?? []) as unknown as Row[]}
            fields={[{ key: "codigo", label: "Código (ex.: BOMBEIRO_CIVIL)", type: "text", lockOnEdit: true }, { key: "nome", label: "Nome", type: "text" }, { key: "ordem", label: "Ordem no menu", type: "number" }, { key: "ativo", label: "Ativa", type: "bool" }]}
            display={[{ key: "codigo", label: "Código" }, { key: "nome", label: "Nome" }, { key: "ordem", label: "Ordem" }, ativoCol]} />
        </TabsContent>
        <TabsContent value="cargos" className="mt-4">
          <CrudTab title="Cargos" testId="cargos" endpoint="/cargos" invalidateKey="catalogos" canEdit={admin} canDelete={admin}
            rows={(c?.cargos ?? []) as unknown as Row[]}
            fields={[{ key: "nome", label: "Nome do cargo", type: "text" }, { key: "categoria", label: "Categoria", type: "select", options: catOpts }, { key: "ativo", label: "Ativo", type: "bool" }]}
            display={[{ key: "nome", label: "Cargo" }, { key: "categoria", label: "Categoria", render: (r) => catNome(r.categoria) }, ativoCol]} />
        </TabsContent>
        <TabsContent value="lotacoes" className="mt-4">
          <CrudTab title="Lotações / UBM" testId="lotacoes" endpoint="/lotacoes" invalidateKey="catalogos" canEdit={admin} canDelete={admin}
            rows={(c?.lotacoes ?? []) as unknown as Row[]}
            fields={[{ key: "nome", label: "Nome", type: "text" }, { key: "tipo", label: "Tipo", type: "select", options: [{ value: "UBM", label: "UBM" }, { value: "ADMINISTRATIVA", label: "Unidade administrativa" }] }, { key: "ativo", label: "Ativa", type: "bool" }]}
            display={[{ key: "nome", label: "Lotação" }, { key: "tipo", label: "Tipo" }, ativoCol]} />
        </TabsContent>
        <TabsContent value="editais" className="mt-4">
          <CrudTab title="Editais / processos seletivos" testId="editais" endpoint="/editais" invalidateKey="catalogos" canEdit={admin} canDelete={admin}
            rows={(c?.editais ?? []) as unknown as Row[]}
            fields={[{ key: "nome", label: "Identificação", type: "text" }, { key: "ano", label: "Ano", type: "number" }, { key: "descricao", label: "Informações adicionais", type: "text" }, { key: "ativo", label: "Ativo", type: "bool" }]}
            display={[{ key: "nome", label: "Edital" }, { key: "ano", label: "Ano" }, { key: "descricao", label: "Informações" }, ativoCol]} />
        </TabsContent>
        <TabsContent value="motivos" className="mt-4">
          <CrudTab title="Motivos de desligamento" testId="motivos" endpoint="/motivos" invalidateKey="catalogos" canEdit={admin} canDelete={admin}
            rows={(c?.motivos ?? []) as unknown as Row[]}
            fields={[{ key: "nome", label: "Motivo", type: "text" }, { key: "ativo", label: "Ativo", type: "bool" }]}
            display={[{ key: "nome", label: "Motivo" }, ativoCol]} />
        </TabsContent>
        {admin && (
          <TabsContent value="usuarios" className="mt-4 space-y-4">
            <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-4">
              <h4 className="text-sm font-bold text-blue-200">Gestão Multiusuário e Controle de Acessos</h4>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                • <strong>Novos Usuários:</strong> Qualquer pessoa que criar uma conta ou entrar pelo Google recebe automaticamente a permissão <span className="font-semibold text-amber-300">Consulta</span> (visualização de quadros, filtros e relatórios).<br />
                • <strong>Aprovação de Administrador:</strong> Para conceder permissão de edição ou gestão a um colega, clique no botão <span className="font-semibold text-blue-300">Editar</span> na linha do usuário e altere o Perfil para <span className="font-semibold text-emerald-300">Administrador</span> ou <span className="font-semibold text-blue-300">Gestor de Pessoal</span>.<br />
                • <strong>Sincronização em Tempo Real:</strong> Todas as alterações nos cadastros e permissões são salvas na nuvem e propagadas instantaneamente para todos os dispositivos conectados.
              </p>
            </div>
            <CrudTab title="Usuários Cadastrados" testId="usuarios" endpoint="/usuarios" invalidateKey="usuarios" canEdit canDelete={admin}
              rows={(usuarios.data ?? []) as unknown as Row[]}
              fields={[
                { key: "nome", label: "Nome", type: "text" }, { key: "email", label: "E-mail", type: "text" },
                { key: "perfil", label: "Perfil", type: "select", options: Object.entries(PERFIL_LABEL).map(([value, label]) => ({ value, label })) },
                { key: "senha", label: "Senha (mín. 8, letras e números)", type: "password" }, { key: "ativo", label: "Ativo", type: "bool" },
              ]}
              display={[{ key: "nome", label: "Nome" }, { key: "email", label: "E-mail" }, { key: "perfil", label: "Perfil", render: (r) => PERFIL_LABEL[String(r.perfil)] || (String(r.perfil) === "ADMIN" ? "Administrador" : String(r.perfil) === "GESTOR" ? "Gestor de Pessoal" : "Consulta") }, ativoCol]} />
            <p className="mt-2 text-xs text-slate-500">Perfis: Administrador (usuários, configurações, reativações) · Gestor de Pessoal (cadastro, edição, importação, desligamentos) · Consulta (somente leitura).</p>
          </TabsContent>
        )}
        {admin && (
          <TabsContent value="auditoria" className="mt-4" data-testid="auditoria-tab">
            <Auditoria />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
