// Interfaces espelhando backend/models/schemas.py — manter sincronizadas manualmente.
export type Perfil = "ADMIN" | "GESTOR" | "CONSULTA";
export type Status = "ATIVO" | "DESLIGADO";

export interface UserOut { id: string; nome: string; email: string; perfil: Perfil; ativo: boolean }
export interface UsuarioIn { nome: string; email: string; perfil: Perfil; ativo: boolean; senha?: string | null }

export interface Categoria { id: string; codigo: string; nome: string; ordem: number; ativo: boolean }
export interface Cargo { id: string; nome: string; categoria: string; ativo: boolean }
export interface Lotacao { id: string; nome: string; tipo: string; ativo: boolean }
export interface Edital { id: string; nome: string; ano: number | null; descricao: string | null; ativo: boolean }
export interface Motivo { id: string; nome: string; ativo: boolean }
export interface Config { alerta_dias: number }
export interface Catalogos {
  categorias: Categoria[]; cargos: Cargo[]; lotacoes: Lotacao[]; editais: Edital[]; motivos: Motivo[]; config: Config;
}
export interface Meta { data_hoje: string; ultima_atualizacao: string | null; total_registros: number }

export interface MilitarIn {
  matricula: string; nome_completo: string; cargo_id: string; lotacao_id: string; edital_id: string;
  data_inclusao: string; data_vencimento_contrato: string; status: Status;
  observacoes?: string | null; doe_incorporacao?: string | null; sub_judice: boolean;
  data_desligamento?: string | null; motivo_desligamento_id?: string | null; documento_desligamento?: string | null;
  renovacao_contrato?: boolean | null;
  ano_contrato?: number | null;
  qtd_renovacoes?: number | null;
}
export interface MilitarRapidoIn {
  lotacao_id?: string | null;
  edital_id?: string | null;
  data_vencimento_contrato?: string | null;
  observacoes?: string | null;
  renovacao_contrato?: boolean | null;
  ano_contrato?: number | null;
  qtd_renovacoes?: number | null;
}
export interface DesligamentoIn { data_desligamento: string; motivo_id: string; documento?: string | null; observacoes?: string | null }
export interface ReativacaoIn { justificativa: string; data_vencimento_contrato?: string | null; documento?: string | null }

export interface Militar {
  id: string; matricula: string; nome_completo: string;
  cargo_id: string; cargo_nome: string; categoria: string; categoria_nome: string;
  lotacao_id: string; lotacao_nome: string; edital_id: string; edital_nome: string;
  data_inclusao: string; data_vencimento_contrato: string; status: Status;
  data_desligamento: string | null; motivo_desligamento_id: string | null; motivo_desligamento_nome: string | null;
  documento_desligamento: string | null; observacoes: string | null; doe_incorporacao: string | null; sub_judice: boolean;
  dias_para_vencer: number; alerta: "VENCIDO" | "A_VENCER" | null;
  criado_em: string | null; atualizado_em: string | null; criado_por_nome: string | null; atualizado_por_nome: string | null;
  renovacao_contrato?: boolean | null;
  ano_contrato?: number;
  qtd_renovacoes?: number;
}

export interface InfoContrato {
  renovado: boolean;
  anoContrato: number;
  qtdRenovacoes: number;
  rotuloAno: string;
  rotuloCompleto: string;
  detalheRenovacao: string;
}

export function getInfoContrato(m?: {
  data_inclusao?: string | null;
  data_vencimento_contrato?: string | null;
  renovacao_contrato?: boolean | null;
  ano_contrato?: number | null;
  qtd_renovacoes?: number | null;
} | null): InfoContrato {
  if (!m) {
    return {
      renovado: false,
      anoContrato: 1,
      qtdRenovacoes: 0,
      rotuloAno: "1º Ano",
      rotuloCompleto: "1º Ano de Contrato",
      detalheRenovacao: "Contrato inicial (sem renovação)",
    };
  }

  const dataInc = m.data_inclusao ? String(m.data_inclusao).slice(0, 10) : "";
  const dataVenc = m.data_vencimento_contrato ? String(m.data_vencimento_contrato).slice(0, 10) : "";

  let anosCalculados = 1;
  if (dataInc && dataVenc) {
    const inc = new Date(`${dataInc}T12:00:00`);
    const venc = new Date(`${dataVenc}T12:00:00`);
    const diffMs = venc.getTime() - inc.getTime();
    const diffDias = Math.max(0, Math.round(diffMs / 86400000));

    // Tolerância para ciclo de 365 dias/ano
    if (diffDias > 395) {
      anosCalculados = Math.max(1, Math.round(diffDias / 365.25));
    } else if (diffDias > 330) {
      anosCalculados = 1;
    }
    const calDiff = venc.getFullYear() - inc.getFullYear();
    if (calDiff > anosCalculados) {
      anosCalculados = calDiff;
    }
  }

  if (typeof m.ano_contrato === "number" && m.ano_contrato >= 1 && m.renovacao_contrato) {
    anosCalculados = Math.max(anosCalculados, m.ano_contrato);
  }

  const inc2025 = Boolean(dataInc && dataInc.startsWith("2025"));
  const venc2027ouMais = Boolean(dataVenc && dataVenc >= "2027-01-01");

  const renovado = Boolean(
    m.renovacao_contrato === true ||
    (m.renovacao_contrato !== false && (anosCalculados > 1 || (inc2025 && venc2027ouMais)))
  );

  const anoContrato = renovado ? Math.max(2, anosCalculados) : 1;
  const qtdRenovacoes = typeof m.qtd_renovacoes === "number" && m.qtd_renovacoes >= 0 && m.renovacao_contrato
    ? m.qtd_renovacoes
    : renovado
      ? Math.max(1, anoContrato - 1)
      : 0;

  const detalheRenovacao = qtdRenovacoes > 0
    ? `${qtdRenovacoes}ª renovação (${anoContrato}º ano)`
    : "Contrato inicial";

  return {
    renovado,
    anoContrato,
    qtdRenovacoes,
    rotuloAno: `${anoContrato}º Ano`,
    rotuloCompleto: `${anoContrato}º Ano de Contrato`,
    detalheRenovacao,
  };
}
export interface MilitarPage { items: Militar[]; total: number; page: number; page_size: number }
export interface MatriculaCheck { existe: boolean; militar_id: string | null; nome_completo: string | null }

export interface HistoricoAlteracao {
  id: string;
  entidade: string;
  entidade_id: string | null;
  matricula: string | null;
  operacao: string;
  usuario_nome: string;
  usuario_email?: string | null;
  timestamp: string;
  data_hora?: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  detalhes?: {
    antes?: Record<string, unknown> | null;
    depois?: Record<string, unknown> | null;
    descricao?: string | null;
  } | null;
}
export interface HistoricoSituacao {
  id: string; militar_id: string; matricula: string; nome_completo: string;
  tipo: "INCLUSAO" | "DESLIGAMENTO" | "REATIVACAO"; data_efetiva: string; motivo_nome: string | null;
  documento: string | null; justificativa: string | null; observacoes: string | null; usuario_nome: string; timestamp: string;
}
export interface MilitarHistorico { alteracoes: HistoricoAlteracao[]; situacao: HistoricoSituacao[] }
export interface AuditoriaPage { items: HistoricoAlteracao[]; total: number; limit?: number; has_more?: boolean }
export interface SituacaoPage { items: HistoricoSituacao[]; total: number }

export interface CountItem { chave: string; nome: string; total: number }
export interface FaixaItem { faixa: string; min: number | null; max: number | null; total: number }
export interface KPIs {
  ativos: number; desligamentos_periodo: number; inclusoes_periodo: number;
  top_ubm_id: string | null; top_ubm_nome: string | null; top_ubm_total: number;
  por_categoria: Record<string, number>; a_vencer: number; vencidos: number; sub_judice: number;
}
export type ChartRow = Record<string, string | number>;
export interface Dashboard {
  data_hoje: string; data_referencia: string; periodo_inicio: string | null; periodo_fim: string | null; alerta_dias: number;
  kpis: KPIs; categorias: CountItem[]; motivos: CountItem[];
  efetivo_cargo_ano: ChartRow[]; deslig_por_ano: ChartRow[]; deslig_por_cargo: ChartRow[]; deslig_motivos: CountItem[];
  por_ubm: CountItem[]; evolucao_mensal: ChartRow[]; evolucao_anual: ChartRow[];
  dist_categoria: CountItem[]; dist_edital: CountItem[]; faixas_vencimento: FaixaItem[];
}

export interface CampoDef { key: string; label: string; obrigatorio: boolean }
export interface ImportAnalise {
  delimitador: string; linha_cabecalho: number | null; cabecalho: string[];
  mapeamento: Record<string, number | null>; amostra: string[][]; total_linhas: number; campos: CampoDef[];
}
export interface ImportValidarIn {
  content: string; filename: string; linha_cabecalho: number; mapeamento: Record<string, number | null>; aprovar_atualizacoes: string[];
}
export interface Diferenca { campo: string; atual: string | null; novo: string | null }
export interface ImportLinha {
  linha: number; matricula: string; nome_completo: string; acao: "INSERIR" | "ATUALIZAR" | "IGNORAR" | "REJEITAR";
  erros: string[]; avisos: string[]; diferencas: Diferenca[]; dados: Record<string, string>;
}
export interface ImportResumo { inserir: number; atualizar: number; ignorar: number; rejeitar: number }
export interface ImportValidacao { linhas: ImportLinha[]; resumo: ImportResumo; novos_cargos: string[]; novas_lotacoes: string[]; novos_editais: string[] }
export interface ImportResultado { inseridos: number; atualizados: number; ignorados: number; rejeitados: number; atualizacoes_nao_aprovadas: number }

export interface Coluna { key: string; label: string }
export interface Relatorio {
  tipo: string; titulo: string; descricao: string; colunas: Coluna[];
  linhas: Record<string, string | number | null>[]; gerado_em: string; filtros: string;
  militar?: Militar;
}

