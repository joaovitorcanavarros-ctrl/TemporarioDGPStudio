# CBMMT — Sistema de Gerenciamento de Bombeiros Militares Temporários

Aplicação web em **React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Recharts** para gestão do efetivo de Bombeiros Militares Temporários do Corpo de Bombeiros Militar de Mato Grosso (CBMMT).

O sistema substitui planilhas descentralizadas por uma plataforma com indicadores dinâmicos, controle de contratos, histórico de alterações e relatórios.

---

## Principais Funcionalidades

- **Painel Geral (Dashboard)**:
  - KPIs em tempo real: Efetivo ativo, Inclusões e Desligamentos no período, UBM com maior efetivo, Sub judice, Contratos a vencer e Vencidos.
  - Gráficos interativos com drill-down: Efetivo por quadro/ano, Desligamentos por motivo, Distribuição por UBM e Edital, Evolução mensal e Faixas de vencimento.
- **Gestão de Efetivo (Temporários)**:
  - Listagem geral e por quadros específicos (Auxiliares, Condutores, Técnicos de Enfermagem, Enfermeiros, Médicos, etc.).
  - Pesquisa instantânea por nome ou matrícula, paginação e ordenação por qualquer coluna.
  - Indicadores visuais de prazo de contrato (Vencido, A vencer em 30 dias, Regular).
  - Cadastro completo com validação de matrícula única e campos oficiais.
  - Edição completa e Edição Rápida (lotação, edital, prorrogação de contrato).
- **Desligamentos e Reativações**:
  - Registro de desligamento com data efetiva, motivo normatizado, número de processo/documento e observações.
  - Histórico de situação (Inclusão, Desligamento, Reativação) com justificativa e usuário responsável.
  - Reativação restrita ao perfil de Administrador com registro de auditoria.
- **Relatórios Oficiais & Exportação**:
  - 8 modalidades de relatórios parametrizáveis:
    1. Efetivo ativo por cargo
    2. Efetivo ativo por UBM
    3. Temporários por edital
    4. Inclusões por período
    5. Contratos a vencer
    6. Contratos vencidos pendentes de conferência
    7. Desligamentos por período e motivo
    8. Histórico individual por matrícula
  - Exportação direta para CSV e Excel.
- **Importação de Planilhas**:
  - Fluxo em 4 etapas: upload do arquivo CSV, detecção e mapeamento de colunas, validação de regras com pré-visualização de inserções/atualizações e aplicação no sistema.
- **Perfis de Acesso**:
  - **Administrador**: Gestão de usuários, configurações de prazos de alerta, catálogos (cargos, lotações, editais, motivos), auditoria e reativações.
  - **Gestor de Pessoal**: Cadastro, edição, desligamentos e importação.
  - **Consulta**: Consulta e exportação de relatórios e painéis.

---

## Contas de Demonstração

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | `admin@cbmmt.mt.gov.br` | `Admin@2026` |
| Gestor de Pessoal | `gestor@cbmmt.mt.gov.br` | `Gestor@2026` |
| Usuário Consulta | `consulta@cbmmt.mt.gov.br` | `Consulta@2026` |

---

## Como Executar

```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento (porta 3000)
npm run dev

# Compilar para produção
npm run build
```
